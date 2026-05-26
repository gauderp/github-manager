import type { PluginContext } from "@paperclipai/plugin-sdk";

const GITHUB_PAT_KEY = "github_pat";
const GITHUB_SECRET_REF_KEY = "github_secret_ref";

export async function resolveGithubToken(ctx: PluginContext, companyId: string): Promise<string> {
  // 1. Check instance config (from Settings > Plugins UI)
  const config = await ctx.config.get();
  if (config?.githubToken && typeof config.githubToken === "string" && config.githubToken.trim()) {
    return config.githubToken.trim();
  }

  // 2. Check company-scoped PAT (from plugin state)
  const pat = await ctx.state.get({
    scopeKind: "company",
    scopeId: companyId,
    stateKey: GITHUB_PAT_KEY,
  });
  if (pat && typeof pat === "string" && pat.trim()) return pat.trim();

  // 3. Env fallback
  const envToken = process.env.GITHUB_TOKEN?.trim();
  if (envToken) return envToken;

  throw new Error("No GitHub token configured. Set a PAT in Settings > Plugins > GitHub Manager.");
}

export async function saveGithubPAT(ctx: PluginContext, companyId: string, token: string): Promise<void> {
  await ctx.state.set({
    scopeKind: "company",
    scopeId: companyId,
    stateKey: GITHUB_PAT_KEY,
  }, token);
}

export async function saveGithubSecretRef(ctx: PluginContext, companyId: string, ref: string): Promise<void> {
  await ctx.state.set({
    scopeKind: "company",
    scopeId: companyId,
    stateKey: GITHUB_SECRET_REF_KEY,
  }, ref);
}

export function getGithubApiBase(): string {
  const base = process.env.GITHUB_API_URL?.trim();
  return base ? base.replace(/\/+$/, "") : "https://api.github.com";
}
