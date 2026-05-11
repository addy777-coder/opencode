export const syncQueryKeys = {
  appInit: () => ["app-init"] as const,
  serverStatus: () => ["server-status"] as const,
  setting: (key: string) => ["settings", key] as const,
  workspaces: () => ["workspaces"] as const,
  threadActivityRecent: () => ["thread-activity-recent"] as const,
  sessions: (baseUrl?: string | null, directory?: string | null) => ["sessions", baseUrl, directory] as const,
  executionOptions: (baseUrl?: string | null, directory?: string | null) =>
    ["execution-options", baseUrl, directory] as const,
  commands: (baseUrl?: string | null, directory?: string | null) => ["commands", baseUrl, directory] as const,
  skills: (baseUrl?: string | null, directory?: string | null) => ["skills", baseUrl, directory] as const,
  skillRecommendations: () => ["skill-recommendations"] as const,
  gitStatus: (directory?: string | null, autoDetect?: boolean) => ["git-status", directory, autoDetect] as const,
  permissions: (baseUrl?: string | null, directory?: string | null) => ["permissions", baseUrl, directory] as const,
  questions: (baseUrl?: string | null, directory?: string | null) => ["questions", baseUrl, directory] as const,
  sessionStatus: (baseUrl?: string | null, directory?: string | null) => ["session-status", baseUrl, directory] as const,
  sessionMessages: (baseUrl?: string | null, directory?: string | null, sessionId?: string | null) =>
    ["session-messages", baseUrl, directory, sessionId] as const,
  sessionDiff: (baseUrl?: string | null, directory?: string | null, sessionId?: string | null) =>
    ["session-diff", baseUrl, directory, sessionId] as const,
}

export type SyncQueryTarget = {
  baseUrl?: string | null
  directory?: string | null
  sessionId?: string | null
}

export function matchesScopedQueryKey(
  queryKey: readonly unknown[],
  scope: {
    root: string
    baseUrl?: string | null
    directory?: string | null
    sessionId?: string | null
  },
) {
  if (queryKey[0] !== scope.root) return false
  if (scope.baseUrl != null && queryKey[1] !== scope.baseUrl) return false
  if (scope.directory != null && queryKey[2] !== scope.directory) return false
  if (scope.sessionId != null && queryKey[3] !== scope.sessionId) return false
  return true
}
