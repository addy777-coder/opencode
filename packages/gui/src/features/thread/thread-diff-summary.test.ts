import { describe, expect, test } from "bun:test"
import { asksForWorkspaceDiffSummary, shouldShowStandaloneThreadDiffSummary } from "./thread-diff-summary"
import type { OpenCodeMessage, SessionDiffFile } from "@/lib/tauri"

const diff: SessionDiffFile = {
  file: "src/app.tsx",
  patch: "@@ -1 +1 @@",
  additions: 1,
  deletions: 1,
  status: "modified",
  raw: null,
}

function message(role: string, text: string, parts: OpenCodeMessage["parts"] = []): OpenCodeMessage {
  return {
    id: `${role}-${text}`,
    role,
    text,
    parts,
    raw: null,
  }
}

describe("thread diff summary visibility", () => {
  test("does not show workspace diffs for a command-only request", () => {
    expect(
      shouldShowStandaloneThreadDiffSummary(
        [
          message("user", "调用sub agent 运行echo 你好"),
          message("assistant", "sub agent 已运行 echo 你好，命令成功。"),
        ],
        [diff],
      ),
    ).toBe(false)
  })

  test("shows workspace diffs for explicit review or diff requests", () => {
    expect(asksForWorkspaceDiffSummary("请审查当前改动")).toBe(true)
    expect(asksForWorkspaceDiffSummary("show git diff")).toBe(true)
    expect(
      shouldShowStandaloneThreadDiffSummary(
        [
          message("user", "请审查当前改动"),
          message("assistant", "好的。"),
        ],
        [diff],
      ),
    ).toBe(true)
  })

  test("uses the latest user turn instead of an older review request", () => {
    expect(
      shouldShowStandaloneThreadDiffSummary(
        [
          message("user", "请审查当前改动"),
          message("assistant", "这里是改动。"),
          message("user", "调用sub agent 运行echo 你好"),
          message("assistant", "命令成功。"),
        ],
        [diff],
      ),
    ).toBe(false)
  })

  test("does not show without diffs", () => {
    expect(shouldShowStandaloneThreadDiffSummary([message("user", "请审查当前改动")], [])).toBe(false)
  })
})
