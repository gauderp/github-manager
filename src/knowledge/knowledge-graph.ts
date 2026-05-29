import { createHash } from "node:crypto";
import type { PluginContext } from "@paperclipai/plugin-sdk";
import type { KnowledgeNodeType } from "../types.js";
import { githubFetch } from "../github/api-client.js";
import {
  getRepoByFullName,
  upsertKnowledgeNode,
  upsertKnowledgeEdge,
} from "../db/queries.js";

// ── Helpers ──

const IGNORED_PATTERNS = [
  /\.lock$/,
  /\.sum$/,
  /\/dist\//,
  /\/build\//,
  /\/node_modules\//,
  /\.min\./,
  /^dist\//,
  /^build\//,
  /^node_modules\//,
];

export function makeNodeId(repoId: number, nodeType: string, name: string): string {
  return createHash("sha1")
    .update(`${repoId}:${nodeType}:${name}`)
    .digest("hex")
    .slice(0, 16);
}

export function makeEdgeId(sourceId: string, targetId: string, edgeType: string): string {
  return createHash("sha1")
    .update(`${sourceId}:${targetId}:${edgeType}`)
    .digest("hex")
    .slice(0, 16);
}

export function classifyFile(filename: string): KnowledgeNodeType {
  const lower = filename.toLowerCase();

  if (/\.(test|spec|_test|_spec)\.\w+$/.test(lower) || lower.includes("__tests__")) {
    return "component"; // test files are still component-typed nodes
  }
  if (/\broute[sr]?\b/.test(lower) || /\bcontroller[s]?\b/.test(lower) || /\bendpoint[s]?\b/.test(lower) || /\bapi\b/.test(lower)) {
    return "api_endpoint";
  }
  if (/\bservice[s]?\b/.test(lower) || /\bprovider[s]?\b/.test(lower) || /\brepository\b/.test(lower) || /\bclient\b/.test(lower)) {
    return "service";
  }
  if (/\bcomponent[s]?\b/.test(lower) || /\.(tsx|jsx)$/.test(lower) || /\bwidget[s]?\b/.test(lower)) {
    return "component";
  }
  if (/\bpattern[s]?\b/.test(lower) || /\bmiddleware\b/.test(lower) || /\bhook[s]?\b/.test(lower) || /\butil[s]?\b/.test(lower)) {
    return "pattern";
  }

  return "module";
}

export function inferLanguage(filename: string): string | null {
  const ext = filename.split(".").pop()?.toLowerCase();
  if (!ext) return null;

  const map: Record<string, string> = {
    ts: "TypeScript",
    tsx: "TypeScript",
    js: "JavaScript",
    jsx: "JavaScript",
    py: "Python",
    go: "Go",
    rs: "Rust",
    java: "Java",
    kt: "Kotlin",
    rb: "Ruby",
    cs: "C#",
    cpp: "C++",
    c: "C",
    swift: "Swift",
    dart: "Dart",
    php: "PHP",
    scala: "Scala",
  };

  return map[ext] ?? null;
}

export function extractImports(patch: string, filename: string): string[] {
  if (!patch) return [];
  const imports: string[] = [];
  const lines = patch.split("\n").filter((l) => l.startsWith("+") && !l.startsWith("+++"));

  for (const line of lines) {
    const content = line.slice(1).trim();

    // JS/TS: import ... from "..."  or  import ... from '...'
    const esmMatch = content.match(/import\s+.*?\s+from\s+["']([^"']+)["']/);
    if (esmMatch) {
      imports.push(esmMatch[1]);
      continue;
    }

    // JS/TS: require("...")
    const cjsMatch = content.match(/require\s*\(\s*["']([^"']+)["']\s*\)/);
    if (cjsMatch) {
      imports.push(cjsMatch[1]);
      continue;
    }

    // Python: from X import Y
    const pyFromMatch = content.match(/from\s+([\w.]+)\s+import/);
    if (pyFromMatch) {
      imports.push(pyFromMatch[1]);
      continue;
    }

    // Python: import X
    const pyImportMatch = content.match(/^import\s+([\w.]+)/);
    if (pyImportMatch && !content.includes("from")) {
      imports.push(pyImportMatch[1]);
      continue;
    }

    // Go: "package/path"
    const goMatch = content.match(/^\s*"([^"]+)"\s*$/);
    if (goMatch && filename.endsWith(".go")) {
      imports.push(goMatch[1]);
      continue;
    }
  }

  return imports;
}

export function getModuleName(filename: string): string {
  const parts = filename.split("/");
  return parts.length > 1 ? parts[0] : ".";
}

function isSourceFile(filename: string): boolean {
  return !IGNORED_PATTERNS.some((p) => p.test(filename));
}

function isTestFile(filename: string): boolean {
  const lower = filename.toLowerCase();
  return /\.(test|spec|_test|_spec)\.\w+$/.test(lower) || lower.includes("__tests__");
}

function inferTestSubject(testFilename: string): string {
  // foo.test.ts → foo.ts,  foo_test.go → foo.go,  foo.spec.tsx → foo.tsx
  return testFilename
    .replace(/\.(test|spec)\./i, ".")
    .replace(/_test\./, ".")
    .replace(/_spec\./, ".");
}

// ── Main Entry Point ──

export async function updateKnowledgeGraphFromPR(
  ctx: PluginContext,
  companyId: string,
  prPayload: Record<string, unknown>,
): Promise<void> {
  const pr = prPayload.pull_request
    ? (prPayload.pull_request as Record<string, unknown>)
    : prPayload;

  const repoPayload = (prPayload.repository ?? (pr.base && (pr.base as Record<string, unknown>).repo)) as Record<string, unknown> | undefined;
  if (!repoPayload) {
    ctx.logger.warn("knowledge-graph: no repository info in PR payload");
    return;
  }

  const repoFullName = repoPayload.full_name as string;
  const prNumber = pr.number as number;
  const ownerObj = repoPayload.owner as Record<string, unknown> | undefined;
  const owner = (ownerObj?.login as string | undefined) ?? repoFullName.split("/")[0];
  const repoName = (repoPayload.name as string | undefined) ?? repoFullName.split("/")[1];

  const repo = await getRepoByFullName(ctx.db, repoFullName);
  if (!repo) {
    ctx.logger.warn(`knowledge-graph: repo ${repoFullName} not found in DB — skipping`);
    return;
  }
  const repoId = repo.id;

  // Fetch PR files
  const { data } = await githubFetch(
    ctx,
    companyId,
    `/repos/${owner}/${repoName}/pulls/${prNumber}/files?per_page=100`,
  );

  const files = data as Array<{
    filename: string;
    status: string;
    additions: number;
    deletions: number;
    patch?: string;
  }>;

  for (const file of files) {
    if (!isSourceFile(file.filename)) continue;

    const language = inferLanguage(file.filename);
    const fileType = classifyFile(file.filename);
    const moduleName = getModuleName(file.filename);

    // Upsert file node
    const fileNodeId = makeNodeId(repoId, fileType, file.filename);
    await upsertKnowledgeNode(ctx.db, {
      id: fileNodeId,
      repoId,
      nodeType: fileType,
      name: file.filename,
      metadata: {
        language,
        additions: file.additions,
        deletions: file.deletions,
        status: file.status,
      },
      firstSeenPr: prNumber,
      lastUpdatedPr: prNumber,
    });

    // Upsert module node
    const moduleNodeId = makeNodeId(repoId, "module", moduleName);
    await upsertKnowledgeNode(ctx.db, {
      id: moduleNodeId,
      repoId,
      nodeType: "module",
      name: moduleName,
      metadata: {},
      firstSeenPr: prNumber,
      lastUpdatedPr: prNumber,
    });

    // Module → File edge
    const moduleEdgeId = makeEdgeId(moduleNodeId, fileNodeId, "imports");
    await upsertKnowledgeEdge(ctx.db, {
      id: moduleEdgeId,
      repoId,
      sourceNodeId: moduleNodeId,
      targetNodeId: fileNodeId,
      edgeType: "imports",
      weight: 1,
      firstSeenPr: prNumber,
    });

    // Extract imports from patch
    if (file.patch) {
      const imports = extractImports(file.patch, file.filename);
      for (const imp of imports) {
        const targetNodeId = makeNodeId(repoId, "module", imp);
        await upsertKnowledgeNode(ctx.db, {
          id: targetNodeId,
          repoId,
          nodeType: "module",
          name: imp,
          metadata: { inferredFromImport: true },
          firstSeenPr: prNumber,
          lastUpdatedPr: prNumber,
        });

        const importEdgeId = makeEdgeId(fileNodeId, targetNodeId, "imports");
        await upsertKnowledgeEdge(ctx.db, {
          id: importEdgeId,
          repoId,
          sourceNodeId: fileNodeId,
          targetNodeId,
          edgeType: "imports",
          weight: 1,
          firstSeenPr: prNumber,
        });
      }
    }

    // Test file → subject edge
    if (isTestFile(file.filename)) {
      const subjectPath = inferTestSubject(file.filename);
      const subjectType = classifyFile(subjectPath);
      const subjectNodeId = makeNodeId(repoId, subjectType, subjectPath);
      const testEdgeId = makeEdgeId(fileNodeId, subjectNodeId, "tests");
      await upsertKnowledgeEdge(ctx.db, {
        id: testEdgeId,
        repoId,
        sourceNodeId: fileNodeId,
        targetNodeId: subjectNodeId,
        edgeType: "tests",
        weight: 1,
        firstSeenPr: prNumber,
      });
    }
  }

  ctx.logger.info(`knowledge-graph: processed ${files.length} files from PR #${prNumber} in ${repoFullName}`);
}
