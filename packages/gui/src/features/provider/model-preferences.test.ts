import { describe, expect, test } from "bun:test"
import {
  applyModelPreferences,
  modelPreferenceKey,
  normalizeModelPreferences,
  toggleModelFavoriteKey,
  toggleModelHiddenKey,
} from "./model-preferences"

const models = [
  { providerId: "anthropic", providerName: "Anthropic", id: "claude-3-5-sonnet", name: "Claude 3.5 Sonnet" },
  { providerId: "openai", providerName: "OpenAI", id: "gpt-5.1", name: "GPT 5.1" },
  { providerId: "openai", providerName: "OpenAI", id: "gpt-5.1-mini", name: "GPT 5.1 Mini" },
]

describe("model preferences", () => {
  test("normalizes favorite, hidden, and variant settings", () => {
    expect(
      normalizeModelPreferences({
        favoriteModels: [" openai/gpt-5.1 ", "openai/gpt-5.1", "bad"],
        hiddenModels: ["anthropic/claude-3-5-sonnet"],
        modelVariants: {
          "openai/gpt-5.1": [
            { id: "fast", name: "Fast", temperature: "0.2", enabled: true },
            { id: "fast", name: "Duplicate" },
            { name: "" },
          ],
        },
      }),
    ).toEqual({
      favoriteModels: ["openai/gpt-5.1"],
      hiddenModels: ["anthropic/claude-3-5-sonnet"],
      modelVariants: {
        "openai/gpt-5.1": [
          {
            id: "fast",
            name: "Fast",
            providerId: "openai",
            modelId: "gpt-5.1",
            reasoningEffort: undefined,
            temperature: 0.2,
            enabled: true,
          },
        ],
      },
    })
  })

  test("sorts favorites first and filters hidden models", () => {
    const preferences = {
      favoriteModels: ["openai/gpt-5.1-mini"],
      hiddenModels: ["openai/gpt-5.1"],
    }
    expect(applyModelPreferences(models, preferences).map((model) => modelPreferenceKey(model.providerId, model.id))).toEqual([
      "openai/gpt-5.1-mini",
      "anthropic/claude-3-5-sonnet",
    ])
    expect(
      applyModelPreferences(models, preferences, { includeHidden: true }).map((model) =>
        modelPreferenceKey(model.providerId, model.id),
      ),
    ).toEqual(["openai/gpt-5.1-mini", "anthropic/claude-3-5-sonnet", "openai/gpt-5.1"])
  })

  test("toggles preference keys without duplicating entries", () => {
    expect(toggleModelFavoriteKey([], "openai/gpt-5.1")).toEqual(["openai/gpt-5.1"])
    expect(toggleModelFavoriteKey(["openai/gpt-5.1"], "openai/gpt-5.1")).toEqual([])
    expect(toggleModelHiddenKey(["bad", "openai/gpt-5.1"], "anthropic/claude-3-5-sonnet")).toEqual([
      "openai/gpt-5.1",
      "anthropic/claude-3-5-sonnet",
    ])
  })
})
