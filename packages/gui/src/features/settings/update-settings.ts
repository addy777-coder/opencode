export const GUI_UPDATE_RELEASE_URL = "https://github.com/addy777-coder/opencode/releases"
export const GUI_UPDATE_DEFER_COOLDOWN_MS = 24 * 60 * 60 * 1000

export type GuiUpdateDeferState = {
  deferredUpdateVersion?: string | null
  deferredUpdateAt?: number | null
}

export function shouldSuppressDeferredUpdatePrompt(
  settings: GuiUpdateDeferState,
  version?: string | null,
  now = Date.now(),
) {
  if (!version || settings.deferredUpdateVersion !== version) return false
  const deferredAt = settings.deferredUpdateAt ?? 0
  return Number.isFinite(deferredAt) && deferredAt > 0 && now - deferredAt < GUI_UPDATE_DEFER_COOLDOWN_MS
}
