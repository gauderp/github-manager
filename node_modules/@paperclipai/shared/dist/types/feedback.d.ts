export declare const FEEDBACK_TARGET_TYPES: readonly ["issue_comment", "issue_document_revision"];
export type FeedbackTargetType = (typeof FEEDBACK_TARGET_TYPES)[number];
export declare const FEEDBACK_VOTE_VALUES: readonly ["up", "down"];
export type FeedbackVoteValue = (typeof FEEDBACK_VOTE_VALUES)[number];
export declare const FEEDBACK_DATA_SHARING_PREFERENCES: readonly ["allowed", "not_allowed", "prompt"];
export type FeedbackDataSharingPreference = (typeof FEEDBACK_DATA_SHARING_PREFERENCES)[number];
export declare const DEFAULT_FEEDBACK_DATA_SHARING_PREFERENCE: FeedbackDataSharingPreference;
export declare const FEEDBACK_TRACE_STATUSES: readonly ["local_only", "pending", "sent", "failed"];
export type FeedbackTraceStatus = (typeof FEEDBACK_TRACE_STATUSES)[number];
export declare const DEFAULT_FEEDBACK_DATA_SHARING_TERMS_VERSION = "feedback-data-sharing-v1";
export interface FeedbackVote {
    id: string;
    companyId: string;
    issueId: string;
    targetType: FeedbackTargetType;
    targetId: string;
    authorUserId: string;
    vote: FeedbackVoteValue;
    reason: string | null;
    sharedWithLabs: boolean;
    sharedAt: Date | null;
    consentVersion: string | null;
    redactionSummary: Record<string, unknown> | null;
    createdAt: Date;
    updatedAt: Date;
}
export interface FeedbackTraceTargetSummary {
    label: string;
    excerpt: string | null;
    authorAgentId: string | null;
    authorUserId: string | null;
    createdAt: Date | null;
    documentKey: string | null;
    documentTitle: string | null;
    revisionNumber: number | null;
}
export interface FeedbackTrace {
    id: string;
    companyId: string;
    feedbackVoteId: string;
    issueId: string;
    projectId: string | null;
    issueIdentifier: string | null;
    issueTitle: string;
    authorUserId: string;
    targetType: FeedbackTargetType;
    targetId: string;
    vote: FeedbackVoteValue;
    status: FeedbackTraceStatus;
    destination: string | null;
    exportId: string | null;
    consentVersion: string | null;
    schemaVersion: string;
    bundleVersion: string;
    payloadVersion: string;
    payloadDigest: string | null;
    payloadSnapshot: Record<string, unknown> | null;
    targetSummary: FeedbackTraceTargetSummary;
    redactionSummary: Record<string, unknown> | null;
    attemptCount: number;
    lastAttemptedAt: Date | null;
    exportedAt: Date | null;
    failureReason: string | null;
    createdAt: Date;
    updatedAt: Date;
}
export type FeedbackTraceBundleCaptureStatus = "full" | "partial" | "unavailable";
export interface FeedbackTraceBundleFile {
    path: string;
    contentType: string;
    encoding: "utf8";
    byteLength: number;
    sha256: string;
    source: "paperclip_run" | "paperclip_run_events" | "paperclip_run_log" | "codex_session" | "claude_stream_json" | "claude_project_session" | "claude_project_artifact" | "claude_debug_log" | "claude_task_metadata" | "opencode_session" | "opencode_session_diff" | "opencode_message" | "opencode_message_part" | "opencode_project" | "opencode_todo";
    contents: string;
}
export interface FeedbackTraceBundle {
    traceId: string;
    exportId: string | null;
    companyId: string;
    issueId: string;
    issueIdentifier: string | null;
    adapterType: string | null;
    captureStatus: FeedbackTraceBundleCaptureStatus;
    notes: string[];
    envelope: Record<string, unknown>;
    surface: Record<string, unknown> | null;
    paperclipRun: Record<string, unknown> | null;
    rawAdapterTrace: Record<string, unknown> | null;
    normalizedAdapterTrace: Record<string, unknown> | null;
    privacy: Record<string, unknown> | null;
    integrity: Record<string, unknown>;
    files: FeedbackTraceBundleFile[];
}
//# sourceMappingURL=feedback.d.ts.map