import React, { useState, useEffect } from "react";
import { useHostContext, usePluginAction, usePluginData } from "@paperclipai/plugin-sdk/ui";
import { layoutStack, cardStyle, buttonStyle, primaryButtonStyle, badgeStyle } from "./shared.js";
import { GitHubNavBar } from "./NavBar.js";
import type { TriageRule } from "../../types.js";

type Repo = { id: number; fullName: string };

export function GitHubSettingsPage() {
  const context = useHostContext();
  const companyId = context.companyId;

  const [token, setToken] = useState("");
  const [secretRef, setSecretRef] = useState("");
  const [repoInput, setRepoInput] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Triage rules state
  const [selectedRepoId, setSelectedRepoId] = useState<number | null>(null);
  const [triageRules, setTriageRules] = useState<TriageRule[]>([]);
  const [editingRule, setEditingRule] = useState<Partial<TriageRule> | null>(null);
  const [triageVersion, setTriageVersion] = useState(0);

  // Review guidelines state
  const [guidelinesRepoId, setGuidelinesRepoId] = useState<number | null>(null);
  const [guidelinesText, setGuidelinesText] = useState("");

  const saveToken = usePluginAction("save-token");
  const saveSecretRefAction = usePluginAction("save-secret-ref");
  const testConnection = usePluginAction("test-connection");
  const addRepo = usePluginAction("add-repo");
  const syncAll = usePluginAction("sync-all");
  const saveTriageRule = usePluginAction("save-triage-rule");
  const deleteTriageRuleAction = usePluginAction("delete-triage-rule");
  const saveReviewGuidelines = usePluginAction("save-review-guidelines");

  const { data: reposData } = usePluginData("repos", { companyId });
  const repos = ((reposData as { repos?: Repo[] })?.repos ?? []) as Repo[];

  const { data: triageData } = usePluginData(
    "triage-rules",
    { companyId, repoId: selectedRepoId, _v: triageVersion },
  );

  const { data: guidelinesData } = usePluginData(
    "review-guidelines",
    { companyId, repoId: guidelinesRepoId },
  );

  useEffect(() => {
    if (!selectedRepoId) { setTriageRules([]); return; }
    const rules = ((triageData as { rules?: TriageRule[] })?.rules ?? []) as TriageRule[];
    setTriageRules(rules);
  }, [triageData, selectedRepoId]);

  useEffect(() => {
    if (!guidelinesRepoId) { setGuidelinesText(""); return; }
    const g = (guidelinesData as { guidelines?: string })?.guidelines ?? "";
    setGuidelinesText(g);
  }, [guidelinesData, guidelinesRepoId]);

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

  const handleSaveRule = async () => {
    if (!editingRule || !selectedRepoId) return;
    if (!editingRule.ruleName || !editingRule.conditionValue || !editingRule.actionValue) {
      setStatus("Preencha todos os campos da regra");
      return;
    }
    setLoading(true);
    try {
      await saveTriageRule({
        companyId,
        rule: {
          ...editingRule,
          repoId: selectedRepoId,
          conditionType: editingRule.conditionType ?? "keyword",
          actionType: editingRule.actionType ?? "add_label",
          priority: editingRule.priority ?? 0,
          enabled: editingRule.enabled ?? true,
        },
      });
      setEditingRule(null);
      setTriageVersion((v) => v + 1);
      setStatus("Regra salva");
    } catch (err) {
      setStatus(`Erro: ${err}`);
    }
    setLoading(false);
  };

  const handleDeleteRule = async (id: number) => {
    setLoading(true);
    try {
      await deleteTriageRuleAction({ companyId, ruleId: id });
      setTriageVersion((v) => v + 1);
      setStatus("Regra removida");
    } catch (err) {
      setStatus(`Erro: ${err}`);
    }
    setLoading(false);
  };

  const handleSaveGuidelines = async () => {
    if (!guidelinesRepoId) return;
    setLoading(true);
    try {
      await saveReviewGuidelines({ companyId, repoId: guidelinesRepoId, guidelines: guidelinesText });
      setStatus("Guidelines salvas");
    } catch (err) {
      setStatus(`Erro: ${err}`);
    }
    setLoading(false);
  };

  const inputStyle: React.CSSProperties = {
    flex: 1,
    padding: "6px 10px",
    borderRadius: "6px",
    border: "1px solid rgba(128,128,128,0.3)",
    background: "transparent",
    fontSize: "13px",
  };

  const selectStyle: React.CSSProperties = {
    ...inputStyle,
    flex: "none",
    width: "auto",
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

      {/* Authentication */}
      <div style={cardStyle}>
        <h3 style={{ margin: "0 0 8px", fontSize: "14px" }}>Autenticação</h3>
        <div style={{ display: "flex", gap: "8px", marginBottom: "8px" }}>
          <input
            type="password"
            placeholder="GitHub Personal Access Token"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            style={inputStyle}
          />
          <button type="button" style={buttonStyle} onClick={handleSaveToken} disabled={loading}>Salvar PAT</button>
        </div>
        <div style={{ display: "flex", gap: "8px", marginBottom: "8px" }}>
          <input
            placeholder="UUID do secret (alternativa)"
            value={secretRef}
            onChange={(e) => setSecretRef(e.target.value)}
            style={inputStyle}
          />
          <button type="button" style={buttonStyle} onClick={handleSaveSecretRef} disabled={loading}>Salvar Ref</button>
        </div>
        <button type="button" style={primaryButtonStyle} onClick={handleTestConnection} disabled={loading}>
          Testar Conexão
        </button>
      </div>

      {/* Add Repo */}
      <div style={cardStyle}>
        <h3 style={{ margin: "0 0 8px", fontSize: "14px" }}>Adicionar Repositório</h3>
        <div style={{ display: "flex", gap: "8px" }}>
          <input
            placeholder="owner/repo (ex: gauderp/gaud-erp-api)"
            value={repoInput}
            onChange={(e) => setRepoInput(e.target.value)}
            style={inputStyle}
          />
          <button type="button" style={primaryButtonStyle} onClick={handleAddRepo} disabled={loading}>Adicionar</button>
        </div>
      </div>

      {/* Sync */}
      <div style={cardStyle}>
        <h3 style={{ margin: "0 0 8px", fontSize: "14px" }}>Sincronização</h3>
        <p style={{ margin: "0 0 8px", fontSize: "12px", opacity: 0.7 }}>
          Sync automático a cada 5 minutos. Use o botão abaixo para forçar um sync completo.
        </p>
        <button type="button" style={primaryButtonStyle} onClick={handleFullSync} disabled={loading}>
          {loading ? "Sincronizando..." : "Sync Completo"}
        </button>
      </div>

      {/* Webhook */}
      <div style={cardStyle}>
        <h3 style={{ margin: "0 0 8px", fontSize: "14px" }}>Webhook (Review + Triage Automático)</h3>
        <p style={{ margin: "0 0 8px", fontSize: "12px", opacity: 0.7 }}>
          Configure um webhook no GitHub para auto-review de PRs e auto-triage de issues.
        </p>
        <div style={{ background: "rgba(128,128,128,0.08)", borderRadius: "6px", padding: "12px", fontSize: "12px", fontFamily: "monospace" }}>
          <div style={{ marginBottom: "12px" }}>
            <strong style={{ fontSize: "11px", opacity: 0.6, display: "block", marginBottom: "4px" }}>Payload URL</strong>
            <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
              <code style={{ flex: 1, wordBreak: "break-all" }}>
                {typeof window !== "undefined" ? `${window.location.origin}/api/plugins/70603f46-017a-409b-bdf5-ca5a17c20bb4/webhooks/github-events` : "<your-host>/api/plugins/<plugin-id>/webhooks/github-events"}
              </code>
              <button
                type="button"
                style={{ ...buttonStyle, fontSize: "11px", padding: "4px 8px" }}
                onClick={() => {
                  const url = `${window.location.origin}/api/plugins/70603f46-017a-409b-bdf5-ca5a17c20bb4/webhooks/github-events`;
                  navigator.clipboard.writeText(url).then(() => setStatus("URL copiada!"));
                }}
              >
                Copiar
              </button>
            </div>
          </div>
          <div style={{ marginBottom: "8px" }}><strong style={{ fontSize: "11px", opacity: 0.6 }}>Content type:</strong> application/json</div>
          <div><strong style={{ fontSize: "11px", opacity: 0.6 }}>Events:</strong> Pull requests, Issues</div>
        </div>
        <p style={{ margin: "8px 0 0", fontSize: "11px", opacity: 0.5 }}>
          Ative "Auto Review" e "Auto Triage" nas configurações da instância para que os agentes sejam atribuídos automaticamente.
        </p>
      </div>

      {/* Triage Rules */}
      <div style={cardStyle}>
        <h3 style={{ margin: "0 0 8px", fontSize: "14px" }}>Regras de Triage</h3>
        <p style={{ margin: "0 0 8px", fontSize: "12px", opacity: 0.7 }}>
          Configure regras automáticas para classificar issues por palavra-chave, path, autor ou prefixo de label.
        </p>

        <div style={{ display: "flex", gap: "8px", marginBottom: "12px" }}>
          <select
            value={selectedRepoId ?? ""}
            onChange={(e) => setSelectedRepoId(e.target.value ? Number(e.target.value) : null)}
            style={selectStyle}
          >
            <option value="">Selecione um repositório...</option>
            {repos.map((r) => (
              <option key={r.id} value={r.id}>{r.fullName}</option>
            ))}
          </select>
          {selectedRepoId && (
            <button
              type="button"
              style={primaryButtonStyle}
              onClick={() => setEditingRule({ conditionType: "keyword", actionType: "add_label", priority: 0, enabled: true })}
            >
              + Nova Regra
            </button>
          )}
        </div>

        {/* Edit form */}
        {editingRule && selectedRepoId && (
          <div style={{ ...cardStyle, marginBottom: "12px", background: "rgba(59,130,246,0.05)", borderColor: "rgba(59,130,246,0.2)" }}>
            <h4 style={{ margin: "0 0 8px", fontSize: "13px" }}>{editingRule.id ? "Editar Regra" : "Nova Regra"}</h4>
            <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
              <input
                placeholder="Nome da regra"
                value={editingRule.ruleName ?? ""}
                onChange={(e) => setEditingRule({ ...editingRule, ruleName: e.target.value })}
                style={inputStyle}
              />
              <div style={{ display: "flex", gap: "6px" }}>
                <select
                  value={editingRule.conditionType ?? "keyword"}
                  onChange={(e) => setEditingRule({ ...editingRule, conditionType: e.target.value as TriageRule["conditionType"] })}
                  style={selectStyle}
                >
                  <option value="keyword">Keyword</option>
                  <option value="path">Path</option>
                  <option value="author">Author</option>
                  <option value="label_prefix">Label Prefix</option>
                </select>
                <input
                  placeholder="Valor da condição (ex: crash, src/api, @johndoe)"
                  value={editingRule.conditionValue ?? ""}
                  onChange={(e) => setEditingRule({ ...editingRule, conditionValue: e.target.value })}
                  style={inputStyle}
                />
              </div>
              <div style={{ display: "flex", gap: "6px" }}>
                <select
                  value={editingRule.actionType ?? "add_label"}
                  onChange={(e) => setEditingRule({ ...editingRule, actionType: e.target.value as TriageRule["actionType"] })}
                  style={selectStyle}
                >
                  <option value="add_label">Add Label</option>
                  <option value="set_assignee">Set Assignee</option>
                  <option value="set_priority">Set Priority</option>
                </select>
                <input
                  placeholder="Valor da ação (ex: bug, @johndoe, high)"
                  value={editingRule.actionValue ?? ""}
                  onChange={(e) => setEditingRule({ ...editingRule, actionValue: e.target.value })}
                  style={inputStyle}
                />
              </div>
              <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
                <input
                  type="number"
                  placeholder="Prioridade (0 = mais baixa)"
                  value={editingRule.priority ?? 0}
                  onChange={(e) => setEditingRule({ ...editingRule, priority: Number(e.target.value) })}
                  style={{ ...inputStyle, flex: "none", width: "180px" }}
                />
                <label style={{ fontSize: "12px", display: "flex", gap: "4px", alignItems: "center" }}>
                  <input
                    type="checkbox"
                    checked={editingRule.enabled ?? true}
                    onChange={(e) => setEditingRule({ ...editingRule, enabled: e.target.checked })}
                  />
                  Habilitada
                </label>
                <div style={{ flex: 1 }} />
                <button type="button" style={buttonStyle} onClick={() => setEditingRule(null)}>Cancelar</button>
                <button type="button" style={primaryButtonStyle} onClick={handleSaveRule} disabled={loading}>Salvar</button>
              </div>
            </div>
          </div>
        )}

        {/* Rules list */}
        {selectedRepoId && triageRules.length === 0 && !editingRule && (
          <p style={{ fontSize: "12px", opacity: 0.5, margin: 0 }}>Nenhuma regra configurada para este repositório.</p>
        )}
        {triageRules.map((rule) => (
          <div key={rule.id} style={{ ...cardStyle, marginBottom: "6px", display: "flex", alignItems: "center", gap: "8px" }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: "13px", fontWeight: 600 }}>{rule.ruleName}</div>
              <div style={{ fontSize: "11px", opacity: 0.6, marginTop: "2px" }}>
                IF {rule.conditionType} = "{rule.conditionValue}" → {rule.actionType}: "{rule.actionValue}"
                {" "} · priority {rule.priority}
              </div>
            </div>
            <span style={badgeStyle(rule.enabled ? "#22c55e" : "#6b7280")}>
              {rule.enabled ? "ON" : "OFF"}
            </span>
            <button
              type="button"
              style={buttonStyle}
              onClick={() => setEditingRule(rule)}
            >
              Editar
            </button>
            <button
              type="button"
              style={{ ...buttonStyle, color: "#ef4444", borderColor: "rgba(239,68,68,0.3)" }}
              onClick={() => handleDeleteRule(rule.id)}
              disabled={loading}
            >
              Remover
            </button>
          </div>
        ))}
      </div>

      {/* Review Guidelines */}
      <div style={cardStyle}>
        <h3 style={{ margin: "0 0 8px", fontSize: "14px" }}>Review Guidelines por Repositório</h3>
        <p style={{ margin: "0 0 8px", fontSize: "12px", opacity: 0.7 }}>
          Configure instruções específicas de code review por repositório. O agente reviewer as receberá automaticamente ao revisar PRs deste repo.
        </p>
        <div style={{ display: "flex", gap: "8px", marginBottom: "8px" }}>
          <select
            value={guidelinesRepoId ?? ""}
            onChange={(e) => setGuidelinesRepoId(e.target.value ? Number(e.target.value) : null)}
            style={selectStyle}
          >
            <option value="">Selecione um repositório...</option>
            {repos.map((r) => (
              <option key={r.id} value={r.id}>{r.fullName}</option>
            ))}
          </select>
        </div>
        {guidelinesRepoId && (
          <>
            <textarea
              placeholder={"Cole aqui as guidelines de code review para este repositório (markdown)\n\nEx:\n- Sempre verificar se migrations têm rollback\n- Código novo deve ter testes\n- Verificar uso de variáveis de ambiente"}
              value={guidelinesText}
              onChange={(e) => setGuidelinesText(e.target.value)}
              rows={8}
              style={{
                ...inputStyle,
                flex: "none",
                width: "100%",
                resize: "vertical",
                fontFamily: "monospace",
                fontSize: "12px",
              }}
            />
            <button
              type="button"
              style={{ ...primaryButtonStyle, marginTop: "8px" }}
              onClick={handleSaveGuidelines}
              disabled={loading}
            >
              Salvar Guidelines
            </button>
          </>
        )}
      </div>
    </div>
  );
}
