import React from "react";
import { useHostContext, usePluginAction } from "@paperclipai/plugin-sdk/ui";
import { buttonStyle } from "./shared.js";

export function GitHubContextMenu() {
  const context = useHostContext();
  const generateGraph = usePluginAction("generate-graph");

  const handleGraphify = () => {
    if (!context.companyId) return;
    void generateGraph({
      companyId: context.companyId,
      level: "high",
    }).catch(console.error);
  };

  return (
    <button type="button" style={buttonStyle} onClick={handleGraphify}>
      Gerar Knowledge Graph
    </button>
  );
}
