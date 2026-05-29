CREATE TABLE IF NOT EXISTS plugin_cus_github_manager_d2300af002.gh_knowledge_edges (
  id             TEXT PRIMARY KEY,
  repo_id        BIGINT NOT NULL REFERENCES plugin_cus_github_manager_d2300af002.gh_repositories(id) ON DELETE CASCADE,
  source_node_id TEXT NOT NULL REFERENCES plugin_cus_github_manager_d2300af002.gh_knowledge_nodes(id) ON DELETE CASCADE,
  target_node_id TEXT NOT NULL REFERENCES plugin_cus_github_manager_d2300af002.gh_knowledge_nodes(id) ON DELETE CASCADE,
  edge_type      TEXT NOT NULL CHECK(edge_type IN ('imports', 'calls', 'extends', 'configures', 'tests', 'documents')),
  weight         INTEGER NOT NULL DEFAULT 1,
  first_seen_pr  INTEGER,
  created_at     TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_knowledge_edges_repo
  ON plugin_cus_github_manager_d2300af002.gh_knowledge_edges(repo_id);

CREATE INDEX IF NOT EXISTS idx_knowledge_edges_source
  ON plugin_cus_github_manager_d2300af002.gh_knowledge_edges(source_node_id);

CREATE INDEX IF NOT EXISTS idx_knowledge_edges_target
  ON plugin_cus_github_manager_d2300af002.gh_knowledge_edges(target_node_id);
