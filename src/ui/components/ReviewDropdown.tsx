import React, { useState } from "react";
import { usePluginData, usePluginAction } from "@paperclipai/plugin-sdk/ui";
import { buttonStyle, primaryButtonStyle } from "./shared.js";

type Agent = { id: string; displayName: string; role: string };

type Props = {
  companyId: string;
  prId: number;
  repoFullName: string;
  prNumber: number;
};

export function ReviewDropdown({ companyId, prId, repoFullName, prNumber }: Props) {
  const [open, setOpen] = useState(false);
  const [reviewing, setReviewing] = useState(false);

  const agentsData = usePluginData<{ agents: Agent[] }>("available-agents", { companyId });
  const requestReview = usePluginAction("request-review");

  const agents = agentsData.data?.agents ?? [];

  const handleReview = async (agentId: string) => {
    setReviewing(true);
    setOpen(false);
    try {
      await requestReview({ companyId, prId, repoFullName, prNumber, agentId });
    } catch (err) {
      console.error("Review request failed:", err);
    }
    setReviewing(false);
  };

  if (reviewing) {
    return <span style={{ fontSize: "12px", opacity: 0.6 }}>Revisando...</span>;
  }

  return (
    <div style={{ position: "relative", display: "inline-block" }}>
      <button type="button" style={primaryButtonStyle} onClick={() => setOpen(!open)}>
        Revisar ▾
      </button>
      {open && (
        <div style={{
          position: "absolute", top: "100%", right: 0, marginTop: "4px",
          background: "var(--background, #1a1a1a)", border: "1px solid rgba(128,128,128,0.3)",
          borderRadius: "8px", padding: "4px", minWidth: "200px", zIndex: 10,
          boxShadow: "0 4px 12px rgba(0,0,0,0.3)",
        }}>
          {agents.length === 0 && (
            <div style={{ padding: "8px", fontSize: "12px", opacity: 0.5 }}>Nenhum agente disponível</div>
          )}
          {agents.map((agent) => (
            <button
              key={agent.id}
              type="button"
              style={{ ...buttonStyle, width: "100%", textAlign: "left", border: "none", borderRadius: "4px" }}
              onClick={() => handleReview(agent.id)}
            >
              <div style={{ fontWeight: 500 }}>{agent.displayName}</div>
              <div style={{ fontSize: "11px", opacity: 0.5 }}>{agent.role}</div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
