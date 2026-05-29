import { createHmac, timingSafeEqual } from "node:crypto";
import type { PluginContext, PluginWebhookInput } from "@paperclipai/plugin-sdk";
import { upsertRepo, upsertPR, upsertIssue, linkPRToCard, getRepoByFullName, upsertWorkflowRun } from "../db/queries.js";
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
  } else if (event === "workflow_run") {
    await handleWorkflowRunEvent(ctx, payload);
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
      const companies = await ctx.companies.list();
      if (companies.length === 0) return;
      const companyId = companies[0].id;

      // Check if auto-review is enabled — if so, attach agentId
      const config = await ctx.config.get();
      const autoReviewEnabled = (config?.autoReviewEnabled as boolean | undefined) ?? false;

      let reviewerAgentId: string | undefined;
      if (autoReviewEnabled) {
        try {
          const reviewer = await ctx.agents.managed.get("github-reviewer", companyId);
          reviewerAgentId = reviewer?.agentId ?? undefined;
        } catch { /* agent not reconciled yet */ }
      }

      // Read per-repo review guidelines from state
      const repo = await getRepoByFullName(ctx.db, repoFullName);
      let guidelinesSection = "";
      if (repo) {
        const guidelines = await ctx.state.get({
          scopeKind: "company",
          scopeId: companyId,
          stateKey: `review-guidelines-${repo.id}`,
        }) as string | undefined;
        if (guidelines) {
          guidelinesSection = [
            "",
            "## Repository Review Guidelines",
            guidelines,
          ].join("\n");
        }
      }

      const issue = await ctx.issues.create({
        companyId,
        title: `Code Review: ${repoFullName}#${pr.number}`,
        description: [
          `Automated review for PR #${pr.number}: **${pr.title}** by @${pr.author}`,
          ``,
          `## Review Tasks`,
          `1. Use \`github_get_repo_structure\` with repo_full_name="${repoFullName}" to understand the codebase`,
          `2. Use \`github_get_pull_request_diff\` with owner="${owner}", repo="${repoName}", pull_number=${pr.number} to get the diff`,
          `3. Use \`github_list_pr_files\` with owner="${owner}", repo="${repoName}", pull_number=${pr.number} to see changed files overview`,
          `4. Use \`github_get_pr_checks\` to verify CI/CD status`,
          `5. Use \`github_get_pr_comments\` to check existing review comments`,
          `6. Read relevant files with \`github_read_file_content\` for context`,
          `7. Post inline comments with \`github_create_review_comment\` for issues found`,
          `8. Use \`github_approve_pr\` if everything looks good, or \`github_request_changes\` if changes are needed`,
          guidelinesSection,
          ``,
          `PR: https://github.com/${repoFullName}/pull/${pr.number}`,
        ].join("\n"),
        originKind: "plugin:github_review",
        originId: `${repoFullName}#${pr.number}`,
        ...(reviewerAgentId ? { agentId: reviewerAgentId } : {}),
      });

      await linkPRToCard(ctx.db, pr.id, issue.id, "webhook");
      ctx.logger.info(`Webhook: auto-created review issue for PR #${pr.number} (autoReview=${autoReviewEnabled})`);
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
  const action = payload.action as string;
  if (!issueData || !repoData) return;

  // Skip issues that are actually PRs
  if (issueData.pull_request) return;

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

  // Auto-triage: create a Paperclip card for the triager agent when issue is opened
  if (action === "opened") {
    try {
      const config = await ctx.config.get();
      const autoTriageEnabled = (config?.autoTriageEnabled as boolean | undefined) ?? false;
      if (!autoTriageEnabled) return;

      const companies = await ctx.companies.list();
      if (companies.length === 0) return;
      const companyId = companies[0].id;

      let triagerAgentId: string | undefined;
      try {
        const triager = await ctx.agents.managed.get("github-triager", companyId);
        triagerAgentId = triager?.agentId ?? undefined;
      } catch { /* agent not reconciled yet */ }

      const repoFullName = repoData.full_name as string;
      const [owner, repoName] = repoFullName.split("/");

      const triageCard = await ctx.issues.create({
        companyId,
        title: `Triage: ${repoFullName}#${issue.number} — ${issue.title}`,
        description: [
          `Triage issue #${issue.number} in **${repoFullName}** opened by @${issue.author}`,
          ``,
          `## Issue Details`,
          `**Title:** ${issue.title}`,
          `**URL:** ${issue.htmlUrl}`,
          `**Current Labels:** ${issue.labels.length > 0 ? issue.labels.join(", ") : "none"}`,
          ``,
          `## Issue Body`,
          issue.body ? issue.body.slice(0, 2000) : "_No description provided_",
          issue.body && issue.body.length > 2000 ? "\n_(body truncated — read full issue via github_search_issues)_" : "",
          ``,
          `## Triage Instructions`,
          `1. Use \`github_list_labels\` with owner="${owner}", repo="${repoName}" to see available labels`,
          `2. Classify the issue by type, priority, and area`,
          `3. Use \`github_add_labels\` with owner="${owner}", repo="${repoName}", issue_number=${issue.number} to apply labels`,
          `4. Use \`github_set_assignees\` if you can determine the right owner`,
          `5. Use \`github_add_comment\` to post your triage summary`,
          ``,
          `If unsure, apply \`needs-triage\` label and post a comment asking for clarification.`,
        ].join("\n"),
        originKind: "plugin:github_triage",
        originId: `${repoFullName}#${issue.number}`,
        ...(triagerAgentId ? { agentId: triagerAgentId } : {}),
      });

      ctx.logger.info(`Webhook: auto-created triage card for issue #${issue.number} (cardId=${triageCard.id})`);
    } catch (err) {
      ctx.logger.error(`Webhook: failed to create triage card for issue #${issue.number}: ${err}`);
    }
  }
}

async function handleWorkflowRunEvent(
  ctx: PluginContext,
  payload: Record<string, unknown>,
): Promise<void> {
  const action = payload.action as string;
  const runData = payload.workflow_run as Record<string, unknown>;
  const repoData = payload.repository as Record<string, unknown>;

  if (!runData || !repoData) return;

  // Only react to completed failures
  if (action !== "completed" || runData.conclusion !== "failure") {
    ctx.logger.info(
      `Ignoring workflow_run event: action=${action} conclusion=${runData.conclusion}`,
    );
    return;
  }

  // Ensure the repo is in our DB
  await upsertRepo(ctx.db, {
    id:            repoData.id as number,
    fullName:      repoData.full_name as string,
    owner:         (repoData.owner as Record<string, unknown>).login as string,
    name:          repoData.name as string,
    private:       repoData.private as boolean,
    defaultBranch: repoData.default_branch as string,
    htmlUrl:       repoData.html_url as string,
    description:   repoData.description as string | null,
    language:      repoData.language as string | null,
    topics:        (repoData.topics as string[]) ?? [],
    updatedAt:     repoData.updated_at as string,
  });

  const repoFullName = repoData.full_name as string;
  const repo = await getRepoByFullName(ctx.db, repoFullName);
  if (!repo) {
    ctx.logger.warn(`workflow_run: repo not found in DB after upsert: ${repoFullName}`);
    return;
  }

  // Extract PR number if any PR is associated with this run
  const prList = (runData.pull_requests as Array<Record<string, unknown>>) ?? [];
  const prNumber = prList.length > 0 ? (prList[0].number as number) : null;

  // Save run to DB
  await upsertWorkflowRun(ctx.db, {
    id:           runData.id as number,
    repoId:       repo.id,
    runNumber:    runData.run_number as number,
    workflowName: runData.name as string,
    headBranch:   runData.head_branch as string | null,
    headSha:      runData.head_sha as string | null,
    status:       runData.status as string,
    conclusion:   runData.conclusion as string,
    prNumber,
    logsSummary:  null,
    analyzedAt:   null,
    htmlUrl:      runData.html_url as string,
  });

  ctx.logger.info(
    `workflow_run: saved run #${runData.run_number} (${runData.name}) for ${repoFullName}`,
  );

  // Check if CI Companion is enabled for this instance
  const config = await ctx.config.get();
  const ciEnabled = config?.ciCompanionEnabled as boolean | undefined;
  if (!ciEnabled) {
    ctx.logger.info("workflow_run: ci-companion disabled — skipping card creation");
    return;
  }

  // Get all companies (single-tenant assumption consistent with existing code)
  const companies = await ctx.companies.list();
  if (companies.length === 0) return;
  const companyId = companies[0].id;

  // Build the analysis instructions for the ci-companion agent
  const [owner, repoName] = repoFullName.split("/");
  const runId = runData.id as number;
  const runNumber = runData.run_number as number;
  const workflowName = runData.name as string;
  const headBranch = runData.head_branch as string;
  const headSha = (runData.head_sha as string).slice(0, 7);

  try {
    const cardDescription = buildCIAnalysisInstructions({
      owner, repo: repoName, repoFullName,
      runId, runNumber, workflowName,
      headBranch, headSha, prNumber,
    });

    const issue = await ctx.issues.create({
      companyId,
      title: `CI Failed: ${workflowName} on ${headBranch} (${headSha})`,
      description: cardDescription,
      originKind: "plugin:github_ci_failure",
      originId: `${repoFullName}#run-${runId}`,
    });

    ctx.logger.info(
      `workflow_run: created ci-companion card ${issue.id} for run #${runNumber}`,
    );
  } catch (err) {
    ctx.logger.error(`workflow_run: failed to create card: ${err}`);
  }
}

function buildCIAnalysisInstructions(opts: {
  owner: string;
  repo: string;
  repoFullName: string;
  runId: number;
  runNumber: number;
  workflowName: string;
  headBranch: string;
  headSha: string;
  prNumber: number | null;
}): string {
  const prLine = opts.prNumber
    ? `Associated PR: #${opts.prNumber} — https://github.com/${opts.repoFullName}/pull/${opts.prNumber}`
    : "No associated PR (direct push or scheduled run).";

  return [
    `A CI/CD workflow has failed and needs analysis.`,
    ``,
    `## Failure Details`,
    `- **Repository:** ${opts.repoFullName}`,
    `- **Workflow:** ${opts.workflowName}`,
    `- **Run:** #${opts.runNumber} (ID: ${opts.runId})`,
    `- **Branch:** ${opts.headBranch} @ ${opts.headSha}`,
    `- ${prLine}`,
    ``,
    `## Analysis Instructions`,
    ``,
    `1. Use \`github_get_workflow_run_jobs\` with owner="${opts.owner}", repo="${opts.repo}", run_id=${opts.runId}`,
    `   → Identify which jobs failed and note their names.`,
    ``,
    `2. Use \`github_get_workflow_run_logs\` with owner="${opts.owner}", repo="${opts.repo}", run_id=${opts.runId}, job_name=<failed_job_name>`,
    `   → Extract the exact error message and failing step.`,
    opts.prNumber ? [
      ``,
      `3. Use \`github_get_pull_request_diff\` with owner="${opts.owner}", repo="${opts.repo}", pull_number=${opts.prNumber}`,
      `   → Correlate the error with the changes in this PR.`,
      ``,
      `4. Use \`github_read_file_content\` to read the specific file that caused the error.`,
      ``,
      `5. Use \`github_add_comment\` with owner="${opts.owner}", repo="${opts.repo}", issue_number=${opts.prNumber}`,
      `   → Post your analysis (error summary, root cause, fix suggestion).`,
    ].join("\n") : [
      ``,
      `3. Use \`github_read_file_content\` to read the specific file that caused the error.`,
      ``,
      `4. Summarize the failure in your response — no PR to comment on.`,
    ].join("\n"),
    ``,
    `## Links`,
    `- Workflow run: https://github.com/${opts.repoFullName}/actions/runs/${opts.runId}`,
  ].join("\n");
}
