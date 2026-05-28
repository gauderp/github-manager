import type { PluginContext, ToolRunContext, ToolResult } from "@paperclipai/plugin-sdk";
import { githubFetch } from "../github/api-client.js";

export function registerTriageTools(ctx: PluginContext): void {
  // ── github_add_labels ──
  ctx.tools.register(
    "github_add_labels",
    {
      displayName: "Add Labels",
      description: "Add labels to a GitHub issue or PR",
      parametersSchema: {
        type: "object",
        properties: {
          owner: { type: "string", description: "Repository owner" },
          repo: { type: "string", description: "Repository name" },
          issue_number: { type: "number", description: "Issue or PR number" },
          labels: { type: "array", items: { type: "string" }, description: "Array of label names to add" },
        },
        required: ["owner", "repo", "issue_number", "labels"],
      },
    },
    async (params: unknown, runCtx: ToolRunContext): Promise<ToolResult> => {
      const { owner, repo, issue_number, labels } = params as {
        owner: string; repo: string; issue_number: number; labels: string[];
      };
      const companyId = runCtx.companyId;
      if (!companyId) return { error: "No company context" };
      if (!labels || labels.length === 0) return { error: "labels array must not be empty" };

      await githubFetch(ctx, companyId, `/repos/${owner}/${repo}/issues/${issue_number}/labels`, {
        method: "POST",
        body: { labels },
      });

      return {
        content: `Added ${labels.length} label(s) to ${owner}/${repo}#${issue_number}: ${labels.join(", ")}`,
        data: { owner, repo, issue_number, labelsAdded: labels },
      };
    },
  );

  // ── github_set_assignees ──
  ctx.tools.register(
    "github_set_assignees",
    {
      displayName: "Set Assignees",
      description: "Set assignees on a GitHub issue or PR (replaces existing assignees)",
      parametersSchema: {
        type: "object",
        properties: {
          owner: { type: "string", description: "Repository owner" },
          repo: { type: "string", description: "Repository name" },
          issue_number: { type: "number", description: "Issue or PR number" },
          assignees: { type: "array", items: { type: "string" }, description: "Array of GitHub usernames to assign" },
        },
        required: ["owner", "repo", "issue_number", "assignees"],
      },
    },
    async (params: unknown, runCtx: ToolRunContext): Promise<ToolResult> => {
      const { owner, repo, issue_number, assignees } = params as {
        owner: string; repo: string; issue_number: number; assignees: string[];
      };
      const companyId = runCtx.companyId;
      if (!companyId) return { error: "No company context" };

      await githubFetch(ctx, companyId, `/repos/${owner}/${repo}/issues/${issue_number}`, {
        method: "PATCH",
        body: { assignees },
      });

      return {
        content: assignees.length > 0
          ? `Assigned ${owner}/${repo}#${issue_number} to: ${assignees.join(", ")}`
          : `Cleared all assignees from ${owner}/${repo}#${issue_number}`,
        data: { owner, repo, issue_number, assignees },
      };
    },
  );

  // ── github_add_comment ──
  ctx.tools.register(
    "github_add_comment",
    {
      displayName: "Add Comment",
      description: "Add a comment to a GitHub issue or PR",
      parametersSchema: {
        type: "object",
        properties: {
          owner: { type: "string", description: "Repository owner" },
          repo: { type: "string", description: "Repository name" },
          issue_number: { type: "number", description: "Issue or PR number" },
          body: { type: "string", description: "Comment text (markdown supported)" },
        },
        required: ["owner", "repo", "issue_number", "body"],
      },
    },
    async (params: unknown, runCtx: ToolRunContext): Promise<ToolResult> => {
      const { owner, repo, issue_number, body } = params as {
        owner: string; repo: string; issue_number: number; body: string;
      };
      const companyId = runCtx.companyId;
      if (!companyId) return { error: "No company context" };
      if (!body || body.trim().length === 0) return { error: "Comment body must not be empty" };

      const { data } = await githubFetch(
        ctx, companyId,
        `/repos/${owner}/${repo}/issues/${issue_number}/comments`,
        { method: "POST", body: { body } },
      );
      const comment = data as Record<string, unknown>;

      return {
        content: `Comment posted on ${owner}/${repo}#${issue_number} (comment id: ${comment.id})`,
        data: { commentId: comment.id, htmlUrl: comment.html_url },
      };
    },
  );

  // ── github_list_labels ──
  ctx.tools.register(
    "github_list_labels",
    {
      displayName: "List Repository Labels",
      description: "List all labels available in a repository",
      parametersSchema: {
        type: "object",
        properties: {
          owner: { type: "string", description: "Repository owner" },
          repo: { type: "string", description: "Repository name" },
        },
        required: ["owner", "repo"],
      },
    },
    async (params: unknown, runCtx: ToolRunContext): Promise<ToolResult> => {
      const { owner, repo } = params as { owner: string; repo: string };
      const companyId = runCtx.companyId;
      if (!companyId) return { error: "No company context" };

      const { data } = await githubFetch(
        ctx, companyId,
        `/repos/${owner}/${repo}/labels?per_page=100`,
      );
      const labels = (data as Array<Record<string, unknown>>).map((l) => ({
        id: l.id as number,
        name: l.name as string,
        color: `#${l.color as string}`,
        description: l.description as string | null,
      }));

      return {
        content: labels.map((l) => `${l.name} (${l.color})${l.description ? ` — ${l.description}` : ""}`).join("\n"),
        data: { labels, total: labels.length },
      };
    },
  );
}
