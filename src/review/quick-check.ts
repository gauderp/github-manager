import type { PluginContext } from "@paperclipai/plugin-sdk";
import { githubFetch } from "../github/api-client.js";
import type { QuickCheckResult } from "../types.js";

const SENSITIVE_PATTERNS = [
  /\.env$/i,
  /\.env\./i,
  /credentials/i,
  /secret/i,
  /\.pem$/i,
  /\.key$/i,
  /password/i,
  /token/i,
];

const TEST_PATTERNS = [
  /\.test\./,
  /\.spec\./,
  /_test\./,
  /tests?\//,
  /__tests__\//,
];

export async function runQuickCheck(
  ctx: PluginContext,
  companyId: string,
  owner: string,
  repo: string,
  pullNumber: number,
): Promise<QuickCheckResult> {
  const { data: prData } = await githubFetch(ctx, companyId, `/repos/${owner}/${repo}/pulls/${pullNumber}`);
  const pr = prData as Record<string, unknown>;

  const { data: filesData } = await githubFetch(
    ctx, companyId,
    `/repos/${owner}/${repo}/pulls/${pullNumber}/files?per_page=100`,
  );
  const files = filesData as Array<Record<string, unknown>>;
  const filenames = files.map((f) => f.filename as string);

  const hasDescription = Boolean(pr.body && (pr.body as string).trim().length > 10);

  const hasTests = filenames.some((f) =>
    TEST_PATTERNS.some((pattern) => pattern.test(f)),
  );

  const sensitiveFiles = filenames.filter((f) =>
    SENSITIVE_PATTERNS.some((pattern) => pattern.test(f)),
  );

  return {
    hasDescription,
    hasTests,
    sensitiveFiles,
    checkedAt: new Date().toISOString(),
  };
}
