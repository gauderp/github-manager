# @gaud_erp/github-manager

Paperclip connector plugin for GitHub — repository listing, PR/issue sync, and webhook registration.

## Features

- List repositories for the authenticated user
- Sync open pull requests and issues (manual actions + scheduled job)
- Register GitHub webhooks pointing at the Paperclip host inbound URL
- Dashboard health widget and full **GitHub** page in the host UI

## Requirements

- Paperclip instance with plugin runtime
- Company secret `github_token` (GitHub PAT or fine-grained token)
- For webhook registration: token scope `admin:repo_hook` on target repos

## Repository

Source: [gauderp/github-manager](https://github.com/gauderp/github-manager)

## Local development

```bash
npm install
npm run dev
paperclipai plugin install /absolute/path/to/plugins/github-manager
```

## Releases e npmjs

Cada **release no GitHub** (tag `v*`, ex. `v0.2.2`) dispara o workflow [publish-npm.yml](.github/workflows/publish-npm.yml) e publica `@gaud_erp/github-manager` no [npmjs](https://www.npmjs.com/package/@gaud_erp/github-manager).

### Primeira vez / credencial

1. No repo **gauderp/github-manager** → Settings → Secrets → Actions: criar `NPM_TOKEN` (token npm com publish no escopo `@gaud_erp`, bypass 2FA se a org exigir).
2. Criar release no GitHub: tag `v0.2.3` apontando para `main` (Actions roda typecheck, test, build, `npm publish`).
3. Confirmar: `npm view @gaud_erp/github-manager version`

### Próximas versões

1. Bump `version` em `package.json` + `src/manifest.ts`
2. Commit, push `main`
3. GitHub → **Create release** com tag `vX.Y.Z` (mesmo número da versão do pacote)

## Production install (npm)

```bash
paperclipai plugin install @gaud_erp/github-manager@0.2.3 --api-base http://127.0.0.1:3100
paperclipai plugin inspect cus.github-manager --api-base http://127.0.0.1:3100
```

Configure o company secret `github_token`, depois use **GitHub → Configurações** na sidebar do Paperclip.

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
