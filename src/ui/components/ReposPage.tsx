import React, { useState } from "react";
import { useHostContext, useHostNavigation, usePluginData, usePluginAction } from "@paperclipai/plugin-sdk/ui";
import { layoutStack, cardStyle, buttonStyle, primaryButtonStyle, timeAgo, PATHS } from "./shared.js";
import type { GitHubRepo } from "../../types.js";

export function GitHubReposPage() {
  const context = useHostContext();
  const companyId = context.companyId;
  const [filter, setFilter] = useState("");

  const nav = useHostNavigation();
  const reposData = usePluginData<{ repos: GitHubRepo[]; lastSync: string | null }>("repos", { companyId });
  const syncAction = usePluginAction("sync-all");
  const generateGraph = usePluginAction("generate-graph");
  const [graphLoading, setGraphLoading] = useState<string | null>(null);

  if (!companyId) return <div style={layoutStack}>Selecione uma empresa.</div>;

  const repos = (reposData.data?.repos ?? []).filter((r) =>
    !filter || r.fullName.toLowerCase().includes(filter.toLowerCase()),
  );

  return (
    <div style={layoutStack}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h2 style={{ margin: 0, fontSize: "18px" }}>Repositórios ({repos.length})</h2>
        <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
          <span style={{ fontSize: "11px", opacity: 0.6 }}>
            Último sync: {reposData.data?.lastSync ? timeAgo(reposData.data.lastSync) : "nunca"}
          </span>
          <button
            type="button"
            style={buttonStyle}
            onClick={() => syncAction({ companyId }).catch(console.error)}
          >
            Sync
          </button>
        </div>
      </div>

      <input
        placeholder="Filtrar repositórios..."
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        style={{ padding: "6px 10px", borderRadius: "6px", border: "1px solid rgba(128,128,128,0.3)", background: "transparent", fontSize: "13px" }}
      />

      {repos.length === 0 && (
        <div style={{ ...cardStyle, textAlign: "center", opacity: 0.6 }}>
          Nenhum repositório rastreado. Adicione em Configurações.
        </div>
      )}

      {repos.map((repo) => (
        <div key={repo.id} style={cardStyle}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
            <div>
              <a href={repo.htmlUrl} target="_blank" rel="noopener" style={{ fontWeight: 600, fontSize: "14px", color: "#3b82f6", textDecoration: "none" }}>
                {repo.fullName}
              </a>
              {repo.private && <span style={{ marginLeft: "8px", fontSize: "11px", opacity: 0.5 }}>privado</span>}
              {repo.description && <p style={{ margin: "4px 0 0", fontSize: "12px", opacity: 0.7 }}>{repo.description}</p>}
            </div>
            <div style={{ display: "flex", gap: "4px" }}>
              <button
                type="button"
                style={buttonStyle}
                disabled={graphLoading === repo.fullName}
                onClick={async () => {
                  setGraphLoading(repo.fullName);
                  try {
                    await generateGraph({ companyId, repoFullName: repo.fullName, level: "code" });
                    nav.navigate(PATHS.graphs);
                  } catch (err) {
                    console.error(err);
                  } finally {
                    setGraphLoading(null);
                  }
                }}
                title="Gerar Knowledge Graph"
              >
                {graphLoading === repo.fullName ? "Gerando..." : "Graphify"}
              </button>
            </div>
          </div>
          <div style={{ display: "flex", gap: "16px", marginTop: "8px", fontSize: "11px", opacity: 0.5 }}>
            {repo.language && <span>{repo.language}</span>}
            <span>branch: {repo.defaultBranch}</span>
            <span>sync: {timeAgo(repo.syncedAt)}</span>
          </div>
        </div>
      ))}
    </div>
  );
}
