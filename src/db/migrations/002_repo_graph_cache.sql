ALTER TABLE plugin_cus_github_manager_d2300af002.gh_repositories
  ADD COLUMN IF NOT EXISTS graph_json TEXT,
  ADD COLUMN IF NOT EXISTS graph_generated_at TEXT;
