/** Process-level GitHub settings (GitHub Enterprise, default org). */
export function getGithubApiBase(): string {
  const raw = process.env.GITHUB_API_URL?.trim();
  return raw ? raw.replace(/\/+$/, "") : "https://api.github.com";
}

export function getGithubDefaultOwner(): string | null {
  const raw = process.env.GITHUB_DEFAULT_OWNER?.trim();
  return raw && raw.length > 0 ? raw : null;
}

/** Optional worker-level PAT when company-scoped auth is not configured. */
export function getGithubEnvToken(): string | null {
  const raw = process.env.GITHUB_TOKEN?.trim();
  return raw && raw.length > 0 ? raw : null;
}
