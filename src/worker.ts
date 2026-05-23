import {
  definePlugin,
  runWorker,
  type PluginContext,
  type PluginWebhookInput
} from "@paperclipai/plugin-sdk";
import {
  clearGithubAuth,
  getGithubAuthStatus,
  resolveGithubToken,
  saveGithubPat,
  saveGithubSecretRef
} from "./github-config.js";
import {
  buildInboundWebhookUrl,
  githubFetch,
  GITHUB_WEBHOOK_ENDPOINT,
  parseRepoFullName
} from "./github-api.js";
import { registerGithubReviewTools } from "./github-review-tools.js";
import type {
  GitHubIssueSummary,
  GitHubPullRequestSummary,
  GitHubRepoSummary,
  GitHubSyncCache,
  GitHubWebhookConfig,
  ReposData,
  SyncOverviewData
} from "./types.js";

const SYNC_STATE_KEY = "github.sync.cache";
const WEBHOOK_STATE_KEY = "github.webhook.config";
const TRACKED_REPOS_KEY = "github.tracked.repos";
const MAX_REPOS_PER_SYNC = 5;
const MAX_ITEMS_PER_REPO = 20;

let workerCtx: PluginContext | null = null;

function companyScope(companyId: string) {
  return { scopeKind: "company" as const, scopeId: companyId };
}

async function loadSyncCache(ctx: PluginContext, companyId: string): Promise<GitHubSyncCache | null> {
  const raw = await ctx.state.get({ ...companyScope(companyId), stateKey: SYNC_STATE_KEY });
  return (raw as GitHubSyncCache | null) ?? null;
}

async function saveSyncCache(ctx: PluginContext, companyId: string, cache: GitHubSyncCache): Promise<void> {
  await ctx.state.set({ ...companyScope(companyId), stateKey: SYNC_STATE_KEY }, cache);
}

async function loadWebhookConfig(
  ctx: PluginContext,
  companyId: string
): Promise<GitHubWebhookConfig | null> {
  const raw = await ctx.state.get({ ...companyScope(companyId), stateKey: WEBHOOK_STATE_KEY });
  return (raw as GitHubWebhookConfig | null) ?? null;
}

async function listRepos(ctx: PluginContext, companyId: string): Promise<ReposData> {
  const checkedAt = new Date().toISOString();
  const token = await resolveGithubToken(ctx, companyId);
  if (!token) {
    return {
      status: "degraded",
      checkedAt,
      message: "Configure o token GitHub em Configurações (PAT ou Secret ID)",
      repos: []
    };
  }

  const res = await githubFetch(
    ctx,
    token,
    `/user/repos?per_page=30&sort=updated&affiliation=owner,organization_member`
  );
  if (!res.ok) {
    return {
      status: "error",
      checkedAt,
      message: `GitHub API returned ${res.status}`,
      repos: []
    };
  }

  const rows = (await res.json()) as Array<{
    id: number;
    full_name: string;
    private: boolean;
    html_url: string;
    updated_at: string;
    default_branch: string;
  }>;

  const repos: GitHubRepoSummary[] = rows.map((r) => ({
    id: r.id,
    fullName: r.full_name,
    private: r.private,
    htmlUrl: r.html_url,
    updatedAt: r.updated_at,
    defaultBranch: r.default_branch
  }));

  return { status: "ok", checkedAt, repos };
}

async function resolveTrackedRepos(ctx: PluginContext, companyId: string): Promise<string[]> {
  const tracked = await ctx.state.get({ ...companyScope(companyId), stateKey: TRACKED_REPOS_KEY });
  if (Array.isArray(tracked) && tracked.length > 0) {
    return tracked.filter((r): r is string => typeof r === "string").slice(0, MAX_REPOS_PER_SYNC);
  }

  const reposData = await listRepos(ctx, companyId);
  return reposData.repos.slice(0, MAX_REPOS_PER_SYNC).map((r) => r.fullName);
}

async function fetchPullRequestsForRepo(
  ctx: PluginContext,
  token: string,
  repoFullName: string
): Promise<GitHubPullRequestSummary[]> {
  const { owner, repo } = parseRepoFullName(repoFullName);
  const res = await githubFetch(
    ctx,
    token,
    `/repos/${owner}/${repo}/pulls?state=open&per_page=${MAX_ITEMS_PER_REPO}&sort=updated&direction=desc`
  );
  if (!res.ok) {
    throw new Error(`PR sync failed for ${repoFullName}: HTTP ${res.status}`);
  }

  const rows = (await res.json()) as Array<{
    id: number;
    number: number;
    title: string;
    state: string;
    html_url: string;
    updated_at: string;
  }>;

  return rows.map((pr) => ({
    id: pr.id,
    number: pr.number,
    title: pr.title,
    state: pr.state,
    htmlUrl: pr.html_url,
    repoFullName,
    updatedAt: pr.updated_at
  }));
}

async function fetchIssuesForRepo(
  ctx: PluginContext,
  token: string,
  repoFullName: string
): Promise<GitHubIssueSummary[]> {
  const { owner, repo } = parseRepoFullName(repoFullName);
  const res = await githubFetch(
    ctx,
    token,
    `/repos/${owner}/${repo}/issues?state=open&per_page=${MAX_ITEMS_PER_REPO}&sort=updated&direction=desc`
  );
  if (!res.ok) {
    throw new Error(`Issue sync failed for ${repoFullName}: HTTP ${res.status}`);
  }

  const rows = (await res.json()) as Array<{
    id: number;
    number: number;
    title: string;
    state: string;
    html_url: string;
    updated_at: string;
    pull_request?: unknown;
  }>;

  return rows
    .filter((row) => !row.pull_request)
    .map((issue) => ({
      id: issue.id,
      number: issue.number,
      title: issue.title,
      state: issue.state,
      htmlUrl: issue.html_url,
      repoFullName,
      updatedAt: issue.updated_at
    }));
}

async function runSync(
  ctx: PluginContext,
  companyId: string,
  mode: "pullRequests" | "issues" | "all"
): Promise<GitHubSyncCache> {
  const token = await resolveGithubToken(ctx, companyId);
  if (!token) {
    throw new Error("Configure o token GitHub em Configurações antes de sincronizar");
  }

  const repos = await resolveTrackedRepos(ctx, companyId);
  const existing = (await loadSyncCache(ctx, companyId)) ?? {
    syncedAt: new Date(0).toISOString(),
    pullRequests: [],
    issues: [],
    errors: []
  };

  const errors: string[] = [];
  let pullRequests = mode === "issues" ? existing.pullRequests : [];
  let issues = mode === "pullRequests" ? existing.issues : [];

  for (const repoFullName of repos) {
    try {
      if (mode === "pullRequests" || mode === "all") {
        pullRequests = pullRequests.concat(
          await fetchPullRequestsForRepo(ctx, token, repoFullName)
        );
      }
      if (mode === "issues" || mode === "all") {
        issues = issues.concat(await fetchIssuesForRepo(ctx, token, repoFullName));
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      errors.push(message);
      ctx.logger.warn("GitHub sync repo failed", { repoFullName, message });
    }
  }

  const cache: GitHubSyncCache = {
    syncedAt: new Date().toISOString(),
    pullRequests: pullRequests
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .slice(0, MAX_ITEMS_PER_REPO * MAX_REPOS_PER_SYNC),
    issues: issues
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .slice(0, MAX_ITEMS_PER_REPO * MAX_REPOS_PER_SYNC),
    errors
  };

  await saveSyncCache(ctx, companyId, cache);
  return cache;
}

async function buildSyncOverview(ctx: PluginContext, companyId: string): Promise<SyncOverviewData> {
  const checkedAt = new Date().toISOString();
  const token = await resolveGithubToken(ctx, companyId);
  const cache = await loadSyncCache(ctx, companyId);

  if (!token) {
    return {
      status: "degraded",
      checkedAt,
      message: "Configure o token GitHub em Configurações para sincronizar PRs e issues",
      lastSyncedAt: cache?.syncedAt ?? null,
      pullRequestCount: cache?.pullRequests.length ?? 0,
      issueCount: cache?.issues.length ?? 0,
      recentPullRequests: cache?.pullRequests.slice(0, 10) ?? [],
      recentIssues: cache?.issues.slice(0, 10) ?? [],
      lastErrors: cache?.errors ?? []
    };
  }

  if (!cache) {
    return {
      status: "not_synced",
      checkedAt,
      message: "Run sync to fetch open PRs and issues",
      lastSyncedAt: null,
      pullRequestCount: 0,
      issueCount: 0,
      recentPullRequests: [],
      recentIssues: [],
      lastErrors: []
    };
  }

  return {
    status: "ok",
    checkedAt,
    message: `Last sync ${cache.syncedAt}`,
    lastSyncedAt: cache.syncedAt,
    pullRequestCount: cache.pullRequests.length,
    issueCount: cache.issues.length,
    recentPullRequests: cache.pullRequests.slice(0, 10),
    recentIssues: cache.issues.slice(0, 10),
    lastErrors: cache.errors
  };
}

async function registerGithubWebhook(
  ctx: PluginContext,
  companyId: string,
  repoFullName: string,
  events: string[]
): Promise<GitHubWebhookConfig> {
  const token = await resolveGithubToken(ctx, companyId);
  if (!token) {
    throw new Error("Configure o token GitHub em Configurações antes de registrar webhooks");
  }

  const pluginId = ctx.manifest.id;
  const inboundUrl = buildInboundWebhookUrl(pluginId);
  const { owner, repo } = parseRepoFullName(repoFullName);
  const payload = {
    name: "web",
    active: true,
    events: events.length > 0 ? events : ["pull_request", "issues"],
    config: {
      url: inboundUrl,
      content_type: "json",
      insecure_ssl: "0"
    }
  };

  const res = await githubFetch(ctx, token, `/repos/${owner}/${repo}/hooks`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`GitHub webhook registration failed (${res.status}): ${body}`);
  }

  const hook = (await res.json()) as { id?: number };
  const config: GitHubWebhookConfig = {
    repoFullName,
    events: payload.events,
    hookId: hook.id,
    configuredAt: new Date().toISOString(),
    inboundUrl
  };

  await ctx.state.set({ ...companyScope(companyId), stateKey: WEBHOOK_STATE_KEY }, config);
  return config;
}

function requireCompanyId(input: unknown): string {
  const companyId = (input as { companyId?: string })?.companyId;
  if (!companyId) {
    throw new Error("companyId is required");
  }
  return companyId;
}

async function handleGithubWebhook(input: PluginWebhookInput): Promise<void> {
  const ctx = workerCtx;
  if (!ctx) {
    return;
  }

  if (input.endpointKey !== GITHUB_WEBHOOK_ENDPOINT) {
    return;
  }

  const payload = (input.parsedBody ?? {}) as {
    action?: string;
    repository?: { full_name?: string };
  };
  const repoFullName = payload.repository?.full_name;
  if (!repoFullName) {
    return;
  }

  const companies = await ctx.companies.list();
  for (const company of companies) {
    const webhook = await loadWebhookConfig(ctx, company.id);
    if (!webhook || webhook.repoFullName !== repoFullName) {
      continue;
    }

    try {
      await runSync(ctx, company.id, "all");
      ctx.logger.info("GitHub webhook triggered sync", {
        companyId: company.id,
        repoFullName,
        action: payload.action ?? "unknown",
        requestId: input.requestId
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      ctx.logger.warn("GitHub webhook sync failed", { companyId: company.id, message });
    }
  }
}

const plugin = definePlugin({
  async setup(ctx) {
    workerCtx = ctx;

    registerGithubReviewTools(ctx);

    ctx.events.on("issue.created", async (event) => {
      const issueId = event.entityId ?? "unknown";
      await ctx.state.set({ scopeKind: "issue", scopeId: issueId, stateKey: "seen" }, true);
      ctx.logger.info("GitHub plugin observed issue.created", { issueId });
    });

    ctx.data.register("health", async ({ companyId }) => {
      if (!companyId) {
        throw new Error("companyId is required");
      }
      const cid = String(companyId);
      const auth = await getGithubAuthStatus(ctx, cid);
      const token = await resolveGithubToken(ctx, cid);
      if (!token) {
        return {
          status: "degraded" as const,
          checkedAt: new Date().toISOString(),
          message:
            auth.mode === "secret-ref"
              ? "Secret ID salvo, mas o Paperclip ainda não resolve secret refs em plugins — cole o PAT abaixo ou aguarde PAP-2394"
              : "Cole um Personal Access Token (PAT) em Configurações e clique em Salvar",
          auth
        };
      }

      const res = await githubFetch(ctx, token, "/user");

      if (!res.ok) {
        return {
          status: "error" as const,
          checkedAt: new Date().toISOString(),
          message: `GitHub API retornou ${res.status} — verifique escopos do PAT`,
          auth
        };
      }

      const user = (await res.json()) as { login?: string };
      return {
        status: "ok" as const,
        checkedAt: new Date().toISOString(),
        login: user.login ?? "unknown",
        auth
      };
    });

    ctx.data.register("repos", async ({ companyId }) => {
      if (!companyId) {
        throw new Error("companyId is required");
      }
      return listRepos(ctx, String(companyId));
    });

    ctx.data.register("syncOverview", async ({ companyId }) => {
      if (!companyId) {
        throw new Error("companyId is required");
      }
      return buildSyncOverview(ctx, String(companyId));
    });

    ctx.data.register("webhookConfig", async ({ companyId }) => {
      if (!companyId) {
        throw new Error("companyId is required");
      }
      const config = await loadWebhookConfig(ctx, String(companyId));
      return {
        configured: Boolean(config),
        config,
        inboundUrl: buildInboundWebhookUrl(ctx.manifest.id)
      };
    });

    ctx.actions.register("ping", async () => {
      return { pong: true, at: new Date().toISOString() };
    });

    ctx.actions.register("saveGithubToken", async (input) => {
      const companyId = requireCompanyId(input);
      const token = (input as { token?: string })?.token;
      if (typeof token !== "string") {
        throw new Error("token is required");
      }
      await saveGithubPat(ctx, companyId, token);
      return { saved: true, at: new Date().toISOString() };
    });

    ctx.actions.register("saveGithubSecretRef", async (input) => {
      const companyId = requireCompanyId(input);
      const secretRef = (input as { secretRef?: string })?.secretRef;
      if (typeof secretRef !== "string") {
        throw new Error("secretRef is required");
      }
      await saveGithubSecretRef(ctx, companyId, secretRef);
      return { saved: true, at: new Date().toISOString() };
    });

    ctx.actions.register("clearGithubAuth", async (input) => {
      const companyId = requireCompanyId(input);
      await clearGithubAuth(ctx, companyId);
      return { cleared: true, at: new Date().toISOString() };
    });

    ctx.actions.register("setTrackedRepos", async (input) => {
      const companyId = requireCompanyId(input);
      const repos = (input as { repos?: string[] })?.repos;
      if (!Array.isArray(repos)) {
        throw new Error("repos array is required");
      }
      const normalized = repos
        .filter((r): r is string => typeof r === "string" && r.includes("/"))
        .slice(0, MAX_REPOS_PER_SYNC);
      await ctx.state.set({ ...companyScope(companyId), stateKey: TRACKED_REPOS_KEY }, normalized);
      return { saved: true, repos: normalized, at: new Date().toISOString() };
    });

    ctx.actions.register("syncPullRequests", async (input) => {
      const companyId = requireCompanyId(input);
      const cache = await runSync(ctx, companyId, "pullRequests");
      return {
        syncedAt: cache.syncedAt,
        pullRequestCount: cache.pullRequests.length,
        errors: cache.errors
      };
    });

    ctx.actions.register("syncIssues", async (input) => {
      const companyId = requireCompanyId(input);
      const cache = await runSync(ctx, companyId, "issues");
      return {
        syncedAt: cache.syncedAt,
        issueCount: cache.issues.length,
        errors: cache.errors
      };
    });

    ctx.actions.register("syncAll", async (input) => {
      const companyId = requireCompanyId(input);
      const cache = await runSync(ctx, companyId, "all");
      return {
        syncedAt: cache.syncedAt,
        pullRequestCount: cache.pullRequests.length,
        issueCount: cache.issues.length,
        errors: cache.errors
      };
    });

    ctx.actions.register("configureWebhook", async (input) => {
      const companyId = requireCompanyId(input);
      const repoFullName = (input as { repoFullName?: string })?.repoFullName;
      const events = (input as { events?: string[] })?.events ?? ["pull_request", "issues"];
      if (!repoFullName) {
        throw new Error("repoFullName is required");
      }
      const config = await registerGithubWebhook(ctx, companyId, repoFullName, events);
      return { saved: true, config };
    });

    ctx.jobs.register("sync-github", async (job) => {
      const companies = await ctx.companies.list();
      for (const company of companies) {
        try {
          await runSync(ctx, company.id, "all");
          ctx.logger.info("Scheduled GitHub sync completed", {
            companyId: company.id,
            runId: job.runId
          });
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          ctx.logger.warn("Scheduled GitHub sync skipped", { companyId: company.id, message });
        }
      }
    });
  },

  async onHealth() {
    return { status: "ok", message: "GitHub Manager worker is running" };
  },

  async onWebhook(input) {
    await handleGithubWebhook(input);
  }
});

export default plugin;
runWorker(plugin, import.meta.url);
