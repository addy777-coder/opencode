import { describe, expect, test } from "bun:test"
import { chooseSelectableModel, selectedModelExists, type SelectableModelRef } from "./model-selection"

const models: SelectableModelRef[] = [
  { providerId: "gpt", id: "gpt-5.5", status: "active" },
  { providerId: "xiaomi", id: "mimo-v2.5-pro", status: "active" },
]

describe("model selection", () => {
  test("keeps a manually selected provider even when another provider is default", () => {
    expect(
      chooseSelectableModel({
        models,
        selectedModel: { providerId: "xiaomi", modelId: "mimo-v2.5-pro" },
        defaultProviderId: "gpt",
        defaultModelId: "gpt-5.5",
      }),
    ).toEqual(models[1])
  })

  test("uses the default provider only when there is no valid manual selection", () => {
    expect(
      chooseSelectableModel({
        models,
        selectedModel: null,
        defaultProviderId: "gpt",
        defaultModelId: "gpt-5.5",
      }),
    ).toEqual(models[0])

    expect(
      chooseSelectableModel({
        models,
        selectedModel: { providerId: "missing", modelId: "missing" },
        defaultProviderId: "xiaomi",
        defaultModelId: "mimo-v2.5-pro",
      }),
    ).toEqual(models[1])
  })

  test("detects whether the selected model is still selectable", () => {
    expect(selectedModelExists(models, { providerId: "xiaomi", modelId: "mimo-v2.5-pro" })).toBe(true)
    expect(selectedModelExists(models, { providerId: "xiaomi", modelId: "missing" })).toBe(false)
  })
})
