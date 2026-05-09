import { describe, expect, test } from "bun:test"
import { buildReviewCommentPrompt, commentAnchorKey } from "./comments"
import { isPathInsideWorkspace, pathKey, relativeWorkspacePath, resolveWorkspacePath } from "./path"

describe("file path helpers", () => {
  test("normalizes paths for cache keys and workspace operations", () => {
    expect(pathKey("C:\\Repo\\SRC\\file.ts")).toBe("c:/repo/src/file.ts")
    expect(resolveWorkspacePath("src/app.ts", "C:\\Repo")).toBe("C:\\Repo/src/app.ts")
    expect(relativeWorkspacePath("C:\\Repo\\src\\app.ts", "C:\\Repo")).toBe("src/app.ts")
    expect(isPathInsideWorkspace("C:\\Repo\\src\\app.ts", "C:\\Repo")).toBe(true)
  })
})

describe("review comments", () => {
  test("builds a prompt-ready comment summary", () => {
    expect(
      buildReviewCommentPrompt([
        { file: "src/app.ts", line: 12, body: "  Extract this. " },
        { file: " ", body: "ignored" },
      ]),
    ).toContain("src/app.ts:12")
    expect(commentAnchorKey({ file: "src\\app.ts", line: 12 })).toBe("src/app.ts:12:new")
  })
})
