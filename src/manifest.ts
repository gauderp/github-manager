import type { PaperclipPluginManifestV1 } from "@paperclipai/plugin-sdk";

export const manifest: PaperclipPluginManifestV1 = {
  id: "cus.github-manager",
  version: "1.0.0",
  apiVersion: 1,
  displayName: "GitHub Manager",
  description: "Manage GitHub repos, PRs, issues, agent code reviews, and knowledge graphs — all from Paperclip",
  author: "Gaud ERP",
  categories: ["connector", "automation"],

  capabilities: [
    "events.subscribe",
    "events.emit",
    "http.outbound",
    "secrets.read-ref",
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
  ],

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
  ],

  agents: [
    {
      agentKey: "github-reviewer",
      displayName: "GitHub Code Reviewer",
      role: "code-review",
      title: "Senior Code Reviewer",
    },
  ],

  ui: {
    slots: [
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
      },
    ],
  },
};
