import { describe, expect, test } from "bun:test"
import {
  canUseThirdPartyProviderAsDefault,
  normalizeThirdPartyProviders,
  providerPatchFromFetchedModels,
  type GuiThirdPartyProvider,
} from "./third-party-api"

describe("API provider model loading", () => {
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

  test("allows default provider only after GUI enablement and OpenCode auth are ready", () => {
    const provider: GuiThirdPartyProvider = {
      id: "xiaomi",
      name: "小米",
      protocol: "openai-compatible",
      baseUrl: "https://api.example.test/v1",
      models: ["mimo-v2.5-pro"],
      defaultModel: "mimo-v2.5-pro",
      headers: "",
      timeout: 300_000,
      chunkTimeout: 60_000,
      contextLimit: 128_000,
      outputLimit: 16_384,
      supportsReasoning: true,
      supportsAttachment: false,
      enabled: true,
      authStored: true,
      note: "",
    }

    expect(canUseThirdPartyProviderAsDefault(provider)).toBe(true)
    expect(canUseThirdPartyProviderAsDefault({ ...provider, enabled: false })).toBe(false)
    expect(canUseThirdPartyProviderAsDefault({ ...provider, authStored: false })).toBe(false)
    expect(canUseThirdPartyProviderAsDefault({ ...provider, models: [] })).toBe(false)
  })
})
