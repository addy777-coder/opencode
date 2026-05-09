export const PTY_CONNECT_TICKET_QUERY = "ticket"

export function terminalWebSocketUrl(input: {
  baseUrl: string
  ptyId: string
  directory?: string | null
  cursor?: number
  ticket?: string | null
}) {
  const next = new URL(`${input.baseUrl.replace(/\/+$/, "")}/pty/${encodeURIComponent(input.ptyId)}/connect`)
  if (input.directory?.trim()) next.searchParams.set("directory", input.directory.trim())
  next.searchParams.set("cursor", String(input.cursor ?? 0))
  if (input.ticket?.trim()) next.searchParams.set(PTY_CONNECT_TICKET_QUERY, input.ticket.trim())
  next.protocol = next.protocol === "https:" ? "wss:" : "ws:"
  return next.toString()
}

export function parsePtyCursorFrame(data: ArrayBuffer | Uint8Array) {
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data)
  if (bytes[0] !== 0) return null
  try {
    const json = new TextDecoder().decode(bytes.subarray(1))
    const parsed = JSON.parse(json) as { cursor?: unknown }
    return typeof parsed.cursor === "number" && Number.isSafeInteger(parsed.cursor) ? parsed.cursor : null
  } catch {
    return null
  }
}
