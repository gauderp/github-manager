import type { PluginContext } from "@paperclipai/plugin-sdk";
import type { DecisionSourceType } from "../types.js";
import { githubFetch } from "../github/api-client.js";
import {
  getRepoByFullName,
  listRepos,
  insertDecision,
  getNextAdrNumber,
} from "../db/queries.js";

const DECISION_LABELS = ["decision", "rfc", "adr", "architecture", "design"];

const STRUCTURAL_FILE_THRESHOLD = 10;
const STRUCTURAL_DIR_THRESHOLD = 3;

// ── Section extraction ──

function extractSection(body: string, heading: string): string | null {
  const pattern = new RegExp(
    `##\\s*${heading}[\\s\\S]*?\\n([\\s\\S]*?)(?=\\n##\\s|$)`,
    "i",
  );
  const match = body.match(pattern);
  if (!match) return null;
  const text = match[1].trim();
  return text.length > 0 ? text : null;
}

function hasDecisionLabel(labels: Array<{ name: string } | string>): boolean {
  return labels.some((l) => {
    const name = typeof l === "string" ? l : l.name;
    return DECISION_LABELS.includes(name.toLowerCase());
  });
}

function isStructuralPR(
  files: Array<{ filename: string }>,
): boolean {
  if (files.length > STRUCTURAL_FILE_THRESHOLD) return true;

  const topDirs = new Set<string>();
  for (const f of files) {
    const parts = f.filename.split("/");
    if (parts.length > 1) {
      topDirs.add(parts[0]);
    }
  }
  return topDirs.size >= STRUCTURAL_DIR_THRESHOLD;
}

// ── Extract from a single repo ──

export async function extractDecisionsForRepo(
  ctx: PluginContext,
  companyId: string,
  repoFullName: string,
  since?: string,
): Promise<number> {
  const repo = await getRepoByFullName(ctx.db, repoFullName);
  if (!repo) {
    ctx.logger.warn(`decision-extractor: repo ${repoFullName} not found in DB`);
    return 0;
  }

  const sinceDate = since
    ? new Date(since)
    : new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);

  let extracted = 0;

  // ── 1. Merged PRs ──
  const { data: prData } = await githubFetch(
    ctx,
    companyId,
    `/repos/${repo.owner}/${repo.name}/pulls?state=closed&per_page=100&sort=updated&direction=desc`,
  );

  const prs = prData as Array<Record<string, unknown>>;

  for (const pr of prs) {
    const mergedAt = pr.merged_at as string | null;
    if (!mergedAt) continue; // not merged
    if (new Date(mergedAt) < sinceDate) continue; // too old

    const prNumber = pr.number as number;
    const title = pr.title as string;
    const body = (pr.body as string) ?? "";
    const labels = (pr.labels ?? []) as Array<{ name: string }>;
    const htmlUrl = pr.html_url as string;

    const isDecisionLabeled = hasDecisionLabel(labels);

    // Check structural significance if no decision label
    let isStructural = false;
    if (!isDecisionLabeled) {
      try {
        const { data: filesData } = await githubFetch(
          ctx,
          companyId,
          `/repos/${repo.owner}/${repo.name}/pulls/${prNumber}/files?per_page=100`,
        );
        const files = filesData as Array<{ filename: string }>;
        isStructural = isStructuralPR(files);
      } catch {
        // If we can't fetch files, skip structural check
      }
    }

    if (!isDecisionLabeled && !isStructural) continue;

    const contextText = extractSection(body, "Context");
    const decisionText = extractSection(body, "Decision");
    const consequencesText = extractSection(body, "Consequences");

    const adrNumber = await getNextAdrNumber(ctx.db, repo.id);

    await insertDecision(ctx.db, {
      repoId: repo.id,
      adrNumber,
      title: title.slice(0, 500),
      contextText,
      decisionText,
      consequencesText,
      status: "accepted",
      sourceType: "pull_request" as DecisionSourceType,
      sourceNumber: prNumber,
      sourceUrl: htmlUrl,
      decidedAt: mergedAt,
    });

    extracted++;
    ctx.logger.info(`decision-extractor: extracted ADR-${adrNumber} from PR #${prNumber} in ${repoFullName}`);
  }

  // ── 2. Closed issues with decision labels ──
  const labelQuery = DECISION_LABELS.join(",");
  try {
    const { data: issueData } = await githubFetch(
      ctx,
      companyId,
      `/repos/${repo.owner}/${repo.name}/issues?state=closed&labels=${labelQuery}&per_page=50`,
    );

    const issues = issueData as Array<Record<string, unknown>>;

    for (const issue of issues) {
      // Skip if it's actually a PR
      if (issue.pull_request) continue;

      const issueNumber = issue.number as number;
      const title = issue.title as string;
      const body = (issue.body as string) ?? "";
      const htmlUrl = issue.html_url as string;
      const closedAt = issue.closed_at as string | null;

      if (closedAt && new Date(closedAt) < sinceDate) continue;

      const contextText = extractSection(body, "Context");
      const decisionText = extractSection(body, "Decision");
      const consequencesText = extractSection(body, "Consequences");

      const adrNumber = await getNextAdrNumber(ctx.db, repo.id);

      await insertDecision(ctx.db, {
        repoId: repo.id,
        adrNumber,
        title: title.slice(0, 500),
        contextText,
        decisionText,
        consequencesText,
        status: "accepted",
        sourceType: "issue" as DecisionSourceType,
        sourceNumber: issueNumber,
        sourceUrl: htmlUrl,
        decidedAt: closedAt,
      });

      extracted++;
      ctx.logger.info(`decision-extractor: extracted ADR-${adrNumber} from issue #${issueNumber} in ${repoFullName}`);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    ctx.logger.warn(`decision-extractor: failed to fetch decision issues for ${repoFullName}: ${message}`);
  }

  ctx.logger.info(`decision-extractor: extracted ${extracted} decisions from ${repoFullName}`);
  return extracted;
}

// ── Extract from all repos ──

export async function extractDecisionsAllRepos(
  ctx: PluginContext,
  companyId: string,
): Promise<void> {
  const repos = await listRepos(ctx.db);
  let total = 0;

  for (const repo of repos) {
    try {
      const count = await extractDecisionsForRepo(ctx, companyId, repo.fullName);
      total += count;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      ctx.logger.error(`decision-extractor: error processing ${repo.fullName}: ${message}`);
    }
  }

  ctx.logger.info(`decision-extractor: extracted ${total} decisions across ${repos.length} repos`);
}
