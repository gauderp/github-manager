import type { PluginContext } from "@paperclipai/plugin-sdk";
import { getGithubApiBase } from "./github-env.js";

export const GITHUB_API = "https://api.github.com";
export const GITHUB_WEBHOOK_ENDPOINT = "github-events";

export type GitHubFetchContext = Pick<PluginContext, "http" | "logger">;

export async function githubFetch(
  ctx: GitHubFetchContext,
  token: string,
  path: string,
  init?: RequestInit
): Promise<Response> {
  const apiBase = getGithubApiBase();
  const url = path.startsWith("http") ? path : `${apiBase}${path}`;
  return ctx.http.fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      ...(init?.headers ?? {})
    }
  });
}

export function parseRepoFullName(fullName: string): { owner: string; repo: string } {
  const [owner, repo] = fullName.split("/");
  if (!owner || !repo) {
    throw new Error(`Invalid repository full name: ${fullName}`);
  }
  return { owner, repo };
}

export function buildInboundWebhookUrl(pluginId: string, baseUrl = "http://127.0.0.1:3100"): string {
  return `${baseUrl.replace(/\/+$/, "")}/api/plugins/${pluginId}/webhooks/${GITHUB_WEBHOOK_ENDPOINT}`;
}

function formatRateLimitMessage(res: Response): string | null {
  const remaining = res.headers.get("x-ratelimit-remaining");
  const reset = res.headers.get("x-ratelimit-reset");
  if (res.status !== 403 || remaining !== "0") {
    return null;
  }
  const resetAt =
    reset && Number.isFinite(Number(reset))
      ? new Date(Number(reset) * 1000).toISOString()
      : "unknown";
  return `GitHub API rate limit exceeded. Retry after ${resetAt}.`;
}

/** Throws with a clear message on HTTP errors, including rate limits. */
export async function assertGithubResponse(res: Response, action: string): Promise<void> {
  if (res.ok) {
    return;
  }
  const rateLimit = formatRateLimitMessage(res);
  const body = await res.text().catch(() => "");
  const detail = body.length > 0 && body.length < 500 ? `: ${body}` : "";
  throw new Error(rateLimit ?? `GitHub ${action} failed (HTTP ${res.status})${detail}`);
}
