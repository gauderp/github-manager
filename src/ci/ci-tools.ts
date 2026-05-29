import { createGunzip } from "node:zlib";
import { Readable } from "node:stream";
import type { PluginContext, ToolRunContext, ToolResult } from "@paperclipai/plugin-sdk";
import { githubFetch } from "../github/api-client.js";
import type { WorkflowJob, WorkflowStep, DeploymentStatus } from "../types.js";

const MAX_LOG_CHARS = 50_000;

// ── Helpers ──

/**
 * Parse a ZIP archive returned from the GitHub logs endpoint.
 * GitHub returns a ZIP where each entry is a log file named
 * "{job_name}/{step_number}_{step_name}.txt".
 * We use a manual ZIP parser to avoid external dependencies.
 * Only reads the local file headers and compressed data.
 */
async function parseZipLogs(
  buffer: Buffer,
  jobNameFilter?: string,
): Promise<string> {
  const lines: string[] = [];

  let offset = 0;
  // ZIP local file header signature: PK\x03\x04
  const LOCAL_FILE_HEADER_SIG = 0x04034b50;

  while (offset < buffer.length - 4) {
    const sig = buffer.readUInt32LE(offset);
    if (sig !== LOCAL_FILE_HEADER_SIG) {
      offset++;
      continue;
    }

    if (offset + 30 > buffer.length) break;

    const compressionMethod = buffer.readUInt16LE(offset + 8);
    const compressedSize    = buffer.readUInt32LE(offset + 18);
    const fileNameLength    = buffer.readUInt16LE(offset + 26);
    const extraFieldLength  = buffer.readUInt16LE(offset + 28);

    const fileNameStart = offset + 30;
    const fileNameEnd   = fileNameStart + fileNameLength;

    if (fileNameEnd > buffer.length) break;

    const fileName = buffer.subarray(fileNameStart, fileNameEnd).toString("utf-8");
    const dataStart = fileNameEnd + extraFieldLength;
    const dataEnd   = dataStart + compressedSize;

    if (dataEnd > buffer.length) break;

    // Apply job name filter — fileName is like "JobName/1_StepName.txt"
    const belongsToJob = !jobNameFilter ||
      fileName.toLowerCase().startsWith(jobNameFilter.toLowerCase() + "/");

    if (belongsToJob && compressedSize > 0) {
      try {
        const compressedData = buffer.subarray(dataStart, dataEnd);
        let entryText: string;

        if (compressionMethod === 0) {
          // Stored (no compression)
          entryText = compressedData.toString("utf-8");
        } else if (compressionMethod === 8) {
          // Deflate — use gunzip with raw deflate via zlib
          entryText = await new Promise<string>((resolve, reject) => {
            const chunks: Buffer[] = [];
            const gunzip = createGunzip({ windowBits: -15 });
            const readable = Readable.from(compressedData);
            readable.pipe(gunzip);
            gunzip.on("data", (chunk: Buffer) => chunks.push(chunk));
            gunzip.on("end", () => resolve(Buffer.concat(chunks).toString("utf-8")));
            gunzip.on("error", reject);
          });
        } else {
          entryText = `[Unsupported compression: ${compressionMethod}]`;
        }

        lines.push(`\n=== ${fileName} ===`);
        // Focus on error lines — keep all lines but truncate per-file to 5000 chars
        const trimmed = entryText.length > 5000
          ? "...(truncated)...\n" + entryText.slice(-5000)
          : entryText;
        lines.push(trimmed);
      } catch {
        lines.push(`\n=== ${fileName} === [parse error]`);
      }
    }

    offset = dataEnd;
  }

  const combined = lines.join("\n");
  if (combined.length > MAX_LOG_CHARS) {
    return combined.slice(-MAX_LOG_CHARS); // keep the tail — errors are at the end
  }
  return combined || "[No log content found]";
}

// ── Tool Registration ──

export function registerCITools(ctx: PluginContext): void {

  // ─────────────────────────────────────────────────────────────────
  // 1. github_list_workflow_runs
  // ─────────────────────────────────────────────────────────────────
  ctx.tools.register(
    "github_list_workflow_runs",
    {
      displayName: "List Workflow Runs",
      description: "List recent workflow runs for a repository, optionally filtered by branch or status",
      parametersSchema: {
        type: "object",
        properties: {
          owner:    { type: "string", description: "Repository owner" },
          repo:     { type: "string", description: "Repository name" },
          branch:   { type: "string", description: "Filter by branch name" },
          status:   { type: "string", enum: ["completed", "in_progress", "queued", "failure", "success"], description: "Filter by run status" },
          per_page: { type: "number", description: "Number of runs to return (default 10, max 30)" },
        },
        required: ["owner", "repo"],
      },
    },
    async (params: unknown, runCtx: ToolRunContext): Promise<ToolResult> => {
      const { owner, repo, branch, status, per_page } = params as {
        owner: string; repo: string;
        branch?: string; status?: string; per_page?: number;
      };
      const companyId = runCtx.companyId;
      if (!companyId) return { error: "No company context" };

      const limit = Math.min(per_page ?? 10, 30);
      const qs = new URLSearchParams({ per_page: String(limit) });
      if (branch) qs.set("branch", branch);
      if (status) qs.set("status", status);

      const { data } = await githubFetch(
        ctx, companyId,
        `/repos/${owner}/${repo}/actions/runs?${qs.toString()}`,
      );

      const result = data as Record<string, unknown>;
      const runs = (result.workflow_runs as Array<Record<string, unknown>>) ?? [];

      const summary = runs.map((r) => {
        const icon = r.conclusion === "success" ? "PASS"
          : r.conclusion === "failure" ? "FAIL"
          : r.status === "in_progress" ? "RUNNING"
          : "PENDING";
        return `[${icon}] #${r.run_number} ${r.name} — branch: ${r.head_branch} — ${r.conclusion ?? r.status} — ${r.created_at}`;
      });

      return {
        content: [
          `Workflow runs for ${owner}/${repo} (${runs.length} results):`,
          ...summary,
        ].join("\n"),
        data: {
          totalCount: result.total_count,
          runs: runs.map((r) => ({
            id:           r.id,
            runNumber:    r.run_number,
            name:         r.name,
            headBranch:   r.head_branch,
            headSha:      r.head_sha,
            status:       r.status,
            conclusion:   r.conclusion,
            htmlUrl:      r.html_url,
            createdAt:    r.created_at,
            updatedAt:    r.updated_at,
            pullRequests: (r.pull_requests as Array<Record<string, unknown>> ?? []).map((p) => ({
              number: p.number,
              url:    p.url,
            })),
          })),
        },
      };
    },
  );

  // ─────────────────────────────────────────────────────────────────
  // 2. github_get_workflow_run_jobs
  // ─────────────────────────────────────────────────────────────────
  ctx.tools.register(
    "github_get_workflow_run_jobs",
    {
      displayName: "Get Workflow Run Jobs",
      description: "List jobs for a workflow run with individual step status",
      parametersSchema: {
        type: "object",
        properties: {
          owner:  { type: "string", description: "Repository owner" },
          repo:   { type: "string", description: "Repository name" },
          run_id: { type: "number", description: "Workflow run ID" },
        },
        required: ["owner", "repo", "run_id"],
      },
    },
    async (params: unknown, runCtx: ToolRunContext): Promise<ToolResult> => {
      const { owner, repo, run_id } = params as {
        owner: string; repo: string; run_id: number;
      };
      const companyId = runCtx.companyId;
      if (!companyId) return { error: "No company context" };

      const { data } = await githubFetch(
        ctx, companyId,
        `/repos/${owner}/${repo}/actions/runs/${run_id}/jobs`,
      );

      const result = data as Record<string, unknown>;
      const rawJobs = (result.jobs as Array<Record<string, unknown>>) ?? [];

      const jobs: WorkflowJob[] = rawJobs.map((j) => {
        const steps: WorkflowStep[] = ((j.steps as Array<Record<string, unknown>>) ?? []).map((s) => ({
          name:        s.name as string,
          status:      s.status as string,
          conclusion:  s.conclusion as string | null,
          number:      s.number as number,
          startedAt:   s.started_at as string | null,
          completedAt: s.completed_at as string | null,
        }));
        return {
          id:          j.id as number,
          runId:       run_id,
          name:        j.name as string,
          status:      j.status as string,
          conclusion:  j.conclusion as string | null,
          startedAt:   j.started_at as string | null,
          completedAt: j.completed_at as string | null,
          steps,
        };
      });

      const failedJobs = jobs.filter((j) => j.conclusion === "failure");
      const lines: string[] = [`Jobs for run #${run_id} (${jobs.length} total, ${failedJobs.length} failed):`];

      for (const j of jobs) {
        const icon = j.conclusion === "success" ? "PASS"
          : j.conclusion === "failure" ? "FAIL"
          : j.status === "in_progress" ? "RUNNING"
          : "SKIP";
        lines.push(`  [${icon}] ${j.name}`);
        for (const s of j.steps) {
          if (s.conclusion && s.conclusion !== "success" && s.conclusion !== "skipped") {
            lines.push(`    → step ${s.number}: ${s.name} [${s.conclusion}]`);
          }
        }
      }

      return {
        content: lines.join("\n"),
        data: { jobs, failedJobNames: failedJobs.map((j) => j.name) },
      };
    },
  );

  // ─────────────────────────────────────────────────────────────────
  // 3. github_get_workflow_run_logs
  // ─────────────────────────────────────────────────────────────────
  ctx.tools.register(
    "github_get_workflow_run_logs",
    {
      displayName: "Get Workflow Run Logs",
      description: "Download and parse logs for a specific workflow run. Returns truncated logs focused on error sections.",
      parametersSchema: {
        type: "object",
        properties: {
          owner:    { type: "string", description: "Repository owner" },
          repo:     { type: "string", description: "Repository name" },
          run_id:   { type: "number", description: "Workflow run ID" },
          job_name: { type: "string", description: "Filter logs to a specific job name (case-insensitive prefix match)" },
        },
        required: ["owner", "repo", "run_id"],
      },
    },
    async (params: unknown, runCtx: ToolRunContext): Promise<ToolResult> => {
      const { owner, repo, run_id, job_name } = params as {
        owner: string; repo: string; run_id: number; job_name?: string;
      };
      const companyId = runCtx.companyId;
      if (!companyId) return { error: "No company context" };

      const { resolveGithubToken, getGithubApiBase } = await import("../github/config.js");
      const t = await resolveGithubToken(ctx, companyId);
      const base = getGithubApiBase();
      const url = `${base}/repos/${owner}/${repo}/actions/runs/${run_id}/logs`;

      const redirectResp = await ctx.http.fetch(url, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${t}`,
          Accept: "application/vnd.github+json",
          "User-Agent": "paperclip-github-manager/1.0",
          "X-GitHub-Api-Version": "2022-11-28",
        },
        redirect: "manual",
      });

      let zipBuffer: Buffer;

      if (redirectResp.status === 302) {
        const location = redirectResp.headers.get("location");
        if (!location) throw new Error("GitHub logs redirect had no Location header");
        const zipResp = await ctx.http.fetch(location, { method: "GET" });
        if (!zipResp.ok) {
          throw new Error(`Failed to download logs ZIP: ${zipResp.status}`);
        }
        const arrayBuffer = await zipResp.arrayBuffer();
        zipBuffer = Buffer.from(arrayBuffer);
      } else if (redirectResp.ok) {
        const arrayBuffer = await redirectResp.arrayBuffer();
        zipBuffer = Buffer.from(arrayBuffer);
      } else {
        throw new Error(`GitHub logs endpoint returned ${redirectResp.status}`);
      }

      const logText = await parseZipLogs(zipBuffer, job_name);

      return {
        content: [
          `Logs for run #${run_id}${job_name ? ` (job: ${job_name})` : ""}:`,
          logText.length === MAX_LOG_CHARS ? `[Truncated to ${MAX_LOG_CHARS} chars — showing tail]` : "",
          logText,
        ].join("\n"),
        data: {
          runId:    run_id,
          jobName:  job_name ?? null,
          charCount: logText.length,
          truncated: logText.length >= MAX_LOG_CHARS,
        },
      };
    },
  );

  // ─────────────────────────────────────────────────────────────────
  // 4. github_rerun_workflow
  // ─────────────────────────────────────────────────────────────────
  ctx.tools.register(
    "github_rerun_workflow",
    {
      displayName: "Re-run Workflow",
      description: "Re-run a failed workflow run (only failed jobs by default)",
      parametersSchema: {
        type: "object",
        properties: {
          owner:       { type: "string", description: "Repository owner" },
          repo:        { type: "string", description: "Repository name" },
          run_id:      { type: "number", description: "Workflow run ID to re-run" },
          only_failed: { type: "boolean", description: "Re-run only failed jobs (default true)" },
        },
        required: ["owner", "repo", "run_id"],
      },
    },
    async (params: unknown, runCtx: ToolRunContext): Promise<ToolResult> => {
      const { owner, repo, run_id, only_failed } = params as {
        owner: string; repo: string; run_id: number; only_failed?: boolean;
      };
      const companyId = runCtx.companyId;
      if (!companyId) return { error: "No company context" };

      const rerunOnlyFailed = only_failed !== false; // default true

      const endpoint = rerunOnlyFailed
        ? `/repos/${owner}/${repo}/actions/runs/${run_id}/rerun-failed-jobs`
        : `/repos/${owner}/${repo}/actions/runs/${run_id}/rerun`;

      await githubFetch(ctx, companyId, endpoint, { method: "POST" });

      return {
        content: `Re-run triggered for workflow run #${run_id} (${rerunOnlyFailed ? "failed jobs only" : "all jobs"}).`,
        data: { runId: run_id, onlyFailed: rerunOnlyFailed, endpoint },
      };
    },
  );

  // ─────────────────────────────────────────────────────────────────
  // 5. github_get_deployment_status
  // ─────────────────────────────────────────────────────────────────
  ctx.tools.register(
    "github_get_deployment_status",
    {
      displayName: "Get Deployment Status",
      description: "Get deployment status for a ref (branch, tag, or SHA)",
      parametersSchema: {
        type: "object",
        properties: {
          owner: { type: "string", description: "Repository owner" },
          repo:  { type: "string", description: "Repository name" },
          ref:   { type: "string", description: "Branch name, tag, or commit SHA" },
        },
        required: ["owner", "repo", "ref"],
      },
    },
    async (params: unknown, runCtx: ToolRunContext): Promise<ToolResult> => {
      const { owner, repo, ref } = params as {
        owner: string; repo: string; ref: string;
      };
      const companyId = runCtx.companyId;
      if (!companyId) return { error: "No company context" };

      const { data: deploymentsData } = await githubFetch(
        ctx, companyId,
        `/repos/${owner}/${repo}/deployments?ref=${encodeURIComponent(ref)}&per_page=5`,
      );

      const deployments = deploymentsData as Array<Record<string, unknown>>;

      if (deployments.length === 0) {
        return {
          content: `No deployments found for ref: ${ref} in ${owner}/${repo}`,
          data: { ref, deployments: [] },
        };
      }

      const results: DeploymentStatus[] = [];
      const lines: string[] = [`Deployments for ${owner}/${repo} @ ${ref}:`];

      for (const dep of deployments.slice(0, 5)) {
        const depId = dep.id as number;
        const { data: statusesData } = await githubFetch(
          ctx, companyId,
          `/repos/${owner}/${repo}/deployments/${depId}/statuses?per_page=1`,
        );

        const statuses = statusesData as Array<Record<string, unknown>>;
        const latestStatus = statuses[0];

        const entry: DeploymentStatus = {
          id:          depId,
          ref:         dep.ref as string,
          environment: dep.environment as string,
          state:       latestStatus ? (latestStatus.state as string) : "pending",
          description: latestStatus ? (latestStatus.description as string | null) : null,
          createdAt:   dep.created_at as string,
          updatedAt:   dep.updated_at as string,
          statusUrl:   latestStatus ? (latestStatus.target_url as string | null) : null,
        };
        results.push(entry);

        const icon = entry.state === "success" ? "PASS"
          : entry.state === "failure" || entry.state === "error" ? "FAIL"
          : entry.state === "in_progress" ? "RUNNING"
          : "PENDING";
        lines.push(`  [${icon}] env: ${entry.environment} — state: ${entry.state} — ${entry.createdAt}`);
        if (entry.description) lines.push(`    ${entry.description}`);
      }

      return {
        content: lines.join("\n"),
        data: { ref, deployments: results },
      };
    },
  );
}
