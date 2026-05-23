import type { PluginContext, ToolResult, ToolRunContext } from "@paperclipai/plugin-sdk";
import { getGithubDefaultOwner } from "./github-env.js";
import { assertGithubResponse, githubFetch } from "./github-api.js";
import { resolveGithubToken } from "./github-config.js";

const MAX_DIFF_CHARS = 120_000;
const MAX_FILE_PATCH_CHARS = 32_000;

type OwnerRepo = { owner: string; repo: string };

function requireString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${field} is required`);
  }
  return value.trim();
}

function requireNumber(value: unknown, field: string): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n) || n < 1) {
    throw new Error(`${field} must be a positive number`);
  }
  return Math.floor(n);
}

function resolveOwnerRepo(params: Record<string, unknown>): OwnerRepo {
  const owner = requireString(params.owner, "owner");
  const repo = requireString(params.repo, "repo");
  return { owner, repo };
}

async function resolveTokenForRun(
  ctx: PluginContext,
  runCtx: ToolRunContext
): Promise<string> {
  const companyToken = await resolveGithubToken(ctx, runCtx.companyId);
  if (companyToken) {
    return companyToken;
  }
  const envToken = process.env.GITHUB_TOKEN?.trim();
  if (envToken) {
    return envToken;
  }
  throw new Error(
    "GitHub token not configured — save a PAT in GitHub → Configurações or set GITHUB_TOKEN"
  );
}

function toolJson(data: unknown, summary?: string): ToolResult {
  return {
    content: summary ?? JSON.stringify(data, null, 2),
    data
  };
}

function truncateDiff(diff: string): { diff: string; truncated: boolean; originalLength: number } {
  if (diff.length <= MAX_DIFF_CHARS) {
    return { diff, truncated: false, originalLength: diff.length };
  }
  const head = diff.slice(0, MAX_DIFF_CHARS);
  const notice = `\n\n… [diff truncated: ${diff.length} chars total, showing first ${MAX_DIFF_CHARS}] …\n`;
  return {
    diff: head + notice,
    truncated: true,
    originalLength: diff.length
  };
}

async function fetchPullRequestDiff(
  ctx: PluginContext,
  token: string,
  { owner, repo }: OwnerRepo,
  prNumber: number
): Promise<ToolResult> {
  const metaRes = await githubFetch(
    ctx,
    token,
    `/repos/${owner}/${repo}/pulls/${prNumber}`
  );
  await assertGithubResponse(metaRes, "fetch pull request");
  const pr = (await metaRes.json()) as {
    number: number;
    title: string;
    state: string;
    html_url: string;
    user?: { login?: string };
    head?: { sha?: string; ref?: string };
    base?: { ref?: string };
    merged_at?: string | null;
    draft?: boolean;
  };

  const diffRes = await githubFetch(
    ctx,
    token,
    `/repos/${owner}/${repo}/pulls/${prNumber}`,
    { headers: { Accept: "application/vnd.github.diff" } }
  );
  await assertGithubResponse(diffRes, "fetch pull request diff");
  let diffText = await diffRes.text();
  const { diff, truncated, originalLength } = truncateDiff(diffText);
  diffText = diff;

  let files: Array<{ filename: string; status: string; additions: number; deletions: number }> =
    [];
  if (truncated) {
    const filesRes = await githubFetch(
      ctx,
      token,
      `/repos/${owner}/${repo}/pulls/${prNumber}/files?per_page=100`
    );
    if (filesRes.ok) {
      const rows = (await filesRes.json()) as Array<{
        filename: string;
        status: string;
        additions: number;
        deletions: number;
        patch?: string;
      }>;
      files = rows.map((f) => ({
        filename: f.filename,
        status: f.status,
        additions: f.additions,
        deletions: f.deletions
      }));
    }
  }

  const payload = {
    pullRequest: {
      number: pr.number,
      title: pr.title,
      state: pr.state,
      htmlUrl: pr.html_url,
      author: pr.user?.login ?? "unknown",
      headSha: pr.head?.sha ?? null,
      headRef: pr.head?.ref ?? null,
      baseRef: pr.base?.ref ?? null,
      draft: pr.draft ?? false,
      mergedAt: pr.merged_at ?? null
    },
    diff: diffText,
    truncated,
    diffOriginalLength: originalLength,
    changedFiles: files
  };

  return toolJson(
    payload,
    truncated
      ? `PR #${prNumber} "${pr.title}" — diff truncated (${originalLength} chars)`
      : `PR #${prNumber} "${pr.title}" — full diff (${originalLength} chars)`
  );
}

async function createReviewComment(
  ctx: PluginContext,
  token: string,
  params: Record<string, unknown>
): Promise<ToolResult> {
  const { owner, repo } = resolveOwnerRepo(params);
  const prNumber = requireNumber(params.pr_number, "pr_number");
  const commitId = requireString(params.commit_id, "commit_id");
  const path = requireString(params.path, "path");
  const line = requireNumber(params.line, "line");
  const body = requireString(params.body, "body");

  const res = await githubFetch(
    ctx,
    token,
    `/repos/${owner}/${repo}/pulls/${prNumber}/comments`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        body,
        commit_id: commitId,
        path,
        line,
        side: "RIGHT"
      })
    }
  );
  await assertGithubResponse(res, "create review comment");
  const comment = (await res.json()) as { id: number; html_url?: string };
  return toolJson(
    { id: comment.id, htmlUrl: comment.html_url ?? null },
    `Review comment created on ${path}:${line}`
  );
}

async function submitPrReview(
  ctx: PluginContext,
  token: string,
  params: Record<string, unknown>
): Promise<ToolResult> {
  const { owner, repo } = resolveOwnerRepo(params);
  const prNumber = requireNumber(params.pr_number, "pr_number");
  const event = requireString(params.event, "event").toUpperCase();
  const body = requireString(params.body, "body");

  if (!["APPROVE", "REQUEST_CHANGES", "COMMENT"].includes(event)) {
    throw new Error('event must be APPROVE, REQUEST_CHANGES, or COMMENT');
  }

  const res = await githubFetch(
    ctx,
    token,
    `/repos/${owner}/${repo}/pulls/${prNumber}/reviews`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ event, body })
    }
  );
  await assertGithubResponse(res, "submit pull request review");
  const review = (await res.json()) as {
    id: number;
    state: string;
    html_url?: string;
  };
  return toolJson(
    { id: review.id, state: review.state, htmlUrl: review.html_url ?? null },
    `Review submitted: ${review.state}`
  );
}

async function readFileContent(
  ctx: PluginContext,
  token: string,
  params: Record<string, unknown>
): Promise<ToolResult> {
  const { owner, repo } = resolveOwnerRepo(params);
  const path = requireString(params.path, "path").replace(/^\/+/, "");
  const ref =
    typeof params.ref === "string" && params.ref.trim().length > 0
      ? params.ref.trim()
      : undefined;

  const query = ref ? `?ref=${encodeURIComponent(ref)}` : "";
  const res = await githubFetch(
    ctx,
    token,
    `/repos/${owner}/${repo}/contents/${path.split("/").map(encodeURIComponent).join("/")}${query}`
  );
  await assertGithubResponse(res, "read file content");
  const file = (await res.json()) as {
    type: string;
    encoding?: string;
    content?: string;
    size?: number;
    sha?: string;
  };

  if (file.type !== "file" || !file.content) {
    throw new Error(`Path is not a file or is too large for API: ${path}`);
  }

  const decoded = Buffer.from(file.content.replace(/\n/g, ""), "base64").toString("utf8");
  if (decoded.length > MAX_FILE_PATCH_CHARS * 4) {
    return toolJson(
      {
        path,
        ref: ref ?? "default",
        truncated: true,
        size: file.size ?? decoded.length,
        content: decoded.slice(0, MAX_FILE_PATCH_CHARS * 4),
        message: `File content truncated to ${MAX_FILE_PATCH_CHARS * 4} characters`
      },
      `File ${path} (truncated)`
    );
  }

  return toolJson(
    { path, ref: ref ?? "default", sha: file.sha ?? null, size: file.size ?? decoded.length, content: decoded },
    `File ${path} (${decoded.length} chars)`
  );
}

async function listRepositories(
  ctx: PluginContext,
  token: string,
  params: Record<string, unknown>
): Promise<ToolResult> {
  const defaultOwner = getGithubDefaultOwner();
  const owner =
    typeof params.owner === "string" && params.owner.trim().length > 0
      ? params.owner.trim()
      : defaultOwner;

  const perPage = Math.min(
    100,
    typeof params.per_page === "number" ? params.per_page : Number(params.per_page) || 30
  );

  let path: string;
  if (owner) {
    const orgProbe = await githubFetch(ctx, token, `/orgs/${owner}`);
    path = orgProbe.ok
      ? `/orgs/${owner}/repos?per_page=${perPage}&sort=updated`
      : `/users/${owner}/repos?per_page=${perPage}&sort=updated`;
  } else {
    path = `/user/repos?per_page=${perPage}&sort=updated&affiliation=owner,organization_member`;
  }

  const res = await githubFetch(ctx, token, path);
  await assertGithubResponse(res, "list repositories");
  const rows = (await res.json()) as Array<{
    id: number;
    full_name: string;
    private: boolean;
    html_url: string;
    default_branch: string;
    updated_at: string;
  }>;

  const repos = rows.map((r) => ({
    id: r.id,
    fullName: r.full_name,
    private: r.private,
    htmlUrl: r.html_url,
    defaultBranch: r.default_branch,
    updatedAt: r.updated_at
  }));

  return toolJson({ owner: owner ?? null, count: repos.length, repos });
}

async function searchIssues(
  ctx: PluginContext,
  token: string,
  params: Record<string, unknown>
): Promise<ToolResult> {
  const query = requireString(params.q ?? params.query, "q");
  const perPage = Math.min(
    100,
    typeof params.per_page === "number" ? params.per_page : Number(params.per_page) || 20
  );

  const res = await githubFetch(
    ctx,
    token,
    `/search/issues?q=${encodeURIComponent(query)}&per_page=${perPage}`
  );
  await assertGithubResponse(res, "search issues");
  const body = (await res.json()) as {
    total_count: number;
    incomplete_results?: boolean;
    items: Array<{
      id: number;
      number: number;
      title: string;
      state: string;
      html_url: string;
      repository_url: string;
      updated_at: string;
    }>;
  };

  const issues = body.items.map((item) => {
    const repoMatch = item.repository_url.match(/repos\/([^/]+)\/([^/]+)$/);
    const repoFullName =
      repoMatch && repoMatch[1] && repoMatch[2] ? `${repoMatch[1]}/${repoMatch[2]}` : null;
    return {
      id: item.id,
      number: item.number,
      title: item.title,
      state: item.state,
      htmlUrl: item.html_url,
      repoFullName,
      updatedAt: item.updated_at
    };
  });

  return toolJson({
    totalCount: body.total_count,
    incompleteResults: body.incomplete_results ?? false,
    count: issues.length,
    issues
  });
}

const ownerRepoSchema = {
  type: "object",
  properties: {
    owner: { type: "string", description: "Repository owner (user or org)" },
    repo: { type: "string", description: "Repository name" }
  },
  required: ["owner", "repo"]
} as const;

export function registerGithubReviewTools(ctx: PluginContext): void {
  const wrap =
    (
      name: string,
      declaration: {
        displayName: string;
        description: string;
        parametersSchema: Record<string, unknown>;
      },
      handler: (
        ctx: PluginContext,
        token: string,
        params: Record<string, unknown>
      ) => Promise<ToolResult>
    ) => {
      ctx.tools.register(name, declaration, async (params, runCtx) => {
        try {
          const token = await resolveTokenForRun(ctx, runCtx);
          return await handler(ctx, token, (params ?? {}) as Record<string, unknown>);
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          return { error: message, content: message };
        }
      });
    };

  wrap(
    "github_get_pull_request_diff",
    {
      displayName: "Get PR diff",
      description:
        "Returns pull request metadata and unified diff. Large diffs are truncated with a file list.",
      parametersSchema: {
        ...ownerRepoSchema,
        properties: {
          ...ownerRepoSchema.properties,
          pr_number: { type: "integer", description: "Pull request number" }
        },
        required: ["owner", "repo", "pr_number"]
      }
    },
    async (ctx, token, params) => {
      const { owner, repo } = resolveOwnerRepo(params);
      const prNumber = requireNumber(params.pr_number, "pr_number");
      return fetchPullRequestDiff(ctx, token, { owner, repo }, prNumber);
    }
  );

  wrap(
    "github_create_review_comment",
    {
      displayName: "Create PR review comment",
      description: "Adds an inline review comment on a specific line in a pull request diff.",
      parametersSchema: {
        ...ownerRepoSchema,
        properties: {
          ...ownerRepoSchema.properties,
          pr_number: { type: "integer" },
          commit_id: { type: "string", description: "Head commit SHA" },
          path: { type: "string", description: "File path in the repo" },
          line: { type: "integer", description: "Line number in the modified file" },
          body: { type: "string", description: "Comment text" }
        },
        required: ["owner", "repo", "pr_number", "commit_id", "path", "line", "body"]
      }
    },
    async (ctx, token, params) => createReviewComment(ctx, token, params)
  );

  wrap(
    "github_submit_pr_review",
    {
      displayName: "Submit PR review",
      description: "Submits a pull request review with APPROVE, REQUEST_CHANGES, or COMMENT.",
      parametersSchema: {
        ...ownerRepoSchema,
        properties: {
          ...ownerRepoSchema.properties,
          pr_number: { type: "integer" },
          event: {
            type: "string",
            enum: ["APPROVE", "REQUEST_CHANGES", "COMMENT"],
            description: "Review verdict"
          },
          body: { type: "string", description: "Summary comment for the review" }
        },
        required: ["owner", "repo", "pr_number", "event", "body"]
      }
    },
    async (ctx, token, params) => submitPrReview(ctx, token, params)
  );

  wrap(
    "github_read_file_content",
    {
      displayName: "Read repository file",
      description: "Reads full file content from a repository at an optional ref (branch or SHA).",
      parametersSchema: {
        ...ownerRepoSchema,
        properties: {
          ...ownerRepoSchema.properties,
          path: { type: "string", description: "Path to the file" },
          ref: { type: "string", description: "Branch name or commit SHA (optional)" }
        },
        required: ["owner", "repo", "path"]
      }
    },
    async (ctx, token, params) => readFileContent(ctx, token, params)
  );

  wrap(
    "github_list_repositories",
    {
      displayName: "List GitHub repositories",
      description:
        "Lists repositories for an owner/org, or the authenticated user when owner is omitted.",
      parametersSchema: {
        type: "object",
        properties: {
          owner: {
            type: "string",
            description: "Org or user (defaults to GITHUB_DEFAULT_OWNER or authenticated user)"
          },
          per_page: { type: "integer", description: "Page size (max 100)" }
        }
      }
    },
    async (ctx, token, params) => listRepositories(ctx, token, params)
  );

  wrap(
    "github_search_issues",
    {
      displayName: "Search GitHub issues",
      description: "Searches issues using GitHub issue search syntax (q parameter).",
      parametersSchema: {
        type: "object",
        properties: {
          q: { type: "string", description: "GitHub search query" },
          per_page: { type: "integer", description: "Results per page (max 100)" }
        },
        required: ["q"]
      }
    },
    async (ctx, token, params) => searchIssues(ctx, token, params)
  );
}
