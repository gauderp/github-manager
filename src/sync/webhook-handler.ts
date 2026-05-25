import type { PluginContext, PluginWebhookInput } from "@paperclipai/plugin-sdk";
import { upsertRepo, upsertPR, upsertIssue } from "../db/queries.js";
import { detectAndLinkCards } from "./link-detector.js";
import type { GitHubPR, GitHubIssue } from "../types.js";

export async function handleGithubWebhook(
  ctx: PluginContext,
  input: PluginWebhookInput,
): Promise<void> {
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
