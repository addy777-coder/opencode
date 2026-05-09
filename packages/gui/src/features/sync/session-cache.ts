export type CachedSession = {
  id: string
  title?: string | null
  updatedAt?: number | null
  [key: string]: unknown
}

export type CachedMessage = {
  id: string
  sessionId?: string | null
  [key: string]: unknown
}

export type SessionCacheState<TSession extends CachedSession = CachedSession, TMessage extends CachedMessage = CachedMessage> = {
  sessions: TSession[]
  messagesBySession: Record<string, TMessage[]>
  dirtySessions: Set<string>
}

export type OpenCodeCacheEvent = {
  type: string
  sessionId?: string | null
  session?: CachedSession | null
  message?: CachedMessage | null
  messageId?: string | null
}

export function createSessionCacheState<
  TSession extends CachedSession = CachedSession,
  TMessage extends CachedMessage = CachedMessage,
>(input?: Partial<SessionCacheState<TSession, TMessage>>): SessionCacheState<TSession, TMessage> {
  return {
    sessions: input?.sessions ?? [],
    messagesBySession: input?.messagesBySession ?? {},
    dirtySessions: input?.dirtySessions ?? new Set<string>(),
  }
}

export function applySessionCacheEvent<
  TSession extends CachedSession = CachedSession,
  TMessage extends CachedMessage = CachedMessage,
>(
  state: SessionCacheState<TSession, TMessage>,
  event: OpenCodeCacheEvent,
): SessionCacheState<TSession, TMessage> {
  const dirtySessions = new Set(state.dirtySessions)

  if (event.type === "session.deleted" && event.sessionId) {
    const { [event.sessionId]: _removed, ...messagesBySession } = state.messagesBySession
    dirtySessions.delete(event.sessionId)
    return {
      sessions: state.sessions.filter((session) => session.id !== event.sessionId),
      messagesBySession,
      dirtySessions,
    }
  }

  if ((event.type === "session.created" || event.type === "session.updated") && event.session?.id) {
    return {
      ...state,
      sessions: upsertById(state.sessions, event.session as TSession, compareSessionUpdatedDesc),
      dirtySessions,
    }
  }

  const sessionId = event.sessionId ?? event.message?.sessionId
  if (sessionId) dirtySessions.add(sessionId)

  if ((event.type === "message.updated" || event.type === "message.part.updated") && event.message?.id && sessionId) {
    return {
      ...state,
      messagesBySession: {
        ...state.messagesBySession,
        [sessionId]: upsertById(state.messagesBySession[sessionId] ?? [], event.message as TMessage),
      },
      dirtySessions,
    }
  }

  if (event.type === "message.removed" && event.messageId && sessionId) {
    return {
      ...state,
      messagesBySession: {
        ...state.messagesBySession,
        [sessionId]: (state.messagesBySession[sessionId] ?? []).filter((message) => message.id !== event.messageId),
      },
      dirtySessions,
    }
  }

  return { ...state, dirtySessions }
}

export function upsertById<T extends { id: string }>(
  items: T[],
  item: T,
  compare?: (left: T, right: T) => number,
) {
  const index = items.findIndex((current) => current.id === item.id)
  const next = index >= 0 ? [...items.slice(0, index), { ...items[index], ...item }, ...items.slice(index + 1)] : [item, ...items]
  return compare ? next.sort(compare) : next
}

function compareSessionUpdatedDesc(left: CachedSession, right: CachedSession) {
  return (right.updatedAt ?? 0) - (left.updatedAt ?? 0)
}
