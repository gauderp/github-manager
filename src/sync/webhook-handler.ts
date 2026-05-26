import { createHmac, timingSafeEqual } from "node:crypto";
import type { PluginContext, PluginWebhookInput } from "@paperclipai/plugin-sdk";
import { upsertRepo, upsertPR, upsertIssue, linkPRToCard } from "../db/queries.js";
import { detectAndLinkCards } from "./link-detector.js";
import type { GitHubPR, GitHubIssue } from "../types.js";

function verifyWebhookSignature(rawBody: string, signature: string, secret: string): boolean {
  const expected = "sha256=" + createHmac("sha256", secret).update(rawBody).digest("hex");
  if (expected.length !== signature.length) return false;
  return timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
}

export async function handleGithubWebhook(
  ctx: PluginContext,
  input: PluginWebhookInput,
): Promise<void> {
  // Validate webhook secret if configured
  const config = await ctx.config.get();
  const webhookSecret = config?.webhookSecret as string | undefined;
  if (webhookSecret) {
    const signature = input.headers["x-hub-signature-256"] as string;
    if (!signature || !verifyWebhookSignature(input.rawBody, signature, webhookSecret)) {
      ctx.logger.warn("Webhook signature verification failed — rejecting");
      return;
    }
  }

  const event = input.headers["x-github-event"];
  const payload = input.parsedBody as Record<string, unknown>;

  if (!payload || !event) {
    ctx.logger.warn("Webhook received with missing event header or body");
    return;
  }

  if (event === "pull_request") {
    await handlePullRequestEvent(ctx, payload);
  } else if (event === "issues") {
    await handleIssuesEvent(ctx, payload);
  } else {
    ctx.logger.info(`Ignoring GitHub event: ${event}`);
  }
}

async function handlePullRequestEvent(
  ctx: PluginContext,
  payload: Record<string, unknown>,
): Promise<void> {
  const prData = payload.pull_request as Record<string, unknown>;
  const repoData = payload.repository as Record<string, unknown>;
  if (!prData || !repoData) return;

  await upsertRepo(ctx.db, {
    id: repoData.id as number,
    fullName: repoData.full_name as string,
    owner: (repoData.owner as Record<string, unknown>).login as string,
    name: repoData.name as string,
    private: repoData.private as boolean,
    defaultBranch: repoData.default_branch as string,
    htmlUrl: repoData.html_url as string,
    description: repoData.description as string | null,
    language: repoData.language as string | null,
    topics: (repoData.topics as string[]) ?? [],
    updatedAt: repoData.updated_at as string,
  });

  const merged = prData.merged as boolean;
  const state = merged ? "merged" : (prData.state as string);

  const pr: Omit<GitHubPR, "syncedAt"> = {
    id: prData.id as number,
    repoId: repoData.id as number,
    number: prData.number as number,
    title: prData.title as string,
    body: prData.body as string | null,
    state: state as GitHubPR["state"],
    author: (prData.user as Record<string, unknown>).login as string,
    headBranch: (prData.head as Record<string, unknown>).ref as string,
    baseBranch: (prData.base as Record<string, unknown>).ref as string,
    htmlUrl: prData.html_url as string,
    draft: prData.draft as boolean,
    mergeable: prData.mergeable as boolean | null,
    mergedAt: prData.merged_at as string | null,
    createdAt: prData.created_at as string,
    updatedAt: prData.updated_at as string,
  };

  await upsertPR(ctx.db, pr);
  await detectAndLinkCards(ctx, pr.id, pr.headBranch, pr.title);
  ctx.logger.info(`Webhook: upserted PR #${pr.number} from ${repoData.full_name}`);

  // Auto-create review issue when PR is opened or ready for review
  const action = payload.action as string;
  if (action === "opened" || action === "ready_for_review") {
    if (pr.draft) return; // Skip drafts

    const repoFullName = repoData.full_name as string;
    const [owner, repoName] = repoFullName.split("/");

    try {
      // Get companyId from first company (single-tenant assumption)
      const companies = await ctx.companies.list();
      if (companies.length === 0) return;
      const companyId = companies[0].id;

      const issue = await ctx.issues.create({
        companyId,
        title: `Code Review: ${repoFullName}#${pr.number}`,
        description: [
          `Automated review for PR #${pr.number}: **${pr.title}** by @${pr.author}`,
          ``,
          `## Review Tasks`,
          `1. Use \`github_get_repo_structure\` with repo_full_name="${repoFullName}" to understand the codebase`,
          `2. Use \`github_get_pull_request_diff\` with owner="${owner}", repo="${repoName}", pull_number=${pr.number} to get the diff`,
          `3. Use \`github_get_pr_checks\` with owner="${owner}", repo="${repoName}", pull_number=${pr.number} to verify CI/CD status`,
          `4. Use \`github_get_pr_comments\` with owner="${owner}", repo="${repoName}", pull_number=${pr.number} to check existing review comments`,
          `5. Read relevant files with \`github_read_file_content\` for context`,
          `6. Post inline comments with \`github_create_review_comment\` for issues found`,
          `7. If changes are needed, submit review with \`github_submit_pr_review\` event="REQUEST_CHANGES" and tag @${pr.author}`,
          `8. If everything looks good, submit with event="APPROVE"`,
          ``,
          `PR: https://github.com/${repoFullName}/pull/${pr.number}`,
        ].join("\n"),
        originKind: "plugin_github_review",
        originId: `${repoFullName}#${pr.number}`,
      });

      await linkPRToCard(ctx.db, pr.id, issue.id, "webhook");
      ctx.logger.info(`Webhook: auto-created review issue for PR #${pr.number}`);
    } catch (err) {
      ctx.logger.error(`Webhook: failed to create review issue for PR #${pr.number}: ${err}`);
    }
  }
}

async function handleIssuesEvent(
  ctx: PluginContext,
  payload: Record<string, unknown>,
): Promise<void> {
  const issueData = payload.issue as Record<string, unknown>;
  const repoData = payload.repository as Record<string, unknown>;
  if (!issueData || !repoData) return;

  await upsertRepo(ctx.db, {
    id: repoData.id as number,
    fullName: repoData.full_name as string,
    owner: (repoData.owner as Record<string, unknown>).login as string,
    name: repoData.name as string,
    private: repoData.private as boolean,
    defaultBranch: repoData.default_branch as string,
    htmlUrl: repoData.html_url as string,
    description: repoData.description as string | null,
    language: repoData.language as string | null,
    topics: (repoData.topics as string[]) ?? [],
    updatedAt: repoData.updated_at as string,
  });

  const issue: Omit<GitHubIssue, "syncedAt"> = {
    id: issueData.id as number,
    repoId: repoData.id as number,
    number: issueData.number as number,
    title: issueData.title as string,
    body: issueData.body as string | null,
    state: issueData.state as string,
    author: (issueData.user as Record<string, unknown>).login as string,
    labels: ((issueData.labels as Array<Record<string, unknown>>) ?? []).map(
      (l) => l.name as string,
    ),
    htmlUrl: issueData.html_url as string,
    createdAt: issueData.created_at as string,
    updatedAt: issueData.updated_at as string,
  };

  await upsertIssue(ctx.db, issue);
  ctx.logger.info(`Webhook: upserted issue #${issue.number} from ${repoData.full_name}`);
}
