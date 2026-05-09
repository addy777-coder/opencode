export type PromptHistoryState = {
  items: string[]
  cursor: number | null
  draft: string
}

export function createPromptHistory(items: string[] = []): PromptHistoryState {
  return {
    items: dedupeHistory(items),
    cursor: null,
    draft: "",
  }
}

export function pushPromptHistory(state: PromptHistoryState, value: string, limit = 100): PromptHistoryState {
  const text = value.trim()
  if (!text) return { ...state, cursor: null, draft: "" }
  return {
    items: dedupeHistory([text, ...state.items]).slice(0, limit),
    cursor: null,
    draft: "",
  }
}

export function navigatePromptHistory(
  state: PromptHistoryState,
  direction: "previous" | "next",
  currentDraft: string,
): { state: PromptHistoryState; value: string } {
  if (!state.items.length) return { state, value: currentDraft }

  const draft = state.cursor === null ? currentDraft : state.draft
  const nextCursor =
    direction === "previous"
      ? state.cursor === null
        ? 0
        : Math.min(state.cursor + 1, state.items.length - 1)
      : state.cursor === null
        ? null
        : state.cursor - 1

  if (nextCursor === null || nextCursor < 0) {
    return {
      state: { ...state, cursor: null, draft: "" },
      value: draft,
    }
  }

  return {
    state: { ...state, cursor: nextCursor, draft },
    value: state.items[nextCursor] ?? draft,
  }
}

function dedupeHistory(items: string[]) {
  const seen = new Set<string>()
  const next: string[] = []
  for (const item of items) {
    const text = item.trim()
    if (!text || seen.has(text)) continue
    seen.add(text)
    next.push(text)
  }
  return next
}
