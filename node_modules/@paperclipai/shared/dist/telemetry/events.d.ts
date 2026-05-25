import type { TelemetryClient } from "./client.js";
export declare function trackInstallStarted(client: TelemetryClient): void;
export declare function trackInstallCompleted(client: TelemetryClient, dims: {
    adapterType: string;
}): void;
export declare function trackCompanyImported(client: TelemetryClient, dims: {
    sourceType: string;
    sourceRef: string;
    isPrivate: boolean;
}): void;
export declare function trackProjectCreated(client: TelemetryClient): void;
export declare function trackRoutineCreated(client: TelemetryClient): void;
export declare function trackRoutineRun(client: TelemetryClient, dims: {
    source: string;
    status: string;
}): void;
export declare function trackGoalCreated(client: TelemetryClient, dims?: {
    goalLevel?: string | null;
}): void;
export declare function trackAgentCreated(client: TelemetryClient, dims: {
    agentRole: string;
    agentId?: string;
}): void;
export declare function trackSkillImported(client: TelemetryClient, dims: {
    sourceType: string;
    skillRef?: string | null;
}): void;
export declare function trackAgentFirstHeartbeat(client: TelemetryClient, dims: {
    agentRole: string;
    agentId?: string;
}): void;
export declare function trackAgentTaskCompleted(client: TelemetryClient, dims: {
    agentRole: string;
    agentId?: string;
    adapterType?: string;
    model?: string;
}): void;
export declare function trackErrorHandlerCrash(client: TelemetryClient, dims: {
    errorCode: string;
}): void;
//# sourceMappingURL=events.d.ts.map