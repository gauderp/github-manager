import React, { useState } from "react";
import { useHostContext, usePluginData } from "@paperclipai/plugin-sdk/ui";
import { layoutStack, cardStyle, buttonStyle } from "./shared.js";
import { GitHubNavBar } from "./NavBar.js";
import type { PRMetrics } from "../../types.js";

type MetricsSummary = {
  avgCycleTimeHours: number | null;
  avgTimeToFirstReviewHours: number | null;
  avgReviewRounds: number | null;
  totalMerged: number;
};

type MetricsData = {
  summary: MetricsSummary | null;
  metrics: PRMetrics[];
};

const PERIODS = [
  { label: "7 dias", value: 7 },
  { label: "30 dias", value: 30 },
  { label: "90 dias", value: 90 },
];

function formatHours(h: number | null): string {
  if (h == null) return "—";
  if (h < 1) return `${Math.round(h * 60)}m`;
  if (h < 24) return `${Math.round(h)}h`;
  const days = Math.floor(h / 24);
  const rem = Math.round(h % 24);
  return rem > 0 ? `${days}d ${rem}h` : `${days}d`;
}

function MetricCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div style={{
      ...cardStyle,
      textAlign: "center",
      flex: "1 1 140px",
      minWidth: "120px",
    }}>
      <div style={{ fontSize: "24px", fontWeight: 700, marginBottom: "4px" }}>{value}</div>
      <div style={{ fontSize: "12px", fontWeight: 600, opacity: 0.7 }}>{label}</div>
      {sub && <div style={{ fontSize: "11px", opacity: 0.5, marginTop: "2px" }}>{sub}</div>}
    </div>
  );
}

function CycleTimeBar({ metrics }: { metrics: PRMetrics[] }) {
  if (metrics.length === 0) return null;

  type WeekBucket = { week: string; avgHours: number; count: number };
  const byWeek: Record<string, { totalHours: number; count: number }> = {};

  for (const m of metrics) {
    if (!m.mergedAt || m.cycleTimeHours == null) continue;
    const date = new Date(m.mergedAt);
    const day = date.getDay();
    const diff = (day === 0 ? -6 : 1 - day);
    const monday = new Date(date);
    monday.setDate(date.getDate() + diff);
    const week = monday.toISOString().slice(0, 10);
    if (!byWeek[week]) byWeek[week] = { totalHours: 0, count: 0 };
    byWeek[week].totalHours += m.cycleTimeHours;
    byWeek[week].count++;
  }

  const weeks: WeekBucket[] = Object.entries(byWeek)
    .map(([week, v]) => ({ week, avgHours: v.totalHours / v.count, count: v.count }))
    .sort((a, b) => a.week.localeCompare(b.week))
    .slice(-8);

  if (weeks.length === 0) return null;

  const maxHours = Math.max(...weeks.map((w) => w.avgHours), 1);

  return (
    <div style={cardStyle}>
      <h3 style={{ margin: "0 0 12px", fontSize: "14px" }}>Cycle Time por Semana (avg horas)</h3>
      <div style={{ display: "flex", alignItems: "flex-end", gap: "6px", height: "120px" }}>
        {weeks.map((w) => {
          const pct = (w.avgHours / maxHours) * 100;
          return (
            <div key={w.week} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: "4px" }}>
              <div style={{ fontSize: "10px", opacity: 0.6 }}>{formatHours(w.avgHours)}</div>
              <div style={{
                width: "100%",
                height: `${Math.max(pct, 4)}%`,
                background: "rgba(59,130,246,0.5)",
                borderRadius: "3px 3px 0 0",
                minHeight: "4px",
                transition: "height 0.3s ease",
              }} title={`Week of ${w.week}: avg ${formatHours(w.avgHours)}, ${w.count} PRs`} />
              <div style={{ fontSize: "9px", opacity: 0.5, transform: "rotate(-30deg)", transformOrigin: "top center", whiteSpace: "nowrap" }}>
                {w.week.slice(5)}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function TopContributors({ metrics }: { metrics: PRMetrics[] }) {
  if (metrics.length === 0) return null;

  const byAuthor: Record<string, { merged: number; additions: number; deletions: number; totalCycleHours: number }> = {};
  for (const m of metrics) {
    if (!m.mergedBy) continue;
    if (!byAuthor[m.mergedBy]) byAuthor[m.mergedBy] = { merged: 0, additions: 0, deletions: 0, totalCycleHours: 0 };
    byAuthor[m.mergedBy].merged++;
    byAuthor[m.mergedBy].additions += m.additions;
    byAuthor[m.mergedBy].deletions += m.deletions;
    if (m.cycleTimeHours != null) byAuthor[m.mergedBy].totalCycleHours += m.cycleTimeHours;
  }

  const contributors = Object.entries(byAuthor)
    .map(([login, s]) => ({
      login,
      merged: s.merged,
      additions: s.additions,
      deletions: s.deletions,
      avgCycleHours: s.merged > 0 ? s.totalCycleHours / s.merged : null,
    }))
    .sort((a, b) => b.merged - a.merged)
    .slice(0, 10);

  return (
    <div style={cardStyle}>
      <h3 style={{ margin: "0 0 12px", fontSize: "14px" }}>Top Contributors (por PRs merged)</h3>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
        <thead>
          <tr style={{ opacity: 0.6 }}>
            <th style={{ textAlign: "left", padding: "4px 8px", fontWeight: 600 }}>Autor</th>
            <th style={{ textAlign: "right", padding: "4px 8px", fontWeight: 600 }}>PRs</th>
            <th style={{ textAlign: "right", padding: "4px 8px", fontWeight: 600 }}>+Lines</th>
            <th style={{ textAlign: "right", padding: "4px 8px", fontWeight: 600 }}>-Lines</th>
            <th style={{ textAlign: "right", padding: "4px 8px", fontWeight: 600 }}>Avg Cycle</th>
          </tr>
        </thead>
        <tbody>
          {contributors.map((c, i) => (
            <tr key={c.login} style={{ borderTop: "1px solid rgba(128,128,128,0.1)" }}>
              <td style={{ padding: "6px 8px" }}>
                <span style={{ opacity: 0.4, marginRight: "6px" }}>#{i + 1}</span>
                @{c.login}
              </td>
              <td style={{ padding: "6px 8px", textAlign: "right", fontWeight: 600 }}>{c.merged}</td>
              <td style={{ padding: "6px 8px", textAlign: "right", color: "#22c55e" }}>+{c.additions.toLocaleString()}</td>
              <td style={{ padding: "6px 8px", textAlign: "right", color: "#ef4444" }}>-{c.deletions.toLocaleString()}</td>
              <td style={{ padding: "6px 8px", textAlign: "right", opacity: 0.7 }}>{formatHours(c.avgCycleHours)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function GitHubMetricsPage() {
  const context = useHostContext();
  const companyId = context.companyId;
  const [period, setPeriod] = useState(30);
  const [repoId, setRepoId] = useState<number | null>(null);

  const reposData = usePluginData<{ repos: Array<{ id: number; fullName: string }> }>("repos", { companyId });
  const repos = reposData.data?.repos ?? [];

  const selectedRepoId = repoId ?? repos[0]?.id ?? null;

  const metricsData = usePluginData<MetricsData>("metrics-data", {
    companyId,
    repoId: selectedRepoId,
    period,
  });

  if (!companyId) return <div style={layoutStack}>Selecione uma empresa.</div>;

  const summary = metricsData.data?.summary ?? null;
  const metrics = metricsData.data?.metrics ?? [];
  const loading = metricsData.loading;

  return (
    <div style={layoutStack}>
      <GitHubNavBar />
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h2 style={{ margin: 0, fontSize: "18px" }}>Métricas de Engenharia</h2>
      </div>

      {/* Filters */}
      <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", alignItems: "center" }}>
        <select
          value={selectedRepoId ?? ""}
          onChange={(e) => setRepoId(Number(e.target.value) || null)}
          style={{ padding: "6px 10px", borderRadius: "6px", border: "1px solid rgba(128,128,128,0.3)", background: "transparent", fontSize: "13px", cursor: "pointer" }}
        >
          {repos.map((r) => (
            <option key={r.id} value={r.id}>{r.fullName}</option>
          ))}
        </select>
        {PERIODS.map((p) => (
          <button
            key={p.value}
            type="button"
            style={{
              ...buttonStyle,
              background: period === p.value ? "rgba(128,128,128,0.15)" : "transparent",
              fontWeight: period === p.value ? 600 : 400,
            }}
            onClick={() => setPeriod(p.value)}
          >
            {p.label}
          </button>
        ))}
      </div>

      {loading && <div style={{ ...cardStyle, opacity: 0.6, textAlign: "center" }}>Carregando métricas...</div>}

      {!loading && summary == null && (
        <div style={{ ...cardStyle, opacity: 0.6, textAlign: "center" }}>
          Nenhuma métrica disponível para o período selecionado. As métricas são calculadas automaticamente ao fazer sync de PRs merged.
        </div>
      )}

      {!loading && summary != null && (
        <>
          {/* Summary cards */}
          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
            <MetricCard
              label="PRs Merged"
              value={String(summary.totalMerged)}
              sub={`últimos ${period} dias`}
            />
            <MetricCard
              label="Avg Cycle Time"
              value={formatHours(summary.avgCycleTimeHours)}
              sub="criação → merge"
            />
            <MetricCard
              label="Avg Time to First Review"
              value={formatHours(summary.avgTimeToFirstReviewHours)}
              sub="criação → primeiro review"
            />
            <MetricCard
              label="Avg Review Rounds"
              value={summary.avgReviewRounds != null ? (Math.round(summary.avgReviewRounds * 10) / 10).toString() : "—"}
              sub="rounds de changes_requested"
            />
          </div>

          <CycleTimeBar metrics={metrics} />
          <TopContributors metrics={metrics} />

          {/* Raw metrics table */}
          {metrics.length > 0 && (
            <div style={cardStyle}>
              <h3 style={{ margin: "0 0 12px", fontSize: "14px" }}>PRs Recentes ({metrics.length})</h3>
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12px" }}>
                  <thead>
                    <tr style={{ opacity: 0.6 }}>
                      <th style={{ textAlign: "left", padding: "4px 8px" }}>Merged At</th>
                      <th style={{ textAlign: "right", padding: "4px 8px" }}>Cycle Time</th>
                      <th style={{ textAlign: "right", padding: "4px 8px" }}>First Review</th>
                      <th style={{ textAlign: "right", padding: "4px 8px" }}>Rounds</th>
                      <th style={{ textAlign: "right", padding: "4px 8px" }}>+/-</th>
                      <th style={{ textAlign: "left", padding: "4px 8px" }}>Merged By</th>
                    </tr>
                  </thead>
                  <tbody>
                    {metrics.slice(0, 20).map((m) => (
                      <tr key={m.prId} style={{ borderTop: "1px solid rgba(128,128,128,0.08)" }}>
                        <td style={{ padding: "5px 8px", opacity: 0.7 }}>
                          {m.mergedAt ? m.mergedAt.slice(0, 10) : "—"}
                        </td>
                        <td style={{ padding: "5px 8px", textAlign: "right" }}>
                          {formatHours(m.cycleTimeHours)}
                        </td>
                        <td style={{ padding: "5px 8px", textAlign: "right", opacity: 0.7 }}>
                          {formatHours(m.timeToFirstReviewHours)}
                        </td>
                        <td style={{ padding: "5px 8px", textAlign: "right" }}>
                          {m.reviewRounds}
                        </td>
                        <td style={{ padding: "5px 8px", textAlign: "right" }}>
                          <span style={{ color: "#22c55e" }}>+{m.additions}</span>
                          {" / "}
                          <span style={{ color: "#ef4444" }}>-{m.deletions}</span>
                        </td>
                        <td style={{ padding: "5px 8px", opacity: 0.7 }}>
                          {m.mergedBy ? `@${m.mergedBy}` : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
