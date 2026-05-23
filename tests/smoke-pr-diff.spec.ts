import { describe, expect, it } from "vitest";
import { createTestHarness } from "@paperclipai/plugin-sdk/testing";
import manifest from "../src/manifest.js";
import plugin from "../src/worker.js";

const hasToken = Boolean(process.env.GITHUB_TOKEN?.trim());

describe.skipIf(!hasToken)("smoke: github_get_pull_request_diff (live GitHub)", () => {
  it("returns pull request metadata and unified diff", async () => {
    const harness = createTestHarness({
      manifest,
      capabilities: [...manifest.capabilities, "events.emit"]
    });
    harness.seed({ companies: [{ id: "co_smoke", name: "CUS", issuePrefix: "CUS" } as never] });
    await plugin.definition.setup(harness.ctx);

    const result = await harness.executeTool("github_get_pull_request_diff", {
      owner: "octocat",
      repo: "Hello-World",
      pr_number: 1
    });

    expect(result.error).toBeFalsy();
    const data = result.data as {
      pullRequest: { number: number; title: string; htmlUrl: string };
      diff: string;
    };
    expect(data.pullRequest.number).toBe(1);
    expect(data.pullRequest.title.length).toBeGreaterThan(0);
    expect(data.pullRequest.htmlUrl).toMatch(/github\.com/);
    expect(typeof data.diff).toBe("string");
    expect(data.diff.length).toBeGreaterThan(0);
  });
});
