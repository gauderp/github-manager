CREATE TABLE IF NOT EXISTS plugin_cus_github_manager_d2300af002.gh_repositories (
  id            BIGINT PRIMARY KEY,
  full_name     TEXT NOT NULL UNIQUE,
  owner         TEXT NOT NULL,
  name          TEXT NOT NULL,
  private       BOOLEAN NOT NULL DEFAULT false,
  default_branch TEXT NOT NULL DEFAULT 'main',
  html_url      TEXT NOT NULL,
  description   TEXT,
  language      TEXT,
  topics        TEXT DEFAULT '[]',
  updated_at    TEXT NOT NULL,
  synced_at     TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS plugin_cus_github_manager_d2300af002.gh_pull_requests (
  id            BIGINT PRIMARY KEY,
  repo_id       BIGINT NOT NULL REFERENCES plugin_cus_github_manager_d2300af002.gh_repositories(id) ON DELETE CASCADE,
  number        INTEGER NOT NULL,
  title         TEXT NOT NULL,
  body          TEXT,
  state         TEXT NOT NULL DEFAULT 'open',
  author        TEXT NOT NULL,
  head_branch   TEXT NOT NULL,
  base_branch   TEXT NOT NULL,
  html_url      TEXT NOT NULL,
  draft         BOOLEAN NOT NULL DEFAULT false,
  mergeable     BOOLEAN,
  merged_at     TEXT,
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL,
  synced_at     TEXT NOT NULL,
  UNIQUE(repo_id, number)
);

CREATE TABLE IF NOT EXISTS plugin_cus_github_manager_d2300af002.gh_issues (
  id            BIGINT PRIMARY KEY,
  repo_id       BIGINT NOT NULL REFERENCES plugin_cus_github_manager_d2300af002.gh_repositories(id) ON DELETE CASCADE,
  number        INTEGER NOT NULL,
  title         TEXT NOT NULL,
  body          TEXT,
  state         TEXT NOT NULL DEFAULT 'open',
  author        TEXT NOT NULL,
  labels        TEXT DEFAULT '[]',
  html_url      TEXT NOT NULL,
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL,
  synced_at     TEXT NOT NULL,
  UNIQUE(repo_id, number)
);

CREATE TABLE IF NOT EXISTS plugin_cus_github_manager_d2300af002.gh_pr_card_links (
  id            SERIAL PRIMARY KEY,
  pr_id         BIGINT NOT NULL REFERENCES plugin_cus_github_manager_d2300af002.gh_pull_requests(id) ON DELETE CASCADE,
  issue_id      TEXT NOT NULL,
  link_source   TEXT NOT NULL CHECK(link_source IN ('webhook', 'pattern', 'manual')),
  created_at    TEXT NOT NULL,
  UNIQUE(pr_id, issue_id)
);

CREATE TABLE IF NOT EXISTS plugin_cus_github_manager_d2300af002.gh_sync_log (
  id            SERIAL PRIMARY KEY,
  scope         TEXT NOT NULL CHECK(scope IN ('full', 'incremental', 'webhook')),
  repos_synced  INTEGER NOT NULL DEFAULT 0,
  prs_synced    INTEGER NOT NULL DEFAULT 0,
  issues_synced INTEGER NOT NULL DEFAULT 0,
  errors        TEXT DEFAULT '[]',
  started_at    TEXT NOT NULL,
  finished_at   TEXT
);
