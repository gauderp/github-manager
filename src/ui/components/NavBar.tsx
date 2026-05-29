import React from "react";
import { useHostNavigation } from "@paperclipai/plugin-sdk/ui";
import { PATHS } from "./shared.js";

const NAV_ITEMS = [
  { label: "Repositórios", path: PATHS.repos },
  { label: "Pull Requests", path: PATHS.prs },
  { label: "Métricas", path: PATHS.metrics },
  { label: "Standups", path: PATHS.standups },
  { label: "Knowledge Graphs", path: PATHS.graphs },
  { label: "Decisions", path: PATHS.decisions },
  { label: "Configurações", path: PATHS.settings },
];

export function GitHubNavBar() {
  const nav = useHostNavigation();
  const currentPath = typeof window !== "undefined" ? window.location.pathname : "";

  return (
    <nav style={{
      display: "flex",
      gap: "2px",
      padding: "4px",
      borderRadius: "8px",
      background: "rgba(128,128,128,0.06)",
      marginBottom: "4px",
    }}>
      {NAV_ITEMS.map((item) => {
        const href = nav.resolveHref(item.path);
        const isActive = currentPath.endsWith(item.path.replace("/", ""));
        return (
          <a
            key={item.path}
            {...nav.linkProps(item.path)}
            aria-current={isActive ? "page" : undefined}
            style={{
              padding: "6px 14px",
              borderRadius: "6px",
              fontSize: "13px",
              fontWeight: isActive ? 600 : 400,
              background: isActive ? "rgba(128,128,128,0.12)" : "transparent",
              textDecoration: "none",
              color: "inherit",
              cursor: "pointer",
            }}
          >
            {item.label}
          </a>
        );
      })}
    </nav>
  );
}
