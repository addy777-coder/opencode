import { describe, expect, test } from "bun:test"
import { buildGuiDeepLink, parseGuiDeepLink } from "./deep-link"

describe("GUI deep links", () => {
  test("builds and parses session links", () => {
    const link = buildGuiDeepLink({
      type: "session",
      sessionId: "ses_123",
      directory: "D:/work/openCode",
      messageId: "msg_1",
    })
    expect(link).toBe("opencode-gui://session/ses_123?directory=D%3A%2Fwork%2FopenCode&message=msg_1")
    expect(parseGuiDeepLink(link)).toEqual({
      type: "session",
      sessionId: "ses_123",
      directory: "D:/work/openCode",
      messageId: "msg_1",
    })
  })

  test("parses hash links for project, file, and review targets", () => {
    expect(parseGuiDeepLink("#/project?directory=D%3A%2Fwork%2FopenCode")).toEqual({
      type: "project",
      directory: "D:/work/openCode",
    })
    expect(parseGuiDeepLink("#/file/src%2Fapp.tsx?line=12")).toEqual({
      type: "file",
      path: "src/app.tsx",
      directory: null,
      line: 12,
    })
    expect(parseGuiDeepLink("#/review?session=ses_123&file=src%2Fapp.tsx")).toEqual({
      type: "review",
      sessionId: "ses_123",
      directory: null,
      file: "src/app.tsx",
    })
  })
})
