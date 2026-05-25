export function trackInstallStarted(client) {
    client.track("install.started");
}
export function trackInstallCompleted(client, dims) {
    client.track("install.completed", { adapter_type: dims.adapterType });
}
export function trackCompanyImported(client, dims) {
    const ref = dims.isPrivate ? client.hashPrivateRef(dims.sourceRef) : dims.sourceRef;
    client.track("company.imported", {
        source_type: dims.sourceType,
        source_ref: ref,
        source_ref_hashed: dims.isPrivate,
    });
}
export function trackProjectCreated(client) {
    client.track("project.created");
}
export function trackRoutineCreated(client) {
    client.track("routine.created");
}
export function trackRoutineRun(client, dims) {
    client.track("routine.run", {
        source: dims.source,
        status: dims.status,
    });
}
export function trackGoalCreated(client, dims) {
    client.track("goal.created", dims?.goalLevel ? { goal_level: dims.goalLevel } : undefined);
}
export function trackAgentCreated(client, dims) {
    client.track("agent.created", {
        agent_role: dims.agentRole,
        ...(dims.agentId ? { agent_id: dims.agentId } : {}),
    });
}
export function trackSkillImported(client, dims) {
    client.track("skill.imported", {
        source_type: dims.sourceType,
        ...(dims.skillRef ? { skill_ref: dims.skillRef } : {}),
    });
}
export function trackAgentFirstHeartbeat(client, dims) {
    client.track("agent.first_heartbeat", {
        agent_role: dims.agentRole,
        ...(dims.agentId ? { agent_id: dims.agentId } : {}),
    });
}
export function trackAgentTaskCompleted(client, dims) {
    client.track("agent.task_completed", {
        agent_role: dims.agentRole,
        ...(dims.agentId ? { agent_id: dims.agentId } : {}),
        ...(dims.adapterType ? { adapter_type: dims.adapterType } : {}),
        ...(dims.model ? { model: dims.model } : {}),
    });
}
export function trackErrorHandlerCrash(client, dims) {
    client.track("error.handler_crash", { error_code: dims.errorCode });
}
//# sourceMappingURL=events.js.map