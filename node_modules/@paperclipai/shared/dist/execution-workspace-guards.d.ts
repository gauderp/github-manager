import type { ExecutionWorkspace } from "./types/workspace-runtime.js";
type ExecutionWorkspaceGuardTarget = Pick<ExecutionWorkspace, "closedAt" | "mode" | "name" | "status">;
export declare function isClosedIsolatedExecutionWorkspace(workspace: Pick<ExecutionWorkspaceGuardTarget, "closedAt" | "mode" | "status"> | null | undefined): boolean;
export declare function getClosedIsolatedExecutionWorkspaceMessage(workspace: Pick<ExecutionWorkspaceGuardTarget, "name">): string;
export {};
//# sourceMappingURL=execution-workspace-guards.d.ts.map