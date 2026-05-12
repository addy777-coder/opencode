import { describe, expect, test } from "bun:test"
import {
  fallbackProgressStepsFromActivities,
  generatedResultsFromDiffs,
  sourceSummariesFromActivities,
} from "./thread-progress-summary"
import type { SessionDiffFile, ThreadActivityItem } from "@/lib/tauri"

type ActivityInput = {
  id: string
  kind: string
  title: string
  status?: ThreadActivityItem["status"]
  sourceEventType?: string
  sessionId?: string | null
  directory?: string | null
  createdAt?: number
  detail?: string | null
  raw?: unknown
}

function activity(input: ActivityInput): ThreadActivityItem {
  return {
    id: input.id,
    kind: input.kind,
    title: input.title,
    status: "success",
    sourceEventType: `message.part.${input.kind}`,
    sessionId: null,
    directory: null,
    createdAt: 1,
    detail: null,
    raw: null,
    ...input,
  }
}

const diff: SessionDiffFile = {
  file: "docs/design.md",
  patch: "",
  additions: 2,
  deletions: 1,
  status: "modified",
  raw: null,
}

describe("thread progress summary", () => {
  test("builds generated result rows from diffs", () => {
    expect(generatedResultsFromDiffs([diff]).rows).toEqual([
      {
        id: "generated:docs/design.md",
        file: "docs/design.md",
        label: "design.md",
        detail: "docs/design.md",
        additions: 2,
        deletions: 1,
        status: "modified",
      },
    ])
  })

  test("infers source categories without exposing raw tool rows", () => {
    expect(
      sourceSummariesFromActivities([
        activity({ id: "1", kind: "tool", title: "Exa Web Search \"react popover\"" }),
        activity({ id: "2", kind: "tool", title: "Read packages/gui/src/app.tsx", raw: { tool: "read" } }),
      ]).map((item) => item.label),
    ).toEqual(["网页搜索", "工作区上下文"])
  })

  test("conservatively groups raw events into progress steps", () => {
    expect(
      fallbackProgressStepsFromActivities(
        [
          activity({ id: "1", kind: "approval", title: "权限请求已处理" }),
          activity({ id: "2", kind: "command", title: "bun typecheck" }),
          activity({ id: "3", kind: "file_edit", title: "检测到线程文件变更" }),
        ],
        false,
        false,
      ).map((item) => item.label),
    ).toEqual(["处理文件变更", "验证结果"])
  })
})
