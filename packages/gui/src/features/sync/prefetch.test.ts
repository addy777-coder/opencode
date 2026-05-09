import { describe, expect, test } from "bun:test"
import { shouldPrefetchSession } from "./prefetch"

describe("sync prefetch", () => {
  test("skips cached sessions and throttles recent misses", () => {
    const key = ["session-messages", "base", "dir", "ses_1"]
    expect(shouldPrefetchSession({ queryKey: key, hasCachedData: true })).toBe(false)
    expect(shouldPrefetchSession({ queryKey: key, hasCachedData: false, now: 10, ttlMs: 100 })).toBe(true)
  })

  test("allows forced prefetch", () => {
    expect(
      shouldPrefetchSession({
        queryKey: ["session-messages", "base", "dir", "ses_1"],
        hasCachedData: true,
        force: true,
      }),
    ).toBe(true)
  })
})
