import { describe, expect, test } from "bun:test"
import { createPromptHistory, navigatePromptHistory, pushPromptHistory } from "./history"
import { buildPromptRequestParts } from "./request-parts"
import { applyPromptSuggestion, parsePromptTrigger } from "./triggers"

describe("prompt trigger parsing", () => {
  test("detects file and slash triggers at token boundaries", () => {
    expect(parsePromptTrigger("open @src/app", 13)).toEqual({ kind: "@", start: 5, query: "src/app" })
    expect(parsePromptTrigger("/review", 7)).toEqual({ kind: "/", start: 0, query: "review" })
    expect(parsePromptTrigger("email@host", 10)).toBeNull()
  })

  test("applies suggestions and preserves trailing text", () => {
    const text = "read @src then"
    const trigger = parsePromptTrigger(text, 9)
    expect(trigger).toBeTruthy()
    expect(applyPromptSuggestion({ text, caret: 9, trigger: trigger!, value: "src/main.ts" })).toEqual({
      text: "read @src/main.ts then",
      caret: 18,
    })
  })
})

describe("prompt request parts", () => {
  test("builds text and valid attachment parts", () => {
    expect(
      buildPromptRequestParts("  hello  ", [
        { mime: " image/png ", url: " data:image/png;base64,abc ", filename: " shot.png " },
        { mime: "", url: "x" },
      ]),
    ).toEqual([
      { type: "text", text: "hello" },
      { type: "file", mime: "image/png", url: "data:image/png;base64,abc", filename: "shot.png" },
    ])
  })
})

describe("prompt history", () => {
  test("dedupes pushes and restores the draft after navigation", () => {
    let state = createPromptHistory()
    state = pushPromptHistory(state, "first")
    state = pushPromptHistory(state, "second")
    state = pushPromptHistory(state, "first")
    expect(state.items).toEqual(["first", "second"])

    const previous = navigatePromptHistory(state, "previous", "draft")
    expect(previous.value).toBe("first")
    const older = navigatePromptHistory(previous.state, "previous", "draft")
    expect(older.value).toBe("second")
    const next = navigatePromptHistory(older.state, "next", "ignored")
    expect(next.value).toBe("first")
    const draft = navigatePromptHistory(next.state, "next", "ignored")
    expect(draft.value).toBe("draft")
  })
})
