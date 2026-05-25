const CLOSED_EXECUTION_WORKSPACE_STATUSES = new Set(["archived", "cleanup_failed"]);
export function isClosedIsolatedExecutionWorkspace(workspace) {
    if (!workspace)
        return false;
    if (workspace.mode !== "isolated_workspace")
        return false;
    return workspace.closedAt != null || CLOSED_EXECUTION_WORKSPACE_STATUSES.has(workspace.status);
}
export function getClosedIsolatedExecutionWorkspaceMessage(workspace) {
    return `This issue is linked to the closed workspace "${workspace.name}". Move it to an open workspace before adding comments or resuming work.`;
}
//# sourceMappingURL=execution-workspace-guards.js.map