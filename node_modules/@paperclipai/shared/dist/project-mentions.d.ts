export declare const PROJECT_MENTION_SCHEME = "project://";
export declare const AGENT_MENTION_SCHEME = "agent://";
export declare const USER_MENTION_SCHEME = "user://";
export declare const SKILL_MENTION_SCHEME = "skill://";
export interface ParsedProjectMention {
    projectId: string;
    color: string | null;
}
export interface ParsedAgentMention {
    agentId: string;
    icon: string | null;
}
export interface ParsedUserMention {
    userId: string;
}
export interface ParsedSkillMention {
    skillId: string;
    slug: string | null;
}
export declare function buildProjectMentionHref(projectId: string, color?: string | null): string;
export declare function parseProjectMentionHref(href: string): ParsedProjectMention | null;
export declare function buildAgentMentionHref(agentId: string, icon?: string | null): string;
export declare function parseAgentMentionHref(href: string): ParsedAgentMention | null;
export declare function buildUserMentionHref(userId: string): string;
export declare function parseUserMentionHref(href: string): ParsedUserMention | null;
export declare function buildSkillMentionHref(skillId: string, slug?: string | null): string;
export declare function parseSkillMentionHref(href: string): ParsedSkillMention | null;
export declare function extractProjectMentionIds(markdown: string): string[];
export declare function extractAgentMentionIds(markdown: string): string[];
export declare function extractUserMentionIds(markdown: string): string[];
export declare function extractSkillMentionIds(markdown: string): string[];
//# sourceMappingURL=project-mentions.d.ts.map