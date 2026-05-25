import { describe, it, expect, vi } from "vitest";

describe("review-tools", () => {
  it("registerReviewTools registers 6 tools", async () => {
    const registered: string[] = [];
    const ctx = {
      tools: {
        register: vi.fn((name: string) => { registered.push(name); }),
      },
    };

    const { registerReviewTools } = await import("../src/review/review-tools.js");
    registerReviewTools(ctx as any);

    expect(registered).toEqual([
      "github_get_pull_request_diff",
      "github_read_file_content",
      "github_create_review_comment",
      "github_submit_pr_review",
      "github_list_repositories",
      "github_search_issues",
    ]);
  });
});
