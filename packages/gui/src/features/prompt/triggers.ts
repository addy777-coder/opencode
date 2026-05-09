export type PromptTriggerKind = "@" | "/"

export type PromptTrigger = {
  kind: PromptTriggerKind
  start: number
  query: string
}

const tokenBoundary = new Set([" ", "\n", "\t"])

export function parsePromptTrigger(text: string, caret: number): PromptTrigger | null {
  const safeCaret = Math.max(0, Math.min(caret, text.length))
  let index = safeCaret - 1

  while (index >= 0) {
    const char = text[index]
    if (char === "@" || char === "/") {
      const previous = index > 0 ? text[index - 1] : "\n"
      if (index === 0 || tokenBoundary.has(previous)) {
        return {
          kind: char,
          start: index,
          query: text.slice(index + 1, safeCaret),
        }
      }
      if (char === "/") {
        index -= 1
        continue
      }
      return null
    }
    if (tokenBoundary.has(char)) return null
    index -= 1
  }

  return null
}

export function applyPromptSuggestion(input: {
  text: string
  caret: number
  trigger: PromptTrigger
  value: string
}) {
  const insert = input.trigger.kind === "/" ? input.value : `@${input.value}`
  const before = input.text.slice(0, input.trigger.start)
  const after = input.text.slice(input.caret).replace(/^\s+/, "")
  const text = `${before}${insert} ${after}`
  return {
    text,
    caret: before.length + insert.length + 1,
  }
}
