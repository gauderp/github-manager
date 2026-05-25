import React, { useState } from "react";
import type { PluginDetailTabProps } from "@paperclipai/plugin-sdk/ui";
import { usePluginData, usePluginAction } from "@paperclipai/plugin-sdk/ui";
import { cardStyle, buttonStyle, badgeStyle, prStateBadge, timeAgo } from "./shared.js";
import { ReviewDropdown } from "./ReviewDropdown.js";
import type { PRWithRepo } from "../../types.js";

export function GitHubDetailTab({ context }: PluginDetailTabProps) {
  const issueId = context.entityId;
  const companyId = context.companyId;
  const [showLinkInput, setShowLinkInput] = useState(false);
  const [selectedPrId, setSelectedPrId] = useState<number | null>(null);

  const cardPRs = usePluginData<{ pullRequests: PRWithRepo[] }>("card-prs", {
    companyId,
    issueId,
  });

  const allPRs = usePluginData<{ pullRequests: PRWithRepo[] }>("pull-requests", {
    companyId,
    filters: { state: "open" },
  });

  const linkAction = usePluginAction("link-pr-to-card");
  const quickCheck = usePluginAction("run-quick-check");

  if (!companyId || !issueId) {
    return <div style={{ padding: "12px", fontSize: "13px", opacity: 0.5 }}>Sem contexto disponível.</div>;
  }

  const prs = cardPRs.data?.pullRequests ?? [];

  const handleLink = async () => {
    if (!selectedPrId) return;
    await linkAction({ prId: selectedPrId, issueId });
    setShowLinkInput(false);
    setSelectedPrId(null);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "8px", padding: "12px" }}>
      {prs.length === 0 ? (
        <div style={{ textAlign: "center", padding: "20px 0" }}>
          <p style={{ fontSize: "13px", opacity: 0.5, margin: "0 0 12px" }}>
            Nenhum PR vinculado a este card.
          </p>
          <button type="button" style={buttonStyle} onClick={() => setShowLinkInput(true)}>
            Vincular PR
          </button>
        </div>
      ) : (
        <>
          {prs.map((pr) => {
            const badge = prStateBadge(pr.draft ? "draft" : pr.state);
            return (
              <div key={pr.id} style={cardStyle}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                      <span style={badgeStyle(badge.color)}>{badge.label}</span>
                      <a href={pr.htmlUrl} target="_blank" rel="noopener" style={{ fontWeight: 600, fontSize: "13px", color: "#3b82f6", textDecoration: "none" }}>
                        #{pr.number} {pr.title}
                      </a>
                    </div>
                    <div style={{ marginTop: "4px", fontSize: "11px", opacity: 0.5 }}>
                      {pr.repoFullName} · {pr.author} · {pr.headBranch} → {pr.baseBranch} · {timeAgo(pr.updatedAt)}
                    </div>
                  </div>
                  <ReviewDropdown
                    companyId={companyId}
                    prId={pr.id}
                    repoFullName={pr.repoFullName}
                    prNumber={pr.number}
                  />
                </div>
              </div>
            );
          })}
          <button type="button" style={{ ...buttonStyle, alignSelf: "flex-start", fontSize: "12px" }} onClick={() => setShowLinkInput(true)}>
            + Vincular outro PR
          </button>
        </>
      )}

      {showLinkInput && (
        <div style={cardStyle}>
          <div style={{ fontSize: "13px", fontWeight: 500, marginBottom: "8px" }}>Selecionar PR</div>
          <select
            style={{ width: "100%", padding: "6px", borderRadius: "6px", border: "1px solid rgba(128,128,128,0.3)", background: "transparent", fontSize: "13px", marginBottom: "8px" }}
            onChange={(e) => setSelectedPrId(Number(e.target.value))}
            value={selectedPrId ?? ""}
          >
            <option value="">Selecione um PR...</option>
            {(allPRs.data?.pullRequests ?? []).map((pr) => (
              <option key={pr.id} value={pr.id}>
                {pr.repoFullName} #{pr.number} — {pr.title}
              </option>
            ))}
          </select>
          <div style={{ display: "flex", gap: "8px" }}>
            <button type="button" style={buttonStyle} onClick={handleLink} disabled={!selectedPrId}>
              Vincular
            </button>
            <button type="button" style={buttonStyle} onClick={() => setShowLinkInput(false)}>
              Cancelar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
