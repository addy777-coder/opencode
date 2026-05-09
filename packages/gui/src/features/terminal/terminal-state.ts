export type LocalPty = {
  id: string
  title: string
  cwd?: string | null
  status?: string | null
  cursor?: number
  buffer?: string
  rows?: number
  cols?: number
}

export type TerminalWorkspaceState = {
  activeId?: string
  sessions: LocalPty[]
}

const BUFFER_LIMIT = 160_000

export function migrateTerminalWorkspaceState(value: unknown): TerminalWorkspaceState {
  if (!isRecord(value)) return { sessions: [] }
  const seen = new Set<string>()
  const sessions = (Array.isArray(value.sessions) ? value.sessions : Array.isArray(value.all) ? value.all : [])
    .map(readLocalPty)
    .filter((session): session is LocalPty => {
      if (!session || seen.has(session.id)) return false
      seen.add(session.id)
      return true
    })
  const active = typeof value.activeId === "string" ? value.activeId : typeof value.active === "string" ? value.active : undefined
  return {
    activeId: active && seen.has(active) ? active : sessions[0]?.id,
    sessions,
  }
}

export function upsertTerminalSession(state: TerminalWorkspaceState, session: LocalPty): TerminalWorkspaceState {
  const index = state.sessions.findIndex((item) => item.id === session.id)
  const sessions =
    index >= 0
      ? [...state.sessions.slice(0, index), { ...state.sessions[index], ...session }, ...state.sessions.slice(index + 1)]
      : [...state.sessions, session]
  return {
    activeId: state.activeId ?? session.id,
    sessions,
  }
}

export function removeTerminalSession(state: TerminalWorkspaceState, id: string): TerminalWorkspaceState {
  const index = state.sessions.findIndex((session) => session.id === id)
  if (index < 0) return state
  const sessions = state.sessions.filter((session) => session.id !== id)
  const activeId = state.activeId === id ? sessions[Math.max(0, index - 1)]?.id ?? sessions[0]?.id : state.activeId
  return { activeId, sessions }
}

export function appendTerminalBuffer(current: string | undefined, chunk: string) {
  const next = `${current ?? ""}${chunk}`
  if (next.length <= BUFFER_LIMIT) return next
  return next.slice(next.length - BUFFER_LIMIT)
}

export function terminalCacheKey(baseUrl?: string | null, directory?: string | null) {
  return ["terminal", baseUrl?.trim() || "local", directory?.trim() || "workspace"].join(":")
}

function readLocalPty(value: unknown): LocalPty | null {
  if (!isRecord(value) || typeof value.id !== "string") return null
  return {
    id: value.id,
    title: typeof value.title === "string" && value.title.trim() ? value.title : `Terminal ${value.id.slice(-4)}`,
    cwd: typeof value.cwd === "string" ? value.cwd : null,
    status: typeof value.status === "string" ? value.status : null,
    cursor: numberValue(value.cursor),
    buffer: typeof value.buffer === "string" ? appendTerminalBuffer("", value.buffer) : undefined,
    rows: numberValue(value.rows),
    cols: numberValue(value.cols),
  }
}

function numberValue(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value))
}
