import type { PaperclipPluginManifestV1 } from "@paperclipai/plugin-sdk";
import { ROUTES } from "./constants.js";

const manifest: PaperclipPluginManifestV1 = {
  id: "cus.github-manager",
  apiVersion: 1,
  version: "0.2.3",
  displayName: "GitHub Manager",
  description: "Plugin Paperclip para gerenciar repositorios, PRs, issues e webhooks GitHub",
  author: "CUS",
  categories: ["connector"],
  capabilities: [
    "events.subscribe",
    "http.outbound",
    "secrets.read-ref",
    "plugin.state.read",
    "plugin.state.write",
    "jobs.schedule",
    "webhooks.receive",
    "ui.sidebar.register",
    "ui.dashboardWidget.register",
    "ui.page.register"
  ],
  jobs: [
    {
      jobKey: "sync-github",
      displayName: "Sync GitHub PRs and issues",
      description: "Pulls open PRs and issues for tracked repositories",
      schedule: "0 */6 * * *"
    }
  ],
  webhooks: [
    {
      endpointKey: "github-events",
      displayName: "GitHub repository events",
      description: "Receives pull_request and issues events from configured repositories"
    }
  ],
  entrypoints: {
    worker: "./dist/worker.js",
    ui: "./dist/ui"
  },
  ui: {
    slots: [
      {
        type: "sidebarPanel",
        id: "github-module",
        displayName: "GitHub",
        exportName: "GitHubSidebarModule",
        order: 45
      },
      {
        type: "routeSidebar",
        id: "github-route-nav",
        displayName: "GitHub",
        routePath: ROUTES.repos,
        exportName: "GitHubRouteSidebar",
        order: 45
      },
      {
        type: "routeSidebar",
        id: "github-settings-route-nav",
        displayName: "GitHub",
        routePath: ROUTES.settings,
        exportName: "GitHubRouteSidebar",
        order: 45
      },
      {
        type: "routeSidebar",
        id: "github-prs-route-nav",
        displayName: "GitHub",
        routePath: ROUTES.pullRequests,
        exportName: "GitHubRouteSidebar",
        order: 45
      },
      {
        type: "dashboardWidget",
        id: "github-health",
        displayName: "GitHub Manager Health",
        exportName: "DashboardWidget"
      },
      {
        type: "page",
        id: "github-settings-page",
        displayName: "GitHub — Configurações",
        routePath: ROUTES.settings,
        exportName: "GitHubSettingsPage",
        order: 45
      },
      {
        type: "page",
        id: "github-repos-page",
        displayName: "GitHub — Repositórios",
        routePath: ROUTES.repos,
        exportName: "GitHubReposPage",
        order: 45
      },
      {
        type: "page",
        id: "github-prs-page",
        displayName: "GitHub — Pull requests",
        routePath: ROUTES.pullRequests,
        exportName: "GitHubPullRequestsPage",
        order: 45
      }
    ]
  }
};

export default manifest;
