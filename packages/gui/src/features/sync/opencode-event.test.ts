import { describe, expect, test } from "bun:test"
import {
  getOpenCodeEventSessionId,
  getOpenCodeEventType,
  getOpenCodePartDelta,
  messageFromOpenCodeEvent,
  partUpdateFromOpenCodeEvent,
  sessionFromOpenCodeEvent,
} from "./opencode-event"

describe("opencode event parsing", () => {
  test("unwraps versioned sync events and extracts session info", () => {
    const payload = {
      type: "sync",
      syncEvent: {
        type: "session.updated.1",
        data: {
          info: {
            id: "ses_1",
            title: "Build cache",
            directory: "D:/repo",
            time: { created: 10, updated: 20 },
            summary: { files: 3 },
          },
        },
      },
    }

    expect(getOpenCodeEventType(payload)).toBe("session.updated")
    expect(getOpenCodeEventSessionId(payload)).toBe("ses_1")
    expect(sessionFromOpenCodeEvent(payload)).toEqual({
      id: "ses_1",
      title: "Build cache",
      directory: "D:/repo",
      path: undefined,
      parentId: undefined,
      projectName: null,
      updatedAt: 20,
      createdAt: 10,
      changedFiles: 3,
    })
  })

  test("normalizes message and part update payloads", () => {
    const messagePayload = {
      type: "message.updated",
      properties: {
        info: {
          id: "msg_1",
          sessionID: "ses_1",
          role: "assistant",
          time: { created: 100 },
        },
        parts: [{ id: "part_1", messageID: "msg_1", type: "text", text: "hello" }],
      },
    }

    expect(messageFromOpenCodeEvent(messagePayload)?.text).toBe("hello")

    const partPayload = {
      type: "message.part.updated",
      properties: {
        sessionID: "ses_1",
        part: { id: "part_2", messageID: "msg_1", type: "reasoning", text: "thinking" },
      },
    }

    expect(partUpdateFromOpenCodeEvent(partPayload)).toMatchObject({
      sessionId: "ses_1",
      messageId: "msg_1",
      partId: "part_2",
      part: { kind: "reasoning", text: "thinking" },
    })
  })

  test("keeps text deltas separate from cached part updates", () => {
    expect(
      getOpenCodePartDelta({
        type: "message.part.delta",
        properties: {
          sessionID: "ses_1",
          messageID: "msg_1",
          partID: "part_1",
          field: "text",
          delta: " world",
        },
      }),
    ).toEqual({
      sessionId: "ses_1",
      messageId: "msg_1",
      partId: "part_1",
      delta: " world",
    })
  })
})
