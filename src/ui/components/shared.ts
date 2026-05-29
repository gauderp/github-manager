import type React from "react";

export const ROUTES = {
  settings: "github-settings",
  repos: "github-repos",
  prs: "github-prs",
  graphs: "github-graphs",
  metrics: "github-metrics",
  standups: "github-standups",
} as const;

export const PATHS = {
  settings: "/github-settings",
  repos: "/github-repos",
  prs: "/github-prs",
  graphs: "/github-graphs",
  metrics: "/github-metrics",
  standups: "/github-standups",
} as const;

export const layoutStack: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "12px",
  padding: "16px",
};

export const cardStyle: React.CSSProperties = {
  border: "1px solid rgba(128,128,128,0.2)",
  borderRadius: "8px",
  padding: "12px",
  background: "rgba(128,128,128,0.04)",
};

export const buttonStyle: React.CSSProperties = {
  padding: "6px 12px",
  borderRadius: "6px",
  border: "1px solid rgba(128,128,128,0.3)",
  background: "transparent",
  cursor: "pointer",
  fontSize: "13px",
};

export const primaryButtonStyle: React.CSSProperties = {
  ...buttonStyle,
  background: "rgba(59,130,246,0.1)",
  borderColor: "rgba(59,130,246,0.3)",
  color: "#3b82f6",
};

export const badgeStyle = (color: string): React.CSSProperties => ({
  display: "inline-block",
  padding: "2px 8px",
  borderRadius: "12px",
  fontSize: "11px",
  fontWeight: 600,
  background: `${color}20`,
  color,
});

export function prStateBadge(state: string): { label: string; color: string } {
  switch (state) {
    case "open": return { label: "Open", color: "#22c55e" };
    case "closed": return { label: "Closed", color: "#ef4444" };
    case "merged": return { label: "Merged", color: "#a855f7" };
    case "draft": return { label: "Draft", color: "#6b7280" };
    default: return { label: state, color: "#6b7280" };
  }
}

export function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}
