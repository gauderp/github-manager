CREATE TABLE IF NOT EXISTS plugin_cus_github_manager_d2300af002.gh_standup_reports (
  id           SERIAL PRIMARY KEY,
  company_id   TEXT NOT NULL,
  report_date  TEXT NOT NULL,
  report_markdown TEXT NOT NULL,
  repos_included  TEXT NOT NULL DEFAULT '[]',
  contributors    TEXT NOT NULL DEFAULT '[]',
  highlights      TEXT NOT NULL DEFAULT '[]',
  generated_at TEXT NOT NULL DEFAULT (now()::text),
  UNIQUE(company_id, report_date)
);

CREATE INDEX IF NOT EXISTS idx_standup_company_date
  ON plugin_cus_github_manager_d2300af002.gh_standup_reports(company_id, report_date);
