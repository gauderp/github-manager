/** Plugin page route segments (manifest `routePath`). */
export const ROUTES = {
  repos: "github",
  settings: "github/settings",
  pullRequests: "github/pull-requests"
} as const;

/** Host navigation paths (use with `linkProps`). */
export const PATHS = {
  repos: "/github",
  settings: "/github/settings",
  pullRequests: "/github/pull-requests",
  companySecrets: "/company/settings"
} as const;

export const GITHUB_TOKEN_SECRET_KEY = "github_token";
