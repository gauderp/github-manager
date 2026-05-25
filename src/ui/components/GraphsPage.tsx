import React, { useState } from "react";
import { useHostContext, usePluginAction } from "@paperclipai/plugin-sdk/ui";
import { layoutStack, cardStyle, buttonStyle, primaryButtonStyle } from "./shared.js";
import type { GraphData } from "../../graphify/graph-generator.js";

export function GitHubGraphsPage() {
  const context = useHostContext();
  const companyId = context.companyId;
  const [graphData, setGraphData] = useState<GraphData | null>(null);
  const [loading, setLoading] = useState(false);
  const [repoInput, setRepoInput] = useState("");

  const generateGraph = usePluginAction("generate-graph");

  if (!companyId) return <div style={layoutStack}>Selecione uma empresa.</div>;

  const handleGenerateHighLevel = async () => {
    setLoading(true);
    try {
      const result = await generateGraph({ companyId, level: "high" }) as GraphData;
      setGraphData(result);
    } catch (err) {
      console.error(err);
    }
    setLoading(false);
  };

  const handleGenerateCode = async () => {
    if (!repoInput.trim()) return;
    setLoading(true);
    try {
      const result = await generateGraph({ companyId, repoFullName: repoInput.trim(), level: "code" }) as GraphData;
      setGraphData(result);
    } catch (err) {
      console.error(err);
    }
    setLoading(false);
  };

  return (
    <div style={layoutStack}>
      <h2 style={{ margin: 0, fontSize: "18px" }}>Knowledge Graphs</h2>

      <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
        <button type="button" style={primaryButtonStyle} onClick={handleGenerateHighLevel} disabled={loading}>
          {loading ? "Gerando..." : "Grafo de Alto Nível"}
        </button>
        <div style={{ display: "flex", gap: "4px", flex: 1 }}>
          <input
            placeholder="owner/repo para drill-down..."
            value={repoInput}
            onChange={(e) => setRepoInput(e.target.value)}
            style={{ flex: 1, padding: "6px 10px", borderRadius: "6px", border: "1px solid rgba(128,128,128,0.3)", background: "transparent", fontSize: "13px" }}
          />
          <button type="button" style={buttonStyle} onClick={handleGenerateCode} disabled={loading || !repoInput.trim()}>
            Grafo de Código
          </button>
        </div>
      </div>

      {graphData && (
        <div style={cardStyle}>
          <div style={{ marginBottom: "8px", fontSize: "13px" }}>
            <strong>{graphData.level === "high" ? "Visão Geral" : graphData.repoFullName}</strong>
            <span style={{ marginLeft: "8px", fontSize: "11px", opacity: 0.5 }}>
              {graphData.nodes.length} nós · {graphData.edges.length} arestas · {new Date(graphData.generatedAt).toLocaleString()}
            </span>
          </div>
          <div style={{ maxHeight: "400px", overflow: "auto", fontSize: "12px" }}>
            <div style={{ marginBottom: "8px" }}>
              <strong>Nós:</strong>
              {graphData.nodes.map((node) => (
                <div key={node.id} style={{ padding: "2px 0", paddingLeft: "12px" }}>
                  <span style={{ opacity: 0.5 }}>[{node.type}]</span> {node.label}
                </div>
              ))}
            </div>
            <div>
              <strong>Arestas:</strong>
              {graphData.edges.map((edge, i) => (
                <div key={i} style={{ padding: "2px 0", paddingLeft: "12px" }}>
                  {edge.source} → {edge.target} <span style={{ opacity: 0.5 }}>({edge.label})</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {!graphData && !loading && (
        <div style={{ ...cardStyle, textAlign: "center", opacity: 0.5 }}>
          Clique em um dos botões acima para gerar um knowledge graph.
        </div>
      )}
    </div>
  );
}
