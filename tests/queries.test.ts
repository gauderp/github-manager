import { describe, it, expect, vi } from "vitest";
import { linkPRToCard, getLinksForCard } from "../src/db/queries.js";

describe("queries", () => {
  function mockDB() {
    return {
      query: vi.fn(async () => [] as Record<string, unknown>[]),
      mutate: vi.fn(async () => undefined),
      execute: vi.fn(async () => ({ rowCount: 1 })),
    };
  }

  describe("linkPRToCard", () => {
    it("calls execute with correct INSERT", async () => {
      const db = mockDB();
      await linkPRToCard(db as any, 42, "issue-abc", "manual");
      expect(db.execute).toHaveBeenCalledOnce();
      const [sql, params] = db.execute.mock.calls[0];
      expect(sql).toContain("INSERT INTO gh_pr_card_links");
      expect(params[0]).toBe(42);
      expect(params[1]).toBe("issue-abc");
      expect(params[2]).toBe("manual");
    });
  });

  describe("getLinksForCard", () => {
    it("queries by issue_id with JOIN", async () => {
      const db = mockDB();
      await getLinksForCard(db as any, "issue-xyz");
      expect(db.query).toHaveBeenCalledOnce();
      const [sql, params] = db.query.mock.calls[0];
      expect(sql).toContain("gh_pr_card_links");
      expect(sql).toContain("JOIN gh_pull_requests");
      expect(params[0]).toBe("issue-xyz");
    });
  });
});
