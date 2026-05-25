import { describe, it, expect, vi } from "vitest";

describe("webhook-handler", () => {
  it("ignores events without x-github-event header", async () => {
    const { handleGithubWebhook } = await import("../src/sync/webhook-handler.js");
    const ctx = mockCtx();
    await handleGithubWebhook(ctx as any, {
      endpointKey: "github-events",
      headers: {},
      rawBody: "{}",
      parsedBody: {},
      requestId: "req-1",
    } as any);
    expect(ctx.database.mutate).not.toHaveBeenCalled();
  });

  it("processes pull_request event and upserts", async () => {
    const { handleGithubWebhook } = await import("../src/sync/webhook-handler.js");
    const ctx = mockCtx();
    await handleGithubWebhook(ctx as any, {
      endpointKey: "github-events",
      headers: { "x-github-event": "pull_request" },
      rawBody: "",
      parsedBody: {
        action: "opened",
        pull_request: {
          id: 1, number: 42, title: "CARD-10 fix", body: null,
          state: "open", draft: false, mergeable: true, merged: false,
          merged_at: null, created_at: "2026-01-01", updated_at: "2026-01-01",
          html_url: "https://github.com/org/repo/pull/42",
          user: { login: "dev" },
          head: { ref: "CARD-10-fix" },
          base: { ref: "main" },
        },
        repository: {
          id: 100, full_name: "org/repo", name: "repo",
          private: false, default_branch: "main",
          html_url: "https://github.com/org/repo",
          description: null, language: "TypeScript",
          topics: [], updated_at: "2026-01-01",
          owner: { login: "org" },
        },
      },
      requestId: "req-2",
    } as any);
    expect(ctx.database.mutate).toHaveBeenCalled();
  });
});

function mockCtx() {
  return {
    database: {
      query: vi.fn(async () => []),
      mutate: vi.fn(async () => undefined),
    },
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    http: { fetch: vi.fn() },
    state: { get: vi.fn(), set: vi.fn() },
    secrets: { resolve: vi.fn() },
  };
}
