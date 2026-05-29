import type { PluginContext } from "@paperclipai/plugin-sdk";
import { githubFetch } from "../github/api-client.js";
import type { DeployGateResult, DeployGateCheck } from "../types.js";

/**
 * Runs a deploy gate checklist for a given PR or ref and returns a structured
 * pass/fail result per check. Called from the worker's "run-deploy-gate" action.
 *
 * Checks performed:
 * 1. All CI checks green (github_get_pr_checks equivalent)
 * 2. PR has at least one approved review
 * 3. No sensitive files in the PR diff
 * 4. Most recent deployment on the target environment is not in a failed state
 * 5. No currently in-progress workflow runs on the branch
 */
export async function runDeployGate(
  ctx: PluginContext,
  companyId: string,
  opts: {
    owner: string;
    repo: string;
    pullNumber: number;
    targetEnvironment?: string;
  },
): Promise<DeployGateResult> {
  const { owner, repo, pullNumber, targetEnvironment } = opts;
  const checks: DeployGateCheck[] = [];

  // ── Check 1: CI checks all green ──
  try {
    const { data: prData } = await githubFetch(
      ctx, companyId,
      `/repos/${owner}/${repo}/pulls/${pullNumber}`,
    );
    const pr = prData as Record<string, unknown>;
    const headSha = (pr.head as Record<string, unknown>).sha as string;
    const headBranch = (pr.head as Record<string, unknown>).ref as string;

    const { data: checksData } = await githubFetch(
      ctx, companyId,
      `/repos/${owner}/${repo}/commits/${headSha}/check-runs?per_page=50`,
    );
    const result = checksData as Record<string, unknown>;
    const checkRuns = (result.check_runs as Array<Record<string, unknown>>) ?? [];

    if (checkRuns.length === 0) {
      checks.push({ name: "CI Checks", passed: false, detail: "No check runs found for this commit." });
    } else {
      const failed = checkRuns.filter((cr) => cr.conclusion === "failure" || cr.conclusion === "timed_out");
      const pending = checkRuns.filter((cr) => cr.status === "in_progress" || cr.status === "queued");
      if (failed.length > 0) {
        checks.push({
          name: "CI Checks",
          passed: false,
          detail: `${failed.length} check(s) failed: ${failed.map((cr) => cr.name).join(", ")}`,
        });
      } else if (pending.length > 0) {
        checks.push({
          name: "CI Checks",
          passed: false,
          detail: `${pending.length} check(s) still in progress: ${pending.map((cr) => cr.name).join(", ")}`,
        });
      } else {
        checks.push({
          name: "CI Checks",
          passed: true,
          detail: `All ${checkRuns.length} checks passed.`,
        });
      }
    }

    // ── Check 2: At least one approved review ──
    const { data: reviewsData } = await githubFetch(
      ctx, companyId,
      `/repos/${owner}/${repo}/pulls/${pullNumber}/reviews?per_page=50`,
    );
    const reviews = reviewsData as Array<Record<string, unknown>>;
    const approvals = reviews.filter((r) => r.state === "APPROVED");
    const changesRequested = reviews.filter((r) => r.state === "CHANGES_REQUESTED");

    if (changesRequested.length > 0) {
      checks.push({
        name: "Review Approval",
        passed: false,
        detail: `Changes requested by: ${changesRequested.map((r) => (r.user as Record<string, unknown>).login).join(", ")}`,
      });
    } else if (approvals.length === 0) {
      checks.push({
        name: "Review Approval",
        passed: false,
        detail: "No approved reviews yet.",
      });
    } else {
      checks.push({
        name: "Review Approval",
        passed: true,
        detail: `Approved by: ${approvals.map((r) => (r.user as Record<string, unknown>).login).join(", ")}`,
      });
    }

    // ── Check 3: No sensitive files ──
    const { data: filesData } = await githubFetch(
      ctx, companyId,
      `/repos/${owner}/${repo}/pulls/${pullNumber}/files?per_page=100`,
    );
    const files = filesData as Array<Record<string, unknown>>;
    const sensitivePatterns = [
      /\.env$/i, /\.env\./i, /secrets?\./i, /credentials?\./i,
      /private[\w.-]*key/i, /\.pem$/i, /\.p12$/i, /\.pfx$/i,
    ];
    const sensitiveFiles = files
      .map((f) => f.filename as string)
      .filter((name) => sensitivePatterns.some((p) => p.test(name)));

    if (sensitiveFiles.length > 0) {
      checks.push({
        name: "Sensitive Files",
        passed: false,
        detail: `Potentially sensitive files detected: ${sensitiveFiles.join(", ")}`,
      });
    } else {
      checks.push({
        name: "Sensitive Files",
        passed: true,
        detail: `No sensitive files detected in ${files.length} changed files.`,
      });
    }

    // ── Check 4: Last deployment state ──
    const env = targetEnvironment ?? "production";
    try {
      const { data: deploymentsData } = await githubFetch(
        ctx, companyId,
        `/repos/${owner}/${repo}/deployments?environment=${encodeURIComponent(env)}&per_page=1`,
      );
      const deployments = deploymentsData as Array<Record<string, unknown>>;

      if (deployments.length === 0) {
        checks.push({
          name: `Last Deployment (${env})`,
          passed: true,
          detail: `No prior deployments found for environment "${env}".`,
        });
      } else {
        const depId = deployments[0].id as number;
        const { data: statusesData } = await githubFetch(
          ctx, companyId,
          `/repos/${owner}/${repo}/deployments/${depId}/statuses?per_page=1`,
        );
        const statuses = statusesData as Array<Record<string, unknown>>;
        const latestState = statuses.length > 0 ? (statuses[0].state as string) : "unknown";
        const isFailed = latestState === "failure" || latestState === "error";

        checks.push({
          name: `Last Deployment (${env})`,
          passed: !isFailed,
          detail: `Last deployment state: ${latestState}`,
        });
      }
    } catch {
      checks.push({
        name: `Last Deployment (${env})`,
        passed: true, // non-blocking — deployments API might not be configured
        detail: "Could not retrieve deployment status (deployments may not be configured).",
      });
    }

    // ── Check 5: No in-progress runs on the branch ──
    try {
      const { data: runsData } = await githubFetch(
        ctx, companyId,
        `/repos/${owner}/${repo}/actions/runs?branch=${encodeURIComponent(headBranch)}&status=in_progress&per_page=5`,
      );
      const runsResult = runsData as Record<string, unknown>;
      const activeRuns = (runsResult.workflow_runs as Array<Record<string, unknown>>) ?? [];

      if (activeRuns.length > 0) {
        checks.push({
          name: "No Active Runs",
          passed: false,
          detail: `${activeRuns.length} workflow run(s) still in progress on ${headBranch}: ${activeRuns.map((r) => r.name).join(", ")}`,
        });
      } else {
        checks.push({
          name: "No Active Runs",
          passed: true,
          detail: `No in-progress workflow runs on branch ${headBranch}.`,
        });
      }
    } catch {
      checks.push({
        name: "No Active Runs",
        passed: true, // non-blocking
        detail: "Could not check for active runs.",
      });
    }
  } catch (err) {
    return {
      passed: false,
      checks: [{ name: "Deploy Gate", passed: false, detail: `Error running checks: ${err}` }],
    };
  }

  const passed = checks.every((c) => c.passed);
  return { passed, checks };
}

/**
 * Format a DeployGateResult as a human-readable text summary.
 */
export function formatDeployGateResult(result: DeployGateResult): string {
  const lines: string[] = [
    result.passed ? "DEPLOY GATE: PASSED" : "DEPLOY GATE: FAILED",
    "",
  ];
  for (const check of result.checks) {
    const icon = check.passed ? "[PASS]" : "[FAIL]";
    lines.push(`${icon} ${check.name}`);
    lines.push(`       ${check.detail}`);
  }
  return lines.join("\n");
}
