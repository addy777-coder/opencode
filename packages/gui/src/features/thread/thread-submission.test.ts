import { describe, expect, test } from "bun:test"
import { LONG_INPUT_ATTACHMENT_THRESHOLD, preparePromptSubmission } from "./thread-submission"

const limits = {
  maxAttachments: 12,
  maxAttachmentBytes: 20 * 1024 * 1024,
  now: Date.UTC(2026, 4, 14, 12, 0, 0),
}

describe("prompt submission preparation", () => {
  test("keeps short input inline", () => {
    const result = preparePromptSubmission({
      text: "  hello  ",
      attachments: [],
      ...limits,
    })

    expect(result).toEqual({
      text: "hello",
      attachments: [],
      convertedLongInput: false,
    })
  })

  test("converts long input into a txt attachment", () => {
    const longText = `需求:\n${"请实现这个功能。".repeat(LONG_INPUT_ATTACHMENT_THRESHOLD)}`
    const result = preparePromptSubmission({
      text: longText,
      attachments: [],
      ...limits,
    })

    expect(result.convertedLongInput).toBe(true)
    expect(result.text).toContain("较长输入已整理到附件")
    expect(result.attachments).toHaveLength(1)
    expect(result.attachments[0].name).toBe("long-input-2026-05-14T12-00-00-000Z.txt")
    expect(result.attachments[0].mime).toBe("text/plain")
    expect(result.attachments[0].url).toStartWith("data:text/plain;base64,")
  })

  test("rejects conversion when attachment slots are full", () => {
    const attachments = Array.from({ length: limits.maxAttachments }, (_, index) => ({
      id: `${index}`,
      name: `${index}.txt`,
      mime: "text/plain",
      url: "data:text/plain;base64,WA==",
      size: 1,
    }))

    expect(() =>
      preparePromptSubmission({
        text: "x".repeat(LONG_INPUT_ATTACHMENT_THRESHOLD + 1),
        attachments,
        ...limits,
      }),
    ).toThrow("附件数量已达上限")
  })
})
