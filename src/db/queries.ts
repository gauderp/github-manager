import type { PluginContext } from "@paperclipai/plugin-sdk";
import type {
  GitHubRepo,
  GitHubPR,
  GitHubIssue,
  PRCardLink,
  SyncLogEntry,
  PRWithRepo,
} from "../types.js";

type DB = PluginContext["db"];

// ── Repositories ──

export async function upsertRepo(db: DB, repo: Omit<GitHubRepo, "syncedAt">): Promise<void> {
  const now = new Date().toISOString();
  await db.execute(
    `INSERT INTO gh_repositories (id, full_name, owner, name, private, default_branch, html_url, description, language, topics, updated_at, synced_at)
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
  const rows = await db.query("SELECT * FROM gh_repositories ORDER BY full_name");
  return rows.map(mapRepo);
}

export async function getRepoByFullName(db: DB, fullName: string): Promise<GitHubRepo | null> {
  const rows = await db.query("SELECT * FROM gh_repositories WHERE full_name = $1", [fullName]);
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
    `INSERT INTO gh_pull_requests (id, repo_id, number, title, body, state, author, head_branch, base_branch, html_url, draft, mergeable, merged_at, created_at, updated_at, synced_at)
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
             FROM gh_pull_requests p
             JOIN gh_repositories r ON r.id = p.repo_id
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
     FROM gh_pull_requests p
     JOIN gh_repositories r ON r.id = p.repo_id
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
    `INSERT INTO gh_issues (id, repo_id, number, title, body, state, author, labels, html_url, created_at, updated_at, synced_at)
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
    `INSERT INTO gh_pr_card_links (pr_id, issue_id, link_source, created_at)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (pr_id, issue_id) DO NOTHING`,
    [prId, issueId, source, new Date().toISOString()],
  );
}

export async function getLinksForCard(db: DB, issueId: string): Promise<PRWithRepo[]> {
  const rows = await db.query(
    `SELECT p.*, r.full_name AS repo_full_name
     FROM gh_pr_card_links l
     JOIN gh_pull_requests p ON p.id = l.pr_id
     JOIN gh_repositories r ON r.id = p.repo_id
     WHERE l.issue_id = $1
     ORDER BY p.updated_at DESC`,
    [issueId],
  );
  return rows.map(mapPRWithRepo);
}

export async function getLinksForPR(db: DB, prId: number): Promise<PRCardLink[]> {
  const rows = await db.query(
    "SELECT * FROM gh_pr_card_links WHERE pr_id = $1",
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
    `INSERT INTO gh_sync_log (scope, started_at) VALUES ($1, $2)`,
    [scope, now],
  );
  const rows = await db.query<{ id: number }>(
    `SELECT id FROM gh_sync_log WHERE scope = $1 AND started_at = $2 ORDER BY id DESC LIMIT 1`,
    [scope, now],
  );
  return rows[0].id;
}

export async function completeSyncLog(
  db: DB, id: number, stats: { reposSynced: number; prsSynced: number; issuesSynced: number; errors: string[] },
): Promise<void> {
  await db.execute(
    `UPDATE gh_sync_log SET repos_synced=$1, prs_synced=$2, issues_synced=$3, errors=$4, finished_at=$5 WHERE id=$6`,
    [stats.reposSynced, stats.prsSynced, stats.issuesSynced, JSON.stringify(stats.errors), new Date().toISOString(), id],
  );
}

export async function getLastSyncTime(db: DB): Promise<string | null> {
  const rows = await db.query(
    "SELECT finished_at FROM gh_sync_log WHERE finished_at IS NOT NULL ORDER BY finished_at DESC LIMIT 1",
  );
  return rows.length > 0 ? (rows[0].finished_at as string) : null;
}
