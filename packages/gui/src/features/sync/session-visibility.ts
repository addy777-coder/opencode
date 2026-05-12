export type SidebarSessionVisibility = {
  parentId?: string | null
  archivedAt?: number | null
}

export function isTopLevelSession(session: SidebarSessionVisibility) {
  return !session.parentId
}

export function isVisibleSidebarSession(session: SidebarSessionVisibility) {
  return isTopLevelSession(session) && !session.archivedAt
}

export function filterVisibleSidebarSessions<T extends SidebarSessionVisibility>(sessions: readonly T[] | null | undefined) {
  return (sessions ?? []).filter(isVisibleSidebarSession)
}
