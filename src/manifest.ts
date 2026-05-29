import type { PaperclipPluginManifestV1 } from "@paperclipai/plugin-sdk";

const manifest: PaperclipPluginManifestV1 = {
  id: "cus.github-manager",
  version: "3.2.0",
  apiVersion: 1,
  displayName: "GitHub Manager",
  description: "Manage GitHub repos, PRs, issues, agent code reviews, and knowledge graphs — all from Paperclip",
  author: "Gaud ERP",
  categories: ["connector", "automation"],

  capabilities: [
    "events.subscribe",
    "events.emit",
    "http.outbound",
    "plugin.state.read",
    "plugin.state.write",
    "database.namespace.read",
    "database.namespace.write",
    "database.namespace.migrate",
    "jobs.schedule",
    "webhooks.receive",
    "agent.tools.register",
    "agents.managed",
    "agents.invoke",
    "agents.read",
    "issues.read",
    "issues.create",
    "companies.read",
    "ui.page.register",
    "ui.dashboardWidget.register",
    "ui.sidebar.register",
    "ui.detailTab.register",
    "ui.action.register",
    "instance.settings.register",
    "skills.managed",
  ],

  instanceConfigSchema: {
    type: "object",
    required: ["githubToken"],
    properties: {
      githubToken: {
        type: "string",
        title: "GitHub Personal Access Token",
        description: "Cole aqui o PAT do GitHub com permissões 'repo' e 'read:org'",
      },
      defaultOrg: {
        type: "string",
        title: "Default Organization",
        description: "GitHub organization to sync repositories from (optional)",
      },
      syncIntervalMinutes: {
        type: "number",
        title: "Sync Interval (minutes)",
        description: "How often to sync PRs and issues (default: 5)",
        default: 5,
        minimum: 1,
        maximum: 1440,
      },
      webhookSecret: {
        type: "string",
        title: "Webhook Secret",
        description: "Opcional. Cole o mesmo secret configurado no GitHub webhook para validar autenticidade dos eventos.",
      },
      ciCompanionEnabled: {
        type: "boolean",
        title: "CI/CD Companion",
        description: "Automatically analyze CI/CD failures and post analysis on the associated PR when a workflow run fails.",
        default: false,
      },
      webhookInfo: {
        type: "string",
        title: "Webhook URL (Auto Review)",
        description: "Configure no GitHub: Settings → Webhooks → Add webhook. Cole a URL completa (substitua <host> pelo seu domínio). Events: Pull requests, Issues. Content type: application/json. O plugin ID é preenchido automaticamente após instalação.",
        default: "/api/plugins/<plugin-id>/webhooks/github-events",
        readOnly: true,
      },
      autoTriageEnabled: {
        type: "boolean",
        title: "Auto Triage Enabled",
        description: "Automatically assign the github-triager agent when an issue is opened",
        default: false,
      },
      autoReviewEnabled: {
        type: "boolean",
        title: "Auto Review Enabled",
        description: "Automatically create code review cards when a PR is opened via webhook",
        default: false,
      },
      standupTime: {
        type: "string",
        title: "Standup Time",
        description: "Time to run the daily standup report (HH:MM, 24h format). Default: 09:00",
        default: "09:00",
      },
      standupTimezone: {
        type: "string",
        title: "Standup Timezone",
        description: "Timezone for standup scheduling (IANA format). Default: America/Sao_Paulo",
        default: "America/Sao_Paulo",
      },
      standupDays: {
        type: "string",
        title: "Standup Days",
        description: "Days of week to run standup as cron range (e.g. '1-5' for Mon-Fri). Default: 1-5",
        default: "1-5",
      },
    },
  },

  entrypoints: {
    worker: "./dist/worker.js",
    ui: "./dist/ui",
  },

  database: {
    migrationsDir: "src/db/migrations",
  },

  jobs: [
    {
      jobKey: "sync-github",
      displayName: "Sync GitHub PRs and Issues",
      schedule: "*/5 * * * *",
      description: "Incremental sync of open PRs and issues for tracked repositories",
    },
    {
      jobKey: "daily-standup",
      displayName: "Daily Standup Report",
      schedule: "0 9 * * 1-5",
      description: "Generate daily standup report from GitHub activity (weekdays at 9:00)",
    },
  ],

  webhooks: [
    {
      endpointKey: "github-events",
      displayName: "GitHub Events",
      description: "Receives GitHub webhook events (pull_request, issues, workflow_run). Configure in GitHub: Settings → Webhooks → Add webhook. Events: Pull requests, Issues, Workflow runs. Content type: application/json.",
    },
  ],

  tools: [
    {
      name: "github_get_pull_request_diff",
      displayName: "Get PR Diff",
      description: "Retrieve the unified diff of a GitHub pull request",
      parametersSchema: {
        type: "object",
        properties: {
          owner: { type: "string" },
          repo: { type: "string" },
          pull_number: { type: "number" },
        },
        required: ["owner", "repo", "pull_number"],
      },
    },
    {
      name: "github_read_file_content",
      displayName: "Read File",
      description: "Read a file from a GitHub repository",
      parametersSchema: {
        type: "object",
        properties: {
          owner: { type: "string" },
          repo: { type: "string" },
          path: { type: "string" },
          ref: { type: "string" },
        },
        required: ["owner", "repo", "path"],
      },
    },
    {
      name: "github_create_review_comment",
      displayName: "Add Review Comment",
      description: "Post an inline review comment on a pull request",
      parametersSchema: {
        type: "object",
        properties: {
          owner: { type: "string" },
          repo: { type: "string" },
          pull_number: { type: "number" },
          commit_id: { type: "string" },
          path: { type: "string" },
          line: { type: "number" },
          body: { type: "string" },
        },
        required: ["owner", "repo", "pull_number", "commit_id", "path", "line", "body"],
      },
    },
    {
      name: "github_submit_pr_review",
      displayName: "Submit PR Review",
      description: "Submit a review verdict (approve, request changes, comment)",
      parametersSchema: {
        type: "object",
        properties: {
          owner: { type: "string" },
          repo: { type: "string" },
          pull_number: { type: "number" },
          event: { type: "string", enum: ["APPROVE", "REQUEST_CHANGES", "COMMENT"] },
          body: { type: "string" },
        },
        required: ["owner", "repo", "pull_number", "event", "body"],
      },
    },
    {
      name: "github_list_repositories",
      displayName: "List Repositories",
      description: "List all tracked GitHub repositories",
      parametersSchema: { type: "object", properties: {} },
    },
    {
      name: "github_search_issues",
      displayName: "Search Issues",
      description: "Search GitHub issues and PRs using search syntax",
      parametersSchema: {
        type: "object",
        properties: {
          query: { type: "string" },
        },
        required: ["query"],
      },
    },
    {
      name: "github_get_pr_checks",
      displayName: "Get PR CI/CD Status",
      description: "Get CI/CD check runs status for a pull request (pass/fail/pending)",
      parametersSchema: {
        type: "object",
        properties: {
          owner: { type: "string" },
          repo: { type: "string" },
          pull_number: { type: "number" },
        },
        required: ["owner", "repo", "pull_number"],
      },
    },
    {
      name: "github_get_pr_comments",
      displayName: "Get PR Review Comments",
      description: "Get all review comments, discussions, and review verdicts on a pull request",
      parametersSchema: {
        type: "object",
        properties: {
          owner: { type: "string" },
          repo: { type: "string" },
          pull_number: { type: "number" },
        },
        required: ["owner", "repo", "pull_number"],
      },
    },
    {
      name: "github_get_repo_structure",
      displayName: "Get Repo Structure",
      description: "Get the cached directory/file structure of a repository. Use this FIRST before reading files to understand the codebase layout and save tokens. Set refresh=true to regenerate from GitHub.",
      parametersSchema: {
        type: "object",
        properties: {
          repo_full_name: { type: "string", description: "owner/repo format" },
          refresh: { type: "boolean", description: "Set true to regenerate the structure from GitHub (use when cache is stale)" },
        },
        required: ["repo_full_name"],
      },
    },
    {
      name: "github_add_labels",
      displayName: "Add Labels",
      description: "Add labels to a GitHub issue or PR",
      parametersSchema: {
        type: "object",
        properties: {
          owner: { type: "string" },
          repo: { type: "string" },
          issue_number: { type: "number" },
          labels: { type: "array", items: { type: "string" } },
        },
        required: ["owner", "repo", "issue_number", "labels"],
      },
    },
    {
      name: "github_set_assignees",
      displayName: "Set Assignees",
      description: "Set assignees on a GitHub issue or PR",
      parametersSchema: {
        type: "object",
        properties: {
          owner: { type: "string" },
          repo: { type: "string" },
          issue_number: { type: "number" },
          assignees: { type: "array", items: { type: "string" } },
        },
        required: ["owner", "repo", "issue_number", "assignees"],
      },
    },
    {
      name: "github_add_comment",
      displayName: "Add Comment",
      description: "Add a comment to a GitHub issue or PR",
      parametersSchema: {
        type: "object",
        properties: {
          owner: { type: "string" },
          repo: { type: "string" },
          issue_number: { type: "number" },
          body: { type: "string" },
        },
        required: ["owner", "repo", "issue_number", "body"],
      },
    },
    {
      name: "github_list_labels",
      displayName: "List Repository Labels",
      description: "List all labels available in a repository",
      parametersSchema: {
        type: "object",
        properties: {
          owner: { type: "string" },
          repo: { type: "string" },
        },
        required: ["owner", "repo"],
      },
    },
    {
      name: "github_list_pr_files",
      displayName: "List PR Files",
      description: "List files changed in a PR with addition/deletion stats and patches",
      parametersSchema: {
        type: "object",
        properties: {
          owner: { type: "string" },
          repo: { type: "string" },
          pull_number: { type: "number" },
        },
        required: ["owner", "repo", "pull_number"],
      },
    },
    {
      name: "github_approve_pr",
      displayName: "Approve PR",
      description: "Approve a pull request with an optional message",
      parametersSchema: {
        type: "object",
        properties: {
          owner: { type: "string" },
          repo: { type: "string" },
          pull_number: { type: "number" },
          body: { type: "string", description: "Optional approval message" },
        },
        required: ["owner", "repo", "pull_number"],
      },
    },
    {
      name: "github_request_changes",
      displayName: "Request Changes",
      description: "Request changes on a pull request with a required summary",
      parametersSchema: {
        type: "object",
        properties: {
          owner: { type: "string" },
          repo: { type: "string" },
          pull_number: { type: "number" },
          body: { type: "string", description: "Summary of requested changes (required)" },
        },
        required: ["owner", "repo", "pull_number", "body"],
      },
    },
    {
      name: "github_list_workflow_runs",
      displayName: "List Workflow Runs",
      description: "List recent workflow runs for a repository, optionally filtered by branch or status",
      parametersSchema: {
        type: "object",
        properties: {
          owner:    { type: "string" },
          repo:     { type: "string" },
          branch:   { type: "string" },
          status:   { type: "string", enum: ["completed", "in_progress", "queued", "failure", "success"] },
          per_page: { type: "number" },
        },
        required: ["owner", "repo"],
      },
    },
    {
      name: "github_get_workflow_run_jobs",
      displayName: "Get Workflow Run Jobs",
      description: "List jobs for a workflow run with individual step status",
      parametersSchema: {
        type: "object",
        properties: {
          owner:  { type: "string" },
          repo:   { type: "string" },
          run_id: { type: "number" },
        },
        required: ["owner", "repo", "run_id"],
      },
    },
    {
      name: "github_get_workflow_run_logs",
      displayName: "Get Workflow Run Logs",
      description: "Download and parse logs for a specific workflow run. Returns truncated logs focused on error sections.",
      parametersSchema: {
        type: "object",
        properties: {
          owner:    { type: "string" },
          repo:     { type: "string" },
          run_id:   { type: "number" },
          job_name: { type: "string" },
        },
        required: ["owner", "repo", "run_id"],
      },
    },
    {
      name: "github_rerun_workflow",
      displayName: "Re-run Workflow",
      description: "Re-run a failed workflow run (only failed jobs by default)",
      parametersSchema: {
        type: "object",
        properties: {
          owner:       { type: "string" },
          repo:        { type: "string" },
          run_id:      { type: "number" },
          only_failed: { type: "boolean" },
        },
        required: ["owner", "repo", "run_id"],
      },
    },
    {
      name: "github_get_deployment_status",
      displayName: "Get Deployment Status",
      description: "Get deployment status for a ref (branch, tag, or SHA)",
      parametersSchema: {
        type: "object",
        properties: {
          owner: { type: "string" },
          repo:  { type: "string" },
          ref:   { type: "string" },
        },
        required: ["owner", "repo", "ref"],
      },
    },
    {
      name: "github_get_pr_timeline",
      displayName: "Get PR Timeline",
      description: "Get the timeline of events for a PR (created, reviewed, approved, merged)",
      parametersSchema: {
        type: "object",
        properties: {
          owner: { type: "string" },
          repo: { type: "string" },
          pull_number: { type: "number" },
        },
        required: ["owner", "repo", "pull_number"],
      },
    },
    {
      name: "github_get_contributor_stats",
      displayName: "Get Contributor Stats",
      description: "Get contributor activity stats (commits, PRs, reviews) for a time period",
      parametersSchema: {
        type: "object",
        properties: {
          owner: { type: "string" },
          repo: { type: "string" },
          since: { type: "string" },
          until: { type: "string" },
        },
        required: ["owner", "repo", "since"],
      },
    },
    {
      name: "github_list_commits_between",
      displayName: "List Commits Between Refs",
      description: "List commits between two refs (tags, branches, or SHAs)",
      parametersSchema: {
        type: "object",
        properties: {
          owner: { type: "string" },
          repo: { type: "string" },
          base: { type: "string" },
          head: { type: "string" },
        },
        required: ["owner", "repo", "base"],
      },
    },
    {
      name: "github_list_releases",
      displayName: "List Releases",
      description: "List releases for a repository",
      parametersSchema: {
        type: "object",
        properties: {
          owner: { type: "string" },
          repo: { type: "string" },
          per_page: { type: "number" },
        },
        required: ["owner", "repo"],
      },
    },
    {
      name: "github_create_release",
      displayName: "Create Release",
      description: "Create a GitHub release with generated notes (always as draft)",
      parametersSchema: {
        type: "object",
        properties: {
          owner: { type: "string" },
          repo: { type: "string" },
          tag_name: { type: "string" },
          name: { type: "string" },
          body: { type: "string" },
          draft: { type: "boolean" },
          prerelease: { type: "boolean" },
        },
        required: ["owner", "repo", "tag_name", "name", "body"],
      },
    },
    {
      name: "github_search_code",
      displayName: "Search Code",
      description: "Search code across all tracked repositories",
      parametersSchema: {
        type: "object",
        properties: {
          query: { type: "string" },
          owner: { type: "string" },
        },
        required: ["query"],
      },
    },
  ],

  agents: [
    {
      agentKey: "github-reviewer",
      displayName: "GitHub Code Reviewer",
      role: "code-review",
      title: "Senior Code Reviewer",
      capabilities: "Reviews GitHub pull requests using plugin tools. Reads repo structure, analyzes diffs, posts inline comments, and submits review verdicts (approve/request changes).",
      instructions: {
        entryFile: "AGENTS.md",
        content: `# GitHub Code Reviewer

You are an expert code reviewer. You review pull requests on GitHub repositories.

## Available Tools

You MUST use these plugin tools to access code:

1. **github_get_repo_structure** — Call FIRST to understand the codebase layout
2. **github_get_pull_request_diff** — Get the PR diff to review
3. **github_read_file_content** — Read specific files for context
4. **github_create_review_comment** — Post inline comments on specific lines
5. **github_submit_pr_review** — Submit your final verdict (APPROVE, REQUEST_CHANGES, or COMMENT)

## Review Workflow

1. Get the repo structure to understand the project
2. Get the PR diff to see what changed
3. Read surrounding files for context when needed
4. Post inline comments on issues you find
5. Submit your review with a summary

## Review Criteria

- Code correctness and logic errors
- Security vulnerabilities (SQL injection, XSS, secrets in code)
- Performance issues (N+1 queries, unnecessary allocations)
- Code style and naming consistency
- Missing error handling
- Test coverage for changes
- Breaking changes in public APIs

## Tone

Be constructive and specific. Explain WHY something is an issue and suggest a fix. Praise good patterns when you see them.
`,
      },
    },
    {
      agentKey: "github-triager",
      displayName: "GitHub Issue Triager",
      role: "triage",
      title: "Issue Triage Specialist",
      capabilities: "Classifies and routes newly opened GitHub issues by type, priority, and area. Applies labels, sets assignees, and posts a triage summary comment.",
      instructions: {
        entryFile: "AGENTS.md",
        content: `# GitHub Issue Triager

You are an expert issue triager. You classify and route newly opened GitHub issues.

## Available Tools

- **github_list_labels** — List all labels available in the repo
- **github_add_labels** — Apply classification labels to an issue
- **github_set_assignees** — Assign the issue to the right person/team
- **github_add_comment** — Post a triage summary comment on the issue
- **github_search_issues** — Search for similar past issues for context

## Triage Workflow

1. Read the issue title and body from the card description carefully
2. Use \`github_list_labels\` to see all available labels in the repo
3. Classify by TYPE: bug, enhancement, question, documentation, invalid, wontfix
4. Classify by PRIORITY: critical, high, medium, low
5. Classify by AREA: frontend, backend, infra, devops, testing (if identifiable from content)
6. Use \`github_add_labels\` to apply all relevant labels
7. Use \`github_set_assignees\` if you can determine the right owner from the area/content
8. Use \`github_add_comment\` to post a triage summary

## Priority Rules

- **critical**: keywords "crash", "data loss", "security", "vulnerability", "breach", "outage", "production down"
- **high**: keywords "broken", "error", "fail", "regression", "blocked", "urgent"
- **medium**: keywords "slow", "performance", "improvement", "inconsistent"
- **low**: keywords "typo", "docs", "cleanup", "cosmetic", "nice to have"

## Triage Comment Format

Post this comment after triaging:

\`\`\`
## Triage Summary

**Type:** {bug | enhancement | question | documentation}
**Priority:** {critical | high | medium | low}
**Area:** {frontend | backend | infra | devops | testing | unknown}

{1-2 sentence summary of the issue and why it was classified this way}

{If similar issues exist: "Related to #123"}

{If more info needed: "Please provide: {what is missing}"}

---
*Triaged automatically by GitHub Triager*
\`\`\`

## Fallback

If you cannot determine classification with confidence:
- Apply label \`needs-triage\`
- Do NOT assign anyone
- Post comment asking for clarification
`,
      },
    },
    {
      agentKey: "ci-companion",
      displayName: "CI/CD Companion",
      role: "ci-analysis",
      title: "CI/CD Failure Analyst",
      capabilities: "Analyzes failing GitHub Actions workflow runs, identifies root causes from logs, correlates failures with PR changes, posts analysis comments, and validates deploy readiness.",
      instructions: {
        entryFile: "CI_COMPANION.md",
        content: `# CI/CD Companion

You are an expert CI/CD analyst. You investigate failing GitHub Actions workflow runs, identify root causes, and help developers fix them quickly.

## Available Tools

### CI/CD Tools
- **github_list_workflow_runs** — List recent workflow runs for a repo. Params: \`owner\`, \`repo\`, optional \`branch\`, \`status\`, \`per_page\`
- **github_get_workflow_run_jobs** — Get job list and step status for a run. Params: \`owner\`, \`repo\`, \`run_id\`
- **github_get_workflow_run_logs** — Download and parse logs for a run. Params: \`owner\`, \`repo\`, \`run_id\`, optional \`job_name\`
- **github_rerun_workflow** — Re-run a failed run. Params: \`owner\`, \`repo\`, \`run_id\`, optional \`only_failed\` (default true)
- **github_get_deployment_status** — Get deployment status for a ref. Params: \`owner\`, \`repo\`, \`ref\`

### Code Access Tools (from Phase 1)
- **github_get_pull_request_diff** — Get PR diff. Params: \`owner\`, \`repo\`, \`pull_number\`
- **github_read_file_content** — Read a file. Params: \`owner\`, \`repo\`, \`path\`, optional \`ref\`
- **github_get_repo_structure** — Get directory layout. Params: \`repo_full_name\`

### Communication Tools (from Phase 1)
- **github_add_comment** — Post a comment on an issue or PR. Params: \`owner\`, \`repo\`, \`issue_number\`, \`body\`
- **github_get_pr_checks** — Get CI check status for a PR. Params: \`owner\`, \`repo\`, \`pull_number\`

## Analysis Workflow

When you receive a card about a CI failure:

1. **Parse the card description** to extract: \`owner\`, \`repo\`, \`run_id\`, \`head_branch\`, and \`pr_number\` (if present).

2. **Get job list**: \`github_get_workflow_run_jobs\` with the \`run_id\` → identify which jobs have \`conclusion: "failure"\`.

3. **Get logs for the failing job**: \`github_get_workflow_run_logs\` with \`run_id\` and \`job_name\` of the first failed job → extract the error.

4. **If associated with a PR** (pr_number is present):
   - \`github_get_pull_request_diff\` → correlate the error with the changed code.
   - \`github_read_file_content\` → read the specific file that caused the error.

5. **Post analysis** on the PR using \`github_add_comment\` with:
   - One-line summary of the error type (compilation, test, lint, etc.)
   - Exact file and line number if identifiable
   - Root cause explanation in 2-3 sentences
   - Concrete fix suggestion with a code snippet when possible
   - Whether this looks flaky (if the error is unrelated to the PR changes)
   - Call to action: "Want me to re-run? Reply with 'rerun' and I'll trigger it."

6. **Flaky test detection**: If the error appears in infrastructure (network, timeouts, external services) or in tests that are unrelated to the changed files, label it as potentially flaky and suggest \`github_rerun_workflow\` with \`only_failed: true\`.

## Failure Priority Order

Prioritize analysis in this order:
1. Compilation / type errors — always developer's fault, must fix
2. Test failures in files touched by the PR — likely related, investigate
3. Test failures in unrelated files — possibly flaky, suggest rerun first
4. Lint / format failures — easy fix, provide the exact command to run
5. Infrastructure failures (Docker, network) — likely flaky, suggest rerun

## Comment Format

\`\`\`markdown
## CI Analysis: {workflow_name} #{run_number}

**Status:** FAILED — {job_name} → {step_name}

### Error
\\\`\\\`\\\`
{exact error lines from logs}
\\\`\\\`\\\`

### Root Cause
{explanation}

### Suggested Fix
{fix description with code snippet if applicable}

### Assessment
{RELATED_TO_PR | LIKELY_FLAKY | INFRASTRUCTURE}

---
*Reply with "rerun" to trigger re-run of failed jobs only.*
\`\`\`
`,
      },
    },
    {
      agentKey: "release-reporter",
      displayName: "Release Reporter",
      role: "release-management",
      title: "Release Engineer",
      capabilities: "Generates changelog and release notes from commits and PRs. Creates draft GitHub releases using plugin tools.",
      instructions: {
        entryFile: "AGENTS.md",
        content: `# Release Reporter

You are the release reporter agent. Your job is to generate professional release notes and create draft GitHub releases.

## Available Tools

- **github_list_releases** — Find the last release tag
- **github_list_commits_between** — Get commits since last release
- **github_create_release** — Create a draft release (always draft=true)
- **github_list_repositories** — List tracked repos
- **github_get_pull_request_diff** — Inspect specific changes if needed

## Workflow

Follow the \`release-notes\` skill instructions injected into your context.

## Rules

- ALWAYS create releases as draft — never publish directly
- Use conventional commit categorization (feat, fix, chore, docs, refactor, breaking)
- Keep notes concise: one line per change
- Include the full changelog URL
- If no conventional commits, group by merge PR vs direct commit
`,
      },
    },
    {
      agentKey: "standup-reporter",
      displayName: "Standup Reporter",
      role: "reporting",
      title: "Engineering Standup Bot",
      capabilities: "Generates daily standup reports from GitHub activity across tracked repositories. Highlights blocked PRs, merged work, and cross-repo dependencies.",
      instructions: {
        entryFile: "AGENTS.md",
        content: `# Standup Reporter

You are the standup reporter agent. Your job is to produce a clear, useful daily standup report covering all GitHub activity from the last 24 hours.

## Available Tools

- **github_list_repositories** — List all tracked repos
- **github_search_issues** — Search for recent issues/PRs
- **github_get_pr_timeline** — Get timeline of a specific PR
- **github_get_contributor_stats** — Get contributor stats
- **github_search_code** — Search code for cross-repo correlation

## Workflow

Follow the \`daily-standup\` skill instructions injected into your context.

## Rules

- Be factual and concise
- Flag PRs >48h without review with a warning
- Include cross-repo alerts when relevant
- Maximum 2000 words
`,
      },
    },
  ],

  skills: [
    {
      skillKey: "github-codebase-access",
      displayName: "GitHub Codebase Access",
      description: "Provides agents with tools to read repository structure and files from GitHub without needing local filesystem access",
      markdown: `# GitHub Codebase Access

You have access to GitHub repositories through the GitHub Manager plugin tools. NEVER say you don't have access to the codebase.

## Available Tools

### Codebase Navigation
- **github_get_repo_structure** — Get directory/file structure. **Call FIRST** before reading files. Params: \`repo_full_name\`, optional \`refresh=true\`
- **github_read_file_content** — Read a file. Params: \`owner\`, \`repo\`, \`path\`, optional \`ref\`
- **github_list_repositories** — List all tracked repos (no params)
- **github_search_issues** — Search issues/PRs. Params: \`query\`

### PR Review
- **github_get_pull_request_diff** — Get unified diff. Params: \`owner\`, \`repo\`, \`pull_number\`
- **github_get_pr_checks** — Get CI/CD status (pass/fail/pending). Params: \`owner\`, \`repo\`, \`pull_number\`
- **github_get_pr_comments** — Get all review comments, discussions, and verdicts. Params: \`owner\`, \`repo\`, \`pull_number\`
- **github_create_review_comment** — Post inline comment. Params: \`owner\`, \`repo\`, \`pull_number\`, \`commit_id\`, \`path\`, \`line\`, \`body\`
- **github_submit_pr_review** — Submit verdict. Params: \`owner\`, \`repo\`, \`pull_number\`, \`event\` (APPROVE/REQUEST_CHANGES/COMMENT), \`body\`

## PR Review Workflow

When reviewing a PR:
1. \`github_get_repo_structure\` — understand the codebase
2. \`github_get_pull_request_diff\` — see what changed
3. \`github_get_pr_checks\` — verify CI/CD passed
4. \`github_get_pr_comments\` — check existing reviews from others
5. \`github_read_file_content\` — read surrounding code for context
6. \`github_create_review_comment\` — post inline comments on issues
7. \`github_submit_pr_review\` — approve or request changes with summary
8. If CI failed or changes needed, tag the PR author to fix

## Codebase Exploration Workflow

1. **ALWAYS** start with \`github_get_repo_structure\` to understand layout
2. Read only the files you need with \`github_read_file_content\`
3. If structure seems outdated, call with \`refresh=true\`
4. Never access the local filesystem — always use these tools
`,
    },
    {
      skillKey: "github-triage",
      displayName: "GitHub Issue Triage",
      description: "Provides agents with tools and workflow to classify, label, assign, and comment on GitHub issues",
      markdown: `# GitHub Issue Triage

You have access to GitHub issue management tools through the GitHub Manager plugin.

## Available Triage Tools

- **github_list_labels** — List all labels in a repo. Params: \`owner\`, \`repo\`
- **github_add_labels** — Add labels to an issue/PR. Params: \`owner\`, \`repo\`, \`issue_number\`, \`labels\` (array)
- **github_set_assignees** — Set assignees on an issue/PR. Params: \`owner\`, \`repo\`, \`issue_number\`, \`assignees\` (array)
- **github_add_comment** — Post a comment. Params: \`owner\`, \`repo\`, \`issue_number\`, \`body\`
- **github_search_issues** — Search for similar issues. Params: \`query\`

## Triage Workflow

When triaging a newly opened issue:
1. \`github_list_labels\` — see what labels exist in the repo
2. Classify by type, priority, area based on issue content
3. \`github_add_labels\` — apply all classification labels in a single call
4. \`github_set_assignees\` — assign if area/owner is clear (empty array to skip)
5. \`github_add_comment\` — post triage summary with classification reasoning

## Priority Classification

| Priority | Keywords |
|----------|----------|
| critical | crash, data loss, security, vulnerability, breach, outage, production down |
| high | broken, error, fail, regression, blocked, urgent |
| medium | slow, performance, improvement, inconsistent |
| low | typo, docs, cleanup, cosmetic, nice to have |

## Label Convention

Apply labels that exist in the repo. Common patterns:
- Type: \`bug\`, \`enhancement\`, \`question\`, \`documentation\`
- Priority: \`priority: critical\`, \`priority: high\`, \`priority: medium\`, \`priority: low\`
- Area: \`area: frontend\`, \`area: backend\`, \`area: infra\`
- Fallback: \`needs-triage\` when unsure

If the needed label doesn't exist in the repo, skip it and note it in the comment.
`,
    },
    {
      skillKey: "ci-analysis",
      displayName: "CI/CD Analysis",
      description: "Teaches agents to analyze failing CI/CD workflow runs, correlate failures with PR changes, and post actionable fix suggestions",
      markdown: `# CI/CD Analysis

You have CI/CD monitoring tools available through the GitHub Manager plugin. Use them to investigate and explain failing workflow runs.

## Available CI/CD Tools

- **github_list_workflow_runs** — List recent runs. Params: \`owner\`, \`repo\`, optional \`branch\`, \`status\` (completed/in_progress/queued/failure/success), \`per_page\` (max 30)
- **github_get_workflow_run_jobs** — Jobs + steps for a run. Params: \`owner\`, \`repo\`, \`run_id\`
- **github_get_workflow_run_logs** — Parsed logs (ZIP extracted, tail-focused). Params: \`owner\`, \`repo\`, \`run_id\`, optional \`job_name\`
- **github_rerun_workflow** — Re-run the run. Params: \`owner\`, \`repo\`, \`run_id\`, optional \`only_failed\` (default: true)
- **github_get_deployment_status** — Deployment state for a ref. Params: \`owner\`, \`repo\`, \`ref\`

## CI Analysis Workflow

1. \`github_get_workflow_run_jobs\` → find failed jobs
2. \`github_get_workflow_run_logs\` with the failed job name → get the error
3. \`github_get_pull_request_diff\` → correlate with PR changes (if PR is known)
4. \`github_read_file_content\` → read the failing file for context
5. \`github_add_comment\` on the PR → post structured analysis

## Log Parsing Tips

- Logs are returned with the tail of each step (last ~5000 chars per step)
- Error patterns to look for:
  - TypeScript: \`error TS\`, \`Cannot find\`, \`Type '...' is not assignable\`
  - Jest/Vitest: \`FAIL\`, \`● \`, \`Expected:\`, \`Received:\`
  - ESLint: \`error  \` (two spaces), \`✖\`
  - Docker build: \`ERROR\`, \`failed to solve\`
  - npm install: \`npm ERR!\`, \`ERESOLVE\`
- The \`job_name\` filter dramatically reduces token usage — always use it when you know which job failed

## Deploy Gate Workflow

When asked to validate deploy readiness:
1. \`github_get_pr_checks\` → verify all checks pass
2. \`github_list_workflow_runs\` with \`status: "completed"\` on the branch → confirm no recent failures
3. \`github_get_deployment_status\` → check last deployment state
4. \`github_get_pull_request_diff\` + \`github_read_file_content\` → scan for sensitive files (.env, credentials)
5. Report each gate as PASS/FAIL with detail
`,
    },
    {
      skillKey: "release-notes",
      displayName: "Release Notes Generation",
      description: "Guides agents through generating categorized release notes from commits and creating draft GitHub releases",
      markdown: `# Release Notes Skill

You are the \`release-reporter\` agent. Your job is to generate professional, well-categorized release notes for a GitHub repository and create a draft GitHub release.

## Available Tools

- **github_list_releases** — List existing releases to find the last released tag
- **github_list_commits_between** — List commits between two refs (base tag → HEAD)
- **github_create_release** — Create a draft GitHub release with the generated notes
- **github_list_repositories** — List tracked repos

## Workflow

1. Call \`github_list_releases\` to find the last non-draft release tag (use as \`base\`)
2. Call \`github_list_commits_between\` with \`base\` = last release tag, \`head\` = HEAD
3. Categorize commits by conventional commit prefix: feat→Features, fix→Bug Fixes, breaking→Breaking Changes, docs→Documentation, refactor→Refactoring, chore/build/ci→Maintenance
4. Generate markdown with sections: Breaking Changes, Features, Bug Fixes, Documentation, Refactoring, Maintenance, Other
5. Call \`github_create_release\` with \`draft: true\` (ALWAYS draft)

## Release Notes Format

\`\`\`
## What's Changed

### Breaking Changes
- Description (#NNN) — @author

### Features
- New feature (#NNN) — @author

### Bug Fixes
- Fix description (#NNN) — @author

### Maintenance
- Dependency and CI updates

**Full Changelog:** https://github.com/{owner}/{repo}/compare/{base}...{new_tag}
\`\`\`

## Rules

- ALWAYS create as draft
- Skip "Merge branch..." commits unless meaningful
- Max 50 commits in notes — group remaining as "and N more minor changes"
- Use imperative mood: "Add X" not "Added X"
`,
    },
    {
      skillKey: "daily-standup",
      displayName: "Daily Standup Generation",
      description: "Guides agents through generating daily standup reports from GitHub activity with cross-repo awareness",
      markdown: `# Daily Standup Skill

You are the \`standup-reporter\` agent. Generate a daily standup report covering all GitHub activity in the last 24 hours.

## Available Tools

- **github_list_repositories** — List all tracked repos
- **github_search_issues** — Search recent issues/PRs with queries like \`is:pr updated:>YYYY-MM-DD\`
- **github_get_pr_timeline** — Get timeline of a specific PR if detail is needed
- **github_get_contributor_stats** — Contributor stats for the period
- **github_search_code** — Search code for cross-repo correlation

## Standup Format

\`\`\`
# Daily Standup — YYYY-MM-DD

## Highlights
- N PRs merged today
- N PRs blocked >48h (needs review)

## {repo-full-name}
### Merged PRs
- [#NNN Title](url) — @author

### New PRs
- [#NNN Title](url) — @author

### Awaiting Review
- [#NNN Title](url) — @author (Nh open ⚠️ if >48h)

### New Issues / Closed Issues
- [#NNN Title](url) — @author
\`\`\`

## Cross-Repo Awareness

Add a "Cross-Repo Alerts" section if:
1. A merged PR modifies API routes/controllers — search other repos that import the service
2. A merged PR adds database migrations — alert about potential downtime
3. A merged PR bumps a major dependency version — check for shared consumers

Use \`github_search_code\` for cross-repo lookups.

## Rules

- Be factual, no fluff
- Use markdown links for all references
- Flag PRs >48h without review with ⚠️
- Max 2000 words — prioritize merged PRs and blockers
- End with generation timestamp
`,
    },
  ],

  ui: {
    slots: [
      {
        type: "sidebar",
        id: "github-sidebar",
        exportName: "GitHubSidebarLink",
        displayName: "GitHub",
      },
      {
        type: "page",
        id: "github-settings",
        exportName: "GitHubSettingsPage",
        displayName: "Configurações GitHub",
        routePath: "github-settings",
      },
      {
        type: "page",
        id: "github-repos",
        exportName: "GitHubReposPage",
        displayName: "Repositórios",
        routePath: "github-repos",
      },
      {
        type: "page",
        id: "github-prs",
        exportName: "GitHubPullRequestsPage",
        displayName: "Pull Requests",
        routePath: "github-prs",
      },
      {
        type: "page",
        id: "github-graphs",
        exportName: "GitHubGraphsPage",
        displayName: "Knowledge Graphs",
        routePath: "github-graphs",
      },
      {
        type: "page",
        id: "github-metrics",
        exportName: "GitHubMetricsPage",
        displayName: "Engineering Metrics",
        routePath: "github-metrics",
      },
      {
        type: "page",
        id: "github-standups",
        exportName: "GitHubStandupPage",
        displayName: "Daily Standups",
        routePath: "github-standups",
      },
      {
        type: "dashboardWidget",
        id: "github-dashboard",
        exportName: "GitHubDashboardWidget",
        displayName: "GitHub Status",
      },
      {
        type: "detailTab",
        id: "github-detail",
        exportName: "GitHubDetailTab",
        displayName: "GitHub",
        entityTypes: ["issue"],
      },
      {
        type: "contextMenuItem",
        id: "github-context-menu",
        exportName: "GitHubContextMenu",
        displayName: "GitHub Actions",
        entityTypes: ["issue"],
      },
    ],
  },
};

export default manifest;
