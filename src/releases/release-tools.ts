import type { PluginContext, ToolRunContext, ToolResult } from "@paperclipai/plugin-sdk";
import { githubFetch } from "../github/api-client.js";

export function registerReleaseTools(ctx: PluginContext): void {
  // ── github_list_commits_between ──
  ctx.tools.register(
    "github_list_commits_between",
    {
      displayName: "List Commits Between Refs",
      description: "List commits between two refs (tags, branches, or SHAs)",
      parametersSchema: {
        type: "object",
        properties: {
          owner: { type: "string" },
          repo: { type: "string" },
          base: { type: "string", description: "Base ref (tag, branch, or SHA)" },
          head: { type: "string", description: "Head ref (defaults to HEAD / default branch)" },
        },
        required: ["owner", "repo", "base"],
      },
    },
    async (params: unknown, runCtx: ToolRunContext): Promise<ToolResult> => {
      const { owner, repo, base, head } = params as {
        owner: string; repo: string; base: string; head?: string;
      };
      const companyId = runCtx.companyId;
      if (!companyId) return { error: "No company context" };

      const headRef = head ?? "HEAD";
      const { data } = await githubFetch(
        ctx, companyId,
        `/repos/${owner}/${repo}/compare/${encodeURIComponent(base)}...${encodeURIComponent(headRef)}`,
      );

      const result = data as Record<string, unknown>;
      const commits = (result.commits as Array<Record<string, unknown>>) ?? [];

      const items = commits.map((c) => {
        const commitData = c.commit as Record<string, unknown>;
        const authorData = commitData.author as Record<string, unknown>;
        const msgLines = (commitData.message as string).split("\n");
        return {
          sha: (c.sha as string).slice(0, 8),
          message: msgLines[0],
          author: ((c.author as Record<string, unknown>)?.login as string) ?? (authorData?.name as string) ?? "unknown",
          date: authorData?.date as string ?? "",
          url: c.html_url as string,
        };
      });

      const lines = items.map((c) => `${c.sha} ${c.message} — @${c.author}`);

      return {
        content: [
          `Commits from ${base} to ${headRef} in ${owner}/${repo} (${items.length} commits):`,
          ...lines,
        ].join("\n"),
        data: { commits: items, aheadBy: result.ahead_by as number },
      };
    },
  );

  // ── github_list_releases ──
  ctx.tools.register(
    "github_list_releases",
    {
      displayName: "List Releases",
      description: "List releases for a repository",
      parametersSchema: {
        type: "object",
        properties: {
          owner: { type: "string" },
          repo: { type: "string" },
          per_page: { type: "number", description: "Number of releases to return (default 10)" },
        },
        required: ["owner", "repo"],
      },
    },
    async (params: unknown, runCtx: ToolRunContext): Promise<ToolResult> => {
      const { owner, repo, per_page } = params as {
        owner: string; repo: string; per_page?: number;
      };
      const companyId = runCtx.companyId;
      if (!companyId) return { error: "No company context" };

      const limit = per_page ?? 10;
      const { data } = await githubFetch(
        ctx, companyId,
        `/repos/${owner}/${repo}/releases?per_page=${limit}`,
      );

      const releases = (data as Array<Record<string, unknown>>).map((r) => ({
        id: r.id as number,
        tagName: r.tag_name as string,
        name: r.name as string,
        draft: r.draft as boolean,
        prerelease: r.prerelease as boolean,
        publishedAt: r.published_at as string | null,
        htmlUrl: r.html_url as string,
        bodyLength: ((r.body as string) ?? "").length,
      }));

      const lines = releases.map((r) => {
        const flags = [r.draft ? "DRAFT" : "", r.prerelease ? "PRE" : ""].filter(Boolean).join(",");
        const published = r.publishedAt ? r.publishedAt.slice(0, 10) : "unpublished";
        return `${r.tagName} "${r.name}" — ${published}${flags ? ` [${flags}]` : ""}`;
      });

      return {
        content: [`Releases for ${owner}/${repo} (${releases.length}):`, ...lines].join("\n"),
        data: { releases },
      };
    },
  );

  // ── github_create_release ──
  ctx.tools.register(
    "github_create_release",
    {
      displayName: "Create Release",
      description: "Create a GitHub release with generated notes. Always creates as DRAFT for safety — publish manually.",
      parametersSchema: {
        type: "object",
        properties: {
          owner: { type: "string" },
          repo: { type: "string" },
          tag_name: { type: "string", description: "Git tag name (e.g. v1.2.0)" },
          name: { type: "string", description: "Release title" },
          body: { type: "string", description: "Release notes in markdown" },
          draft: { type: "boolean", description: "Create as draft (defaults to true — always recommended)" },
          prerelease: { type: "boolean", description: "Mark as pre-release (default false)" },
        },
        required: ["owner", "repo", "tag_name", "name", "body"],
      },
    },
    async (params: unknown, runCtx: ToolRunContext): Promise<ToolResult> => {
      const { owner, repo, tag_name, name, body, draft, prerelease } = params as {
        owner: string; repo: string; tag_name: string;
        name: string; body: string; draft?: boolean; prerelease?: boolean;
      };
      const companyId = runCtx.companyId;
      if (!companyId) return { error: "No company context" };

      const isDraft = draft !== false;

      const { data } = await githubFetch(
        ctx, companyId,
        `/repos/${owner}/${repo}/releases`,
        {
          method: "POST",
          body: {
            tag_name,
            name,
            body,
            draft: isDraft,
            prerelease: prerelease ?? false,
          },
        },
      );

      const release = data as Record<string, unknown>;
      return {
        content: [
          `Release created: ${release.html_url}`,
          `Tag: ${release.tag_name}`,
          `Status: ${isDraft ? "DRAFT (not yet published)" : "PUBLISHED"}`,
        ].join("\n"),
        data: {
          id: release.id,
          tagName: release.tag_name,
          htmlUrl: release.html_url,
          draft: release.draft,
        },
      };
    },
  );
}
