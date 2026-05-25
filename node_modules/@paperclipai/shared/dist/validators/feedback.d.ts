import { z } from "zod";
export declare const feedbackTargetTypeSchema: z.ZodEnum<["issue_comment", "issue_document_revision"]>;
export declare const feedbackTraceStatusSchema: z.ZodEnum<["local_only", "pending", "sent", "failed"]>;
export declare const feedbackVoteValueSchema: z.ZodEnum<["up", "down"]>;
export declare const feedbackDataSharingPreferenceSchema: z.ZodEnum<["allowed", "not_allowed", "prompt"]>;
export declare const upsertIssueFeedbackVoteSchema: z.ZodObject<{
    targetType: z.ZodEnum<["issue_comment", "issue_document_revision"]>;
    targetId: z.ZodString;
    vote: z.ZodEnum<["up", "down"]>;
    reason: z.ZodOptional<z.ZodString>;
    allowSharing: z.ZodOptional<z.ZodBoolean>;
}, "strip", z.ZodTypeAny, {
    targetType: "issue_comment" | "issue_document_revision";
    targetId: string;
    vote: "up" | "down";
    reason?: string | undefined;
    allowSharing?: boolean | undefined;
}, {
    targetType: "issue_comment" | "issue_document_revision";
    targetId: string;
    vote: "up" | "down";
    reason?: string | undefined;
    allowSharing?: boolean | undefined;
}>;
export type UpsertIssueFeedbackVote = z.infer<typeof upsertIssueFeedbackVoteSchema>;
//# sourceMappingURL=feedback.d.ts.map