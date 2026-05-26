import type { PluginContext, ToolRunContext, ToolResult } from "@paperclipai/plugin-sdk";
import { githubFetch } from "../github/api-client.js";
import { getRepoGraph, saveRepoGraph, getRepoByFullName } from "../db/queries.js";

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

  ctx.tools.register(
    "github_get_repo_structure",
    {
      displayName: "Get Repo Structure",
      description: "Get the cached directory and file structure of a repository. Call this FIRST before reading files to understand codebase layout.",
      parametersSchema: {
        type: "object",
        properties: {
          repo_full_name: { type: "string", description: "Repository in owner/repo format" },
        },
        required: ["repo_full_name"],
      },
    },
    async (params: unknown, runCtx: ToolRunContext): Promise<ToolResult> => {
      const { repo_full_name, refresh } = params as { repo_full_name: string; refresh?: boolean };
      const companyId = runCtx.companyId;

      // If refresh requested or no cache, regenerate
      if (refresh && companyId) {
        const repo = await getRepoByFullName(ctx.db, repo_full_name);
        if (repo) {
          const { data: treeData } = await githubFetch(
            ctx, companyId,
            `/repos/${repo_full_name}/git/trees/${repo.defaultBranch}?recursive=1`,
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
        }
      }

      const cached = await getRepoGraph(ctx.db, repo_full_name);
      if (!cached) {
        return { content: `No cached structure for ${repo_full_name}. Run a full sync first or call with refresh=true.` };
      }

      const graph = JSON.parse(cached.graphJson) as { dirs: string[]; files: string[]; defaultBranch: string; language: string | null };
      const summary = [
        `Repository: ${repo_full_name}`,
        `Language: ${graph.language ?? "unknown"}`,
        `Default branch: ${graph.defaultBranch}`,
        `Generated: ${cached.generatedAt}`,
        ``,
        `Directories (${graph.dirs.length}):`,
        ...graph.dirs.map((d) => `  ${d}/`),
        ``,
        `Key files (${graph.files.length}):`,
        ...graph.files.map((f) => `  ${f}`),
      ].join("\n");

      return { content: summary, data: graph };
    },
  );

  ctx.tools.register(
    "github_get_pr_checks",
    {
      displayName: "Get PR CI/CD Status",
      description: "Get the CI/CD check runs status for a pull request (GitHub Actions, etc)",
      parametersSchema: {
        type: "object",
        properties: {
          owner: { type: "string" },
          repo: { type: "string" },
          pull_number: { type: "number" },
        },
        required: ["owner", "repo", "pull_number"],
      },
    },
    async (params: unknown, runCtx: ToolRunContext): Promise<ToolResult> => {
      const { owner, repo, pull_number } = params as { owner: string; repo: string; pull_number: number };
      const companyId = runCtx.companyId;
      if (!companyId) return { error: "No company context" };

      // Get PR to find head SHA
      const { data: prData } = await githubFetch(ctx, companyId, `/repos/${owner}/${repo}/pulls/${pull_number}`);
      const headSha = ((prData as Record<string, unknown>).head as Record<string, unknown>).sha as string;

      // Get check runs for that commit
      const { data } = await githubFetch(ctx, companyId, `/repos/${owner}/${repo}/commits/${headSha}/check-runs`);
      const result = data as Record<string, unknown>;
      const checkRuns = (result.check_runs as Array<Record<string, unknown>>) ?? [];

      const summary = checkRuns.map((cr) => {
        const status = cr.status as string;
        const conclusion = cr.conclusion as string | null;
        const icon = conclusion === "success" ? "PASS" : conclusion === "failure" ? "FAIL" : status === "in_progress" ? "RUNNING" : "PENDING";
        return `[${icon}] ${cr.name} — ${conclusion ?? status}`;
      });

      const allPassed = checkRuns.length > 0 && checkRuns.every((cr) => cr.conclusion === "success");
      const hasFailed = checkRuns.some((cr) => cr.conclusion === "failure");

      return {
        content: [
          `CI/CD Status for PR #${pull_number} (${headSha.slice(0, 7)}):`,
          `Total checks: ${checkRuns.length}`,
          allPassed ? "All checks passed!" : hasFailed ? "Some checks FAILED" : "Checks pending...",
          "",
          ...summary,
        ].join("\n"),
        data: { checkRuns: checkRuns.map((cr) => ({ name: cr.name, status: cr.status, conclusion: cr.conclusion })), allPassed, hasFailed },
      };
    },
  );

  ctx.tools.register(
    "github_get_pr_comments",
    {
      displayName: "Get PR Review Comments",
      description: "Get all review comments and issue comments on a pull request from other reviewers",
      parametersSchema: {
        type: "object",
        properties: {
          owner: { type: "string" },
          repo: { type: "string" },
          pull_number: { type: "number" },
        },
        required: ["owner", "repo", "pull_number"],
      },
    },
    async (params: unknown, runCtx: ToolRunContext): Promise<ToolResult> => {
      const { owner, repo, pull_number } = params as { owner: string; repo: string; pull_number: number };
      const companyId = runCtx.companyId;
      if (!companyId) return { error: "No company context" };

      // Get review comments (inline on code)
      const { data: reviewComments } = await githubFetch(ctx, companyId, `/repos/${owner}/${repo}/pulls/${pull_number}/comments?per_page=100`);
      const rcs = (reviewComments as Array<Record<string, unknown>>).map((c) => ({
        author: (c.user as Record<string, unknown>).login as string,
        path: c.path as string,
        line: c.line as number | null,
        body: c.body as string,
        createdAt: c.created_at as string,
      }));

      // Get issue comments (general discussion)
      const { data: issueComments } = await githubFetch(ctx, companyId, `/repos/${owner}/${repo}/issues/${pull_number}/comments?per_page=100`);
      const ics = (issueComments as Array<Record<string, unknown>>).map((c) => ({
        author: (c.user as Record<string, unknown>).login as string,
        body: c.body as string,
        createdAt: c.created_at as string,
      }));

      // Get reviews (approve/request changes)
      const { data: reviews } = await githubFetch(ctx, companyId, `/repos/${owner}/${repo}/pulls/${pull_number}/reviews?per_page=100`);
      const rvs = (reviews as Array<Record<string, unknown>>).map((r) => ({
        author: (r.user as Record<string, unknown>).login as string,
        state: r.state as string,
        body: r.body as string | null,
        submittedAt: r.submitted_at as string,
      }));

      const lines: string[] = [`PR #${pull_number} — Review Activity:`];

      if (rvs.length > 0) {
        lines.push("", "## Reviews:");
        for (const r of rvs) {
          lines.push(`- @${r.author}: ${r.state}${r.body ? ` — "${r.body}"` : ""}`);
        }
      }

      if (rcs.length > 0) {
        lines.push("", `## Inline Comments (${rcs.length}):`);
        for (const c of rcs) {
          lines.push(`- @${c.author} on ${c.path}${c.line ? `:${c.line}` : ""}: ${c.body.slice(0, 200)}`);
        }
      }

      if (ics.length > 0) {
        lines.push("", `## Discussion Comments (${ics.length}):`);
        for (const c of ics) {
          lines.push(`- @${c.author}: ${c.body.slice(0, 200)}`);
        }
      }

      if (rvs.length === 0 && rcs.length === 0 && ics.length === 0) {
        lines.push("", "No reviews or comments yet.");
      }

      return {
        content: lines.join("\n"),
        data: { reviews: rvs, reviewComments: rcs, issueComments: ics },
      };
    },
  );
}
