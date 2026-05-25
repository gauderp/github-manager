import type { PluginContext, ToolRunContext, ToolResult } from "@paperclipai/plugin-sdk";
import { githubFetch } from "../github/api-client.js";

const MAX_DIFF_CHARS = 120_000;
const MAX_FILE_CHARS = 128_000;

export function registerReviewTools(ctx: PluginContext): void {
  ctx.tools.register(
    "github_get_pull_request_diff",
    {
      displayName: "Get PR Diff",
      description: "Get the diff of a GitHub pull request for code review",
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
      const { owner, repo, pull_number } = params as { owner: string; repo: string; pull_number: number };
      const companyId = runCtx.companyId;
      if (!companyId) return { error: "No company context" };

      const { data: prData } = await githubFetch(ctx, companyId, `/repos/${owner}/${repo}/pulls/${pull_number}`);
      const pr = prData as Record<string, unknown>;

      const { data: diffData } = await githubFetch(
        ctx, companyId,
        `/repos/${owner}/${repo}/pulls/${pull_number}`,
        { accept: "application/vnd.github.v3.diff" },
      );

      let diff = String(diffData);
      let truncated = false;
      if (diff.length > MAX_DIFF_CHARS) {
        diff = diff.slice(0, MAX_DIFF_CHARS);
        truncated = true;
      }

      const { data: filesData } = await githubFetch(
        ctx, companyId,
        `/repos/${owner}/${repo}/pulls/${pull_number}/files?per_page=100`,
      );
      const files = (filesData as Array<Record<string, unknown>>).map((f) => ({
        filename: f.filename,
        status: f.status,
        additions: f.additions,
        deletions: f.deletions,
      }));

      return {
        content: `PR #${pull_number}: ${pr.title}\nAuthor: ${(pr.user as Record<string, unknown>).login}\nFiles changed: ${files.length}${truncated ? "\n⚠️ Diff truncated" : ""}\n\n${diff}`,
        data: { pr: { title: pr.title, number: pull_number, sha: (pr.head as Record<string, unknown>).sha }, files },
      };
    },
  );

  ctx.tools.register(
    "github_read_file_content",
    {
      displayName: "Read File",
      description: "Read a file from a GitHub repository",
      parametersSchema: {
        type: "object",
        properties: {
          owner: { type: "string" },
          repo: { type: "string" },
          path: { type: "string", description: "File path in the repository" },
          ref: { type: "string", description: "Branch, tag, or commit SHA (optional)" },
        },
        required: ["owner", "repo", "path"],
      },
    },
    async (params: unknown, runCtx: ToolRunContext): Promise<ToolResult> => {
      const { owner, repo, path, ref } = params as { owner: string; repo: string; path: string; ref?: string };
      const companyId = runCtx.companyId;
      if (!companyId) return { error: "No company context" };

      const refParam = ref ? `?ref=${ref}` : "";
      const { data } = await githubFetch(
        ctx, companyId,
        `/repos/${owner}/${repo}/contents/${path}${refParam}`,
      );

      const file = data as Record<string, unknown>;
      const content = Buffer.from(file.content as string, "base64").toString("utf-8");
      const truncated = content.length > MAX_FILE_CHARS;

      return {
        content: truncated ? content.slice(0, MAX_FILE_CHARS) + "\n⚠️ Truncated" : content,
        data: { path, size: file.size, sha: file.sha },
      };
    },
  );

  ctx.tools.register(
    "github_create_review_comment",
    {
      displayName: "Add Review Comment",
      description: "Add an inline review comment to a pull request",
      parametersSchema: {
        type: "object",
        properties: {
          owner: { type: "string" },
          repo: { type: "string" },
          pull_number: { type: "number" },
          commit_id: { type: "string", description: "The SHA of the PR head commit" },
          path: { type: "string", description: "File path relative to repo root" },
          line: { type: "number", description: "Line number in the diff" },
          body: { type: "string", description: "Comment text (markdown)" },
        },
        required: ["owner", "repo", "pull_number", "commit_id", "path", "line", "body"],
      },
    },
    async (params: unknown, runCtx: ToolRunContext): Promise<ToolResult> => {
      const { owner, repo, pull_number, commit_id, path, line, body } = params as {
        owner: string; repo: string; pull_number: number;
        commit_id: string; path: string; line: number; body: string;
      };
      const companyId = runCtx.companyId;
      if (!companyId) return { error: "No company context" };

      await githubFetch(ctx, companyId, `/repos/${owner}/${repo}/pulls/${pull_number}/comments`, {
        method: "POST",
        body: { commit_id, path, line, body, side: "RIGHT" },
      });

      return { content: `Comment added to ${path}:${line}` };
    },
  );

  ctx.tools.register(
    "github_submit_pr_review",
    {
      displayName: "Submit PR Review",
      description: "Submit a pull request review with a verdict",
      parametersSchema: {
        type: "object",
        properties: {
          owner: { type: "string" },
          repo: { type: "string" },
          pull_number: { type: "number" },
          event: { type: "string", enum: ["APPROVE", "REQUEST_CHANGES", "COMMENT"] },
          body: { type: "string", description: "Review summary (markdown)" },
        },
        required: ["owner", "repo", "pull_number", "event", "body"],
      },
    },
    async (params: unknown, runCtx: ToolRunContext): Promise<ToolResult> => {
      const { owner, repo, pull_number, event, body } = params as {
        owner: string; repo: string; pull_number: number; event: string; body: string;
      };
      const companyId = runCtx.companyId;
      if (!companyId) return { error: "No company context" };

      await githubFetch(ctx, companyId, `/repos/${owner}/${repo}/pulls/${pull_number}/reviews`, {
        method: "POST",
        body: { event, body },
      });

      return { content: `Review submitted: ${event}`, data: { event } };
    },
  );

  ctx.tools.register(
    "github_list_repositories",
    {
      displayName: "List Repositories",
      description: "List tracked GitHub repositories",
      parametersSchema: { type: "object", properties: {} },
    },
    async (_params: unknown, _runCtx: ToolRunContext): Promise<ToolResult> => {
      const { listRepos } = await import("../db/queries.js");
      const repos = await listRepos(ctx.db);
      return {
        content: repos.map((r) => `${r.fullName} (${r.language ?? "unknown"})`).join("\n"),
        data: { repos },
      };
    },
  );

  ctx.tools.register(
    "github_search_issues",
    {
      displayName: "Search Issues",
      description: "Search GitHub issues and PRs using GitHub search syntax",
      parametersSchema: {
        type: "object",
        properties: {
          query: { type: "string", description: "GitHub search query (e.g. 'is:open label:bug')" },
        },
        required: ["query"],
      },
    },
    async (params: unknown, runCtx: ToolRunContext): Promise<ToolResult> => {
      const { query } = params as { query: string };
      const companyId = runCtx.companyId;
      if (!companyId) return { error: "No company context" };

      const { data } = await githubFetch(
        ctx, companyId,
        `/search/issues?q=${encodeURIComponent(query)}&per_page=20`,
      );
      const result = data as Record<string, unknown>;
      const items = (result.items as Array<Record<string, unknown>>).map((i) => ({
        title: i.title, number: i.number, state: i.state, html_url: i.html_url,
      }));

      return { content: items.map((i) => `#${i.number} ${i.title} [${i.state}]`).join("\n"), data: { items } };
    },
  );
}
