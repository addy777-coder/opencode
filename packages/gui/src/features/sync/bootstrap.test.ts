import { describe, expect, test } from "bun:test"
import { workspaceBootstrapKeys } from "./bootstrap"

describe("workspace bootstrap", () => {
  test("declares the workspace data that should be warmed together", () => {
    expect(workspaceBootstrapKeys("base", "dir")).toEqual([
      ["sessions", "base", "dir"],
      ["execution-options", "base", "dir"],
      ["commands", "base", "dir"],
      ["session-status", "base", "dir"],
      ["permissions", "base", "dir"],
      ["questions", "base", "dir"],
    ])
  })
})
