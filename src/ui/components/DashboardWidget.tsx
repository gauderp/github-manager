import React from "react";
import type { PluginWidgetProps } from "@paperclipai/plugin-sdk/ui";
import { useHostNavigation, usePluginData } from "@paperclipai/plugin-sdk/ui";
import { PATHS, timeAgo } from "./shared.js";

export function GitHubDashboardWidget({ context }: PluginWidgetProps) {
  const nav = useHostNavigation();
  const syncStatus = usePluginData<{ lastSync: string | null; repoCount: number; openPRCount: number }>("sync-status", {
    companyId: context.companyId,
  });

  const data = syncStatus.data;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "6px", fontSize: "12px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <strong style={{ fontSize: "13px" }}>GitHub</strong>
        <span style={{
          display: "inline-block", width: "8px", height: "8px", borderRadius: "50%",
          background: data ? "#22c55e" : "#6b7280",
        }} />
      </div>
      <div style={{ display: "grid", gap: "2px" }}>
        <div>Repositórios: {data?.repoCount ?? 0}</div>
        <div>PRs abertos: {data?.openPRCount ?? 0}</div>
        <div>Último sync: {data?.lastSync ? timeAgo(data.lastSync) : "nunca"}</div>
      </div>
      <a {...nav.linkProps(PATHS.prs)} style={{ fontSize: "12px", color: "#3b82f6" }}>
        Ver Pull Requests →
      </a>
    </div>
  );
}
