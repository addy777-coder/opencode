import { describe, expect, test } from "bun:test"
import { appendTerminalBuffer, migrateTerminalWorkspaceState, removeTerminalSession, terminalCacheKey, upsertTerminalSession } from "./terminal-state"
import { parsePtyCursorFrame, terminalWebSocketUrl } from "./terminal-url"

describe("terminal bridge helpers", () => {
  test("builds websocket URLs with tickets and directory routing", () => {
    expect(
      terminalWebSocketUrl({
        baseUrl: "http://127.0.0.1:4096/",
        ptyId: "pty_123",
        directory: "C:\\Repo",
        cursor: -1,
        ticket: "abc",
      }),
    ).toBe("ws://127.0.0.1:4096/pty/pty_123/connect?directory=C%3A%5CRepo&cursor=-1&ticket=abc")
  })

  test("parses cursor control frames", () => {
    const payload = new TextEncoder().encode(JSON.stringify({ cursor: 42 }))
    const frame = new Uint8Array(payload.length + 1)
    frame[0] = 0
    frame.set(payload, 1)
    expect(parsePtyCursorFrame(frame)).toBe(42)
  })

  test("migrates and updates local terminal state", () => {
    let state = migrateTerminalWorkspaceState({ active: "a", all: [{ id: "a", title: "A" }] })
    state = upsertTerminalSession(state, { id: "b", title: "B" })
    expect(state.activeId).toBe("a")
    state = removeTerminalSession(state, "a")
    expect(state.activeId).toBe("b")
    expect(appendTerminalBuffer("a", "b")).toBe("ab")
    expect(terminalCacheKey("http://localhost:4096", "C:\\Repo")).toBe("terminal:http://localhost:4096:C:\\Repo")
  })
})
