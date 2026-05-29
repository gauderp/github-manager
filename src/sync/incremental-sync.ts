import type { PluginContext } from "@paperclipai/plugin-sdk";
import { githubFetch, isRateLimitSafe } from "../github/api-client.js";
import {
  listRepos, upsertPR, upsertIssue,
  getLastSyncTime, createSyncLog, completeSyncLog,
} from "../db/queries.js";
import { detectAndLinkCards } from "./link-detector.js";
import { calculateAndSavePRMetrics } from "../metrics/metrics-calculator.js";
import type { GitHubPR, GitHubIssue } from "../types.js";

export async function runIncrementalSync(ctx: PluginContext, companyId: string): Promise<void> {
  const repos = await listRepos(ctx.db);
  if (repos.length === 0) return;

  const lastSync = await getLastSyncTime(ctx.db);
  const since = lastSync ?? new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  const logId = await createSyncLog(ctx.db, "incremental");
  let reposSynced = 0;
  let prsSynced = 0;
  let issuesSynced = 0;
  const errors: string[] = [];

  for (const repo of repos) {
    try {
      const prResult = await syncRepoPRs(ctx, companyId, repo.id, repo.fullName, since);
      const issueResult = await syncRepoIssues(ctx, companyId, repo.id, repo.fullName, since);

      prsSynced += prResult;
      issuesSynced += issueResult;
      reposSynced++;
    } catch (err) {
      const msg = `${repo.fullName}: ${err instanceof Error ? err.message : String(err)}`;
      errors.push(msg);
      ctx.logger.error(`Sync error: ${msg}`);
    }
  }

  await completeSyncLog(ctx.db, logId, { reposSynced, prsSynced, issuesSynced, errors });
  ctx.logger.info(`Incremental sync done: ${reposSynced} repos, ${prsSynced} PRs, ${issuesSynced} issues`);
}

async function syncRepoPRs(
  ctx: PluginContext, companyId: string,
  repoId: number, fullName: string, since: string,
): Promise<number> {
  const { data, rateLimit } = await githubFetch(
    ctx, companyId,
    `/repos/${fullName}/pulls?state=all&sort=updated&direction=desc&per_page=100&since=${since}`,
  );

  if (!isRateLimitSafe(rateLimit)) {
    ctx.logger.warn(`Rate limit low (${rateLimit.remaining}), skipping remaining repos`);
  }

  const items = data as Array<Record<string, unknown>>;
  for (const item of items) {
    const merged = item.merged_at !== null && item.merged_at !== undefined;
    const state = merged ? "merged" : (item.state as string);

    const pr: Omit<GitHubPR, "syncedAt"> = {
      id: item.id as number,
      repoId,
      number: item.number as number,
      title: item.title as string,
      body: item.body as string | null,
      state: state as GitHubPR["state"],
      author: (item.user as Record<string, unknown>).login as string,
      headBranch: (item.head as Record<string, unknown>).ref as string,
      baseBranch: (item.base as Record<string, unknown>).ref as string,
      htmlUrl: item.html_url as string,
      draft: item.draft as boolean,
      mergeable: item.mergeable as boolean | null,
      mergedAt: item.merged_at as string | null,
      createdAt: item.created_at as string,
      updatedAt: item.updated_at as string,
    };

    await upsertPR(ctx.db, pr);
    await detectAndLinkCards(ctx, pr.id, pr.headBranch, pr.title);

    // Calculate engineering metrics for newly merged PRs
    if (pr.state === "merged" && pr.mergedAt) {
      await calculateAndSavePRMetrics(
        ctx, companyId, fullName,
        pr.id, repoId, pr.number, pr.createdAt, pr.mergedAt,
      );
    }
  }

  return items.length;
}

async function syncRepoIssues(
  ctx: PluginContext, companyId: string,
  repoId: number, fullName: string, since: string,
): Promise<number> {
  const { data } = await githubFetch(
    ctx, companyId,
    `/repos/${fullName}/issues?state=all&sort=updated&direction=desc&per_page=100&since=${since}&filter=all`,
  );

  const items = (data as Array<Record<string, unknown>>).filter(
    (item) => !item.pull_request,
  );

  for (const item of items) {
    const issue: Omit<GitHubIssue, "syncedAt"> = {
      id: item.id as number,
      repoId,
      number: item.number as number,
      title: item.title as string,
      body: item.body as string | null,
      state: item.state as string,
      author: (item.user as Record<string, unknown>).login as string,
      labels: ((item.labels as Array<Record<string, unknown>>) ?? []).map(
        (l) => l.name as string,
      ),
      htmlUrl: item.html_url as string,
      createdAt: item.created_at as string,
      updatedAt: item.updated_at as string,
    };

    await upsertIssue(ctx.db, issue);
  }

  return items.length;
}
