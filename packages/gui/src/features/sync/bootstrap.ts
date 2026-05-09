import type { QueryClient } from "@tanstack/react-query"
import type {
  ExecutionOptions,
  OpenCodeCommand,
  OpenCodeSession,
  OpenCodeSessionStatusMap,
  PermissionInfo,
  QuestionInfo,
} from "@/lib/tauri"
import { syncQueryKeys } from "./query-keys"

export type WorkspaceBootstrapLoaders = {
  sessions: () => Promise<OpenCodeSession[]>
  executionOptions: () => Promise<ExecutionOptions>
  commands: () => Promise<OpenCodeCommand[]>
  sessionStatus: () => Promise<OpenCodeSessionStatusMap>
  permissions: () => Promise<PermissionInfo[]>
  questions: () => Promise<QuestionInfo[]>
}

export function workspaceBootstrapKeys(baseUrl?: string | null, directory?: string | null) {
  return [
    syncQueryKeys.sessions(baseUrl, directory),
    syncQueryKeys.executionOptions(baseUrl, directory),
    syncQueryKeys.commands(baseUrl, directory),
    syncQueryKeys.sessionStatus(baseUrl, directory),
    syncQueryKeys.permissions(baseUrl, directory),
    syncQueryKeys.questions(baseUrl, directory),
  ] as const
}

export async function prefetchWorkspaceBootstrap(input: {
  queryClient: QueryClient
  baseUrl?: string | null
  directory?: string | null
  loaders: WorkspaceBootstrapLoaders
}) {
  const keys = workspaceBootstrapKeys(input.baseUrl, input.directory)
  await Promise.allSettled([
    input.queryClient.prefetchQuery({ queryKey: keys[0], queryFn: input.loaders.sessions }),
    input.queryClient.prefetchQuery({ queryKey: keys[1], queryFn: input.loaders.executionOptions, staleTime: 30_000 }),
    input.queryClient.prefetchQuery({ queryKey: keys[2], queryFn: input.loaders.commands, staleTime: 30_000 }),
    input.queryClient.prefetchQuery({ queryKey: keys[3], queryFn: input.loaders.sessionStatus }),
    input.queryClient.prefetchQuery({ queryKey: keys[4], queryFn: input.loaders.permissions }),
    input.queryClient.prefetchQuery({ queryKey: keys[5], queryFn: input.loaders.questions }),
  ])
}
