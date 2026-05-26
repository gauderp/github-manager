import React, { useState } from "react";
import { useHostContext, usePluginAction } from "@paperclipai/plugin-sdk/ui";
import { layoutStack, cardStyle, buttonStyle, primaryButtonStyle } from "./shared.js";
import { GitHubNavBar } from "./NavBar.js";

export function GitHubSettingsPage() {
  const context = useHostContext();
  const companyId = context.companyId;

  const [token, setToken] = useState("");
  const [secretRef, setSecretRef] = useState("");
  const [repoInput, setRepoInput] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const saveToken = usePluginAction("save-token");
  const saveSecretRefAction = usePluginAction("save-secret-ref");
  const testConnection = usePluginAction("test-connection");
  const addRepo = usePluginAction("add-repo");
  const syncAll = usePluginAction("sync-all");

  if (!companyId) return <div style={layoutStack}>Selecione uma empresa.</div>;

  const handleSaveToken = async () => {
    if (!token.trim()) return;
    setLoading(true);
    try {
      await saveToken({ companyId, token: token.trim() });
      setStatus("Token salvo com sucesso");
      setToken("");
    } catch (err) {
      setStatus(`Erro: ${err}`);
    }
    setLoading(false);
  };

  const handleSaveSecretRef = async () => {
    if (!secretRef.trim()) return;
    setLoading(true);
    try {
      await saveSecretRefAction({ companyId, secretRef: secretRef.trim() });
      setStatus("Secret ref salvo com sucesso");
      setSecretRef("");
    } catch (err) {
      setStatus(`Erro: ${err}`);
    }
    setLoading(false);
  };

  const handleTestConnection = async () => {
    setLoading(true);
    try {
      const result = await testConnection({ companyId }) as { ok: boolean; login?: string; error?: string };
      if (result.ok) {
        setStatus(`Conectado como ${result.login}`);
      } else {
        setStatus(`Falha: ${result.error}`);
      }
    } catch (err) {
      setStatus(`Erro: ${err}`);
    }
    setLoading(false);
  };

  const handleAddRepo = async () => {
    if (!repoInput.trim()) return;
    setLoading(true);
    try {
      await addRepo({ companyId, fullName: repoInput.trim() });
      setStatus(`Repositório ${repoInput.trim()} adicionado`);
      setRepoInput("");
    } catch (err) {
      setStatus(`Erro: ${err}`);
    }
    setLoading(false);
  };

  const handleFullSync = async () => {
    setLoading(true);
    setStatus("Sincronizando...");
    try {
      await syncAll({ companyId });
      setStatus("Sync completo finalizado");
    } catch (err) {
      setStatus(`Erro no sync: ${err}`);
    }
    setLoading(false);
  };

  return (
    <div style={layoutStack}>
      <GitHubNavBar />
      <h2 style={{ margin: 0, fontSize: "18px" }}>Configurações GitHub</h2>

      {status && (
        <div style={{ ...cardStyle, fontSize: "13px", color: status.startsWith("Erro") ? "#ef4444" : "#22c55e" }}>
          {status}
        </div>
      )}

      <div style={cardStyle}>
        <h3 style={{ margin: "0 0 8px", fontSize: "14px" }}>Autenticação</h3>
        <div style={{ display: "flex", gap: "8px", marginBottom: "8px" }}>
          <input
            type="password"
            placeholder="GitHub Personal Access Token"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            style={{ flex: 1, padding: "6px 10px", borderRadius: "6px", border: "1px solid rgba(128,128,128,0.3)", background: "transparent", fontSize: "13px" }}
          />
          <button type="button" style={buttonStyle} onClick={handleSaveToken} disabled={loading}>
            Salvar PAT
          </button>
        </div>
        <div style={{ display: "flex", gap: "8px", marginBottom: "8px" }}>
          <input
            placeholder="UUID do secret (alternativa)"
            value={secretRef}
            onChange={(e) => setSecretRef(e.target.value)}
            style={{ flex: 1, padding: "6px 10px", borderRadius: "6px", border: "1px solid rgba(128,128,128,0.3)", background: "transparent", fontSize: "13px" }}
          />
          <button type="button" style={buttonStyle} onClick={handleSaveSecretRef} disabled={loading}>
            Salvar Ref
          </button>
        </div>
        <button type="button" style={primaryButtonStyle} onClick={handleTestConnection} disabled={loading}>
          Testar Conexão
        </button>
      </div>

      <div style={cardStyle}>
        <h3 style={{ margin: "0 0 8px", fontSize: "14px" }}>Adicionar Repositório</h3>
        <div style={{ display: "flex", gap: "8px" }}>
          <input
            placeholder="owner/repo (ex: gauderp/gaud-erp-api)"
            value={repoInput}
            onChange={(e) => setRepoInput(e.target.value)}
            style={{ flex: 1, padding: "6px 10px", borderRadius: "6px", border: "1px solid rgba(128,128,128,0.3)", background: "transparent", fontSize: "13px" }}
          />
          <button type="button" style={primaryButtonStyle} onClick={handleAddRepo} disabled={loading}>
            Adicionar
          </button>
        </div>
      </div>

      <div style={cardStyle}>
        <h3 style={{ margin: "0 0 8px", fontSize: "14px" }}>Sincronização</h3>
        <p style={{ margin: "0 0 8px", fontSize: "12px", opacity: 0.7 }}>
          Sync automático a cada 5 minutos. Use o botão abaixo para forçar um sync completo.
        </p>
        <button type="button" style={primaryButtonStyle} onClick={handleFullSync} disabled={loading}>
          {loading ? "Sincronizando..." : "Sync Completo"}
        </button>
      </div>
    </div>
  );
}
