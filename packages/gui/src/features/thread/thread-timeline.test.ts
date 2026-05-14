import { describe, expect, test } from "bun:test"
import { buildThreadTimelineItems, timelineMessagePreview } from "./thread-timeline"

describe("thread timeline helpers", () => {
  test("hides timeline for short conversations", () => {
    const items = buildThreadTimelineItems(
      [
        { id: "1", role: "user", text: "hello" },
        { id: "2", role: "assistant", text: "hi" },
      ],
      { minItems: 3 },
    )

    expect(items).toEqual([])
  })

  test("builds markers only for major user turn nodes", () => {
    const messages = Array.from({ length: 8 }, (_, index) => ({
      id: `${index}`,
      role: index % 2 === 0 ? "user" : "assistant",
      text: `message ${index}`,
      createdAt: index,
    }))
    const items = buildThreadTimelineItems(messages, { minItems: 4 })

    expect(items).toEqual([
      { id: "0", role: "user", label: "用户", preview: "message 0", createdAt: 0, status: undefined },
      { id: "2", role: "user", label: "用户", preview: "message 2", createdAt: 2, status: undefined },
      { id: "4", role: "user", label: "用户", preview: "message 4", createdAt: 4, status: undefined },
      { id: "6", role: "user", label: "用户", preview: "message 6", createdAt: 6, status: undefined },
    ])
  })

  test("falls back to file part titles and truncates preview", () => {
    expect(
      timelineMessagePreview(
        {
          id: "file",
          role: "user",
          parts: [{ kind: "file", title: "very-long-file-name.txt" }],
        },
        10,
      ),
    ).toBe("very-long…")
  })
})
