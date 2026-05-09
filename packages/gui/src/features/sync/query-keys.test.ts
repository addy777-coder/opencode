import { describe, expect, test } from "bun:test"
import { matchesScopedQueryKey } from "./query-keys"

describe("sync query keys", () => {
  test("treats missing scope values as wildcards", () => {
    const key = ["session-messages", "base", "dir", "session"]
    expect(matchesScopedQueryKey(key, { root: "session-messages", baseUrl: "base", directory: "dir" })).toBe(true)
    expect(matchesScopedQueryKey(key, { root: "session-messages", directory: null, sessionId: null })).toBe(true)
    expect(matchesScopedQueryKey(key, { root: "session-messages", sessionId: "other" })).toBe(false)
  })
})
