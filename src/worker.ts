import { definePlugin, runWorker } from "@paperclipai/plugin-sdk";
import type { PluginContext } from "@paperclipai/plugin-sdk";
import { registerReviewTools } from "./review/review-tools.js";
import { registerTriageTools } from "./triage/triage-tools.js";
import { registerCITools } from "./ci/ci-tools.js";
import { runDeployGate, formatDeployGateResult } from "./ci/deploy-gate.js";
import { handleGithubWebhook } from "./sync/webhook-handler.js";
import { runIncrementalSync } from "./sync/incremental-sync.js";
import { runFullSync } from "./sync/full-sync.js";
import { runQuickCheck } from "./review/quick-check.js";
import { generateHighLevelGraph, generateCodeGraph } from "./graphify/graph-generator.js";
import {
  listRepos, listPRs, getLinksForCard,
  getLastSyncTime, upsertRepo, linkPRToCard,
  getRepoByFullName,
  listTriageRules, upsertTriageRule, updateTriageRule, deleteTriageRule,
} from "./db/queries.js";
import { saveGithubPAT, saveGithubSecretRef, resolveGithubToken } from "./github/config.js";
import { githubFetch } from "./github/api-client.js";

let pluginCtx: PluginContext | null = null;

const plugin = definePlugin({
  async setup(ctx) {
    pluginCtx = ctx;
    ctx.logger.info("GitHub Manager v3.1 starting");

    // ── Tools ──
    registerReviewTools(ctx);
    registerTriageTools(ctx);
    registerCITools(ctx);

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
      const repos = await listRepos(ctx.db);
      const lastSync = await getLastSyncTime(ctx.db);
      return { repos, lastSync };
    });

    ctx.data.register("pull-requests", async ({ companyId, filters }) => {
      const f = filters as { repoId?: number; state?: string; author?: string } | undefined;
      const prs = await listPRs(ctx.db, f);
      return { pullRequests: prs };
    });

    ctx.data.register("card-prs", async ({ companyId, issueId }) => {
      const prs = await getLinksForCard(ctx.db, issueId as string);
      return { pullRequests: prs };
    });

    ctx.data.register("sync-status", async () => {
      const lastSync = await getLastSyncTime(ctx.db);
      const repos = await listRepos(ctx.db);
      const openPRs = await listPRs(ctx.db, { state: "open" });
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

    ctx.data.register("triage-rules", async ({ companyId, repoId }) => {
      if (!repoId) return { rules: [] };
      const rules = await listTriageRules(ctx.db, repoId as number);
      return { rules };
    });

    ctx.data.register("review-guidelines", async ({ companyId, repoId }) => {
      if (!companyId || !repoId) return { guidelines: "" };
      const guidelines = await ctx.state.get({
        scopeKind: "company",
        scopeId: companyId as string,
        stateKey: `review-guidelines-${repoId}`,
      }) as string | undefined;
      return { guidelines: guidelines ?? "" };
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
      await linkPRToCard(ctx.db, prId as number, issueId as string, "manual");
      return { ok: true };
    });

    ctx.actions.register("request-review", async ({ companyId, prId, repoFullName, prNumber }) => {
      const [owner, repoName] = (repoFullName as string).split("/");

      const issue = await ctx.issues.create({
        companyId: companyId as string,
        title: `Code Review: ${repoFullName}#${prNumber}`,
        description: [
          `Review PR #${prNumber} in ${repoFullName}.`,
          ``,
          `## Instructions`,
          `1. Use \`github_get_repo_structure\` with repo_full_name="${repoFullName}" to understand the codebase`,
          `2. Use \`github_get_pull_request_diff\` with owner="${owner}", repo="${repoName}", pull_number=${prNumber} to get the diff`,
          `3. Read relevant files with \`github_read_file_content\` for context`,
          `4. Post inline comments with \`github_create_review_comment\``,
          `5. Submit your verdict with \`github_submit_pr_review\``,
          ``,
          `PR link: https://github.com/${repoFullName}/pull/${prNumber}`,
        ].join("\n"),
        originKind: "plugin:github_review",
        originId: `${repoFullName}#${prNumber}`,
      });

      // Link the PR to the new Paperclip issue
      await linkPRToCard(ctx.db, prId as number, issue.id, "manual");

      return { ok: true, issueId: issue.id };
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

    ctx.actions.register("save-triage-rule", async ({ companyId, rule }) => {
      const r = rule as {
        id?: number;
        repoId: number;
        ruleName: string;
        conditionType: "keyword" | "path" | "author" | "label_prefix";
        conditionValue: string;
        actionType: "add_label" | "set_assignee" | "set_priority";
        actionValue: string;
        priority: number;
        enabled: boolean;
      };

      if (r.id) {
        await updateTriageRule(ctx.db, r.id, {
          ruleName: r.ruleName,
          conditionType: r.conditionType,
          conditionValue: r.conditionValue,
          actionType: r.actionType,
          actionValue: r.actionValue,
          priority: r.priority,
          enabled: r.enabled,
        });
        return { ok: true, id: r.id };
      } else {
        await upsertTriageRule(ctx.db, {
          repoId: r.repoId,
          ruleName: r.ruleName,
          conditionType: r.conditionType,
          conditionValue: r.conditionValue,
          actionType: r.actionType,
          actionValue: r.actionValue,
          priority: r.priority,
          enabled: r.enabled,
        });
        return { ok: true };
      }
    });

    ctx.actions.register("delete-triage-rule", async ({ companyId, ruleId }) => {
      await deleteTriageRule(ctx.db, ruleId as number);
      return { ok: true };
    });

    ctx.actions.register("save-review-guidelines", async ({ companyId, repoId, guidelines }) => {
      await ctx.state.set({
        scopeKind: "company",
        scopeId: companyId as string,
        stateKey: `review-guidelines-${repoId}`,
      }, guidelines as string);
      return { ok: true };
    });

    ctx.actions.register("run-deploy-gate", async ({ companyId, repoFullName, prNumber, targetEnvironment }) => {
      const [owner, repo] = (repoFullName as string).split("/");
      const result = await runDeployGate(ctx, companyId as string, {
        owner,
        repo,
        pullNumber: prNumber as number,
        targetEnvironment: targetEnvironment as string | undefined,
      });
      return {
        passed:  result.passed,
        summary: formatDeployGateResult(result),
        checks:  result.checks,
      };
    });

    // ── Managed resource reconciliation ──
    // Reconcile for existing companies on startup
    const companies = await ctx.companies.list();
    for (const company of companies) {
      try {
        await ctx.agents.managed.reconcile("github-reviewer", company.id);
        await ctx.agents.managed.reconcile("github-triager", company.id);
        await ctx.agents.managed.reconcile("ci-companion", company.id);
        await ctx.skills.managed.reconcile("github-codebase-access", company.id);
        await ctx.skills.managed.reconcile("github-triage", company.id);
        await ctx.skills.managed.reconcile("ci-analysis", company.id);
      } catch (err) {
        ctx.logger.warn(`Reconcile failed for company ${company.id}: ${err}`);
      }
    }

    ctx.events.on("company.created", async (event) => {
      await ctx.agents.managed.reconcile("github-reviewer", event.companyId);
      await ctx.agents.managed.reconcile("github-triager", event.companyId);
      await ctx.agents.managed.reconcile("ci-companion", event.companyId);
      await ctx.skills.managed.reconcile("github-codebase-access", event.companyId);
      await ctx.skills.managed.reconcile("github-triage", event.companyId);
      await ctx.skills.managed.reconcile("ci-analysis", event.companyId);
    });
  },

  async onHealth() {
    return { status: "ok", message: "GitHub Manager v3.1 running" };
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

runWorker(plugin, import.meta.url);
