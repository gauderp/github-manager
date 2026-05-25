import { z } from "zod";
export declare const sidebarOrderPreferenceSchema: z.ZodObject<{
    orderedIds: z.ZodArray<z.ZodString, "many">;
    updatedAt: z.ZodNullable<z.ZodDate>;
}, "strip", z.ZodTypeAny, {
    updatedAt: Date | null;
    orderedIds: string[];
}, {
    updatedAt: Date | null;
    orderedIds: string[];
}>;
export declare const upsertSidebarOrderPreferenceSchema: z.ZodObject<{
    orderedIds: z.ZodArray<z.ZodString, "many">;
}, "strip", z.ZodTypeAny, {
    orderedIds: string[];
}, {
    orderedIds: string[];
}>;
export type UpsertSidebarOrderPreference = z.infer<typeof upsertSidebarOrderPreferenceSchema>;
//# sourceMappingURL=sidebar-preferences.d.ts.map