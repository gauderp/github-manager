export type GitHubRepo = {
  id: number;
  fullName: string;
  owner: string;
  name: string;
  private: boolean;
  defaultBranch: string;
  htmlUrl: string;
  description: string | null;
  language: string | null;
  topics: string[];
  updatedAt: string;
  syncedAt: string;
};

export type GitHubPR = {
  id: number;
  repoId: number;
  number: number;
  title: string;
  body: string | null;
  state: "open" | "closed" | "merged";
  author: string;
  headBranch: string;
  baseBranch: string;
  htmlUrl: string;
  draft: boolean;
  mergeable: boolean | null;
  mergedAt: string | null;
  createdAt: string;
  updatedAt: string;
  syncedAt: string;
};

export type GitHubIssue = {
  id: number;
  repoId: number;
  number: number;
  title: string;
  body: string | null;
  state: string;
  author: string;
  labels: string[];
  htmlUrl: string;
  createdAt: string;
  updatedAt: string;
  syncedAt: string;
};

export type PRCardLink = {
  id: number;
  prId: number;
  issueId: string;
  linkSource: "webhook" | "pattern" | "manual";
  createdAt: string;
};

export type SyncLogEntry = {
  id: number;
  scope: "full" | "incremental" | "webhook";
  reposSynced: number;
  prsSynced: number;
  issuesSynced: number;
  errors: string[];
  startedAt: string;
  finishedAt: string | null;
};

export type PRWithRepo = GitHubPR & {
  repoFullName: string;
};

export type PRWithLinks = PRWithRepo & {
  linkedCardIds: string[];
};

export type QuickCheckResult = {
  hasDescription: boolean;
  hasTests: boolean;
  sensitiveFiles: string[];
  checkedAt: string;
};

export type ReviewSummary = {
  agentKey: string;
  agentName: string;
  verdict: "APPROVE" | "REQUEST_CHANGES" | "COMMENT";
  commentCount: number;
  reviewedAt: string;
};
