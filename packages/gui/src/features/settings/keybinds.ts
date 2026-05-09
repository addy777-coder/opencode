export type KeybindDefinition = {
  id: string
  label?: string
  keys: string
}

export type KeybindConflict = {
  keys: string
  ids: string[]
}

export function normalizeKeybind(value: string) {
  return value
    .split("+")
    .map((part) => part.trim().toLowerCase())
    .filter(Boolean)
    .map((part) => {
      if (part === "control") return "ctrl"
      if (part === "cmd" || part === "command") return "meta"
      if (part === "option") return "alt"
      if (part === "escape") return "esc"
      return part
    })
    .sort((left, right) => keyOrder(left) - keyOrder(right) || left.localeCompare(right))
    .join("+")
}

export function findKeybindConflicts(definitions: KeybindDefinition[]) {
  const byKeys = new Map<string, string[]>()
  for (const definition of definitions) {
    const keys = normalizeKeybind(definition.keys)
    if (!keys) continue
    byKeys.set(keys, [...(byKeys.get(keys) ?? []), definition.id])
  }
  return [...byKeys.entries()]
    .filter(([, ids]) => ids.length > 1)
    .map(([keys, ids]): KeybindConflict => ({ keys, ids }))
}

function keyOrder(key: string) {
  if (key === "ctrl") return 1
  if (key === "meta") return 2
  if (key === "alt") return 3
  if (key === "shift") return 4
  return 10
}
