# GitHub Manager — Paperclip Plugin

[![npm version](https://img.shields.io/npm/v/@gaud_erp/paperclip-github-manager.svg)](https://www.npmjs.com/package/@gaud_erp/paperclip-github-manager)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

Open-source [Paperclip](https://github.com/paperclipai/paperclip) plugin that brings GitHub repository management, PR/issue sync, AI-powered code reviews, and knowledge graphs into your Paperclip instance.

## Features

- **3-layer sync**: webhooks (real-time) + cron every 5 min (safety net) + manual full sync
- **PR ↔ Card linking**: automatic detection via branch name or title patterns (CARD-123, #456)
- **AI code review**: 7 agent tools for reviewing PRs (diff, inline comments, verdicts)
- **Repo structure cache**: agents get a pre-built codebase map in one call, saving 60-90% of tokens
- **Managed skill**: `github-codebase-access` skill teaches agents how to navigate repos via tools
- **Knowledge graphs**: visual repo structure, exportable as Obsidian Canvas (`.canvas`)
- **Local DB**: zero GitHub API calls when rendering UI — all data read from synced database

## Installation

### Via Paperclip UI (recommended)

1. Open your Paperclip instance
2. Go to **Settings > Plugins**
3. Click **Install Plugin**
4. Enter the npm package name: `@gaud_erp/paperclip-github-manager`
5. Wait for installation — status will change to **Ready**

### Via CLI

```bash
paperclipai plugin install @gaud_erp/paperclip-github-manager
```

## Configuration

1. Go to **Settings > Plugins > GitHub Manager > Configuration**
2. Enter your GitHub Personal Access Token (PAT)
3. Optionally set the **Default Organization** to auto-discover repos on first sync
4. Click **Save**
5. Navigate to **GitHub > Repositories** and click **Sync**

### Required GitHub PAT permissions

- `repo` — full access to private repositories
- `read:org` — list organization repositories

### Webhook (optional)

Set up a GitHub webhook pointing to:

```
https://<your-paperclip-host>/plugins/cus.github-manager/webhooks/github-events
```

Events: `pull_request`, `issues`

## Agent Tools

The plugin registers 7 tools available to Paperclip agents:

| Tool | Description |
|------|-------------|
| `github_get_repo_structure` | Get cached directory/file structure (call this FIRST) |
| `github_get_pull_request_diff` | Get unified diff of a PR |
| `github_read_file_content` | Read a file from a repository |
| `github_create_review_comment` | Post an inline review comment on a PR |
| `github_submit_pr_review` | Submit a review verdict (approve/request_changes/comment) |
| `github_list_repositories` | List all tracked repositories |
| `github_search_issues` | Search issues and PRs using GitHub search syntax |

### Agent Skill

The plugin ships a managed skill **`github-codebase-access`** that appears in your Paperclip skill library. Enable it on any agent (CEO, FoundingEngineer, etc.) to give it access to GitHub repositories without needing local filesystem access.

## UI Pages

| Page | Description |
|------|-------------|
| **Repositories** | List synced repos, trigger sync, generate knowledge graphs |
| **Pull Requests** | Browse PRs with filters by repo, state, author |
| **Knowledge Graphs** | Generate and export repo structure graphs (Obsidian Canvas) |
| **Settings** | Configure GitHub PAT, default org, sync interval |

The plugin also adds a **dashboard widget** (GitHub Status), a **detail tab** on issue cards (linked PRs), and a **sidebar link** for quick navigation.

## Architecture

```
src/
  manifest.ts           — capabilities, tools, agents, skills, UI slots
  worker.ts             — jobs, data/action handlers, webhook registration
  types.ts              — shared types
  db/
    migrations/         — PostgreSQL schema (plugin-namespaced)
    queries.ts          — typed query layer
  sync/
    webhook-handler.ts  — real-time GitHub event processing
    incremental-sync.ts — cron job: fetch updates since last sync
    full-sync.ts        — full sync with auto-discovery
    link-detector.ts    — regex matching for PR ↔ card linking
  github/
    api-client.ts       — authenticated fetch with rate-limit awareness
    config.ts           — token resolution (config → state → env)
  review/
    review-tools.ts     — 7 agent tools registration
    quick-check.ts      — automated PR checklist
  graphify/
    graph-generator.ts  — high-level and code-level graph generation
  ui/
    index.tsx           — component re-exports
    components/         — Settings, Repos, PRs, Graphs, Dashboard, DetailTab, Sidebar
```

## Development

```bash
npm install
npm run dev          # watch mode
npm run build        # production build
npm run typecheck    # type checking
npm test             # tests (vitest)
```

## Publishing

Releases are published automatically to npm via GitHub Actions when a new release is created on GitHub.

```bash
npm version patch    # or minor/major
git push && git push --tags
# Then create a GitHub release from the tag
```

## License

MIT
