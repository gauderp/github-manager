import type { PaperclipPluginManifestV1 } from "@paperclipai/plugin-sdk";

const manifest: PaperclipPluginManifestV1 = {
  id: "cus.github-manager",
  apiVersion: 1,
  version: "0.2.1",
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
        type: "sidebar",
        id: "github-nav",
        displayName: "GitHub",
        exportName: "GitHubSidebar",
        order: 45
      },
      {
        type: "routeSidebar",
        id: "github-route-nav",
        displayName: "GitHub",
        routePath: "github",
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
        id: "github-home",
        displayName: "GitHub",
        routePath: "github",
        exportName: "GitHubPage",
        order: 45
      }
    ]
  }
};

export default manifest;
