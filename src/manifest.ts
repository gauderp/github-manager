import type { PaperclipPluginManifestV1 } from "@paperclipai/plugin-sdk";

const manifest: PaperclipPluginManifestV1 = {
  id: "cus.github-manager",
  version: "3.0.0",
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
      webhookInfo: {
        type: "string",
        title: "Webhook URL (Auto Review)",
        description: "Configure no GitHub: Settings → Webhooks → Add webhook. Cole a URL completa (substitua <host> pelo seu domínio). Events: Pull requests, Issues. Content type: application/json. O plugin ID é preenchido automaticamente após instalação.",
        default: "/api/plugins/<plugin-id>/webhooks/github-events",
        readOnly: true,
      },
      autoReviewEnabled: {
        type: "boolean",
        title: "Auto Review Enabled",
        description: "Automatically assign the github-reviewer agent when a PR is opened or ready for review",
        default: false,
      },
      autoTriageEnabled: {
        type: "boolean",
        title: "Auto Triage Enabled",
        description: "Automatically assign the github-triager agent when an issue is opened",
        default: false,
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
  ],

  webhooks: [
    {
      endpointKey: "github-events",
      displayName: "GitHub Events",
      description: "Receives GitHub webhook events (pull_request, issues)",
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
