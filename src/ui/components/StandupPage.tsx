import React, { useState } from "react";
import { useHostContext, usePluginData } from "@paperclipai/plugin-sdk/ui";
import { layoutStack, cardStyle, buttonStyle } from "./shared.js";
import { GitHubNavBar } from "./NavBar.js";
import type { StandupReport } from "../../types.js";

type StandupData = {
  reports: StandupReport[];
};

function formatDate(dateStr: string): string {
  const d = new Date(dateStr + "T12:00:00Z");
  return d.toLocaleDateString("pt-BR", { weekday: "long", year: "numeric", month: "long", day: "numeric" });
}

function MarkdownBlock({ markdown }: { markdown: string }) {
  const lines = markdown.split("\n");
  const elements: React.ReactNode[] = [];
  let key = 0;

  for (const rawLine of lines) {
    const line = rawLine;

    if (line.startsWith("# ")) {
      elements.push(<h2 key={key++} style={{ fontSize: "16px", margin: "12px 0 8px", fontWeight: 700 }}>{line.slice(2)}</h2>);
    } else if (line.startsWith("## ")) {
      elements.push(<h3 key={key++} style={{ fontSize: "14px", margin: "10px 0 6px", fontWeight: 600 }}>{line.slice(3)}</h3>);
    } else if (line.startsWith("### ")) {
      elements.push(<h4 key={key++} style={{ fontSize: "13px", margin: "8px 0 4px", fontWeight: 600, opacity: 0.8 }}>{line.slice(4)}</h4>);
    } else if (line.startsWith("- ")) {
      const content = renderInline(line.slice(2), key++);
      elements.push(
        <div key={key++} style={{ display: "flex", gap: "6px", paddingLeft: "12px", marginBottom: "2px" }}>
          <span style={{ opacity: 0.4, flexShrink: 0 }}>•</span>
          <span style={{ fontSize: "13px" }}>{content}</span>
        </div>
      );
    } else if (line.startsWith("---")) {
      elements.push(<hr key={key++} style={{ border: "none", borderTop: "1px solid rgba(128,128,128,0.15)", margin: "8px 0" }} />);
    } else if (line.trim() === "") {
      elements.push(<div key={key++} style={{ height: "4px" }} />);
    } else if (line.startsWith("_") && line.endsWith("_")) {
      elements.push(<div key={key++} style={{ fontSize: "11px", opacity: 0.5, fontStyle: "italic" }}>{line.slice(1, -1)}</div>);
    } else {
      elements.push(<div key={key++} style={{ fontSize: "13px" }}>{renderInline(line, key++)}</div>);
    }
  }

  return <div>{elements}</div>;
}

function renderInline(text: string, baseKey: number): React.ReactNode {
  const parts: React.ReactNode[] = [];
  let remaining = text;
  let k = baseKey * 100;

  while (remaining.length > 0) {
    const boldMatch = remaining.match(/^(.*?)\*\*(.+?)\*\*(.*)/s);
    if (boldMatch) {
      if (boldMatch[1]) parts.push(<span key={k++}>{boldMatch[1]}</span>);
      parts.push(<strong key={k++}>{boldMatch[2]}</strong>);
      remaining = boldMatch[3];
      continue;
    }

    const linkMatch = remaining.match(/^(.*?)\[([^\]]+)\]\(([^)]+)\)(.*)/s);
    if (linkMatch) {
      if (linkMatch[1]) parts.push(<span key={k++}>{linkMatch[1]}</span>);
      parts.push(
        <a key={k++} href={linkMatch[3]} target="_blank" rel="noopener" style={{ color: "#3b82f6", textDecoration: "none" }}>
          {linkMatch[2]}
        </a>
      );
      remaining = linkMatch[4];
      continue;
    }

    parts.push(<span key={k++}>{remaining}</span>);
    break;
  }

  return <>{parts}</>;
}

export function GitHubStandupPage() {
  const context = useHostContext();
  const companyId = context.companyId;
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  const standupData = usePluginData<StandupData>("standup-reports", { companyId, limit: 30 });
  const reports = standupData.data?.reports ?? [];
  const loading = standupData.loading;

  if (!companyId) return <div style={layoutStack}>Selecione uma empresa.</div>;

  const selectedReport = selectedDate
    ? reports.find((r) => r.reportDate === selectedDate) ?? null
    : reports[0] ?? null;

  return (
    <div style={layoutStack}>
      <GitHubNavBar />
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h2 style={{ margin: 0, fontSize: "18px" }}>Daily Standups</h2>
        <span style={{ fontSize: "12px", opacity: 0.5 }}>Automático seg-sex às 09:00</span>
      </div>

      {loading && (
        <div style={{ ...cardStyle, opacity: 0.6, textAlign: "center" }}>Carregando standups...</div>
      )}

      {!loading && reports.length === 0 && (
        <div style={{ ...cardStyle, opacity: 0.6, textAlign: "center" }}>
          Nenhum standup gerado ainda. O primeiro será gerado automaticamente na próxima seg-sex às 09:00 (horário de Brasília).
        </div>
      )}

      {!loading && reports.length > 0 && (
        <div style={{ display: "flex", gap: "12px", alignItems: "flex-start" }}>
          {/* Sidebar: report list */}
          <div style={{ width: "180px", flexShrink: 0, display: "flex", flexDirection: "column", gap: "4px" }}>
            {reports.map((r) => {
              const isSelected = r.reportDate === (selectedReport?.reportDate ?? null);
              return (
                <button
                  key={r.reportDate}
                  type="button"
                  onClick={() => setSelectedDate(r.reportDate)}
                  style={{
                    ...buttonStyle,
                    textAlign: "left",
                    background: isSelected ? "rgba(59,130,246,0.1)" : "transparent",
                    borderColor: isSelected ? "rgba(59,130,246,0.3)" : "rgba(128,128,128,0.2)",
                    color: isSelected ? "#3b82f6" : "inherit",
                    padding: "8px 10px",
                    fontSize: "12px",
                    width: "100%",
                  }}
                >
                  <div style={{ fontWeight: 600 }}>{r.reportDate}</div>
                  {r.contributors.length > 0 && (
                    <div style={{ opacity: 0.6, marginTop: "2px" }}>
                      {r.contributors.length} contributors
                    </div>
                  )}
                </button>
              );
            })}
          </div>

          {/* Main: selected report */}
          {selectedReport && (
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={cardStyle}>
                <div style={{ marginBottom: "12px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: "15px" }}>{formatDate(selectedReport.reportDate)}</div>
                    <div style={{ fontSize: "11px", opacity: 0.5, marginTop: "2px" }}>
                      {selectedReport.reposIncluded.length} repos · {selectedReport.contributors.length} contributors
                    </div>
                  </div>
                  {selectedReport.highlights.length > 0 && (
                    <div style={{ fontSize: "11px", opacity: 0.7, maxWidth: "200px", textAlign: "right" }}>
                      {selectedReport.highlights.length} highlight(s)
                    </div>
                  )}
                </div>
                <MarkdownBlock markdown={selectedReport.reportMarkdown} />
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
