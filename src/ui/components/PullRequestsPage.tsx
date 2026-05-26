import React, { useState } from "react";
import { useHostContext, usePluginData, usePluginAction } from "@paperclipai/plugin-sdk/ui";
import { layoutStack, cardStyle, buttonStyle, primaryButtonStyle, badgeStyle, prStateBadge, timeAgo } from "./shared.js";
import { GitHubNavBar } from "./NavBar.js";
import type { PRWithRepo } from "../../types.js";

export function GitHubPullRequestsPage() {
  const context = useHostContext();
  const companyId = context.companyId;
  const [stateFilter, setStateFilter] = useState<string>("open");
  const [search, setSearch] = useState("");
  const [reviewingPR, setReviewingPR] = useState<number | null>(null);
  const [reviewStatus, setReviewStatus] = useState<Record<number, string>>({});

  const prsData = usePluginData<{ pullRequests: PRWithRepo[] }>("pull-requests", {
    companyId,
    filters: stateFilter ? { state: stateFilter } : undefined,
  });

  const syncAction = usePluginAction("sync-all");
  const requestReview = usePluginAction("request-review");
  const runQuickCheck = usePluginAction("run-quick-check");

  if (!companyId) return <div style={layoutStack}>Selecione uma empresa.</div>;

  const prs = (prsData.data?.pullRequests ?? []).filter((pr) =>
    !search || pr.title.toLowerCase().includes(search.toLowerCase()) || pr.repoFullName.toLowerCase().includes(search.toLowerCase()),
  );

  const handleRequestReview = async (pr: PRWithRepo) => {
    setReviewingPR(pr.id);
    setReviewStatus((s) => ({ ...s, [pr.id]: "Solicitando review..." }));
    try {
      await requestReview({
        companyId,
        prId: pr.id,
        repoFullName: pr.repoFullName,
        prNumber: pr.number,
      });
      setReviewStatus((s) => ({ ...s, [pr.id]: "Review solicitada!" }));
    } catch (err) {
      setReviewStatus((s) => ({ ...s, [pr.id]: `Erro: ${err}` }));
    } finally {
      setReviewingPR(null);
    }
  };

  const handleQuickCheck = async (pr: PRWithRepo) => {
    setReviewingPR(pr.id);
    setReviewStatus((s) => ({ ...s, [pr.id]: "Executando quick check..." }));
    try {
      const result = await runQuickCheck({
        companyId,
        repoFullName: pr.repoFullName,
        prNumber: pr.number,
      }) as Record<string, unknown>;
      const checks = result.checks as Array<{ name: string; passed: boolean; detail: string }> | undefined;
      if (checks) {
        const summary = checks.map((c) => `${c.passed ? "OK" : "WARN"}: ${c.name}`).join(" | ");
        setReviewStatus((s) => ({ ...s, [pr.id]: summary }));
      } else {
        setReviewStatus((s) => ({ ...s, [pr.id]: "Quick check concluído" }));
      }
    } catch (err) {
      setReviewStatus((s) => ({ ...s, [pr.id]: `Erro: ${err}` }));
    } finally {
      setReviewingPR(null);
    }
  };

  return (
    <div style={layoutStack}>
      <GitHubNavBar />
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h2 style={{ margin: 0, fontSize: "18px" }}>Pull Requests ({prs.length})</h2>
        <button type="button" style={buttonStyle} onClick={() => syncAction({ companyId }).catch(console.error)}>
          Sync
        </button>
      </div>

      <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
        {["open", "closed", "merged", ""].map((state) => (
          <button
            key={state}
            type="button"
            style={{
              ...buttonStyle,
              background: stateFilter === state ? "rgba(128,128,128,0.15)" : "transparent",
              fontWeight: stateFilter === state ? 600 : 400,
            }}
            onClick={() => setStateFilter(state)}
          >
            {state || "Todos"}
          </button>
        ))}
        <input
          placeholder="Buscar por título ou repo..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ flex: 1, minWidth: "200px", padding: "6px 10px", borderRadius: "6px", border: "1px solid rgba(128,128,128,0.3)", background: "transparent", fontSize: "13px" }}
        />
      </div>

      {prs.length === 0 && (
        <div style={{ ...cardStyle, textAlign: "center", opacity: 0.6 }}>
          Nenhum PR encontrado com os filtros atuais.
        </div>
      )}

      {prs.map((pr) => {
        const badge = prStateBadge(pr.draft ? "draft" : pr.state);
        const status = reviewStatus[pr.id];
        const isReviewing = reviewingPR === pr.id;

        return (
          <div key={pr.id} style={cardStyle}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
              <div style={{ flex: 1 }}>
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <span style={badgeStyle(badge.color)}>{badge.label}</span>
                  <a href={pr.htmlUrl} target="_blank" rel="noopener" style={{ fontWeight: 600, fontSize: "14px", color: "#3b82f6", textDecoration: "none" }}>
                    #{pr.number} {pr.title}
                  </a>
                </div>
                <div style={{ marginTop: "4px", fontSize: "12px", opacity: 0.6 }}>
                  {pr.repoFullName} · {pr.author} · {pr.headBranch} → {pr.baseBranch} · {timeAgo(pr.updatedAt)}
                </div>
              </div>
              <div style={{ display: "flex", gap: "4px", flexShrink: 0 }}>
                <button
                  type="button"
                  style={buttonStyle}
                  disabled={isReviewing}
                  onClick={() => handleQuickCheck(pr)}
                  title="Checklist rápido automático"
                >
                  Quick Check
                </button>
                <button
                  type="button"
                  style={{
                    ...primaryButtonStyle,
                    opacity: isReviewing ? 0.6 : 1,
                  }}
                  disabled={isReviewing}
                  onClick={() => handleRequestReview(pr)}
                >
                  {isReviewing ? "Solicitando..." : "Agent Review"}
                </button>
              </div>
            </div>
            {status && (
              <div style={{ marginTop: "6px", padding: "4px 8px", borderRadius: "4px", background: "rgba(128,128,128,0.08)", fontSize: "11px" }}>
                {status}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
