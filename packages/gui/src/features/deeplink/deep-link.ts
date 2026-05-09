export type GuiDeepLinkTarget =
  | { type: "project"; directory: string }
  | { type: "session"; sessionId: string; directory?: string | null; messageId?: string | null }
  | { type: "file"; path: string; directory?: string | null; line?: number | null }
  | { type: "review"; sessionId?: string | null; directory?: string | null; file?: string | null }

export function buildGuiDeepLink(target: GuiDeepLinkTarget) {
  const params = new URLSearchParams()
  if ("directory" in target && target.directory?.trim()) params.set("directory", target.directory.trim())

  if (target.type === "project") {
    return `opencode-gui://project?${params.toString()}`
  }

  if (target.type === "session") {
    if (target.messageId?.trim()) params.set("message", target.messageId.trim())
    const query = params.toString()
    return `opencode-gui://session/${encodeURIComponent(target.sessionId)}${query ? `?${query}` : ""}`
  }

  if (target.type === "file") {
    params.set("path", target.path)
    if (target.line && target.line > 0) params.set("line", String(Math.floor(target.line)))
    return `opencode-gui://file?${params.toString()}`
  }

  if (target.sessionId?.trim()) params.set("session", target.sessionId.trim())
  if (target.file?.trim()) params.set("file", target.file.trim())
  const query = params.toString()
  return `opencode-gui://review${query ? `?${query}` : ""}`
}

export function parseGuiDeepLink(value: string): GuiDeepLinkTarget | null {
  const source = value.trim()
  if (!source) return null
  return parseUrlLike(source) ?? parseHashLike(source)
}

function parseUrlLike(source: string): GuiDeepLinkTarget | null {
  let url: URL
  try {
    url = new URL(source)
  } catch {
    return null
  }
  if (url.protocol !== "opencode-gui:") return parseHashLike(url.hash)
  const route = normalizeRoute([url.hostname, url.pathname].filter(Boolean).join("/"))
  return targetFromRoute(route, url.searchParams)
}

function parseHashLike(source: string): GuiDeepLinkTarget | null {
  const hashIndex = source.indexOf("#")
  const hash = hashIndex >= 0 ? source.slice(hashIndex + 1) : source
  const normalized = hash.replace(/^\/+/, "")
  if (!normalized) return null
  const [routePart, queryPart = ""] = normalized.split("?", 2)
  return targetFromRoute(normalizeRoute(routePart), new URLSearchParams(queryPart))
}

function targetFromRoute(route: string, params: URLSearchParams): GuiDeepLinkTarget | null {
  const [kind, ...parts] = route.split("/").filter(Boolean)
  if (kind === "project") {
    const directory = params.get("directory")?.trim()
    return directory ? { type: "project", directory } : null
  }
  if (kind === "session") {
    const sessionId = decodePart(parts[0])
    if (!sessionId) return null
    return {
      type: "session",
      sessionId,
      directory: params.get("directory"),
      messageId: params.get("message"),
    }
  }
  if (kind === "file") {
    const path = params.get("path")?.trim() || decodePart(parts.join("/"))
    if (!path) return null
    return {
      type: "file",
      path,
      directory: params.get("directory"),
      line: positiveInteger(params.get("line")),
    }
  }
  if (kind === "review") {
    return {
      type: "review",
      sessionId: params.get("session"),
      directory: params.get("directory"),
      file: params.get("file"),
    }
  }
  return null
}

function normalizeRoute(value: string) {
  return value.replace(/^\/+/, "").replace(/\/+$/, "")
}

function decodePart(value?: string) {
  if (!value) return null
  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}

function positiveInteger(value: string | null) {
  if (!value) return null
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null
}
