import type { PaperclipPluginManifestV1, PluginCapability, PluginEventType, Company, Project, Issue, IssueComment, Agent, Goal } from "@paperclipai/shared";
import type { PluginContext, PluginJobContext, PluginEvent, ScopeKey, ToolResult, ToolRunContext, AgentSessionEvent } from "./types.js";
import type { PluginEnvironmentValidateConfigParams, PluginEnvironmentValidationResult, PluginEnvironmentProbeParams, PluginEnvironmentProbeResult, PluginEnvironmentLease, PluginEnvironmentAcquireLeaseParams, PluginEnvironmentResumeLeaseParams, PluginEnvironmentReleaseLeaseParams, PluginEnvironmentDestroyLeaseParams, PluginEnvironmentRealizeWorkspaceParams, PluginEnvironmentRealizeWorkspaceResult, PluginEnvironmentExecuteParams, PluginEnvironmentExecuteResult } from "./protocol.js";
export interface TestHarnessOptions {
    /** Plugin manifest used to seed capability checks and metadata. */
    manifest: PaperclipPluginManifestV1;
    /** Optional capability override. Defaults to `manifest.capabilities`. */
    capabilities?: PluginCapability[];
    /** Initial config returned by `ctx.config.get()`. */
    config?: Record<string, unknown>;
}
export interface TestHarnessLogEntry {
    level: "info" | "warn" | "error" | "debug";
    message: string;
    meta?: Record<string, unknown>;
}
export interface TestHarness {
    /** Fully-typed in-memory plugin context passed to `plugin.setup(ctx)`. */
    ctx: PluginContext;
    /** Seed host entities for `ctx.companies/projects/issues/agents/goals` reads. */
    seed(input: {
        companies?: Company[];
        projects?: Project[];
        issues?: Issue[];
        issueComments?: IssueComment[];
        agents?: Agent[];
        goals?: Goal[];
    }): void;
    setConfig(config: Record<string, unknown>): void;
    /** Dispatch a host or plugin event to registered handlers. */
    emit(eventType: PluginEventType | `plugin.${string}`, payload: unknown, base?: Partial<PluginEvent>): Promise<void>;
    /** Execute a previously-registered scheduled job handler. */
    runJob(jobKey: string, partial?: Partial<PluginJobContext>): Promise<void>;
    /** Invoke a `ctx.data.register(...)` handler by key. */
    getData<T = unknown>(key: string, params?: Record<string, unknown>): Promise<T>;
    /** Invoke a `ctx.actions.register(...)` handler by key. */
    performAction<T = unknown>(key: string, params?: Record<string, unknown>): Promise<T>;
    /** Execute a registered tool handler via `ctx.tools.execute(...)`. */
    executeTool<T = ToolResult>(name: string, params: unknown, runCtx?: Partial<ToolRunContext>): Promise<T>;
    /** Read raw in-memory state for assertions. */
    getState(input: ScopeKey): unknown;
    /** Simulate a streaming event arriving for an active session. */
    simulateSessionEvent(sessionId: string, event: Omit<AgentSessionEvent, "sessionId">): void;
    logs: TestHarnessLogEntry[];
    activity: Array<{
        message: string;
        entityType?: string;
        entityId?: string;
        metadata?: Record<string, unknown>;
    }>;
    metrics: Array<{
        name: string;
        value: number;
        tags?: Record<string, string>;
    }>;
    telemetry: Array<{
        eventName: string;
        dimensions?: Record<string, string | number | boolean>;
    }>;
    dbQueries: Array<{
        sql: string;
        params?: unknown[];
    }>;
    dbExecutes: Array<{
        sql: string;
        params?: unknown[];
    }>;
}
/** Recorded environment lifecycle event for assertion helpers. */
export interface EnvironmentEventRecord {
    type: "validateConfig" | "probe" | "acquireLease" | "resumeLease" | "releaseLease" | "destroyLease" | "realizeWorkspace" | "execute";
    driverKey: string;
    environmentId: string;
    timestamp: string;
    params: Record<string, unknown>;
    result?: unknown;
    error?: string;
}
/** Options for creating an environment-aware test harness. */
export interface EnvironmentTestHarnessOptions extends TestHarnessOptions {
    /** Environment driver hooks provided by the plugin under test. */
    environmentDriver: {
        driverKey: string;
        onValidateConfig?: (params: PluginEnvironmentValidateConfigParams) => Promise<PluginEnvironmentValidationResult>;
        onProbe?: (params: PluginEnvironmentProbeParams) => Promise<PluginEnvironmentProbeResult>;
        onAcquireLease?: (params: PluginEnvironmentAcquireLeaseParams) => Promise<PluginEnvironmentLease>;
        onResumeLease?: (params: PluginEnvironmentResumeLeaseParams) => Promise<PluginEnvironmentLease>;
        onReleaseLease?: (params: PluginEnvironmentReleaseLeaseParams) => Promise<void>;
        onDestroyLease?: (params: PluginEnvironmentDestroyLeaseParams) => Promise<void>;
        onRealizeWorkspace?: (params: PluginEnvironmentRealizeWorkspaceParams) => Promise<PluginEnvironmentRealizeWorkspaceResult>;
        onExecute?: (params: PluginEnvironmentExecuteParams) => Promise<PluginEnvironmentExecuteResult>;
    };
}
/** Extended test harness with environment driver simulation. */
export interface EnvironmentTestHarness extends TestHarness {
    /** Recorded environment lifecycle events for assertion. */
    environmentEvents: EnvironmentEventRecord[];
    /** Invoke the environment driver's validateConfig hook. */
    validateConfig(params: PluginEnvironmentValidateConfigParams): Promise<PluginEnvironmentValidationResult>;
    /** Invoke the environment driver's probe hook. */
    probe(params: PluginEnvironmentProbeParams): Promise<PluginEnvironmentProbeResult>;
    /** Invoke the environment driver's acquireLease hook. */
    acquireLease(params: PluginEnvironmentAcquireLeaseParams): Promise<PluginEnvironmentLease>;
    /** Invoke the environment driver's resumeLease hook. */
    resumeLease(params: PluginEnvironmentResumeLeaseParams): Promise<PluginEnvironmentLease>;
    /** Invoke the environment driver's releaseLease hook. */
    releaseLease(params: PluginEnvironmentReleaseLeaseParams): Promise<void>;
    /** Invoke the environment driver's destroyLease hook. */
    destroyLease(params: PluginEnvironmentDestroyLeaseParams): Promise<void>;
    /** Invoke the environment driver's realizeWorkspace hook. */
    realizeWorkspace(params: PluginEnvironmentRealizeWorkspaceParams): Promise<PluginEnvironmentRealizeWorkspaceResult>;
    /** Invoke the environment driver's execute hook. */
    execute(params: PluginEnvironmentExecuteParams): Promise<PluginEnvironmentExecuteResult>;
}
/** Filter environment events by type. */
export declare function filterEnvironmentEvents(events: EnvironmentEventRecord[], type: EnvironmentEventRecord["type"]): EnvironmentEventRecord[];
/** Assert that environment events occurred in the expected order. */
export declare function assertEnvironmentEventOrder(events: EnvironmentEventRecord[], expectedOrder: EnvironmentEventRecord["type"][]): void;
/** Assert that a full lease lifecycle (acquire → release) occurred for an environment. */
export declare function assertLeaseLifecycle(events: EnvironmentEventRecord[], environmentId: string): {
    acquire: EnvironmentEventRecord;
    release: EnvironmentEventRecord;
};
/** Assert that workspace realization occurred between lease acquire and release. */
export declare function assertWorkspaceRealizationLifecycle(events: EnvironmentEventRecord[], environmentId: string): EnvironmentEventRecord;
/** Assert that an execute call occurred within the lease lifecycle. */
export declare function assertExecutionLifecycle(events: EnvironmentEventRecord[], environmentId: string): EnvironmentEventRecord[];
/** Assert that an event recorded an error. */
export declare function assertEnvironmentError(events: EnvironmentEventRecord[], type: EnvironmentEventRecord["type"], environmentId?: string): EnvironmentEventRecord;
/** Options for creating a fake environment driver for contract testing. */
export interface FakeEnvironmentDriverOptions {
    driverKey?: string;
    /** Simulated acquire delay in ms. */
    acquireDelayMs?: number;
    /** If true, probe will return `ok: false`. */
    probeFailure?: boolean;
    /** If true, acquireLease will throw. */
    acquireFailure?: string;
    /** If true, execute will return a non-zero exit code. */
    executeFailure?: boolean;
    /** Custom metadata returned on lease acquire. */
    leaseMetadata?: Record<string, unknown>;
}
/**
 * Create a fake environment driver suitable for contract testing.
 *
 * This returns a driver hooks object compatible with `EnvironmentTestHarnessOptions.environmentDriver`.
 * It simulates the full environment lifecycle with configurable failure injection.
 */
export declare function createFakeEnvironmentDriver(options?: FakeEnvironmentDriverOptions): EnvironmentTestHarnessOptions["environmentDriver"];
/**
 * Create an in-memory host harness for plugin worker tests.
 *
 * The harness enforces declared capabilities and simulates host APIs, so tests
 * can validate plugin behavior without spinning up the Paperclip server runtime.
 */
export declare function createTestHarness(options: TestHarnessOptions): TestHarness;
/**
 * Create an environment-aware test harness that wraps the base harness with
 * environment driver simulation and lifecycle event recording.
 *
 * Use this to test environment plugins through the full host contract:
 * validateConfig → probe → acquireLease → realizeWorkspace → execute → releaseLease.
 */
export declare function createEnvironmentTestHarness(options: EnvironmentTestHarnessOptions): EnvironmentTestHarness;
//# sourceMappingURL=testing.d.ts.map