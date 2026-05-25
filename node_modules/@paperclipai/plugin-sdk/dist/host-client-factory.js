/**
 * Host-side client factory — creates capability-gated handler maps for
 * servicing worker→host JSON-RPC calls.
 *
 * When a plugin worker calls `ctx.state.get(...)` inside its process, the
 * SDK serializes the call as a JSON-RPC request over stdio. On the host side,
 * the `PluginWorkerManager` receives the request and dispatches it to the
 * handler registered for that method. This module provides a factory that
 * creates those handlers for all `WorkerToHostMethods`, with automatic
 * capability enforcement.
 *
 * ## Design
 *
 * 1. **Capability gating**: Each handler checks the plugin's declared
 *    capabilities before executing. If the plugin lacks a required capability,
 *    the handler throws a `CapabilityDeniedError` (which the worker manager
 *    translates into a JSON-RPC error response with code
 *    `CAPABILITY_DENIED`).
 *
 * 2. **Service adapters**: The caller provides a `HostServices` object with
 *    concrete implementations of each platform service. The factory wires
 *    each handler to the appropriate service method.
 *
 * 3. **Type safety**: The returned handler map is typed as
 *    `WorkerToHostHandlers` (from `plugin-worker-manager.ts`) so it plugs
 *    directly into `WorkerStartOptions.hostHandlers`.
 *
 * @example
 * ```ts
 * const handlers = createHostClientHandlers({
 *   pluginId: "acme.linear",
 *   capabilities: manifest.capabilities,
 *   services: {
 *     config:    { get: () => registry.getConfig(pluginId) },
 *     state:     { get: ..., set: ..., delete: ... },
 *     entities:  { upsert: ..., list: ... },
 *     // ... all services
 *   },
 * });
 *
 * await workerManager.startWorker("acme.linear", {
 *   // ...
 *   hostHandlers: handlers,
 * });
 * ```
 *
 * @see PLUGIN_SPEC.md §13 — Host-Worker Protocol
 * @see PLUGIN_SPEC.md §15 — Capability Model
 */
import { PLUGIN_RPC_ERROR_CODES } from "./protocol.js";
// ---------------------------------------------------------------------------
// Error types
// ---------------------------------------------------------------------------
/**
 * Thrown when a plugin calls a host method it does not have the capability for.
 *
 * The `code` field is set to `PLUGIN_RPC_ERROR_CODES.CAPABILITY_DENIED` so
 * the worker manager can propagate it as the correct JSON-RPC error code.
 */
export class CapabilityDeniedError extends Error {
    name = "CapabilityDeniedError";
    code = PLUGIN_RPC_ERROR_CODES.CAPABILITY_DENIED;
    constructor(pluginId, method, capability) {
        super(`Plugin "${pluginId}" is missing required capability "${capability}" for method "${method}"`);
    }
}
// ---------------------------------------------------------------------------
// Capability → method mapping
// ---------------------------------------------------------------------------
/**
 * Maps each worker→host RPC method to the capability required to invoke it.
 * Methods without a capability requirement (e.g. `config.get`, `log`) are
 * mapped to `null`.
 *
 * @see PLUGIN_SPEC.md §15 — Capability Model
 */
const METHOD_CAPABILITY_MAP = {
    // Config — always allowed
    "config.get": null,
    // Trusted local folders
    "localFolders.declarations": null,
    "localFolders.configure": "local.folders",
    "localFolders.status": "local.folders",
    "localFolders.list": "local.folders",
    "localFolders.readText": "local.folders",
    "localFolders.writeTextAtomic": "local.folders",
    "localFolders.deleteFile": "local.folders",
    // State
    "state.get": "plugin.state.read",
    "state.set": "plugin.state.write",
    "state.delete": "plugin.state.write",
    "db.namespace": "database.namespace.read",
    "db.query": "database.namespace.read",
    "db.execute": "database.namespace.write",
    // Entities — no specific capability required (plugin-scoped by design)
    "entities.upsert": null,
    "entities.list": null,
    // Events
    "events.emit": "events.emit",
    "events.subscribe": "events.subscribe",
    // HTTP
    "http.fetch": "http.outbound",
    // Secrets
    "secrets.resolve": "secrets.read-ref",
    // Activity
    "activity.log": "activity.log.write",
    // Metrics
    "metrics.write": "metrics.write",
    // Telemetry
    "telemetry.track": "telemetry.track",
    // Logger — always allowed
    "log": null,
    // Companies
    "companies.list": "companies.read",
    "companies.get": "companies.read",
    // Projects
    "projects.list": "projects.read",
    "projects.get": "projects.read",
    "projects.listWorkspaces": "project.workspaces.read",
    "projects.getPrimaryWorkspace": "project.workspaces.read",
    "projects.getWorkspaceForIssue": "project.workspaces.read",
    "projects.managed.get": "projects.managed",
    "projects.managed.reconcile": "projects.managed",
    "projects.managed.reset": "projects.managed",
    "routines.managed.get": "routines.managed",
    "routines.managed.reconcile": "routines.managed",
    "routines.managed.reset": "routines.managed",
    "routines.managed.update": "routines.managed",
    "routines.managed.run": "routines.managed",
    "skills.managed.get": "skills.managed",
    "skills.managed.reconcile": "skills.managed",
    "skills.managed.reset": "skills.managed",
    // Issues
    "issues.list": "issues.read",
    "issues.get": "issues.read",
    "issues.create": "issues.create",
    "issues.update": "issues.update",
    "issues.relations.get": "issue.relations.read",
    "issues.relations.setBlockedBy": "issue.relations.write",
    "issues.relations.addBlockers": "issue.relations.write",
    "issues.relations.removeBlockers": "issue.relations.write",
    "issues.assertCheckoutOwner": "issues.checkout",
    "issues.getSubtree": "issue.subtree.read",
    "issues.requestWakeup": "issues.wakeup",
    "issues.requestWakeups": "issues.wakeup",
    "issues.summaries.getOrchestration": "issues.orchestration.read",
    "issues.listComments": "issue.comments.read",
    "issues.createComment": "issue.comments.create",
    "issues.createInteraction": "issue.interactions.create",
    // Issue Documents
    "issues.documents.list": "issue.documents.read",
    "issues.documents.get": "issue.documents.read",
    "issues.documents.upsert": "issue.documents.write",
    "issues.documents.delete": "issue.documents.write",
    // Agents
    "agents.list": "agents.read",
    "agents.get": "agents.read",
    "agents.pause": "agents.pause",
    "agents.resume": "agents.resume",
    "agents.invoke": "agents.invoke",
    "agents.managed.get": "agents.managed",
    "agents.managed.reconcile": "agents.managed",
    "agents.managed.reset": "agents.managed",
    // Agent Sessions
    "agents.sessions.create": "agent.sessions.create",
    "agents.sessions.list": "agent.sessions.list",
    "agents.sessions.sendMessage": "agent.sessions.send",
    "agents.sessions.close": "agent.sessions.close",
    // Goals
    "goals.list": "goals.read",
    "goals.get": "goals.read",
    "goals.create": "goals.create",
    "goals.update": "goals.update",
};
// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------
/**
 * Create a complete handler map for all worker→host JSON-RPC methods.
 *
 * Each handler:
 * 1. Checks the plugin's declared capabilities against the required capability
 *    for the method (if any).
 * 2. Delegates to the corresponding service adapter method.
 * 3. Returns the service result, which is serialized as the JSON-RPC response
 *    by the worker manager.
 *
 * If a capability check fails, the handler throws a `CapabilityDeniedError`
 * with code `CAPABILITY_DENIED`. The worker manager catches this and sends a
 * JSON-RPC error response to the worker, which surfaces as a `JsonRpcCallError`
 * in the plugin's SDK client.
 *
 * @param options - Plugin ID, capabilities, and service adapters
 * @returns A handler map suitable for `WorkerStartOptions.hostHandlers`
 */
export function createHostClientHandlers(options) {
    const { pluginId, services } = options;
    const capabilitySet = new Set(options.capabilities);
    /**
     * Assert that the plugin has the required capability for a method.
     * Throws `CapabilityDeniedError` if the capability is missing.
     */
    function requireCapability(method) {
        const required = METHOD_CAPABILITY_MAP[method];
        if (required === null)
            return; // No capability required
        if (capabilitySet.has(required))
            return;
        throw new CapabilityDeniedError(pluginId, method, required);
    }
    /**
     * Create a capability-gated proxy handler for a method.
     *
     * @param method - The RPC method name (used for capability lookup)
     * @param handler - The actual handler implementation
     * @returns A wrapper that checks capabilities before delegating
     */
    function gated(method, handler) {
        return async (params) => {
            requireCapability(method);
            return handler(params);
        };
    }
    // -------------------------------------------------------------------------
    // Build the complete handler map
    // -------------------------------------------------------------------------
    return {
        // Config
        "config.get": gated("config.get", async () => {
            return services.config.get();
        }),
        "localFolders.declarations": gated("localFolders.declarations", async (params) => {
            return services.localFolders.declarations(params);
        }),
        "localFolders.configure": gated("localFolders.configure", async (params) => {
            return services.localFolders.configure(params);
        }),
        "localFolders.status": gated("localFolders.status", async (params) => {
            return services.localFolders.status(params);
        }),
        "localFolders.list": gated("localFolders.list", async (params) => {
            return services.localFolders.list(params);
        }),
        "localFolders.readText": gated("localFolders.readText", async (params) => {
            return services.localFolders.readText(params);
        }),
        "localFolders.writeTextAtomic": gated("localFolders.writeTextAtomic", async (params) => {
            return services.localFolders.writeTextAtomic(params);
        }),
        "localFolders.deleteFile": gated("localFolders.deleteFile", async (params) => {
            return services.localFolders.deleteFile(params);
        }),
        // State
        "state.get": gated("state.get", async (params) => {
            return services.state.get(params);
        }),
        "state.set": gated("state.set", async (params) => {
            return services.state.set(params);
        }),
        "state.delete": gated("state.delete", async (params) => {
            return services.state.delete(params);
        }),
        "db.namespace": gated("db.namespace", async (params) => {
            return services.db.namespace(params);
        }),
        "db.query": gated("db.query", async (params) => {
            return services.db.query(params);
        }),
        "db.execute": gated("db.execute", async (params) => {
            return services.db.execute(params);
        }),
        // Entities
        "entities.upsert": gated("entities.upsert", async (params) => {
            return services.entities.upsert(params);
        }),
        "entities.list": gated("entities.list", async (params) => {
            return services.entities.list(params);
        }),
        // Events
        "events.emit": gated("events.emit", async (params) => {
            return services.events.emit(params);
        }),
        "events.subscribe": gated("events.subscribe", async (params) => {
            return services.events.subscribe(params);
        }),
        // HTTP
        "http.fetch": gated("http.fetch", async (params) => {
            return services.http.fetch(params);
        }),
        // Secrets
        "secrets.resolve": gated("secrets.resolve", async (params) => {
            return services.secrets.resolve(params);
        }),
        // Activity
        "activity.log": gated("activity.log", async (params) => {
            return services.activity.log(params);
        }),
        // Metrics
        "metrics.write": gated("metrics.write", async (params) => {
            return services.metrics.write(params);
        }),
        // Telemetry
        "telemetry.track": gated("telemetry.track", async (params) => {
            return services.telemetry.track(params);
        }),
        // Logger
        "log": gated("log", async (params) => {
            return services.logger.log(params);
        }),
        // Companies
        "companies.list": gated("companies.list", async (params) => {
            return services.companies.list(params);
        }),
        "companies.get": gated("companies.get", async (params) => {
            return services.companies.get(params);
        }),
        // Projects
        "projects.list": gated("projects.list", async (params) => {
            return services.projects.list(params);
        }),
        "projects.get": gated("projects.get", async (params) => {
            return services.projects.get(params);
        }),
        "projects.listWorkspaces": gated("projects.listWorkspaces", async (params) => {
            return services.projects.listWorkspaces(params);
        }),
        "projects.getPrimaryWorkspace": gated("projects.getPrimaryWorkspace", async (params) => {
            return services.projects.getPrimaryWorkspace(params);
        }),
        "projects.getWorkspaceForIssue": gated("projects.getWorkspaceForIssue", async (params) => {
            return services.projects.getWorkspaceForIssue(params);
        }),
        "projects.managed.get": gated("projects.managed.get", async (params) => {
            return services.projects.getManaged(params);
        }),
        "projects.managed.reconcile": gated("projects.managed.reconcile", async (params) => {
            return services.projects.reconcileManaged(params);
        }),
        "projects.managed.reset": gated("projects.managed.reset", async (params) => {
            return services.projects.resetManaged(params);
        }),
        // Routines
        "routines.managed.get": gated("routines.managed.get", async (params) => {
            return services.routines.managedGet(params);
        }),
        "routines.managed.reconcile": gated("routines.managed.reconcile", async (params) => {
            return services.routines.managedReconcile(params);
        }),
        "routines.managed.reset": gated("routines.managed.reset", async (params) => {
            return services.routines.managedReset(params);
        }),
        "routines.managed.update": gated("routines.managed.update", async (params) => {
            return services.routines.managedUpdate(params);
        }),
        "routines.managed.run": gated("routines.managed.run", async (params) => {
            return services.routines.managedRun(params);
        }),
        // Skills
        "skills.managed.get": gated("skills.managed.get", async (params) => {
            return services.skills.managedGet(params);
        }),
        "skills.managed.reconcile": gated("skills.managed.reconcile", async (params) => {
            return services.skills.managedReconcile(params);
        }),
        "skills.managed.reset": gated("skills.managed.reset", async (params) => {
            return services.skills.managedReset(params);
        }),
        // Issues
        "issues.list": gated("issues.list", async (params) => {
            return services.issues.list(params);
        }),
        "issues.get": gated("issues.get", async (params) => {
            return services.issues.get(params);
        }),
        "issues.create": gated("issues.create", async (params) => {
            return services.issues.create(params);
        }),
        "issues.update": gated("issues.update", async (params) => {
            return services.issues.update(params);
        }),
        "issues.relations.get": gated("issues.relations.get", async (params) => {
            return services.issues.getRelations(params);
        }),
        "issues.relations.setBlockedBy": gated("issues.relations.setBlockedBy", async (params) => {
            return services.issues.setBlockedBy(params);
        }),
        "issues.relations.addBlockers": gated("issues.relations.addBlockers", async (params) => {
            return services.issues.addBlockers(params);
        }),
        "issues.relations.removeBlockers": gated("issues.relations.removeBlockers", async (params) => {
            return services.issues.removeBlockers(params);
        }),
        "issues.assertCheckoutOwner": gated("issues.assertCheckoutOwner", async (params) => {
            return services.issues.assertCheckoutOwner(params);
        }),
        "issues.getSubtree": gated("issues.getSubtree", async (params) => {
            return services.issues.getSubtree(params);
        }),
        "issues.requestWakeup": gated("issues.requestWakeup", async (params) => {
            return services.issues.requestWakeup(params);
        }),
        "issues.requestWakeups": gated("issues.requestWakeups", async (params) => {
            return services.issues.requestWakeups(params);
        }),
        "issues.summaries.getOrchestration": gated("issues.summaries.getOrchestration", async (params) => {
            return services.issues.getOrchestrationSummary(params);
        }),
        "issues.listComments": gated("issues.listComments", async (params) => {
            return services.issues.listComments(params);
        }),
        "issues.createComment": gated("issues.createComment", async (params) => {
            return services.issues.createComment(params);
        }),
        "issues.createInteraction": gated("issues.createInteraction", async (params) => {
            return services.issues.createInteraction(params);
        }),
        // Issue Documents
        "issues.documents.list": gated("issues.documents.list", async (params) => {
            return services.issueDocuments.list(params);
        }),
        "issues.documents.get": gated("issues.documents.get", async (params) => {
            return services.issueDocuments.get(params);
        }),
        "issues.documents.upsert": gated("issues.documents.upsert", async (params) => {
            return services.issueDocuments.upsert(params);
        }),
        "issues.documents.delete": gated("issues.documents.delete", async (params) => {
            return services.issueDocuments.delete(params);
        }),
        // Agents
        "agents.list": gated("agents.list", async (params) => {
            return services.agents.list(params);
        }),
        "agents.get": gated("agents.get", async (params) => {
            return services.agents.get(params);
        }),
        "agents.pause": gated("agents.pause", async (params) => {
            return services.agents.pause(params);
        }),
        "agents.resume": gated("agents.resume", async (params) => {
            return services.agents.resume(params);
        }),
        "agents.invoke": gated("agents.invoke", async (params) => {
            return services.agents.invoke(params);
        }),
        "agents.managed.get": gated("agents.managed.get", async (params) => {
            return services.agents.managedGet(params);
        }),
        "agents.managed.reconcile": gated("agents.managed.reconcile", async (params) => {
            return services.agents.managedReconcile(params);
        }),
        "agents.managed.reset": gated("agents.managed.reset", async (params) => {
            return services.agents.managedReset(params);
        }),
        // Agent Sessions
        "agents.sessions.create": gated("agents.sessions.create", async (params) => {
            return services.agentSessions.create(params);
        }),
        "agents.sessions.list": gated("agents.sessions.list", async (params) => {
            return services.agentSessions.list(params);
        }),
        "agents.sessions.sendMessage": gated("agents.sessions.sendMessage", async (params) => {
            return services.agentSessions.sendMessage(params);
        }),
        "agents.sessions.close": gated("agents.sessions.close", async (params) => {
            return services.agentSessions.close(params);
        }),
        // Goals
        "goals.list": gated("goals.list", async (params) => {
            return services.goals.list(params);
        }),
        "goals.get": gated("goals.get", async (params) => {
            return services.goals.get(params);
        }),
        "goals.create": gated("goals.create", async (params) => {
            return services.goals.create(params);
        }),
        "goals.update": gated("goals.update", async (params) => {
            return services.goals.update(params);
        }),
    };
}
// ---------------------------------------------------------------------------
// Utility: getRequiredCapability
// ---------------------------------------------------------------------------
/**
 * Get the capability required for a given worker→host method, or `null` if
 * no capability is required.
 *
 * Useful for inspecting capability requirements without calling the factory.
 *
 * @param method - The worker→host method name
 * @returns The required capability, or `null`
 */
export function getRequiredCapability(method) {
    return METHOD_CAPABILITY_MAP[method];
}
//# sourceMappingURL=host-client-factory.js.map