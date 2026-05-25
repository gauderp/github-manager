import type { PluginManifest } from "@paperclipai/plugin-sdk";

export const manifest: PluginManifest = {
  id: "cus.github-manager",
  version: "1.0.0",
  apiVersion: 1,
  displayName: "GitHub Manager",
  description: "Manage GitHub repos, PRs, issues, agent code reviews, and knowledge graphs — all from Paperclip",
  author: "Gaud ERP",
  categories: ["connector", "automation"],

  capabilities: [
    "config",
    "events.subscribe",
    "events.emit",
    "http.request",
    "secrets.resolve",
    "state.read",
    "state.write",
    "database.query",
    "database.mutate",
    "jobs.schedule",
    "webhooks.receive",
    "tools.register",
    "agents.managed.reconcile",
    "agents.invoke",
    "issues.read",
    "ui.page.register",
    "ui.sidebar.register",
    "ui.detailTab.register",
    "ui.dashboardWidget.register",
    "ui.contextMenuItem.register",
    "logging",
  ],

  worker: { source: "./dist/worker.js" },
  ui: { source: "./dist/ui" },

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
      description: "Receives GitHub webhook events (pull_request, issues)",
      events: ["pull_request", "issues"],
    },
  ],

  tools: [
    {
      toolKey: "github_get_pull_request_diff",
      displayName: "Get PR Diff",
      description: "Retrieve the unified diff of a GitHub pull request",
    },
    {
      toolKey: "github_read_file_content",
      displayName: "Read File",
      description: "Read a file from a GitHub repository",
    },
    {
      toolKey: "github_create_review_comment",
      displayName: "Add Review Comment",
      description: "Post an inline review comment on a pull request",
    },
    {
      toolKey: "github_submit_pr_review",
      displayName: "Submit PR Review",
      description: "Submit a review verdict (approve, request changes, comment)",
    },
    {
      toolKey: "github_list_repositories",
      displayName: "List Repositories",
      description: "List all tracked GitHub repositories",
    },
    {
      toolKey: "github_search_issues",
      displayName: "Search Issues",
      description: "Search GitHub issues and PRs using search syntax",
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

  ui_slots: [
    {
      slot: "sidebar",
      exportName: "GitHubSidebarLink",
      displayName: "GitHub",
    },
    {
      slot: "sidebarPanel",
      exportName: "GitHubSidebarPanel",
      displayName: "GitHub Quick View",
    },
    {
      slot: "page",
      exportName: "GitHubSettingsPage",
      displayName: "Configurações GitHub",
      routePath: "github-settings",
    },
    {
      slot: "routeSidebar",
      exportName: "GitHubRouteSidebar",
      displayName: "GitHub Navigation",
      routePaths: ["github-settings", "github-repos", "github-prs", "github-graphs"],
    },
    {
      slot: "page",
      exportName: "GitHubReposPage",
      displayName: "Repositórios",
      routePath: "github-repos",
    },
    {
      slot: "page",
      exportName: "GitHubPullRequestsPage",
      displayName: "Pull Requests",
      routePath: "github-prs",
    },
    {
      slot: "page",
      exportName: "GitHubGraphsPage",
      displayName: "Knowledge Graphs",
      routePath: "github-graphs",
    },
    {
      slot: "dashboardWidget",
      exportName: "GitHubDashboardWidget",
      displayName: "GitHub Status",
    },
    {
      slot: "detailTab",
      exportName: "GitHubDetailTab",
      displayName: "GitHub",
      entityTypes: ["issue"],
    },
    {
      slot: "contextMenuItem",
      exportName: "GitHubContextMenu",
      displayName: "GitHub Actions",
    },
  ],
};
