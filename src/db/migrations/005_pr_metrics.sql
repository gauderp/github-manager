CREATE TABLE IF NOT EXISTS plugin_cus_github_manager_d2300af002.gh_pr_metrics (
  pr_id     BIGINT PRIMARY KEY REFERENCES plugin_cus_github_manager_d2300af002.gh_pull_requests(id) ON DELETE CASCADE,
  repo_id   BIGINT NOT NULL REFERENCES plugin_cus_github_manager_d2300af002.gh_repositories(id) ON DELETE CASCADE,
  cycle_time_hours          REAL,
  time_to_first_review_hours REAL,
  review_rounds             INTEGER NOT NULL DEFAULT 0,
  additions                 INTEGER NOT NULL DEFAULT 0,
  deletions                 INTEGER NOT NULL DEFAULT 0,
  merged_by                 TEXT,
  created_at                TEXT,
  merged_at                 TEXT
);

CREATE INDEX IF NOT EXISTS idx_pr_metrics_repo
  ON plugin_cus_github_manager_d2300af002.gh_pr_metrics(repo_id);

CREATE INDEX IF NOT EXISTS idx_pr_metrics_merged
  ON plugin_cus_github_manager_d2300af002.gh_pr_metrics(merged_at);
