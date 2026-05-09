import { describe, expect, test } from "bun:test"
import { findKeybindConflicts, normalizeKeybind } from "./keybinds"

describe("keybind helpers", () => {
  test("normalizes aliases and detects conflicts", () => {
    expect(normalizeKeybind("Command + Shift + P")).toBe("meta+shift+p")
    expect(
      findKeybindConflicts([
        { id: "one", keys: "Ctrl+K" },
        { id: "two", keys: "control+k" },
        { id: "three", keys: "alt+k" },
      ]),
    ).toEqual([{ keys: "ctrl+k", ids: ["one", "two"] }])
  })
})
