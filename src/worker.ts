import { definePlugin, runWorker } from "@paperclipai/plugin-sdk";
import type { PluginContext } from "@paperclipai/plugin-sdk";
import { registerReviewTools } from "./review/review-tools.js";
import { handleGithubWebhook } from "./sync/webhook-handler.js";
import { runIncrementalSync } from "./sync/incremental-sync.js";
import { runFullSync } from "./sync/full-sync.js";
import { runQuickCheck } from "./review/quick-check.js";
import { generateHighLevelGraph, generateCodeGraph } from "./graphify/graph-generator.js";
import {
  listRepos, listPRs, getLinksForCard,
  getLastSyncTime, upsertRepo, linkPRToCard,
  getRepoByFullName,
} from "./db/queries.js";
import { saveGithubPAT, saveGithubSecretRef, resolveGithubToken } from "./github/config.js";
import { githubFetch } from "./github/api-client.js";

let pluginCtx: PluginContext | null = null;

const plugin = definePlugin({
  async setup(ctx) {
    pluginCtx = ctx;
    ctx.logger.info("GitHub Manager v2 starting");

    // ── Tools ──
    registerReviewTools(ctx);

    // ── Jobs ──
    ctx.jobs.register("sync-github", async (job) => {
      ctx.logger.info("Running scheduled incremental sync");
      const companies = await ctx.companies.list();
      for (const company of companies) {
        try {
          await runIncrementalSync(ctx, company.id);
        } catch (err) {
          ctx.logger.error(`Sync failed for company ${company.id}: ${err}`);
        }
      }
    });

    // ── Data handlers (UI reads) ──

    ctx.data.register("repos", async ({ companyId }) => {
      const repos = await listRepos(ctx.database);
      const lastSync = await getLastSyncTime(ctx.database);
      return { repos, lastSync };
    });

    ctx.data.register("pull-requests", async ({ companyId, filters }) => {
      const f = filters as { repoId?: number; state?: string; author?: string } | undefined;
      const prs = await listPRs(ctx.database, f);
      return { pullRequests: prs };
    });

    ctx.data.register("card-prs", async ({ companyId, issueId }) => {
      const prs = await getLinksForCard(ctx.database, issueId as string);
      return { pullRequests: prs };
    });

    ctx.data.register("sync-status", async () => {
      const lastSync = await getLastSyncTime(ctx.database);
      const repos = await listRepos(ctx.database);
      const openPRs = await listPRs(ctx.database, { state: "open" });
      return {
        lastSync,
        repoCount: repos.length,
        openPRCount: openPRs.length,
      };
    });

    ctx.data.register("graph-data", async ({ companyId, repoFullName, level }) => {
      if (level === "high") {
        return await generateHighLevelGraph(ctx, companyId as string);
      }
      return await generateCodeGraph(ctx, companyId as string, repoFullName as string);
    });

    ctx.data.register("available-agents", async ({ companyId }) => {
      const agents = await ctx.agents.list({ companyId: companyId as string });
      return { agents };
    });

    // ── Action handlers (UI writes) ──

    ctx.actions.register("save-token", async ({ companyId, token }) => {
      await saveGithubPAT(ctx, companyId as string, token as string);
      return { ok: true };
    });

    ctx.actions.register("save-secret-ref", async ({ companyId, secretRef }) => {
      await saveGithubSecretRef(ctx, companyId as string, secretRef as string);
      return { ok: true };
    });

    ctx.actions.register("test-connection", async ({ companyId }) => {
      try {
        const token = await resolveGithubToken(ctx, companyId as string);
        const { data } = await githubFetch(ctx, companyId as string, "/user");
        const user = data as Record<string, unknown>;
        return { ok: true, login: user.login };
      } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : String(err) };
      }
    });

    ctx.actions.register("add-repo", async ({ companyId, fullName }) => {
      const { data } = await githubFetch(ctx, companyId as string, `/repos/${fullName}`);
      const rd = data as Record<string, unknown>;
      await upsertRepo(ctx.database, {
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
      return { ok: true };
    });

    ctx.actions.register("sync-all", async ({ companyId }) => {
      await runFullSync(ctx, companyId as string);
      return { ok: true };
    });

    ctx.actions.register("sync-incremental", async ({ companyId }) => {
      await runIncrementalSync(ctx, companyId as string);
      return { ok: true };
    });

    ctx.actions.register("link-pr-to-card", async ({ prId, issueId }) => {
      await linkPRToCard(ctx.database, prId as number, issueId as string, "manual");
      return { ok: true };
    });

    ctx.actions.register("request-review", async ({ companyId, prId, repoFullName, prNumber, agentId }) => {
      const repo = await getRepoByFullName(ctx.database, repoFullName as string);
      if (!repo) throw new Error(`Repo ${repoFullName} not found`);

      const [owner, repoName] = (repoFullName as string).split("/");

      await ctx.agents.invoke({
        agentId: agentId as string,
        companyId: companyId as string,
        message: `Please review PR #${prNumber} in ${repoFullName}. Use the github_get_pull_request_diff tool with owner="${owner}", repo="${repoName}", pull_number=${prNumber} to get the diff, then provide a thorough code review. Post your findings as inline comments using github_create_review_comment and submit your final verdict using github_submit_pr_review.`,
      });

      return { ok: true };
    });

    ctx.actions.register("run-quick-check", async ({ companyId, repoFullName, prNumber }) => {
      const [owner, repo] = (repoFullName as string).split("/");
      const result = await runQuickCheck(ctx, companyId as string, owner, repo, prNumber as number);
      return result;
    });

    ctx.actions.register("generate-graph", async ({ companyId, repoFullName, level }) => {
      if (level === "high") {
        return await generateHighLevelGraph(ctx, companyId as string);
      }
      return await generateCodeGraph(ctx, companyId as string, repoFullName as string);
    });

    // ── Managed agent reconciliation ──
    ctx.events.on("company.created", async (event) => {
      await ctx.agents.managed.reconcile(event.payload.companyId);
    });
  },

  async onHealth() {
    return { status: "ok", message: "GitHub Manager v2 running" };
  },

  async onWebhook(input) {
    if (!pluginCtx) throw new Error("Plugin not initialized");
    await handleGithubWebhook(pluginCtx, input);
  },

  async onShutdown() {
    pluginCtx = null;
  },
});

export default plugin;

runWorker(plugin);
