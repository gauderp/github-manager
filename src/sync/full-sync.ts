import type { PluginContext } from "@paperclipai/plugin-sdk";
import { githubFetch } from "../github/api-client.js";
import {
  upsertRepo, listRepos, upsertPR, upsertIssue,
  createSyncLog, completeSyncLog, saveRepoGraph,
} from "../db/queries.js";
import { detectAndLinkCards } from "./link-detector.js";
import { calculateAndSavePRMetrics } from "../metrics/metrics-calculator.js";
import type { GitHubRepo, GitHubPR, GitHubIssue } from "../types.js";

export async function runFullSync(ctx: PluginContext, companyId: string): Promise<void> {
  // Discover repos from org if none are tracked yet
  let repos = await listRepos(ctx.db);
  if (repos.length === 0) {
    const config = await ctx.config.get();
    const org = config?.defaultOrg as string | undefined;
    if (org) {
      ctx.logger.info(`No repos tracked, discovering from org: ${org}`);
      let page = 1;
      let hasMore = true;
      while (hasMore) {
        const { data } = await githubFetch(ctx, companyId, `/orgs/${org}/repos?per_page=100&page=${page}`);
        const items = data as Array<Record<string, unknown>>;
        for (const rd of items) {
          await upsertRepo(ctx.db, {
            id: rd.id as number,
            fullName: rd.full_name as string,
            owner: (rd.owner as Record<string, unknown>).login as string,
            name: rd.name as string,
            private: rd.private as boolean,
            defaultBranch: rd.default_branch as string,
            htmlUrl: rd.html_url as string,
            description: rd.description as string | null,
            language: rd.language as string | null,
            topics: (rd.topics as string[]) ?? [],
            updatedAt: rd.updated_at as string,
          });
        }
        hasMore = items.length === 100;
        page++;
      }
      repos = await listRepos(ctx.db);
    } else {
      // Try user repos as fallback
      ctx.logger.info("No repos tracked and no defaultOrg, discovering user repos");
      const { data } = await githubFetch(ctx, companyId, "/user/repos?per_page=100&sort=updated");
      const items = data as Array<Record<string, unknown>>;
      for (const rd of items) {
        await upsertRepo(ctx.db, {
          id: rd.id as number,
          fullName: rd.full_name as string,
          owner: (rd.owner as Record<string, unknown>).login as string,
          name: rd.name as string,
          private: rd.private as boolean,
          defaultBranch: rd.default_branch as string,
          htmlUrl: rd.html_url as string,
          description: rd.description as string | null,
          language: rd.language as string | null,
          topics: (rd.topics as string[]) ?? [],
          updatedAt: rd.updated_at as string,
        });
      }
      repos = await listRepos(ctx.db);
    }
    if (repos.length === 0) return;
  }

  const logId = await createSyncLog(ctx.db, "full");
  let reposSynced = 0;
  let prsSynced = 0;
  let issuesSynced = 0;
  const errors: string[] = [];

  for (const repo of repos) {
    try {
      const { data: repoData } = await githubFetch(ctx, companyId, `/repos/${repo.fullName}`);
      const rd = repoData as Record<string, unknown>;
      await upsertRepo(ctx.db, {
        id: rd.id as number,
        fullName: rd.full_name as string,
        owner: (rd.owner as Record<string, unknown>).login as string,
        name: rd.name as string,
        private: rd.private as boolean,
        defaultBranch: rd.default_branch as string,
        htmlUrl: rd.html_url as string,
        description: rd.description as string | null,
        language: rd.language as string | null,
        topics: (rd.topics as string[]) ?? [],
        updatedAt: rd.updated_at as string,
      });

      const { data: prs } = await githubFetch(
        ctx, companyId,
        `/repos/${repo.fullName}/pulls?state=open&per_page=100`,
      );
      for (const item of prs as Array<Record<string, unknown>>) {
        const pr: Omit<GitHubPR, "syncedAt"> = {
          id: item.id as number,
          repoId: repo.id,
          number: item.number as number,
          title: item.title as string,
          body: item.body as string | null,
          state: "open",
          author: (item.user as Record<string, unknown>).login as string,
          headBranch: (item.head as Record<string, unknown>).ref as string,
          baseBranch: (item.base as Record<string, unknown>).ref as string,
          htmlUrl: item.html_url as string,
          draft: item.draft as boolean,
          mergeable: item.mergeable as boolean | null,
          mergedAt: null,
          createdAt: item.created_at as string,
          updatedAt: item.updated_at as string,
        };
        await upsertPR(ctx.db, pr);
        await detectAndLinkCards(ctx, pr.id, pr.headBranch, pr.title);
        prsSynced++;

        // Note: full-sync only fetches open PRs, so merged PRs are not re-calculated here.
        // Merged PR metrics are handled by incremental-sync when a PR transitions to merged.
      }

      const { data: issues } = await githubFetch(
        ctx, companyId,
        `/repos/${repo.fullName}/issues?state=open&per_page=100&filter=all`,
      );
      for (const item of (issues as Array<Record<string, unknown>>).filter((i) => !i.pull_request)) {
        const issue: Omit<GitHubIssue, "syncedAt"> = {
          id: item.id as number,
          repoId: repo.id,
          number: item.number as number,
          title: item.title as string,
          body: item.body as string | null,
          state: item.state as string,
          author: (item.user as Record<string, unknown>).login as string,
          labels: ((item.labels as Array<Record<string, unknown>>) ?? []).map((l) => l.name as string),
          htmlUrl: item.html_url as string,
          createdAt: item.created_at as string,
          updatedAt: item.updated_at as string,
        };
        await upsertIssue(ctx.db, issue);
        issuesSynced++;
      }

      // Generate compact graph for agent context
      try {
        const { data: treeData } = await githubFetch(
          ctx, companyId,
          `/repos/${repo.fullName}/git/trees/${repo.defaultBranch}?recursive=1`,
        );
        const tree = (treeData as Record<string, unknown>).tree as Array<Record<string, unknown>>;
        const dirs: string[] = [];
        const files: string[] = [];
        for (const entry of tree) {
          const p = entry.path as string;
          if (entry.type === "tree" && p.split("/").length <= 3) dirs.push(p);
          else if (entry.type === "blob" && (p.split("/").length <= 2 || /\.(ts|js|py|go|rs|java|json|ya?ml|toml|md)$/.test(p))) files.push(p);
        }
        const graph = { dirs, files, defaultBranch: repo.defaultBranch, language: repo.language };
        await saveRepoGraph(ctx.db, repo.id, JSON.stringify(graph));
      } catch (graphErr) {
        ctx.logger.warn(`Graph generation failed for ${repo.fullName}: ${graphErr}`);
      }

      reposSynced++;
    } catch (err) {
      errors.push(`${repo.fullName}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  await completeSyncLog(ctx.db, logId, { reposSynced, prsSynced, issuesSynced, errors });
  ctx.logger.info(`Full sync done: ${reposSynced} repos, ${prsSynced} PRs, ${issuesSynced} issues`);
}
