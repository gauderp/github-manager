import type { PluginContext } from "@paperclipai/plugin-sdk";
import type {
  GitHubRepo,
  GitHubPR,
  GitHubIssue,
  PRCardLink,
  SyncLogEntry,
  PRWithRepo,
  TriageRule,
  TriageRuleInput,
  GitHubWorkflowRun,
  PRMetrics,
  StandupReport,
} from "../types.js";

type DB = PluginContext["db"];

const S = "plugin_cus_github_manager_d2300af002";

// ── Repositories ──

export async function upsertRepo(db: DB, repo: Omit<GitHubRepo, "syncedAt">): Promise<void> {
  const now = new Date().toISOString();
  await db.execute(
    `INSERT INTO ${S}.gh_repositories (id, full_name, owner, name, private, default_branch, html_url, description, language, topics, updated_at, synced_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
     ON CONFLICT (id) DO UPDATE SET
       full_name = EXCLUDED.full_name,
       owner = EXCLUDED.owner,
       name = EXCLUDED.name,
       private = EXCLUDED.private,
       default_branch = EXCLUDED.default_branch,
       html_url = EXCLUDED.html_url,
       description = EXCLUDED.description,
       language = EXCLUDED.language,
       topics = EXCLUDED.topics,
       updated_at = EXCLUDED.updated_at,
       synced_at = EXCLUDED.synced_at`,
    [repo.id, repo.fullName, repo.owner, repo.name, repo.private, repo.defaultBranch,
     repo.htmlUrl, repo.description, repo.language, JSON.stringify(repo.topics),
     repo.updatedAt, now],
  );
}

export async function listRepos(db: DB): Promise<GitHubRepo[]> {
  const rows = await db.query(`SELECT * FROM ${S}.gh_repositories ORDER BY full_name`);
  return rows.map(mapRepo);
}

export async function getRepoByFullName(db: DB, fullName: string): Promise<GitHubRepo | null> {
  const rows = await db.query(`SELECT * FROM ${S}.gh_repositories WHERE full_name = $1`, [fullName]);
  return rows.length > 0 ? mapRepo(rows[0]) : null;
}

function mapRepo(row: Record<string, unknown>): GitHubRepo {
  return {
    id: row.id as number,
    fullName: row.full_name as string,
    owner: row.owner as string,
    name: row.name as string,
    private: row.private as boolean,
    defaultBranch: row.default_branch as string,
    htmlUrl: row.html_url as string,
    description: row.description as string | null,
    language: row.language as string | null,
    topics: JSON.parse((row.topics as string) || "[]"),
    updatedAt: row.updated_at as string,
    syncedAt: row.synced_at as string,
  };
}

// ── Pull Requests ──

export async function upsertPR(db: DB, pr: Omit<GitHubPR, "syncedAt">): Promise<void> {
  const now = new Date().toISOString();
  await db.execute(
    `INSERT INTO ${S}.gh_pull_requests (id, repo_id, number, title, body, state, author, head_branch, base_branch, html_url, draft, mergeable, merged_at, created_at, updated_at, synced_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
     ON CONFLICT (repo_id, number) DO UPDATE SET
       title = EXCLUDED.title, body = EXCLUDED.body, state = EXCLUDED.state,
       author = EXCLUDED.author, head_branch = EXCLUDED.head_branch,
       base_branch = EXCLUDED.base_branch, html_url = EXCLUDED.html_url,
       draft = EXCLUDED.draft, mergeable = EXCLUDED.mergeable,
       merged_at = EXCLUDED.merged_at, updated_at = EXCLUDED.updated_at,
       synced_at = EXCLUDED.synced_at`,
    [pr.id, pr.repoId, pr.number, pr.title, pr.body, pr.state,
     pr.author, pr.headBranch, pr.baseBranch, pr.htmlUrl, pr.draft,
     pr.mergeable, pr.mergedAt, pr.createdAt, pr.updatedAt, now],
  );
}

export async function listPRs(
  db: DB,
  filters?: { repoId?: number; state?: string; author?: string },
): Promise<PRWithRepo[]> {
  let sql = `SELECT p.*, r.full_name AS repo_full_name
             FROM ${S}.gh_pull_requests p
             JOIN ${S}.gh_repositories r ON r.id = p.repo_id
             WHERE 1=1`;
  const params: unknown[] = [];
  let idx = 1;

  if (filters?.repoId) {
    sql += ` AND p.repo_id = $${idx++}`;
    params.push(filters.repoId);
  }
  if (filters?.state) {
    sql += ` AND p.state = $${idx++}`;
    params.push(filters.state);
  }
  if (filters?.author) {
    sql += ` AND p.author = $${idx++}`;
    params.push(filters.author);
  }
  sql += " ORDER BY p.updated_at DESC";

  const rows = await db.query(sql, params);
  return rows.map(mapPRWithRepo);
}

export async function getPRByRepoAndNumber(
  db: DB, repoId: number, number: number,
): Promise<PRWithRepo | null> {
  const rows = await db.query(
    `SELECT p.*, r.full_name AS repo_full_name
     FROM ${S}.gh_pull_requests p
     JOIN ${S}.gh_repositories r ON r.id = p.repo_id
     WHERE p.repo_id = $1 AND p.number = $2`,
    [repoId, number],
  );
  return rows.length > 0 ? mapPRWithRepo(rows[0]) : null;
}

function mapPRWithRepo(row: Record<string, unknown>): PRWithRepo {
  return {
    id: row.id as number,
    repoId: row.repo_id as number,
    number: row.number as number,
    title: row.title as string,
    body: row.body as string | null,
    state: row.state as GitHubPR["state"],
    author: row.author as string,
    headBranch: row.head_branch as string,
    baseBranch: row.base_branch as string,
    htmlUrl: row.html_url as string,
    draft: row.draft as boolean,
    mergeable: row.mergeable as boolean | null,
    mergedAt: row.merged_at as string | null,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
    syncedAt: row.synced_at as string,
    repoFullName: row.repo_full_name as string,
  };
}

// ── Issues ──

export async function upsertIssue(db: DB, issue: Omit<GitHubIssue, "syncedAt">): Promise<void> {
  const now = new Date().toISOString();
  await db.execute(
    `INSERT INTO ${S}.gh_issues (id, repo_id, number, title, body, state, author, labels, html_url, created_at, updated_at, synced_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
     ON CONFLICT (repo_id, number) DO UPDATE SET
       title = EXCLUDED.title, body = EXCLUDED.body, state = EXCLUDED.state,
       author = EXCLUDED.author, labels = EXCLUDED.labels,
       html_url = EXCLUDED.html_url, updated_at = EXCLUDED.updated_at,
       synced_at = EXCLUDED.synced_at`,
    [issue.id, issue.repoId, issue.number, issue.title, issue.body,
     issue.state, issue.author, JSON.stringify(issue.labels),
     issue.htmlUrl, issue.createdAt, issue.updatedAt, now],
  );
}

// ── PR ↔ Card Links ──

export async function linkPRToCard(
  db: DB, prId: number, issueId: string, source: PRCardLink["linkSource"],
): Promise<void> {
  await db.execute(
    `INSERT INTO ${S}.gh_pr_card_links (pr_id, issue_id, link_source, created_at)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (pr_id, issue_id) DO NOTHING`,
    [prId, issueId, source, new Date().toISOString()],
  );
}

export async function getLinksForCard(db: DB, issueId: string): Promise<PRWithRepo[]> {
  const rows = await db.query(
    `SELECT p.*, r.full_name AS repo_full_name
     FROM ${S}.gh_pr_card_links l
     JOIN ${S}.gh_pull_requests p ON p.id = l.pr_id
     JOIN ${S}.gh_repositories r ON r.id = p.repo_id
     WHERE l.issue_id = $1
     ORDER BY p.updated_at DESC`,
    [issueId],
  );
  return rows.map(mapPRWithRepo);
}

export async function getLinksForPR(db: DB, prId: number): Promise<PRCardLink[]> {
  const rows = await db.query(
    `SELECT * FROM ${S}.gh_pr_card_links WHERE pr_id = $1`,
    [prId],
  );
  return rows.map((r: Record<string, unknown>) => ({
    id: r.id as number,
    prId: r.pr_id as number,
    issueId: r.issue_id as string,
    linkSource: r.link_source as PRCardLink["linkSource"],
    createdAt: r.created_at as string,
  }));
}

// ── Sync Log ──

export async function createSyncLog(
  db: DB, scope: SyncLogEntry["scope"],
): Promise<number> {
  const now = new Date().toISOString();
  await db.execute(
    `INSERT INTO ${S}.gh_sync_log (scope, started_at) VALUES ($1, $2)`,
    [scope, now],
  );
  const rows = await db.query<{ id: number }>(
    `SELECT id FROM ${S}.gh_sync_log WHERE scope = $1 AND started_at = $2 ORDER BY id DESC LIMIT 1`,
    [scope, now],
  );
  return rows[0].id;
}

export async function completeSyncLog(
  db: DB, id: number, stats: { reposSynced: number; prsSynced: number; issuesSynced: number; errors: string[] },
): Promise<void> {
  await db.execute(
    `UPDATE ${S}.gh_sync_log SET repos_synced=$1, prs_synced=$2, issues_synced=$3, errors=$4, finished_at=$5 WHERE id=$6`,
    [stats.reposSynced, stats.prsSynced, stats.issuesSynced, JSON.stringify(stats.errors), new Date().toISOString(), id],
  );
}

export async function getLastSyncTime(db: DB): Promise<string | null> {
  const rows = await db.query(
    `SELECT finished_at FROM ${S}.gh_sync_log WHERE finished_at IS NOT NULL ORDER BY finished_at DESC LIMIT 1`,
  );
  return rows.length > 0 ? (rows[0].finished_at as string) : null;
}

// ── Graph Cache ──

export async function saveRepoGraph(db: DB, repoId: number, graphJson: string): Promise<void> {
  await db.execute(
    `UPDATE ${S}.gh_repositories SET graph_json=$1, graph_generated_at=$2 WHERE id=$3`,
    [graphJson, new Date().toISOString(), repoId],
  );
}

export async function getRepoGraph(db: DB, fullName: string): Promise<{ graphJson: string; generatedAt: string } | null> {
  const rows = await db.query(
    `SELECT graph_json, graph_generated_at FROM ${S}.gh_repositories WHERE full_name = $1 AND graph_json IS NOT NULL`,
    [fullName],
  );
  if (rows.length === 0) return null;
  return {
    graphJson: rows[0].graph_json as string,
    generatedAt: rows[0].graph_generated_at as string,
  };
}

// ── Triage Rules ──

export async function listTriageRules(db: DB, repoId: number): Promise<TriageRule[]> {
  const rows = await db.query(
    `SELECT * FROM ${S}.gh_triage_rules WHERE repo_id = $1 ORDER BY priority DESC, id ASC`,
    [repoId],
  );
  return rows.map(mapTriageRule);
}

export async function listEnabledTriageRules(db: DB, repoId: number): Promise<TriageRule[]> {
  const rows = await db.query(
    `SELECT * FROM ${S}.gh_triage_rules WHERE repo_id = $1 AND enabled = true ORDER BY priority DESC, id ASC`,
    [repoId],
  );
  return rows.map(mapTriageRule);
}

export async function upsertTriageRule(db: DB, rule: TriageRuleInput): Promise<void> {
  const now = new Date().toISOString();
  await db.execute(
    `INSERT INTO ${S}.gh_triage_rules
       (repo_id, rule_name, condition_type, condition_value, action_type, action_value, priority, enabled, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $9)`,
    [
      rule.repoId, rule.ruleName, rule.conditionType, rule.conditionValue,
      rule.actionType, rule.actionValue, rule.priority, rule.enabled, now,
    ],
  );
}

export async function updateTriageRule(db: DB, id: number, rule: Partial<TriageRuleInput>): Promise<void> {
  const now = new Date().toISOString();
  const sets: string[] = ["updated_at = $1"];
  const params: unknown[] = [now];
  let idx = 2;

  if (rule.ruleName !== undefined) { sets.push(`rule_name = $${idx++}`); params.push(rule.ruleName); }
  if (rule.conditionType !== undefined) { sets.push(`condition_type = $${idx++}`); params.push(rule.conditionType); }
  if (rule.conditionValue !== undefined) { sets.push(`condition_value = $${idx++}`); params.push(rule.conditionValue); }
  if (rule.actionType !== undefined) { sets.push(`action_type = $${idx++}`); params.push(rule.actionType); }
  if (rule.actionValue !== undefined) { sets.push(`action_value = $${idx++}`); params.push(rule.actionValue); }
  if (rule.priority !== undefined) { sets.push(`priority = $${idx++}`); params.push(rule.priority); }
  if (rule.enabled !== undefined) { sets.push(`enabled = $${idx++}`); params.push(rule.enabled); }

  params.push(id);
  await db.execute(
    `UPDATE ${S}.gh_triage_rules SET ${sets.join(", ")} WHERE id = $${idx}`,
    params,
  );
}

export async function deleteTriageRule(db: DB, id: number): Promise<void> {
  await db.execute(`DELETE FROM ${S}.gh_triage_rules WHERE id = $1`, [id]);
}

function mapTriageRule(row: Record<string, unknown>): TriageRule {
  return {
    id: row.id as number,
    repoId: row.repo_id as number,
    ruleName: row.rule_name as string,
    conditionType: row.condition_type as TriageRule["conditionType"],
    conditionValue: row.condition_value as string,
    actionType: row.action_type as TriageRule["actionType"],
    actionValue: row.action_value as string,
    priority: row.priority as number,
    enabled: row.enabled as boolean,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

// ── Workflow Runs ──

export async function upsertWorkflowRun(
  db: DB,
  run: Omit<GitHubWorkflowRun, "createdAt" | "updatedAt">,
): Promise<void> {
  const now = new Date().toISOString();
  await db.execute(
    `INSERT INTO ${S}.gh_workflow_runs
       (id, repo_id, run_number, workflow_name, head_branch, head_sha, status, conclusion,
        pr_number, logs_summary, analyzed_at, html_url, created_at, updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
     ON CONFLICT (id) DO UPDATE SET
       status       = EXCLUDED.status,
       conclusion   = EXCLUDED.conclusion,
       logs_summary = EXCLUDED.logs_summary,
       analyzed_at  = EXCLUDED.analyzed_at,
       updated_at   = EXCLUDED.updated_at`,
    [
      run.id,
      run.repoId,
      run.runNumber,
      run.workflowName,
      run.headBranch,
      run.headSha,
      run.status,
      run.conclusion,
      run.prNumber,
      run.logsSummary,
      run.analyzedAt,
      run.htmlUrl,
      now,
      now,
    ],
  );
}

export async function getWorkflowRun(
  db: DB,
  runId: number,
): Promise<GitHubWorkflowRun | null> {
  const rows = await db.query(
    `SELECT * FROM ${S}.gh_workflow_runs WHERE id = $1`,
    [runId],
  );
  return rows.length > 0 ? mapWorkflowRun(rows[0]) : null;
}

export async function listWorkflowRunsForPR(
  db: DB,
  prNumber: number,
): Promise<GitHubWorkflowRun[]> {
  const rows = await db.query(
    `SELECT * FROM ${S}.gh_workflow_runs WHERE pr_number = $1 ORDER BY id DESC`,
    [prNumber],
  );
  return rows.map(mapWorkflowRun);
}

export async function markWorkflowRunAnalyzed(
  db: DB,
  runId: number,
  logsSummary: string,
): Promise<void> {
  await db.execute(
    `UPDATE ${S}.gh_workflow_runs
     SET logs_summary = $1, analyzed_at = $2, updated_at = $3
     WHERE id = $4`,
    [logsSummary, new Date().toISOString(), new Date().toISOString(), runId],
  );
}

function mapWorkflowRun(row: Record<string, unknown>): GitHubWorkflowRun {
  return {
    id:           row.id as number,
    repoId:       row.repo_id as number,
    runNumber:    row.run_number as number,
    workflowName: row.workflow_name as string,
    headBranch:   row.head_branch as string | null,
    headSha:      row.head_sha as string | null,
    status:       row.status as string,
    conclusion:   row.conclusion as string | null,
    prNumber:     row.pr_number as number | null,
    logsSummary:  row.logs_summary as string | null,
    analyzedAt:   row.analyzed_at as string | null,
    htmlUrl:      row.html_url as string,
    createdAt:    row.created_at as string,
    updatedAt:    row.updated_at as string,
  };
}

// ── PR Metrics ──

export async function upsertPRMetrics(db: DB, m: PRMetrics): Promise<void> {
  await db.execute(
    `INSERT INTO ${S}.gh_pr_metrics
       (pr_id, repo_id, cycle_time_hours, time_to_first_review_hours,
        review_rounds, additions, deletions, merged_by, created_at, merged_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     ON CONFLICT (pr_id) DO UPDATE SET
       cycle_time_hours = EXCLUDED.cycle_time_hours,
       time_to_first_review_hours = EXCLUDED.time_to_first_review_hours,
       review_rounds = EXCLUDED.review_rounds,
       additions = EXCLUDED.additions,
       deletions = EXCLUDED.deletions,
       merged_by = EXCLUDED.merged_by,
       created_at = EXCLUDED.created_at,
       merged_at = EXCLUDED.merged_at`,
    [m.prId, m.repoId, m.cycleTimeHours, m.timeToFirstReviewHours,
     m.reviewRounds, m.additions, m.deletions, m.mergedBy,
     m.createdAt, m.mergedAt],
  );
}

export async function getMetricsByRepo(
  db: DB,
  repoId: number,
  sinceDate: string,
  untilDate?: string,
): Promise<PRMetrics[]> {
  let sql = `SELECT * FROM ${S}.gh_pr_metrics WHERE repo_id = $1 AND merged_at >= $2`;
  const params: unknown[] = [repoId, sinceDate];
  if (untilDate) {
    sql += ` AND merged_at <= $3`;
    params.push(untilDate);
  }
  sql += ` ORDER BY merged_at DESC`;
  const rows = await db.query(sql, params);
  return rows.map(mapMetrics);
}

export async function getMetricsSummary(
  db: DB,
  repoId: number,
  sinceDate: string,
): Promise<{
  avgCycleTimeHours: number | null;
  avgTimeToFirstReviewHours: number | null;
  avgReviewRounds: number | null;
  totalMerged: number;
}> {
  const rows = await db.query(
    `SELECT
       AVG(cycle_time_hours)             AS avg_cycle_time,
       AVG(time_to_first_review_hours)   AS avg_first_review,
       AVG(review_rounds)                AS avg_review_rounds,
       COUNT(*)                          AS total_merged
     FROM ${S}.gh_pr_metrics
     WHERE repo_id = $1 AND merged_at >= $2`,
    [repoId, sinceDate],
  );
  const r = rows[0] as Record<string, unknown>;
  return {
    avgCycleTimeHours: r.avg_cycle_time != null ? Number(r.avg_cycle_time) : null,
    avgTimeToFirstReviewHours: r.avg_first_review != null ? Number(r.avg_first_review) : null,
    avgReviewRounds: r.avg_review_rounds != null ? Number(r.avg_review_rounds) : null,
    totalMerged: Number(r.total_merged ?? 0),
  };
}

function mapMetrics(row: Record<string, unknown>): PRMetrics {
  return {
    prId: row.pr_id as number,
    repoId: row.repo_id as number,
    cycleTimeHours: row.cycle_time_hours != null ? Number(row.cycle_time_hours) : null,
    timeToFirstReviewHours: row.time_to_first_review_hours != null ? Number(row.time_to_first_review_hours) : null,
    reviewRounds: Number(row.review_rounds ?? 0),
    additions: Number(row.additions ?? 0),
    deletions: Number(row.deletions ?? 0),
    mergedBy: row.merged_by as string | null,
    createdAt: row.created_at as string | null,
    mergedAt: row.merged_at as string | null,
  };
}

// ── Standup Reports ──

export async function upsertStandupReport(
  db: DB,
  report: Omit<StandupReport, "id">,
): Promise<void> {
  await db.execute(
    `INSERT INTO ${S}.gh_standup_reports
       (company_id, report_date, report_markdown, repos_included, contributors, highlights, generated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (company_id, report_date) DO UPDATE SET
       report_markdown = EXCLUDED.report_markdown,
       repos_included  = EXCLUDED.repos_included,
       contributors    = EXCLUDED.contributors,
       highlights      = EXCLUDED.highlights,
       generated_at    = EXCLUDED.generated_at`,
    [
      report.companyId,
      report.reportDate,
      report.reportMarkdown,
      JSON.stringify(report.reposIncluded),
      JSON.stringify(report.contributors),
      JSON.stringify(report.highlights),
      report.generatedAt,
    ],
  );
}

export async function listStandupReports(
  db: DB,
  companyId: string,
  limit = 30,
): Promise<StandupReport[]> {
  const rows = await db.query(
    `SELECT * FROM ${S}.gh_standup_reports
     WHERE company_id = $1
     ORDER BY report_date DESC
     LIMIT $2`,
    [companyId, limit],
  );
  return rows.map(mapStandup);
}

export async function getStandupReport(
  db: DB,
  companyId: string,
  reportDate: string,
): Promise<StandupReport | null> {
  const rows = await db.query(
    `SELECT * FROM ${S}.gh_standup_reports WHERE company_id = $1 AND report_date = $2`,
    [companyId, reportDate],
  );
  return rows.length > 0 ? mapStandup(rows[0]) : null;
}

function mapStandup(row: Record<string, unknown>): StandupReport {
  return {
    id: row.id as number,
    companyId: row.company_id as string,
    reportDate: row.report_date as string,
    reportMarkdown: row.report_markdown as string,
    reposIncluded: JSON.parse((row.repos_included as string) || "[]"),
    contributors: JSON.parse((row.contributors as string) || "[]"),
    highlights: JSON.parse((row.highlights as string) || "[]"),
    generatedAt: row.generated_at as string,
  };
}
