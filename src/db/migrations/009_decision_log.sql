CREATE TABLE IF NOT EXISTS plugin_cus_github_manager_d2300af002.gh_decision_log (
  id                 SERIAL PRIMARY KEY,
  repo_id            BIGINT NOT NULL REFERENCES plugin_cus_github_manager_d2300af002.gh_repositories(id) ON DELETE CASCADE,
  adr_number         INTEGER NOT NULL,
  title              TEXT NOT NULL,
  context_text       TEXT,
  decision_text      TEXT,
  consequences_text  TEXT,
  status             TEXT NOT NULL DEFAULT 'accepted'
                       CHECK(status IN ('proposed', 'accepted', 'deprecated', 'superseded')),
  source_type        TEXT NOT NULL
                       CHECK(source_type IN ('pull_request', 'issue', 'discussion')),
  source_number      INTEGER NOT NULL,
  source_url         TEXT,
  decided_at         TEXT,
  created_at         TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at         TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(repo_id, adr_number)
);

CREATE INDEX IF NOT EXISTS idx_decision_log_repo
  ON plugin_cus_github_manager_d2300af002.gh_decision_log(repo_id);

CREATE INDEX IF NOT EXISTS idx_decision_log_status
  ON plugin_cus_github_manager_d2300af002.gh_decision_log(status);

CREATE INDEX IF NOT EXISTS idx_decision_log_decided_at
  ON plugin_cus_github_manager_d2300af002.gh_decision_log(decided_at);
