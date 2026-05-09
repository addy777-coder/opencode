import { describe, expect, test } from "bun:test"
import { normalizeThirdPartyProviders, providerPatchFromFetchedModels } from "./third-party-api"

describe("third-party API model loading", () => {
  test("uses fetched API models as the authoritative model list", () => {
    expect(
      providerPatchFromFetchedModels(
        { defaultModel: "old-model" },
        [" api-model-a ", "api-model-a", "api-model-b"],
      ),
    ).toEqual({
      models: ["api-model-a", "api-model-b"],
      defaultModel: "api-model-a",
    })

    expect(
      providerPatchFromFetchedModels(
        { defaultModel: "api-model-b" },
        ["api-model-a", "api-model-b"],
      ),
    ).toEqual({
      models: ["api-model-a", "api-model-b"],
      defaultModel: "api-model-b",
    })
  })

  test("drops stale default models while normalizing providers", () => {
    expect(
      normalizeThirdPartyProviders([
        {
          id: "openrouter",
          name: "OpenRouter",
          protocol: "openai-compatible",
          baseUrl: "https://openrouter.ai/api/v1",
          models: ["api-model-a"],
          defaultModel: "old-model",
        },
      ])[0]?.defaultModel,
    ).toBe("api-model-a")
  })
})
