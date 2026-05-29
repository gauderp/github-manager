import type { PluginContext } from "@paperclipai/plugin-sdk";
import { githubFetch } from "../github/api-client.js";
import { upsertPRMetrics } from "../db/queries.js";
import type { PRMetrics } from "../types.js";

/**
 * Calculate and persist metrics for a single merged PR.
 * Called after every upsertPR where state === "merged".
 */
export async function calculateAndSavePRMetrics(
  ctx: PluginContext,
  companyId: string,
  repoFullName: string,
  prId: number,
  repoId: number,
  prNumber: number,
  createdAt: string,
  mergedAt: string,
): Promise<void> {
  try {
    const [owner, repo] = repoFullName.split("/");
    const createdTs = new Date(createdAt).getTime();
    const mergedTs = new Date(mergedAt).getTime();
    const cycleTimeHours = (mergedTs - createdTs) / (1000 * 60 * 60);

    let timeToFirstReviewHours: number | null = null;
    let reviewRounds = 0;
    let mergedBy: string | null = null;

    try {
      const { data: timelineData } = await githubFetch(
        ctx, companyId,
        `/repos/${owner}/${repo}/issues/${prNumber}/timeline?per_page=100`,
        { accept: "application/vnd.github.mockingbird-preview+json" },
      );
      const events = timelineData as Array<Record<string, unknown>>;

      for (const event of events) {
        const ev = event.event as string;

        if (ev === "reviewed" && timeToFirstReviewHours === null) {
          const reviewedAt = event.submitted_at as string;
          if (reviewedAt) {
            timeToFirstReviewHours = (new Date(reviewedAt).getTime() - createdTs) / (1000 * 60 * 60);
          }
        }

        if (ev === "reviewed" && event.state === "changes_requested") {
          reviewRounds++;
        }

        if (ev === "merged" && event.actor) {
          mergedBy = ((event.actor as Record<string, unknown>).login as string) ?? null;
        }
      }
    } catch {
      ctx.logger.warn(`Timeline fetch failed for ${repoFullName}#${prNumber}, skipping review metrics`);
    }

    let additions = 0;
    let deletions = 0;

    try {
      const { data: filesData } = await githubFetch(
        ctx, companyId,
        `/repos/${owner}/${repo}/pulls/${prNumber}/files?per_page=100`,
      );
      for (const file of filesData as Array<Record<string, unknown>>) {
        additions += (file.additions as number) ?? 0;
        deletions += (file.deletions as number) ?? 0;
      }
    } catch {
      ctx.logger.warn(`Files fetch failed for ${repoFullName}#${prNumber}, defaulting additions/deletions to 0`);
    }

    const metrics: PRMetrics = {
      prId,
      repoId,
      cycleTimeHours: Math.round(cycleTimeHours * 10) / 10,
      timeToFirstReviewHours: timeToFirstReviewHours != null
        ? Math.round(timeToFirstReviewHours * 10) / 10
        : null,
      reviewRounds,
      additions,
      deletions,
      mergedBy,
      createdAt,
      mergedAt,
    };

    await upsertPRMetrics(ctx.db, metrics);
    ctx.logger.info(`Metrics saved for ${repoFullName}#${prNumber}: cycle=${metrics.cycleTimeHours}h`);
  } catch (err) {
    ctx.logger.error(`Metrics calculation failed for ${repoFullName}#${prNumber}: ${err}`);
  }
}
