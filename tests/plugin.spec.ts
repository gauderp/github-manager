import { describe, expect, it } from "vitest";
import { createTestHarness } from "@paperclipai/plugin-sdk/testing";
import manifest from "../src/manifest.js";
import plugin from "../src/worker.js";
import { buildInboundWebhookUrl, parseRepoFullName } from "../src/github-api.js";

describe("github-manager plugin", () => {
  it("declares connector capabilities including sync, webhooks, and agent tools", () => {
    expect(manifest.capabilities).toContain("events.subscribe");
    expect(manifest.capabilities).toContain("http.outbound");
    expect(manifest.capabilities).toContain("agent.tools.register");
    expect(manifest.capabilities).toContain("jobs.schedule");
    expect(manifest.capabilities).toContain("webhooks.receive");
    expect(manifest.capabilities).toContain("ui.sidebar.register");
    expect(manifest.capabilities).toContain("ui.page.register");
    expect(manifest.ui?.slots?.some((s) => s.type === "sidebarPanel")).toBe(true);
    expect(manifest.ui?.slots?.filter((s) => s.type === "page").length).toBeGreaterThanOrEqual(3);
    expect(manifest.jobs?.[0]?.jobKey).toBe("sync-github");
    expect(manifest.webhooks?.[0]?.endpointKey).toBe("github-events");
  });

  it("registers data + actions and handles events", async () => {
    const harness = createTestHarness({
      manifest,
      capabilities: [...manifest.capabilities, "events.emit"]
    });
    await plugin.definition.setup(harness.ctx);

    await harness.emit(
      "issue.created",
      { issueId: "iss_1" },
      { entityId: "iss_1", entityType: "issue" }
    );
    expect(
      harness.getState({ scopeKind: "issue", scopeId: "iss_1", stateKey: "seen" })
    ).toBe(true);

    harness.seed({ companies: [{ id: "co_health", name: "CUS", issuePrefix: "CUS" } as never] });

    const health = await harness.getData<{ status: string }>("health", {
      companyId: "co_health"
    });
    expect(["degraded", "error", "ok"]).toContain(health.status);

    const repos = await harness.getData<{ status: string; repos: unknown[] }>("repos", {
      companyId: "co_health"
    });
    expect(["degraded", "error", "ok"]).toContain(repos.status);
    expect(Array.isArray(repos.repos)).toBe(true);

    const action = await harness.performAction<{ pong: boolean }>("ping");
    expect(action.pong).toBe(true);
  });

  it("stores tracked repos and returns sync overview for a company", async () => {
    const harness = createTestHarness({
      manifest,
      capabilities: [...manifest.capabilities, "events.emit"]
    });
    harness.seed({ companies: [{ id: "co_1", name: "CUS", issuePrefix: "CUS" } as never] });
    await plugin.definition.setup(harness.ctx);

    await harness.performAction("setTrackedRepos", {
      companyId: "co_1",
      repos: ["acme/widget", "acme/other"]
    });

    const overview = await harness.getData<{ status: string }>("syncOverview", {
      companyId: "co_1"
    });
    expect(["degraded", "not_synced", "ok"]).toContain(overview.status);

    const webhook = await harness.getData<{ inboundUrl: string }>("webhookConfig", {
      companyId: "co_1"
    });
    expect(webhook.inboundUrl).toContain("github-events");
  });

  it("parses repo full names and builds webhook URLs", () => {
    expect(parseRepoFullName("org/repo")).toEqual({ owner: "org", repo: "repo" });
    expect(buildInboundWebhookUrl("cus.github-manager")).toBe(
      "http://127.0.0.1:3100/api/plugins/cus.github-manager/webhooks/github-events"
    );
  });

  it("registers GitHub review agent tools", async () => {
    const harness = createTestHarness({
      manifest,
      capabilities: [...manifest.capabilities, "events.emit"]
    });
    harness.seed({ companies: [{ id: "co_tools", name: "CUS", issuePrefix: "CUS" } as never] });
    await plugin.definition.setup(harness.ctx);

    const diff = await harness.executeTool("github_get_pull_request_diff", {
      owner: "acme",
      repo: "api",
      pr_number: 1
    });
    expect(diff.error).toBeTruthy();
    expect(String(diff.content)).toMatch(/token/i);
  });
});
