import type { PluginContext, ToolRunContext, ToolResult } from "@paperclipai/plugin-sdk";
import { githubFetch } from "../github/api-client.js";
import {
  getRepoByFullName,
  getKnowledgeNodes,
  getKnowledgeEdges,
} from "../db/queries.js";

export function registerKnowledgeTools(ctx: PluginContext): void {
  // ── 1. Knowledge Graph ──
  ctx.tools.register(
    "github_get_repo_knowledge_graph",
    {
      displayName: "Get Repository Knowledge Graph",
      description:
        "Retrieve the knowledge graph (code modules, components, services, and their relationships) for a GitHub repository from the local database.",
      parametersSchema: {
        type: "object",
        properties: {
          repo: {
            type: "string",
            description: "Full repository name (owner/repo)",
          },
          node_type: {
            type: "string",
            description: "Filter by node type (module, component, service, api_endpoint, pattern, dependency)",
          },
          min_weight: {
            type: "number",
            description: "Minimum edge weight to include (default: 1)",
          },
        },
        required: ["repo"],
      },
    },
    async (params: unknown, runCtx: ToolRunContext): Promise<ToolResult> => {
      const { repo, node_type, min_weight } = params as {
        repo: string;
        node_type?: string;
        min_weight?: number;
      };
      const companyId = runCtx.companyId;
      if (!companyId) return { error: "No company context" };

      const repoRow = await getRepoByFullName(ctx.db, repo);
      if (!repoRow) return { error: `Repository ${repo} not found in database` };

      const nodes = await getKnowledgeNodes(
        ctx.db,
        repoRow.id,
        node_type as Parameters<typeof getKnowledgeNodes>[2],
      );
      const edges = await getKnowledgeEdges(ctx.db, repoRow.id, min_weight);

      if (nodes.length === 0) {
        return {
          content: `No knowledge graph data found for ${repo}. The graph is built incrementally from merged PRs.`,
          data: { nodes: [], edges: [], repoId: repoRow.id },
        };
      }

      const nodesByType = new Map<string, typeof nodes>();
      for (const n of nodes) {
        const list = nodesByType.get(n.nodeType) ?? [];
        list.push(n);
        nodesByType.set(n.nodeType, list);
      }

      const lines: string[] = [`Knowledge Graph for ${repo}`, `Nodes: ${nodes.length}  |  Edges: ${edges.length}`, ""];

      for (const [type, typeNodes] of Array.from(nodesByType.entries())) {
        lines.push(`## ${type} (${typeNodes.length})`);
        for (const n of typeNodes.slice(0, 50)) {
          lines.push(`  - ${n.name}`);
        }
        if (typeNodes.length > 50) lines.push(`  ... and ${typeNodes.length - 50} more`);
        lines.push("");
      }

      if (edges.length > 0) {
        lines.push("## Top Relationships (by weight)");
        for (const e of edges.slice(0, 30)) {
          lines.push(`  ${e.sourceNodeId.slice(0, 8)} --[${e.edgeType} w:${e.weight}]--> ${e.targetNodeId.slice(0, 8)}`);
        }
      }

      return {
        content: lines.join("\n"),
        data: { nodes, edges, repoId: repoRow.id, repoFullName: repo },
      };
    },
  );

  // ── 2. README ──
  ctx.tools.register(
    "github_get_readme",
    {
      displayName: "Get Repository README",
      description: "Fetch the README file for a GitHub repository. Tries the default endpoint and falls back to common filenames.",
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

      // Try default readme endpoint
      try {
        const { data } = await githubFetch(
          ctx,
          companyId,
          `/repos/${owner}/${repo}/readme`,
          { accept: "application/vnd.github+json" },
        );
        const readme = data as { content: string; encoding: string; name: string; path: string };
        const decoded = Buffer.from(readme.content, "base64").toString("utf-8");
        return {
          content: decoded,
          data: { filename: readme.name, path: readme.path },
        };
      } catch {
        // Fall through to fallbacks
      }

      // Fallback: try common filenames
      const fallbacks = ["README.md", "readme.md", "README.rst", "README.txt", "README"];
      for (const filename of fallbacks) {
        try {
          const { data } = await githubFetch(
            ctx,
            companyId,
            `/repos/${owner}/${repo}/contents/${filename}`,
          );
          const file = data as { content: string; encoding: string; name: string; path: string };
          const decoded = Buffer.from(file.content, "base64").toString("utf-8");
          return {
            content: decoded,
            data: { filename: file.name, path: file.path },
          };
        } catch {
          continue;
        }
      }

      return { error: `No README found for ${owner}/${repo}` };
    },
  );

  // ── 3. Contributing Guide ──
  ctx.tools.register(
    "github_get_contributing_guide",
    {
      displayName: "Get Contributing Guide",
      description:
        "Fetch the CONTRIBUTING.md guide for a GitHub repository. Tries multiple common locations.",
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

      const paths = [
        "CONTRIBUTING.md",
        ".github/CONTRIBUTING.md",
        "docs/CONTRIBUTING.md",
      ];

      for (const filePath of paths) {
        try {
          const { data } = await githubFetch(
            ctx,
            companyId,
            `/repos/${owner}/${repo}/contents/${filePath}`,
          );
          const file = data as { content: string; encoding: string; name: string; path: string };
          const decoded = Buffer.from(file.content, "base64").toString("utf-8");
          return {
            content: decoded,
            data: { filename: file.name, path: file.path },
          };
        } catch {
          continue;
        }
      }

      return { error: `No CONTRIBUTING.md found for ${owner}/${repo}` };
    },
  );

  // ── 4. List Discussions ──
  ctx.tools.register(
    "github_list_discussions",
    {
      displayName: "List Repository Discussions",
      description:
        "List recent discussions in a GitHub repository using the GraphQL API. Optionally filter by category.",
      parametersSchema: {
        type: "object",
        properties: {
          owner: { type: "string", description: "Repository owner" },
          repo: { type: "string", description: "Repository name" },
          limit: {
            type: "number",
            description: "Number of discussions to fetch (default: 20, max: 50)",
          },
          category_id: {
            type: "string",
            description: "Optional discussion category ID to filter by",
          },
        },
        required: ["owner", "repo"],
      },
    },
    async (params: unknown, runCtx: ToolRunContext): Promise<ToolResult> => {
      const { owner, repo, limit, category_id } = params as {
        owner: string;
        repo: string;
        limit?: number;
        category_id?: string;
      };
      const companyId = runCtx.companyId;
      if (!companyId) return { error: "No company context" };

      const first = Math.min(limit ?? 20, 50);

      const query = `query ListDiscussions($owner: String!, $name: String!, $first: Int!, $categoryId: ID) {
  repository(owner: $owner, name: $name) {
    discussions(first: $first, categoryId: $categoryId, orderBy: {field: CREATED_AT, direction: DESC}) {
      nodes {
        id
        number
        title
        body
        url
        createdAt
        author { login }
        category { name slug }
      }
    }
  }
}`;

      const variables: Record<string, unknown> = {
        owner,
        name: repo,
        first,
      };
      if (category_id) {
        variables.categoryId = category_id;
      }

      try {
        const { data } = await githubFetch(ctx, companyId, "/graphql", {
          method: "POST",
          body: { query, variables },
        });

        const gqlData = data as {
          data: {
            repository: {
              discussions: {
                nodes: Array<{
                  id: string;
                  number: number;
                  title: string;
                  body: string;
                  url: string;
                  createdAt: string;
                  author: { login: string } | null;
                  category: { name: string; slug: string };
                }>;
              };
            };
          };
        };

        const discussions = gqlData.data.repository.discussions.nodes;

        if (discussions.length === 0) {
          return {
            content: `No discussions found in ${owner}/${repo}.`,
            data: { discussions: [] },
          };
        }

        const lines: string[] = [`Discussions in ${owner}/${repo} (${discussions.length})`, ""];
        for (const d of discussions) {
          const author = d.author?.login ?? "unknown";
          const date = new Date(d.createdAt).toISOString().slice(0, 10);
          const bodyPreview = d.body ? d.body.slice(0, 150).replace(/\n/g, " ") : "";
          lines.push(`#${d.number} [${d.category.name}] ${d.title}`);
          lines.push(`  by @${author} on ${date} — ${d.url}`);
          if (bodyPreview) lines.push(`  ${bodyPreview}...`);
          lines.push("");
        }

        return {
          content: lines.join("\n"),
          data: { discussions },
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return { error: `Failed to fetch discussions: ${message}` };
      }
    },
  );
}
