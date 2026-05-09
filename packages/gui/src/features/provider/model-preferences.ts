export type ModelPreferenceRef = {
  id: string
  providerId: string
  name?: string | null
  providerName?: string | null
  status?: string | null
}

export type ModelVariant = {
  id: string
  name: string
  providerId: string
  modelId: string
  reasoningEffort?: "low" | "medium" | "high" | string
  temperature?: number | null
  enabled: boolean
}

export type ModelPreferences = {
  favoriteModels: string[]
  hiddenModels: string[]
  modelVariants: Record<string, ModelVariant[]>
}

export function modelPreferenceKey(providerId: string, modelId: string) {
  return `${providerId.trim()}/${modelId.trim()}`
}

export function modelKeyFromRef(model: ModelPreferenceRef) {
  return modelPreferenceKey(model.providerId, model.id)
}

export function normalizeModelPreferenceKeys(value: unknown) {
  if (!Array.isArray(value)) return []
  return Array.from(
    new Set(
      value
        .filter((item): item is string => typeof item === "string")
        .map((item) => item.trim())
        .filter((item) => item.includes("/") && !item.startsWith("/") && !item.endsWith("/")),
    ),
  )
}

export function normalizeModelVariants(value: unknown): Record<string, ModelVariant[]> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {}
  const out: Record<string, ModelVariant[]> = {}
  for (const [key, rawItems] of Object.entries(value)) {
    const normalizedKey = normalizeModelPreferenceKeys([key])[0]
    if (!normalizedKey || !Array.isArray(rawItems)) continue
    const variants = rawItems
      .map((item) => normalizeModelVariant(normalizedKey, item))
      .filter((item): item is ModelVariant => Boolean(item))
    if (variants.length) out[normalizedKey] = dedupeVariants(variants)
  }
  return out
}

export function normalizeModelPreferences(value: Partial<ModelPreferences> | null | undefined): ModelPreferences {
  return {
    favoriteModels: normalizeModelPreferenceKeys(value?.favoriteModels),
    hiddenModels: normalizeModelPreferenceKeys(value?.hiddenModels),
    modelVariants: normalizeModelVariants(value?.modelVariants),
  }
}

export function isFavoriteModel(model: ModelPreferenceRef, preferences: Pick<ModelPreferences, "favoriteModels">) {
  return preferences.favoriteModels.includes(modelKeyFromRef(model))
}

export function isHiddenModel(model: ModelPreferenceRef, preferences: Pick<ModelPreferences, "hiddenModels">) {
  return preferences.hiddenModels.includes(modelKeyFromRef(model))
}

export function toggleModelFavoriteKey(keys: string[], key: string) {
  const normalized = normalizeModelPreferenceKeys(keys)
  return normalized.includes(key) ? normalized.filter((item) => item !== key) : [...normalized, key]
}

export function toggleModelHiddenKey(keys: string[], key: string) {
  const normalized = normalizeModelPreferenceKeys(keys)
  return normalized.includes(key) ? normalized.filter((item) => item !== key) : [...normalized, key]
}

export function applyModelPreferences<T extends ModelPreferenceRef>(
  models: T[],
  preferences: Pick<ModelPreferences, "favoriteModels" | "hiddenModels">,
  options?: { includeHidden?: boolean },
) {
  const favorites = new Set(normalizeModelPreferenceKeys(preferences.favoriteModels))
  const hidden = new Set(normalizeModelPreferenceKeys(preferences.hiddenModels))
  return models
    .filter((model) => options?.includeHidden || !hidden.has(modelKeyFromRef(model)))
    .slice()
    .sort((left, right) => {
      const leftFavorite = favorites.has(modelKeyFromRef(left))
      const rightFavorite = favorites.has(modelKeyFromRef(right))
      if (leftFavorite !== rightFavorite) return leftFavorite ? -1 : 1
      const provider = (left.providerName ?? left.providerId).localeCompare(right.providerName ?? right.providerId)
      if (provider !== 0) return provider
      return (left.name ?? left.id).localeCompare(right.name ?? right.id)
    })
}

function normalizeModelVariant(key: string, value: unknown): ModelVariant | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null
  const record = value as Record<string, unknown>
  const [providerId, modelId] = key.split("/", 2)
  const id = stringValue(record.id) ?? stringValue(record.name)
  const name = stringValue(record.name) ?? id
  if (!id || !name) return null
  return {
    id,
    name,
    providerId: stringValue(record.providerId) ?? providerId,
    modelId: stringValue(record.modelId) ?? modelId,
    reasoningEffort: stringValue(record.reasoningEffort) ?? undefined,
    temperature: numberValue(record.temperature),
    enabled: record.enabled !== false,
  }
}

function dedupeVariants(variants: ModelVariant[]) {
  const seen = new Set<string>()
  const out: ModelVariant[] = []
  for (const variant of variants) {
    const key = variant.id.trim()
    if (!key || seen.has(key)) continue
    seen.add(key)
    out.push(variant)
  }
  return out
}

function stringValue(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null
}

function numberValue(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) return parsed
  }
  return null
}
