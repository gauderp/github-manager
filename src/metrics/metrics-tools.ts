import type { PluginContext, ToolRunContext, ToolResult } from "@paperclipai/plugin-sdk";
import { githubFetch } from "../github/api-client.js";
import { getMetricsByRepo, listRepos } from "../db/queries.js";

export function registerMetricsTools(ctx: PluginContext): void {
  ctx.tools.register(
    "github_get_pr_timeline",
    {
      displayName: "Get PR Timeline",
      description: "Get the timeline of events for a PR (created, reviewed, approved, merged)",
      parametersSchema: {
        type: "object",
        properties: {
          owner: { type: "string", description: "Repository owner" },
          repo: { type: "string", description: "Repository name" },
          pull_number: { type: "number", description: "PR number" },
        },
        required: ["owner", "repo", "pull_number"],
      },
    },
    async (params: unknown, runCtx: ToolRunContext): Promise<ToolResult> => {
      const { owner, repo, pull_number } = params as {
        owner: string; repo: string; pull_number: number;
      };
      const companyId = runCtx.companyId;
      if (!companyId) return { error: "No company context" };

      const { data } = await githubFetch(
        ctx, companyId,
        `/repos/${owner}/${repo}/issues/${pull_number}/timeline?per_page=100`,
        { accept: "application/vnd.github.mockingbird-preview+json" },
      );

      const events = data as Array<Record<string, unknown>>;
      const relevant = events
        .filter((e) =>
          ["reviewed", "ready_for_review", "merged", "commented",
           "assigned", "labeled", "closed"].includes(e.event as string),
        )
        .map((e) => ({
          event: e.event as string,
          actor: e.actor
            ? ((e.actor as Record<string, unknown>).login as string)
            : (e.user ? ((e.user as Record<string, unknown>).login as string) : null),
          createdAt: (e.created_at ?? e.submitted_at ?? e.merged_at) as string,
          state: e.state as string | undefined,
          body: e.body ? (e.body as string).slice(0, 300) : undefined,
        }));

      const lines = relevant.map((e) => {
        const who = e.actor ? `@${e.actor}` : "?";
        const when = e.createdAt ? new Date(e.createdAt).toISOString().slice(0, 16).replace("T", " ") : "";
        const extra = e.state ? ` [${e.state}]` : "";
        return `${when} — ${e.event}${extra} by ${who}`;
      });

      return {
        content: [`PR #${pull_number} Timeline (${relevant.length} events):`, ...lines].join("\n"),
        data: { events: relevant },
      };
    },
  );

  ctx.tools.register(
    "github_get_contributor_stats",
    {
      displayName: "Get Contributor Stats",
      description: "Get contributor activity stats (commits, PRs, reviews) for a time period",
      parametersSchema: {
        type: "object",
        properties: {
          owner: { type: "string" },
          repo: { type: "string" },
          since: { type: "string", description: "ISO date string (e.g. 2026-01-01)" },
          until: { type: "string", description: "ISO date string (optional, defaults to now)" },
        },
        required: ["owner", "repo", "since"],
      },
    },
    async (params: unknown, runCtx: ToolRunContext): Promise<ToolResult> => {
      const { owner, repo, since, until } = params as {
        owner: string; repo: string; since: string; until?: string;
      };
      const companyId = runCtx.companyId;
      if (!companyId) return { error: "No company context" };

      const { data: statsData } = await githubFetch(
        ctx, companyId,
        `/repos/${owner}/${repo}/stats/contributors`,
      );

      const sinceTs = new Date(since).getTime();
      const untilTs = until ? new Date(until).getTime() : Date.now();

      const contributors: Record<string, { commits: number; additions: number; deletions: number }> = {};
      for (const contributor of (statsData as Array<Record<string, unknown>>) ?? []) {
        const login = (contributor.author as Record<string, unknown>).login as string;
        let commits = 0;
        let additions = 0;
        let deletions = 0;
        for (const week of (contributor.weeks as Array<Record<string, unknown>>) ?? []) {
          const weekTs = (week.w as number) * 1000;
          if (weekTs >= sinceTs && weekTs <= untilTs) {
            commits += week.c as number;
            additions += week.a as number;
            deletions += week.d as number;
          }
        }
        if (commits > 0 || additions > 0) {
          contributors[login] = { commits, additions, deletions };
        }
      }

      // Enrich with local PR data
      const repos = await listRepos(ctx.db);
      const repoRecord = repos.find((r) => r.owner === owner && r.name === repo);
      const prStats: Record<string, { opened: number; merged: number }> = {};

      if (repoRecord) {
        const metrics = await getMetricsByRepo(ctx.db, repoRecord.id, since, until);
        for (const m of metrics) {
          if (m.mergedBy) {
            if (!prStats[m.mergedBy]) prStats[m.mergedBy] = { opened: 0, merged: 0 };
            prStats[m.mergedBy].merged++;
          }
        }
      }

      const stats = Object.entries(contributors)
        .map(([login, c]) => ({
          login,
          commits: c.commits,
          additions: c.additions,
          deletions: c.deletions,
          pullRequestsMerged: prStats[login]?.merged ?? 0,
        }))
        .sort((a, b) => b.commits - a.commits);

      const lines = stats.map((s) =>
        `@${s.login}: ${s.commits} commits, +${s.additions}/-${s.deletions} lines, ${s.pullRequestsMerged} PRs merged`,
      );

      return {
        content: [`Contributor stats for ${owner}/${repo} since ${since}:`, ...lines].join("\n"),
        data: { contributors: stats },
      };
    },
  );

  ctx.tools.register(
    "github_search_code",
    {
      displayName: "Search Code",
      description: "Search code across all tracked repositories using GitHub code search",
      parametersSchema: {
        type: "object",
        properties: {
          query: { type: "string", description: "GitHub code search query (e.g. 'AuthService language:typescript')" },
          owner: { type: "string", description: "Filter by org/owner (optional)" },
        },
        required: ["query"],
      },
    },
    async (params: unknown, runCtx: ToolRunContext): Promise<ToolResult> => {
      const { query, owner } = params as { query: string; owner?: string };
      const companyId = runCtx.companyId;
      if (!companyId) return { error: "No company context" };

      const q = owner ? `${query}+org:${owner}` : query;
      const { data } = await githubFetch(
        ctx, companyId,
        `/search/code?q=${encodeURIComponent(q)}&per_page=20`,
      );

      const result = data as Record<string, unknown>;
      const items = (result.items as Array<Record<string, unknown>>) ?? [];

      const lines = items.map((item) => {
        const repoName = (item.repository as Record<string, unknown>).full_name as string;
        return `${repoName}: ${item.path} (${item.html_url})`;
      });

      return {
        content: [
          `Code search results for "${query}"${owner ? ` in org:${owner}` : ""} (${items.length} results):`,
          ...lines,
        ].join("\n"),
        data: {
          totalCount: result.total_count as number,
          items: items.map((i) => ({
            path: i.path,
            repo: (i.repository as Record<string, unknown>).full_name,
            url: i.html_url,
          })),
        },
      };
    },
  );
}
