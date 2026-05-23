import { describe, expect, it } from "vitest";
import { assertGithubResponse } from "../src/github-api.js";

describe("assertGithubResponse", () => {
  it("throws a rate-limit message on 403 with remaining 0", async () => {
    const res = new Response("rate limited", {
      status: 403,
      headers: {
        "x-ratelimit-remaining": "0",
        "x-ratelimit-reset": String(Math.floor(Date.now() / 1000) + 60)
      }
    });
    await expect(assertGithubResponse(res, "test")).rejects.toThrow(/rate limit/i);
  });

  it("throws a generic HTTP error for other failures", async () => {
    const res = new Response("not found", { status: 404 });
    await expect(assertGithubResponse(res, "fetch repo")).rejects.toThrow(/HTTP 404/);
  });
});
