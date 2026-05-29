import type { PluginContext } from "@paperclipai/plugin-sdk";
import { listRepos, upsertStandupReport } from "../db/queries.js";
import { githubFetch } from "../github/api-client.js";
import type { StandupActivity } from "../types.js";

const HOURS_24 = 24 * 60 * 60 * 1000;
const HOURS_48 = 48 * 60 * 60 * 1000;

/**
 * Generate and persist a standup report for a company.
 * Looks at activity in the last 24 hours across all tracked repos.
 */
export async function generateAndSaveStandupReport(
  ctx: PluginContext,
  companyId: string,
): Promise<string> {
  const now = new Date();
  const since = new Date(now.getTime() - HOURS_24);
  const sinceIso = since.toISOString();
  const reportDate = now.toISOString().slice(0, 10);

  const repos = await listRepos(ctx.db);
  if (repos.length === 0) {
    const emptyReport = `# Standup ${reportDate}\n\nNo repositories tracked. Add repositories via GitHub Manager settings.\n`;
    await upsertStandupReport(ctx.db, {
      companyId,
      reportDate,
      reportMarkdown: emptyReport,
      reposIncluded: [],
      contributors: [],
      highlights: [],
      generatedAt: now.toISOString(),
    });
    return emptyReport;
  }

  const activities: StandupActivity[] = [];
  const allContributors = new Set<string>();
  const highlights: string[] = [];

  for (const repo of repos) {
    try {
      const activity = await buildRepoActivity(ctx, companyId, repo.fullName, sinceIso, now);
      activities.push(activity);

      for (const pr of [...activity.prsOpened, ...activity.prsMerged]) {
        allContributors.add(pr.author);
      }
      for (const issue of [...activity.issuesOpened, ...activity.issuesClosed]) {
        allContributors.add(issue.author);
      }

      if (activity.prsMerged.length > 0) {
        for (const pr of activity.prsMerged) {
          highlights.push(`Merged: ${pr.title} in ${repo.fullName} (#${pr.number})`);
        }
      }
      if (activity.prsAwaitingReview.length > 0) {
        for (const pr of activity.prsAwaitingReview) {
          if (pr.hoursOpen > 48) {
            highlights.push(`Blocked >48h: ${pr.title} in ${repo.fullName} (#${pr.number}) — @${pr.author}`);
          }
        }
      }
    } catch (err) {
      ctx.logger.warn(`Standup: failed to collect activity for ${repo.fullName}: ${err}`);
    }
  }

  const markdown = buildStandupMarkdown(reportDate, activities, highlights);

  await upsertStandupReport(ctx.db, {
    companyId,
    reportDate,
    reportMarkdown: markdown,
    reposIncluded: repos.map((r) => r.id),
    contributors: Array.from(allContributors),
    highlights,
    generatedAt: now.toISOString(),
  });

  ctx.logger.info(`Standup report generated for ${reportDate}: ${repos.length} repos, ${allContributors.size} contributors`);
  return markdown;
}

async function buildRepoActivity(
  ctx: PluginContext,
  companyId: string,
  repoFullName: string,
  since: string,
  now: Date,
): Promise<StandupActivity> {
  // Fetch PRs updated in the last 24h from GitHub
  const { data: prData } = await githubFetch(
    ctx, companyId,
    `/repos/${repoFullName}/pulls?state=all&sort=updated&direction=desc&per_page=50&since=${since}`,
  );
  const allPRs = prData as Array<Record<string, unknown>>;

  const prsOpened: StandupActivity["prsOpened"] = [];
  const prsMerged: StandupActivity["prsMerged"] = [];
  const prsAwaitingReview: StandupActivity["prsAwaitingReview"] = [];

  for (const pr of allPRs) {
    const author = (pr.user as Record<string, unknown>).login as string;
    const entry = {
      number: pr.number as number,
      title: pr.title as string,
      author,
      url: pr.html_url as string,
    };

    if ((pr.created_at as string) >= since) {
      prsOpened.push(entry);
    }

    const mergedAt = pr.merged_at as string | null;
    if (mergedAt && mergedAt >= since) {
      prsMerged.push(entry);
    }

    if (!mergedAt && pr.state === "open" && !(pr.draft as boolean)) {
      const createdAt = pr.created_at as string;
      const hoursOpen = (now.getTime() - new Date(createdAt).getTime()) / (1000 * 60 * 60);
      if (hoursOpen >= 2) {
        prsAwaitingReview.push({ ...entry, hoursOpen: Math.round(hoursOpen) });
      }
    }
  }

  // Fetch issues updated in last 24h
  const { data: issueData } = await githubFetch(
    ctx, companyId,
    `/repos/${repoFullName}/issues?state=all&sort=updated&direction=desc&per_page=50&since=${since}&filter=all`,
  );
  const allIssues = (issueData as Array<Record<string, unknown>>).filter((i) => !i.pull_request);

  const issuesOpened: StandupActivity["issuesOpened"] = [];
  const issuesClosed: StandupActivity["issuesClosed"] = [];

  for (const issue of allIssues) {
    const entry = {
      number: issue.number as number,
      title: issue.title as string,
      author: (issue.user as Record<string, unknown>).login as string,
      url: issue.html_url as string,
    };
    if ((issue.created_at as string) >= since) issuesOpened.push(entry);
    if (issue.state === "closed" && (issue.closed_at as string) >= since) issuesClosed.push(entry);
  }

  return { repoFullName, prsOpened, prsMerged, issuesOpened, issuesClosed, prsAwaitingReview };
}

function buildStandupMarkdown(
  reportDate: string,
  activities: StandupActivity[],
  highlights: string[],
): string {
  const lines: string[] = [];
  lines.push(`# Daily Standup — ${reportDate}`);
  lines.push("");

  const blockedPRs = activities.flatMap((a) =>
    a.prsAwaitingReview.filter((pr) => pr.hoursOpen > 48),
  );
  const mergedToday = activities.flatMap((a) => a.prsMerged);

  if (mergedToday.length > 0 || blockedPRs.length > 0) {
    lines.push("## Highlights");
    if (mergedToday.length > 0) {
      lines.push(`- **${mergedToday.length} PR(s) merged today**`);
    }
    if (blockedPRs.length > 0) {
      lines.push(`- **${blockedPRs.length} PR(s) blocked >48h without review** — attention needed`);
    }
    lines.push("");
  }

  for (const a of activities) {
    const hasActivity =
      a.prsOpened.length > 0 || a.prsMerged.length > 0 ||
      a.issuesOpened.length > 0 || a.issuesClosed.length > 0 ||
      a.prsAwaitingReview.length > 0;

    if (!hasActivity) continue;

    lines.push(`## ${a.repoFullName}`);

    if (a.prsMerged.length > 0) {
      lines.push("### Merged PRs");
      for (const pr of a.prsMerged) {
        lines.push(`- [#${pr.number} ${pr.title}](${pr.url}) — @${pr.author}`);
      }
    }

    if (a.prsOpened.length > 0) {
      lines.push("### New PRs");
      for (const pr of a.prsOpened) {
        lines.push(`- [#${pr.number} ${pr.title}](${pr.url}) — @${pr.author}`);
      }
    }

    if (a.prsAwaitingReview.length > 0) {
      lines.push("### Awaiting Review");
      for (const pr of a.prsAwaitingReview) {
        const alert = pr.hoursOpen > 48 ? " ⚠️ >48h" : "";
        lines.push(`- [#${pr.number} ${pr.title}](${pr.url}) — @${pr.author} (${pr.hoursOpen}h open${alert})`);
      }
    }

    if (a.issuesOpened.length > 0) {
      lines.push("### New Issues");
      for (const issue of a.issuesOpened) {
        lines.push(`- [#${issue.number} ${issue.title}](${issue.url}) — @${issue.author}`);
      }
    }

    if (a.issuesClosed.length > 0) {
      lines.push("### Closed Issues");
      for (const issue of a.issuesClosed) {
        lines.push(`- [#${issue.number} ${issue.title}](${issue.url})`);
      }
    }

    lines.push("");
  }

  const totalRepos = activities.filter((a) =>
    a.prsOpened.length + a.prsMerged.length + a.issuesOpened.length + a.issuesClosed.length > 0,
  ).length;

  if (totalRepos === 0) {
    lines.push("_No activity in the last 24 hours across all tracked repositories._");
  }

  lines.push("---");
  lines.push(`_Generated by GitHub Manager on ${new Date().toISOString()}_`);

  return lines.join("\n");
}
