# @gaud_erp/paperclip-github-manager

Paperclip connector plugin for GitHub — repository listing, PR/issue sync, and webhook registration.

## Features

- List repositories for the authenticated user
- Sync open pull requests and issues (manual actions + scheduled job)
- Register GitHub webhooks pointing at the Paperclip host inbound URL
- Dashboard health widget and full **GitHub** page in the host UI
- **Agent tools** for autonomous PR code review (diff, inline comments, review verdict, file read, repo list, issue search)

## Agent reviewer workflow

Tools are exposed to Paperclip agents as `cus.github-manager/github_*` (plugin-namespaced at runtime).

1. **Collect** — `github_get_pull_request_diff` with `owner`, `repo`, `pr_number`
2. **Analyze** — agent reads metadata + unified diff (truncated above ~120k chars with a changed-files index)
3. **Context** (optional) — `github_read_file_content` when the diff is insufficient
4. **Inline feedback** (optional) — `github_create_review_comment` per finding (`commit_id` = PR head SHA)
5. **Verdict** — `github_submit_pr_review` with `APPROVE`, `REQUEST_CHANGES`, or `COMMENT`

Supporting tools: `github_list_repositories`, `github_search_issues`.

### Configuration

| Variable | Purpose |
|----------|---------|
| `GITHUB_TOKEN` | Optional worker-level PAT fallback |
| `GITHUB_DEFAULT_OWNER` | Default org/user when `owner` is omitted in list tools |
| `GITHUB_API_URL` | API base (GitHub Enterprise), default `https://api.github.com` |

Per-company PAT in **GitHub → Configurações** is preferred for multi-tenant installs.

## Requirements

- Paperclip instance with plugin runtime
- GitHub PAT saved in **GitHub → Configurações** (or company secret UUID when secret refs are re-enabled)
- For webhook registration: token scope `admin:repo_hook` on target repos

## Repository

Source: [gauderp/paperclip-github-manager](https://github.com/gauderp/paperclip-github-manager)

## Local development

```bash
npm install
npm run dev
paperclipai plugin install /absolute/path/to/plugins/github-manager
```

## Releases e npmjs

Cada **release no GitHub** (tag `v*`, ex. `v0.3.0`) dispara o workflow [publish-npm.yml](.github/workflows/publish-npm.yml) e publica `@gaud_erp/paperclip-github-manager` no [npmjs](https://www.npmjs.com/package/@gaud_erp/paperclip-github-manager).

### Primeira vez / credencial

1. No repo **gauderp/paperclip-github-manager** → Settings → Secrets → Actions: `NPM_TOKEN` (publish no escopo `@gaud_erp`).
2. Criar release no GitHub: tag `v0.3.0` apontando para `main`.
3. Confirmar: `npm view @gaud_erp/paperclip-github-manager version`

### Próximas versões

1. Bump `version` em `package.json` + `src/manifest.ts`
2. Commit, push `main`
3. GitHub → **Create release** com tag `vX.Y.Z`

## Production install (npm)

```bash
paperclipai plugin install @gaud_erp/paperclip-github-manager@0.4.0 --api-base http://127.0.0.1:3100
paperclipai plugin inspect cus.github-manager --api-base http://127.0.0.1:3100
```

Configure o PAT em **GitHub → Configurações** na sidebar do Paperclip.

## Build

```bash
npm run typecheck
npm test
npm run build
```

`prepublishOnly` runs build automatically before `npm publish`.

## Manifest

- Plugin id: `cus.github-manager`
- Webhook endpoint: `github-events`
- Scheduled job: `sync-github` (every 6 hours)
