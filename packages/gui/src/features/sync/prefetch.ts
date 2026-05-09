import type { QueryClient, QueryKey } from "@tanstack/react-query"
import type { OpenCodeMessage, SessionDiffFile } from "@/lib/tauri"
import { syncQueryKeys } from "./query-keys"

export const SESSION_PREFETCH_TTL_MS = 15_000

type PrefetchInput<T> = {
  queryClient: QueryClient
  queryKey: QueryKey
  queryFn: () => Promise<T>
  ttlMs?: number
  force?: boolean
}

const inflight = new Map<string, Promise<unknown>>()
const lastPrefetch = new Map<string, number>()

export function clearSyncPrefetch() {
  inflight.clear()
  lastPrefetch.clear()
}

export function shouldPrefetchSession(input: {
  queryKey: QueryKey
  now?: number
  ttlMs?: number
  force?: boolean
  hasCachedData?: boolean
}) {
  if (input.force) return true
  if (input.hasCachedData) return false
  const id = stableKey(input.queryKey)
  const at = lastPrefetch.get(id)
  if (!at) return true
  return (input.now ?? Date.now()) - at >= (input.ttlMs ?? SESSION_PREFETCH_TTL_MS)
}

export function prefetchOnce<T>(input: PrefetchInput<T>) {
  const id = stableKey(input.queryKey)
  const cached = input.queryClient.getQueryData(input.queryKey)
  if (
    !shouldPrefetchSession({
      queryKey: input.queryKey,
      ttlMs: input.ttlMs,
      force: input.force,
      hasCachedData: cached !== undefined,
    })
  ) {
    return Promise.resolve()
  }
  const pending = inflight.get(id)
  if (pending) return pending.then(() => undefined)

  lastPrefetch.set(id, Date.now())
  const promise = input.queryClient
    .prefetchQuery({
      queryKey: input.queryKey,
      queryFn: input.queryFn,
      staleTime: input.ttlMs ?? SESSION_PREFETCH_TTL_MS,
    })
    .finally(() => {
      if (inflight.get(id) === promise) inflight.delete(id)
    })

  inflight.set(id, promise)
  return promise.then(() => undefined)
}

export function prefetchSessionMessages(input: {
  queryClient: QueryClient
  baseUrl?: string | null
  directory?: string | null
  sessionId: string
  limit?: number
  queryFn: () => Promise<OpenCodeMessage[]>
  force?: boolean
}) {
  return prefetchOnce({
    queryClient: input.queryClient,
    queryKey: syncQueryKeys.sessionMessages(input.baseUrl, input.directory, input.sessionId),
    queryFn: input.queryFn,
    force: input.force,
  })
}

export function prefetchSessionDiff(input: {
  queryClient: QueryClient
  baseUrl?: string | null
  directory?: string | null
  sessionId: string
  queryFn: () => Promise<SessionDiffFile[]>
  force?: boolean
}) {
  return prefetchOnce({
    queryClient: input.queryClient,
    queryKey: syncQueryKeys.sessionDiff(input.baseUrl, input.directory, input.sessionId),
    queryFn: input.queryFn,
    force: input.force,
  })
}

function stableKey(queryKey: QueryKey) {
  return JSON.stringify(queryKey)
}
