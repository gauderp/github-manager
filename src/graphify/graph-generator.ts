import type { PluginContext } from "@paperclipai/plugin-sdk";
import { githubFetch } from "../github/api-client.js";
import { listRepos, listPRs } from "../db/queries.js";
import type { GitHubRepo, PRWithRepo } from "../types.js";

export type GraphNode = {
  id: string;
  label: string;
  type: "repo" | "pr" | "file" | "module" | "agent";
  metadata: Record<string, unknown>;
};

export type GraphEdge = {
  source: string;
  target: string;
  label: string;
  type: "dependency" | "pr_target" | "contains" | "reviews";
};

export type GraphData = {
  nodes: GraphNode[];
  edges: GraphEdge[];
  generatedAt: string;
  repoFullName: string;
  level: "high" | "code";
};

export async function generateHighLevelGraph(
  ctx: PluginContext,
  companyId: string,
): Promise<GraphData> {
  const repos = await listRepos(ctx.db);
  const prs = await listPRs(ctx.db, { state: "open" });

  const nodes: GraphNode[] = repos.map((r) => ({
    id: `repo:${r.fullName}`,
    label: r.fullName,
    type: "repo" as const,
    metadata: { language: r.language, private: r.private, defaultBranch: r.defaultBranch },
  }));

  const edges: GraphEdge[] = [];

  for (const pr of prs) {
    const prNode: GraphNode = {
      id: `pr:${pr.repoFullName}#${pr.number}`,
      label: `#${pr.number}: ${pr.title}`,
      type: "pr",
      metadata: { state: pr.state, author: pr.author, draft: pr.draft },
    };
    nodes.push(prNode);
    edges.push({
      source: prNode.id,
      target: `repo:${pr.repoFullName}`,
      label: `${pr.headBranch} → ${pr.baseBranch}`,
      type: "pr_target",
    });
  }

  return {
    nodes,
    edges,
    generatedAt: new Date().toISOString(),
    repoFullName: "*",
    level: "high",
  };
}

export async function generateCodeGraph(
  ctx: PluginContext,
  companyId: string,
  repoFullName: string,
): Promise<GraphData> {
  const { data } = await githubFetch(
    ctx, companyId,
    `/repos/${repoFullName}/git/trees/HEAD?recursive=1`,
  );

  const tree = (data as Record<string, unknown>).tree as Array<Record<string, unknown>>;

  const nodes: GraphNode[] = [{
    id: `repo:${repoFullName}`,
    label: repoFullName,
    type: "repo",
    metadata: {},
  }];

  const edges: GraphEdge[] = [];

  const dirs = new Set<string>();

  for (const entry of tree) {
    const path = entry.path as string;
    const type = entry.type as string;

    if (type === "tree") {
      const depth = path.split("/").length;
      if (depth <= 3) {
        dirs.add(path);
        nodes.push({
          id: `dir:${repoFullName}/${path}`,
          label: path,
          type: "module",
          metadata: { depth },
        });

        const parentDir = path.split("/").slice(0, -1).join("/");
        const parentId = parentDir
          ? `dir:${repoFullName}/${parentDir}`
          : `repo:${repoFullName}`;
        edges.push({
          source: parentId,
          target: `dir:${repoFullName}/${path}`,
          label: "contains",
          type: "contains",
        });
      }
    } else if (type === "blob") {
      const depth = path.split("/").length;
      if (depth <= 2 || /\.(json|ya?ml|toml|lock)$/.test(path)) {
        nodes.push({
          id: `file:${repoFullName}/${path}`,
          label: path.split("/").pop()!,
          type: "file",
          metadata: { path, size: entry.size },
        });

        const parentDir = path.split("/").slice(0, -1).join("/");
        const parentId = parentDir
          ? `dir:${repoFullName}/${parentDir}`
          : `repo:${repoFullName}`;
        edges.push({
          source: parentId,
          target: `file:${repoFullName}/${path}`,
          label: "contains",
          type: "contains",
        });
      }
    }
  }

  return {
    nodes,
    edges,
    generatedAt: new Date().toISOString(),
    repoFullName,
    level: "code",
  };
}
