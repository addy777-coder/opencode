import { describe, expect, test } from "bun:test"
import { GUI_UPDATE_DEFER_COOLDOWN_MS, shouldSuppressDeferredUpdatePrompt } from "./update-settings"

describe("update prompt cooldown", () => {
  test("suppresses the same deferred version for one day", () => {
    const now = 200_000_000

    expect(
      shouldSuppressDeferredUpdatePrompt(
        { deferredUpdateVersion: "0.2.0", deferredUpdateAt: now - GUI_UPDATE_DEFER_COOLDOWN_MS + 1 },
        "0.2.0",
        now,
      ),
    ).toBe(true)

    expect(
      shouldSuppressDeferredUpdatePrompt(
        { deferredUpdateVersion: "0.2.0", deferredUpdateAt: now - GUI_UPDATE_DEFER_COOLDOWN_MS },
        "0.2.0",
        now,
      ),
    ).toBe(false)
  })

  test("does not suppress a different version", () => {
    expect(
      shouldSuppressDeferredUpdatePrompt({ deferredUpdateVersion: "0.2.0", deferredUpdateAt: 1_000 }, "0.2.1", 2_000),
    ).toBe(false)
  })
})
