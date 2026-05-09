import type { QueryClient } from "@tanstack/react-query"
import type {
  OpenCodeEventEnvelope,
  OpenCodeMessage,
  OpenCodeMessagePart,
  OpenCodeSession,
  OpenCodeSessionStatusMap,
  PermissionInfo,
  QuestionInfo,
  SessionDiffFile,
} from "@/lib/tauri"
import {
  diffsFromOpenCodeEvent,
  getOpenCodeEventSessionId,
  messageFromOpenCodeEvent,
  partRemovalFromOpenCodeEvent,
  partUpdateFromOpenCodeEvent,
  permissionFromOpenCodeEvent,
  permissionReplyFromOpenCodeEvent,
  questionFromOpenCodeEvent,
  questionReplyFromOpenCodeEvent,
  removedMessageFromOpenCodeEvent,
  sessionFromOpenCodeEvent,
  statusFromOpenCodeEvent,
  unwrapOpenCodeEvent,
} from "./opencode-event"
import { matchesScopedQueryKey, type SyncQueryTarget } from "./query-keys"

export type SyncEventApplyResult = {
  type: string | null
  sessionId?: string | null
  directory?: string | null
}

export function applyOpenCodeEventToQueryCache(
  queryClient: QueryClient,
  envelope: OpenCodeEventEnvelope,
  scope: {
    baseUrl?: string | null
    directory?: string | null
  } = {},
): SyncEventApplyResult {
  const event = unwrapOpenCodeEvent(envelope.payload)
  if (!event) return { type: null }

  const session = sessionFromOpenCodeEvent(envelope.payload, envelope.directory ?? scope.directory)
  const sessionId = getOpenCodeEventSessionId(envelope.payload)
  const directory = envelope.directory ?? session?.directory ?? scope.directory ?? null
  const target = { baseUrl: scope.baseUrl, directory, sessionId: sessionId ?? session?.id }

  switch (event.type) {
    case "session.created":
    case "session.updated": {
      if (session) upsertSession(queryClient, target, session)
      invalidateSessions(queryClient, target)
      break
    }
    case "session.deleted": {
      const id = session?.id ?? sessionId
      if (id) {
        removeSession(queryClient, { ...target, sessionId: id })
        removeSessionQueries(queryClient, { ...target, sessionId: id })
      }
      invalidateSessions(queryClient, target)
      break
    }
    case "session.status": {
      const status = statusFromOpenCodeEvent(envelope.payload)
      if (status && target.sessionId) updateSessionStatus(queryClient, target, status)
      else invalidateSessionStatus(queryClient, target)
      break
    }
    case "session.idle":
    case "session.error":
    case "session.next.step.failed": {
      const status = statusFromOpenCodeEvent(envelope.payload)
      if (status && target.sessionId) updateSessionStatus(queryClient, target, status)
      invalidateSessionStatus(queryClient, target)
      if (target.sessionId) invalidateSessionMessages(queryClient, target)
      break
    }
    case "message.updated": {
      const message = messageFromOpenCodeEvent(envelope.payload)
      if (message) upsertMessage(queryClient, { ...target, sessionId: message.sessionId ?? target.sessionId }, message)
      else invalidateSessionMessages(queryClient, target)
      break
    }
    case "message.removed": {
      const removed = removedMessageFromOpenCodeEvent(envelope.payload)
      if (removed) removeMessage(queryClient, { ...target, sessionId: removed.sessionId ?? target.sessionId }, removed.messageId)
      else invalidateSessionMessages(queryClient, target)
      break
    }
    case "message.part.updated": {
      const update = partUpdateFromOpenCodeEvent(envelope.payload)
      if (update?.part) {
        const messageTarget = { ...target, sessionId: update.sessionId ?? target.sessionId }
        const hadMessage = hasCachedMessage(queryClient, messageTarget, update.messageId)
        upsertMessagePart(queryClient, messageTarget, update.messageId, update.part)
        if (!hadMessage) invalidateSessionMessages(queryClient, messageTarget)
      } else {
        invalidateSessionMessages(queryClient, target)
      }
      break
    }
    case "message.part.removed": {
      const removed = partRemovalFromOpenCodeEvent(envelope.payload)
      if (removed) {
        removeMessagePart(queryClient, { ...target, sessionId: removed.sessionId ?? target.sessionId }, removed.messageId, removed.partId)
      } else {
        invalidateSessionMessages(queryClient, target)
      }
      break
    }
    case "session.next.text.ended":
    case "session.next.step.ended":
      invalidateSessionMessages(queryClient, target)
      break
    case "session.diff": {
      const diffs = diffsFromOpenCodeEvent(envelope.payload)
      if (diffs && target.sessionId) setSessionDiff(queryClient, target, diffs)
      else invalidateSessionDiff(queryClient, target)
      break
    }
    case "file.edited":
      invalidateSessionDiff(queryClient, target)
      invalidateGitStatus(queryClient, directory)
      break
    case "permission.asked": {
      const permission = permissionFromOpenCodeEvent(envelope.payload)
      if (permission) upsertPermission(queryClient, target, permission)
      else invalidatePermissions(queryClient, target)
      break
    }
    case "permission.replied": {
      const reply = permissionReplyFromOpenCodeEvent(envelope.payload)
      if (reply) removePermission(queryClient, { ...target, sessionId: reply.sessionId ?? target.sessionId }, reply.requestId)
      else invalidatePermissions(queryClient, target)
      break
    }
    case "question.asked": {
      const question = questionFromOpenCodeEvent(envelope.payload)
      if (question) upsertQuestion(queryClient, target, question)
      else invalidateQuestions(queryClient, target)
      break
    }
    case "question.replied":
    case "question.rejected": {
      const reply = questionReplyFromOpenCodeEvent(envelope.payload)
      if (reply) removeQuestion(queryClient, { ...target, sessionId: reply.sessionId ?? target.sessionId }, reply.requestId)
      else invalidateQuestions(queryClient, target)
      break
    }
  }

  return { type: event.type, sessionId: target.sessionId, directory }
}

export function invalidateSessionMessages(queryClient: QueryClient, target: SyncQueryTarget) {
  void queryClient.invalidateQueries({
    predicate: (query) =>
      matchesScopedQueryKey(query.queryKey, {
        root: "session-messages",
        baseUrl: target.baseUrl,
        directory: target.directory,
        sessionId: target.sessionId,
      }),
  })
}

export function invalidateSessionDiff(queryClient: QueryClient, target: SyncQueryTarget) {
  void queryClient.invalidateQueries({
    predicate: (query) =>
      matchesScopedQueryKey(query.queryKey, {
        root: "session-diff",
        baseUrl: target.baseUrl,
        directory: target.directory,
        sessionId: target.sessionId,
      }),
  })
}

export function invalidateSessions(queryClient: QueryClient, target: SyncQueryTarget) {
  void queryClient.invalidateQueries({
    predicate: (query) =>
      matchesScopedQueryKey(query.queryKey, {
        root: "sessions",
        baseUrl: target.baseUrl,
        directory: target.directory,
      }),
  })
}

export function invalidateSessionStatus(queryClient: QueryClient, target: SyncQueryTarget) {
  void queryClient.invalidateQueries({
    predicate: (query) =>
      matchesScopedQueryKey(query.queryKey, {
        root: "session-status",
        baseUrl: target.baseUrl,
        directory: target.directory,
      }),
  })
}

export function invalidatePermissions(queryClient: QueryClient, target: SyncQueryTarget) {
  void queryClient.invalidateQueries({
    predicate: (query) =>
      matchesScopedQueryKey(query.queryKey, {
        root: "permissions",
        baseUrl: target.baseUrl,
        directory: target.directory,
      }),
  })
}

export function invalidateQuestions(queryClient: QueryClient, target: SyncQueryTarget) {
  void queryClient.invalidateQueries({
    predicate: (query) =>
      matchesScopedQueryKey(query.queryKey, {
        root: "questions",
        baseUrl: target.baseUrl,
        directory: target.directory,
      }),
  })
}

export function invalidateGitStatus(queryClient: QueryClient, directory?: string | null) {
  if (!directory) return
  void queryClient.invalidateQueries({
    predicate: (query) => query.queryKey[0] === "git-status" && query.queryKey[1] === directory,
  })
}

function sessionQueries(target: SyncQueryTarget) {
  return {
    predicate: (query: { queryKey: readonly unknown[] }) =>
      matchesScopedQueryKey(query.queryKey, {
        root: "sessions",
        baseUrl: target.baseUrl,
        directory: target.directory,
      }),
  }
}

function messageQueries(target: SyncQueryTarget) {
  return {
    predicate: (query: { queryKey: readonly unknown[] }) =>
      matchesScopedQueryKey(query.queryKey, {
        root: "session-messages",
        baseUrl: target.baseUrl,
        directory: target.directory,
        sessionId: target.sessionId,
      }),
  }
}

function upsertSession(queryClient: QueryClient, target: SyncQueryTarget, session: OpenCodeSession) {
  queryClient.setQueriesData<OpenCodeSession[]>(sessionQueries(target), (current) => {
    if (!current) return current
    return upsertById(current, session, compareSessionUpdatedDesc)
  })
}

function removeSession(queryClient: QueryClient, target: SyncQueryTarget) {
  if (!target.sessionId) return
  queryClient.setQueriesData<OpenCodeSession[]>(sessionQueries(target), (current) =>
    current?.filter((session) => session.id !== target.sessionId) ?? current,
  )
}

function removeSessionQueries(queryClient: QueryClient, target: SyncQueryTarget) {
  if (!target.sessionId) return
  queryClient.removeQueries(messageQueries(target))
  queryClient.removeQueries({
    predicate: (query) =>
      matchesScopedQueryKey(query.queryKey, {
        root: "session-diff",
        baseUrl: target.baseUrl,
        directory: target.directory,
        sessionId: target.sessionId,
      }),
  })
}

function updateSessionStatus(queryClient: QueryClient, target: SyncQueryTarget, status: OpenCodeSessionStatusMap[string]) {
  if (!target.sessionId) return
  queryClient.setQueriesData<OpenCodeSessionStatusMap>(
    {
      predicate: (query) =>
        matchesScopedQueryKey(query.queryKey, {
          root: "session-status",
          baseUrl: target.baseUrl,
          directory: target.directory,
        }),
    },
    (current) => ({
      ...(current ?? {}),
      [target.sessionId!]: status,
    }),
  )
}

function upsertMessage(queryClient: QueryClient, target: SyncQueryTarget, message: OpenCodeMessage) {
  if (!target.sessionId) return
  queryClient.setQueriesData<OpenCodeMessage[]>(messageQueries(target), (current) => {
    if (!current) return current
    return upsertById(current, message, compareMessageCreatedAsc)
  })
}

function removeMessage(queryClient: QueryClient, target: SyncQueryTarget, messageId: string) {
  queryClient.setQueriesData<OpenCodeMessage[]>(messageQueries(target), (current) =>
    current?.filter((message) => message.id !== messageId) ?? current,
  )
}

function upsertMessagePart(queryClient: QueryClient, target: SyncQueryTarget, messageId: string, part: OpenCodeMessagePart) {
  queryClient.setQueriesData<OpenCodeMessage[]>(messageQueries(target), (current) => {
    if (!current) return current
    return current.map((message) => {
      if (message.id !== messageId) return message
      const parts = upsertPart(message.parts, part)
      return { ...message, parts, text: messageTextFromParts(parts) || message.text }
    })
  })
}

function hasCachedMessage(queryClient: QueryClient, target: SyncQueryTarget, messageId: string) {
  return queryClient
    .getQueriesData<OpenCodeMessage[]>(messageQueries(target))
    .some(([, messages]) => messages?.some((message) => message.id === messageId))
}

function removeMessagePart(queryClient: QueryClient, target: SyncQueryTarget, messageId: string, partId: string) {
  queryClient.setQueriesData<OpenCodeMessage[]>(messageQueries(target), (current) => {
    if (!current) return current
    return current.map((message) => {
      if (message.id !== messageId) return message
      const parts = message.parts.filter((part) => part.id !== partId)
      return { ...message, parts, text: messageTextFromParts(parts) || message.text }
    })
  })
}

function setSessionDiff(queryClient: QueryClient, target: SyncQueryTarget, diffs: SessionDiffFile[]) {
  if (!target.sessionId) return
  queryClient.setQueriesData<SessionDiffFile[]>(
    {
      predicate: (query) =>
        matchesScopedQueryKey(query.queryKey, {
          root: "session-diff",
          baseUrl: target.baseUrl,
          directory: target.directory,
          sessionId: target.sessionId,
        }),
    },
    diffs,
  )
}

function upsertPermission(queryClient: QueryClient, target: SyncQueryTarget, permission: PermissionInfo) {
  queryClient.setQueriesData<PermissionInfo[]>(
    {
      predicate: (query) =>
        matchesScopedQueryKey(query.queryKey, {
          root: "permissions",
          baseUrl: target.baseUrl,
          directory: target.directory,
        }),
    },
    (current) => upsertById(current ?? [], permission, compareIdAsc),
  )
}

function removePermission(queryClient: QueryClient, target: SyncQueryTarget, requestId: string) {
  queryClient.setQueriesData<PermissionInfo[]>(
    {
      predicate: (query) =>
        matchesScopedQueryKey(query.queryKey, {
          root: "permissions",
          baseUrl: target.baseUrl,
          directory: target.directory,
        }),
    },
    (current) => current?.filter((permission) => permission.id !== requestId) ?? current,
  )
}

function upsertQuestion(queryClient: QueryClient, target: SyncQueryTarget, question: QuestionInfo) {
  queryClient.setQueriesData<QuestionInfo[]>(
    {
      predicate: (query) =>
        matchesScopedQueryKey(query.queryKey, {
          root: "questions",
          baseUrl: target.baseUrl,
          directory: target.directory,
        }),
    },
    (current) => upsertById(current ?? [], question, compareIdAsc),
  )
}

function removeQuestion(queryClient: QueryClient, target: SyncQueryTarget, requestId: string) {
  queryClient.setQueriesData<QuestionInfo[]>(
    {
      predicate: (query) =>
        matchesScopedQueryKey(query.queryKey, {
          root: "questions",
          baseUrl: target.baseUrl,
          directory: target.directory,
        }),
    },
    (current) => current?.filter((question) => question.id !== requestId) ?? current,
  )
}

function upsertById<T extends { id: string }>(items: readonly T[], item: T, compare?: (left: T, right: T) => number) {
  const index = items.findIndex((current) => current.id === item.id)
  const next =
    index >= 0
      ? [...items.slice(0, index), { ...items[index], ...item }, ...items.slice(index + 1)]
      : [...items, item]
  return compare ? next.sort(compare) : next
}

function upsertPart(parts: readonly OpenCodeMessagePart[], part: OpenCodeMessagePart) {
  const key = part.id
  if (!key) return [...parts, part]
  const index = parts.findIndex((current) => current.id === key)
  return index >= 0
    ? [...parts.slice(0, index), { ...parts[index], ...part }, ...parts.slice(index + 1)]
    : [...parts, part]
}

function messageTextFromParts(parts: readonly OpenCodeMessagePart[]) {
  return parts
    .filter((part) => part.kind === "text")
    .map((part) => part.text?.trim())
    .filter(Boolean)
    .join("\n\n")
}

function compareIdAsc(left: { id: string }, right: { id: string }) {
  return left.id.localeCompare(right.id)
}

function compareSessionUpdatedDesc(left: OpenCodeSession, right: OpenCodeSession) {
  return (right.updatedAt ?? 0) - (left.updatedAt ?? 0)
}

function compareMessageCreatedAsc(left: OpenCodeMessage, right: OpenCodeMessage) {
  return (left.createdAt ?? 0) - (right.createdAt ?? 0) || left.id.localeCompare(right.id)
}
