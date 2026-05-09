import { describe, expect, test } from "bun:test"
import { QueryClient } from "@tanstack/react-query"
import type { OpenCodeMessage, PermissionInfo } from "@/lib/tauri"
import { applyOpenCodeEventToQueryCache } from "./query-cache"
import { syncQueryKeys } from "./query-keys"

describe("sync query cache reducer", () => {
  test("updates cached session messages from message events", () => {
    const queryClient = new QueryClient()
    const key = syncQueryKeys.sessionMessages("http://server", "D:/repo", "ses_1")
    const initial: OpenCodeMessage[] = [
      {
        id: "msg_1",
        sessionId: "ses_1",
        role: "assistant",
        text: "",
        createdAt: 1,
        completedAt: null,
        parts: [],
        raw: {},
      },
    ]
    queryClient.setQueryData(key, initial)

    applyOpenCodeEventToQueryCache(
      queryClient,
      {
        directory: "D:/repo",
        payload: {
          type: "message.part.updated",
          properties: {
            sessionID: "ses_1",
            part: { id: "part_1", messageID: "msg_1", type: "text", text: "cached text" },
          },
        },
      },
      { baseUrl: "http://server" },
    )

    expect(queryClient.getQueryData<OpenCodeMessage[]>(key)?.[0]).toMatchObject({
      id: "msg_1",
      text: "cached text",
      parts: [{ id: "part_1", kind: "text", text: "cached text" }],
    })
  })

  test("removes replied permissions from the scoped cache", () => {
    const queryClient = new QueryClient()
    const key = syncQueryKeys.permissions("http://server", "D:/repo")
    const permission: PermissionInfo = {
      id: "perm_1",
      sessionId: "ses_1",
      permission: "edit",
      patterns: ["*.ts"],
      always: [],
      metadata: null,
      raw: {},
    }
    queryClient.setQueryData(key, [permission])

    applyOpenCodeEventToQueryCache(
      queryClient,
      {
        directory: "D:/repo",
        payload: {
          type: "permission.replied",
          properties: {
            sessionID: "ses_1",
            requestID: "perm_1",
          },
        },
      },
      { baseUrl: "http://server" },
    )

    expect(queryClient.getQueryData<PermissionInfo[]>(key)).toEqual([])
  })
})
