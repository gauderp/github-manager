# GitHub Manager v2 — Paperclip Plugin

Plugin para o Paperclip que integra repositórios GitHub com sincronização local, PRs vinculados a cards, revisão de código por agentes IA, e knowledge graphs.

## Funcionalidades

- **Sync 3 camadas**: webhooks (tempo real), cron 5min (safety net), sync manual completo
- **PR ↔ Card**: detecção automática de links via branch/título (CARD-123, #456)
- **Review por agentes**: ferramentas para agentes IA revisarem PRs (diff, comentários inline, veredito)
- **Quick check**: checklist automático (descrição, testes, arquivos sensíveis)
- **Graphify**: knowledge graphs de alto nível e por repositório
- **DB local**: zero chamadas à API GitHub ao renderizar UI — tudo lido do banco

## Arquitetura

```
src/
  manifest.ts           — declaração de capabilities, slots, tools, agents
  worker.ts             — entry point: registra jobs, data/action handlers, webhook
  types.ts              — tipos compartilhados
  db/
    migrations/001.sql  — tabelas: repos, PRs, issues, links, sync_log
    queries.ts          — camada de queries tipada
  sync/
    webhook-handler.ts  — processa eventos GitHub (PR, issues)
    incremental-sync.ts — cron 5min: busca atualizações desde último sync
    full-sync.ts        — sync manual completo
    link-detector.ts    — regex matching para vincular PRs a cards
  github/
    api-client.ts       — fetch autenticado com rate-limit awareness
    config.ts           — resolução de token (PAT → secret → env)
  review/
    review-tools.ts     — 6 ferramentas para agentes: diff, read, comment, submit, list, search
    quick-check.ts      — checklist automático de PR
  graphify/
    graph-generator.ts  — gera grafos de repositórios e código
  ui/
    index.tsx           — re-exports de todos os componentes
    components/         — Settings, Repos, PRs, Graphs, DetailTab, Dashboard, Sidebar
```

## UI Slots

| Slot | Componente | Descrição |
|------|-----------|-----------|
| sidebar | GitHubSidebarLink | Link na sidebar principal |
| sidebarPanel | GitHubSidebarPanel | Painel rápido com contadores |
| routeSidebar | GitHubRouteSidebar | Navegação entre páginas GitHub |
| page | GitHubSettingsPage | Token, repos, sync |
| page | GitHubReposPage | Lista de repositórios |
| page | GitHubPullRequestsPage | PRs com filtros |
| page | GitHubGraphsPage | Knowledge graphs |
| dashboardWidget | GitHubDashboardWidget | Status no dashboard |
| detailTab | GitHubDetailTab | Tab GitHub dentro de cards |
| contextMenuItem | GitHubContextMenu | Ação no menu de contexto |

## Agent Tools

| Tool | Descrição |
|------|-----------|
| `github_get_pull_request_diff` | Diff unificado de um PR |
| `github_read_file_content` | Lê arquivo do repositório |
| `github_create_review_comment` | Comentário inline no PR |
| `github_submit_pr_review` | Submete review (approve/request_changes/comment) |
| `github_list_repositories` | Lista repos rastreados |
| `github_search_issues` | Busca issues/PRs via GitHub search |

## Desenvolvimento

```bash
npm install
npm run dev          # watch mode
npm run build        # build de produção
npm run typecheck    # verificação de tipos
npm test             # testes (vitest)
```

## Release

```bash
npm run build
npm pack             # gera .tgz
```

## Instalação

```bash
paperclipai plugin install ./gaud_erp-paperclip-github-manager-1.0.0.tgz
```

## Configuração

1. Acesse **GitHub > Configurações** no Paperclip
2. Configure o Personal Access Token (PAT) ou secret reference
3. Teste a conexão
4. Adicione repositórios (formato `owner/repo`)
5. O sync automático inicia a cada 5 minutos

### Permissões GitHub necessárias (PAT)

- `repo` (acesso completo a repos privados)
- `read:org` (listar repos da org)

### Webhook (opcional)

Configure um webhook no GitHub apontando para:
```
https://<paperclip-host>/plugins/cus.github-manager/webhooks/github-events
```
Eventos: `pull_request`, `issues`
