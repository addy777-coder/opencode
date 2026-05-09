import { describe, expect, test } from "bun:test"
import { applySessionCacheEvent, createSessionCacheState } from "./session-cache"

describe("session cache reducer", () => {
  test("upserts sessions and removes deleted sessions with messages", () => {
    let state = createSessionCacheState()
    state = applySessionCacheEvent(state, { type: "session.created", session: { id: "s1", title: "One", updatedAt: 1 } })
    state = applySessionCacheEvent(state, { type: "session.updated", session: { id: "s1", title: "Renamed", updatedAt: 2 } })
    state = applySessionCacheEvent(state, { type: "message.updated", sessionId: "s1", message: { id: "m1", text: "hello" } })
    expect(state.sessions[0]?.title).toBe("Renamed")
    expect(state.messagesBySession.s1?.[0]?.id).toBe("m1")
    expect(state.dirtySessions.has("s1")).toBe(true)

    state = applySessionCacheEvent(state, { type: "session.deleted", sessionId: "s1" })
    expect(state.sessions).toEqual([])
    expect(state.messagesBySession.s1).toBeUndefined()
  })
})
