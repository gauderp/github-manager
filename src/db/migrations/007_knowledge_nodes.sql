CREATE TABLE IF NOT EXISTS plugin_cus_github_manager_d2300af002.gh_knowledge_nodes (
  id              TEXT PRIMARY KEY,
  repo_id         BIGINT NOT NULL REFERENCES plugin_cus_github_manager_d2300af002.gh_repositories(id) ON DELETE CASCADE,
  node_type       TEXT NOT NULL CHECK(node_type IN ('module', 'pattern', 'dependency', 'api_endpoint', 'component', 'service')),
  name            TEXT NOT NULL,
  metadata        TEXT DEFAULT '{}',
  first_seen_pr   INTEGER,
  last_updated_pr INTEGER,
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_knowledge_nodes_repo
  ON plugin_cus_github_manager_d2300af002.gh_knowledge_nodes(repo_id);

CREATE INDEX IF NOT EXISTS idx_knowledge_nodes_type
  ON plugin_cus_github_manager_d2300af002.gh_knowledge_nodes(node_type);

CREATE UNIQUE INDEX IF NOT EXISTS idx_knowledge_nodes_repo_type_name
  ON plugin_cus_github_manager_d2300af002.gh_knowledge_nodes(repo_id, node_type, name);
