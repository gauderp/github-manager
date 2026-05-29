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

// ── Triage ──

export type TriageRule = {
  id: number;
  repoId: number;
  ruleName: string;
  conditionType: "keyword" | "path" | "author" | "label_prefix";
  conditionValue: string;
  actionType: "add_label" | "set_assignee" | "set_priority";
  actionValue: string;
  priority: number;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
};

export type TriageRuleInput = Omit<TriageRule, "id" | "createdAt" | "updatedAt">;

export type GitHubLabel = {
  id: number;
  name: string;
  color: string;
  description: string | null;
};

export type PRFileChange = {
  filename: string;
  status: "added" | "removed" | "modified" | "renamed" | "copied" | "changed" | "unchanged";
  additions: number;
  deletions: number;
  patch?: string;
};

export type ReviewGuidelines = {
  repoId: number;
  repoFullName: string;
  guidelines: string;
  updatedAt: string;
};

// ── CI/CD ──

export type GitHubWorkflowRun = {
  id: number;
  repoId: number;
  runNumber: number;
  workflowName: string;
  headBranch: string | null;
  headSha: string | null;
  status: string;
  conclusion: string | null;
  prNumber: number | null;
  logsSummary: string | null;
  analyzedAt: string | null;
  htmlUrl: string;
  createdAt: string;
  updatedAt: string;
};

export type WorkflowJob = {
  id: number;
  runId: number;
  name: string;
  status: string;
  conclusion: string | null;
  startedAt: string | null;
  completedAt: string | null;
  steps: WorkflowStep[];
};

export type WorkflowStep = {
  name: string;
  status: string;
  conclusion: string | null;
  number: number;
  startedAt: string | null;
  completedAt: string | null;
};

export type DeploymentStatus = {
  id: number;
  ref: string;
  environment: string;
  state: string;
  description: string | null;
  createdAt: string;
  updatedAt: string;
  statusUrl: string | null;
};

export type DeployGateResult = {
  passed: boolean;
  checks: DeployGateCheck[];
};

export type DeployGateCheck = {
  name: string;
  passed: boolean;
  detail: string;
};

// ── Phase 3: Metrics ──

export type PRMetrics = {
  prId: number;
  repoId: number;
  cycleTimeHours: number | null;
  timeToFirstReviewHours: number | null;
  reviewRounds: number;
  additions: number;
  deletions: number;
  mergedBy: string | null;
  createdAt: string | null;
  mergedAt: string | null;
};

export type ContributorStat = {
  login: string;
  commits: number;
  pullRequestsOpened: number;
  pullRequestsMerged: number;
  reviewsGiven: number;
  additions: number;
  deletions: number;
};

export type PRTimelineEvent = {
  event: string;
  actor: string | null;
  createdAt: string;
  state?: string;
  body?: string;
};

// ── Phase 3: Standup ──

export type StandupReport = {
  id: number;
  companyId: string;
  reportDate: string;
  reportMarkdown: string;
  reposIncluded: number[];
  contributors: string[];
  highlights: string[];
  generatedAt: string;
};

export type StandupActivity = {
  repoFullName: string;
  prsOpened: Array<{ number: number; title: string; author: string; url: string }>;
  prsMerged: Array<{ number: number; title: string; author: string; url: string }>;
  issuesOpened: Array<{ number: number; title: string; author: string; url: string }>;
  issuesClosed: Array<{ number: number; title: string; author: string; url: string }>;
  prsAwaitingReview: Array<{ number: number; title: string; author: string; hoursOpen: number; url: string }>;
};

// ── Phase 3: Releases ──

export type GitHubRelease = {
  id: number;
  tagName: string;
  name: string;
  body: string | null;
  draft: boolean;
  prerelease: boolean;
  publishedAt: string | null;
  htmlUrl: string;
};

export type GitHubCommit = {
  sha: string;
  message: string;
  author: string;
  date: string;
  url: string;
};
