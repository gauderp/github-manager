CREATE TABLE IF NOT EXISTS plugin_cus_github_manager_d2300af002.gh_triage_rules (
  id              SERIAL PRIMARY KEY,
  repo_id         BIGINT NOT NULL REFERENCES plugin_cus_github_manager_d2300af002.gh_repositories(id) ON DELETE CASCADE,
  rule_name       TEXT NOT NULL,
  condition_type  TEXT NOT NULL CHECK(condition_type IN ('keyword', 'path', 'author', 'label_prefix')),
  condition_value TEXT NOT NULL,
  action_type     TEXT NOT NULL CHECK(action_type IN ('add_label', 'set_assignee', 'set_priority')),
  action_value    TEXT NOT NULL,
  priority        INTEGER NOT NULL DEFAULT 0,
  enabled         BOOLEAN NOT NULL DEFAULT true,
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_triage_rules_repo
  ON plugin_cus_github_manager_d2300af002.gh_triage_rules(repo_id);

CREATE INDEX IF NOT EXISTS idx_triage_rules_enabled
  ON plugin_cus_github_manager_d2300af002.gh_triage_rules(repo_id, enabled);
