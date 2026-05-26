import type { PaperclipPluginManifestV1 } from "@paperclipai/plugin-sdk";

const manifest: PaperclipPluginManifestV1 = {
  id: "cus.github-manager",
  version: "1.8.1",
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
  ],

  skills: [
    {
      skillKey: "github-codebase-access",
      displayName: "GitHub Codebase Access",
      description: "Provides agents with tools to read repository structure and files from GitHub without needing local filesystem access",
      markdown: `# GitHub Codebase Access

You have access to GitHub repositories through the GitHub Manager plugin tools. NEVER say you don't have access to the codebase.

## Available Tools

### 1. github_get_repo_structure
Get the directory and file structure of a repository. **Always call this FIRST** before reading any files.

Parameters:
- \`repo_full_name\` (required): Repository in "owner/repo" format
- \`refresh\` (optional): Set to true to regenerate from GitHub if cache is stale

### 2. github_read_file_content
Read the content of a specific file from a GitHub repository.

Parameters:
- \`owner\` (required): Repository owner (e.g. "gauderp")
- \`repo\` (required): Repository name (e.g. "gaud-erp-api")
- \`path\` (required): File path (e.g. "src/main/java/com/gaud/App.java")
- \`ref\` (optional): Branch or commit SHA (defaults to main branch)

### 3. github_get_pull_request_diff
Get the unified diff of a pull request for code review.

Parameters:
- \`owner\`, \`repo\`, \`pull_number\`

### 4. github_search_issues
Search GitHub issues and PRs using GitHub search syntax.

Parameters:
- \`query\`: GitHub search query (e.g. "is:open label:bug")

### 5. github_list_repositories
List all tracked GitHub repositories (no parameters needed).

## Mandatory Workflow

1. **ALWAYS** start with \`github_get_repo_structure\` to understand the codebase layout
2. Read only the files you actually need with \`github_read_file_content\`
3. If the structure seems outdated, call \`github_get_repo_structure\` with \`refresh=true\`
4. Never try to access the local filesystem for source code — always use these tools

## Token Efficiency
The structure cache returns directories and key files in a single call (~5-50KB).
This replaces hundreds of file-listing API calls, saving 60-90% of tokens.
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
