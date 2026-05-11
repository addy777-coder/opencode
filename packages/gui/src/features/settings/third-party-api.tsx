import { useState, type ComponentType, type ReactNode, type SVGProps } from "react"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import {
  ArrowLeft,
  CheckCircle2,
  ChevronDown,
  Eye,
  EyeOff,
  KeyRound,
  Loader2,
  Pencil,
  Plus,
  RefreshCw,
  Save,
  ServerCog,
  Trash2,
  X,
} from "lucide-react"
import {
  thirdPartyProviderApply,
  thirdPartyProviderModels,
  thirdPartyProviderRemove,
  type ServerStatus,
  type ThirdPartyProviderConfig,
  type ThirdPartyProviderProtocol,
} from "@/lib/tauri"
import { cn } from "@/lib/utils"

type IconComponent = ComponentType<SVGProps<SVGSVGElement>>

const ArrowLeftIcon = ArrowLeft as IconComponent
const CheckCircle2Icon = CheckCircle2 as IconComponent
const ChevronDownIcon = ChevronDown as IconComponent
const EyeIcon = Eye as IconComponent
const EyeOffIcon = EyeOff as IconComponent
const KeyRoundIcon = KeyRound as IconComponent
const Loader2Icon = Loader2 as IconComponent
const PencilIcon = Pencil as IconComponent
const PlusIcon = Plus as IconComponent
const RefreshCwIcon = RefreshCw as IconComponent
const SaveIcon = Save as IconComponent
const ServerCogIcon = ServerCog as IconComponent
const Trash2Icon = Trash2 as IconComponent
const XIcon = X as IconComponent

export type GuiThirdPartyProvider = ThirdPartyProviderConfig & {
  enabled: boolean
  authStored: boolean
  note: string
}

export type ThirdPartySettingsPatch = {
  thirdPartyProviders?: GuiThirdPartyProvider[]
  activeThirdPartyProviderId?: string
}

type ProviderEditorState = {
  mode: "new" | "edit"
  originalId: string | null
  provider: GuiThirdPartyProvider
}

const DEFAULT_CONTEXT_LIMIT = 128_000
const DEFAULT_OUTPUT_LIMIT = 16_384
const DEFAULT_TIMEOUT = 300_000
const DEFAULT_CHUNK_TIMEOUT = 60_000

const PROTOCOL_OPTIONS: Array<{ value: ThirdPartyProviderProtocol; label: string; hint: string }> = [
  {
    value: "openai-compatible",
    label: "OpenAI Compatible",
    hint: "适合 OpenAI、OpenRouter、LiteLLM、One API、New API 等兼容端点。",
  },
  {
    value: "anthropic",
    label: "Anthropic Compatible",
    hint: "适合原生 Anthropic 或兼容 Claude Messages 的端点。",
  },
]

export function createThirdPartyProvider(index: number): GuiThirdPartyProvider {
  const id = `custom-${Date.now().toString(36)}-${index + 1}`
  return {
    id,
    name: `自定义供应商 ${index + 1}`,
    protocol: "openai-compatible",
    baseUrl: "",
    models: [],
    defaultModel: "",
    headers: "",
    timeout: DEFAULT_TIMEOUT,
    chunkTimeout: DEFAULT_CHUNK_TIMEOUT,
    contextLimit: DEFAULT_CONTEXT_LIMIT,
    outputLimit: DEFAULT_OUTPUT_LIMIT,
    supportsReasoning: true,
    supportsAttachment: false,
    enabled: false,
    authStored: false,
    note: "",
  }
}

export function normalizeThirdPartyProviders(value: unknown): GuiThirdPartyProvider[] {
  if (!Array.isArray(value)) return []
  return value
    .map((item, index): GuiThirdPartyProvider | null => {
      if (!item || typeof item !== "object" || Array.isArray(item)) return null
      const record = item as Partial<GuiThirdPartyProvider>
      const protocol = record.protocol === "anthropic" ? "anthropic" : "openai-compatible"
      const models = Array.isArray(record.models)
        ? Array.from(new Set(record.models.map((model) => String(model).trim()).filter(Boolean)))
        : []
      return {
        id: cleanProviderId(record.id, index),
        name: typeof record.name === "string" && record.name.trim() ? record.name : `自定义供应商 ${index + 1}`,
        protocol,
        baseUrl: typeof record.baseUrl === "string" ? record.baseUrl : "",
        models,
        defaultModel:
          typeof record.defaultModel === "string" && models.includes(record.defaultModel)
            ? record.defaultModel
            : models[0] ?? "",
        headers: typeof record.headers === "string" ? record.headers : "",
        timeout: typeof record.timeout === "number" ? record.timeout : DEFAULT_TIMEOUT,
        chunkTimeout: typeof record.chunkTimeout === "number" ? record.chunkTimeout : DEFAULT_CHUNK_TIMEOUT,
        contextLimit: typeof record.contextLimit === "number" ? record.contextLimit : DEFAULT_CONTEXT_LIMIT,
        outputLimit: typeof record.outputLimit === "number" ? record.outputLimit : DEFAULT_OUTPUT_LIMIT,
        supportsReasoning: record.supportsReasoning !== false,
        supportsAttachment: record.supportsAttachment === true,
        enabled: record.enabled !== false,
        authStored: record.authStored === true,
        note: typeof record.note === "string" ? record.note : "",
      }
    })
    .filter((item): item is GuiThirdPartyProvider => Boolean(item))
}

export function canApplyThirdPartyProvider(provider: GuiThirdPartyProvider | ThirdPartyProviderConfig) {
  return (
    isValidProviderId(provider.id) &&
    provider.name.trim().length > 0 &&
    provider.baseUrl.trim().length > 0 &&
    provider.models.some((model) => model.trim().length > 0)
  )
}

export function canUseThirdPartyProviderAsDefault(provider: GuiThirdPartyProvider) {
  return provider.enabled && provider.authStored && canApplyThirdPartyProvider(provider)
}

export function thirdPartyProviderRuntimeConfig(provider: GuiThirdPartyProvider): ThirdPartyProviderConfig {
  return {
    id: provider.id.trim(),
    name: provider.name.trim(),
    protocol: provider.protocol,
    baseUrl: provider.baseUrl.trim(),
    models: uniqueModels(provider.models),
    defaultModel: provider.defaultModel?.trim() || provider.models[0] || null,
    headers: provider.headers,
    timeout: provider.timeout,
    chunkTimeout: provider.chunkTimeout,
    contextLimit: provider.contextLimit,
    outputLimit: provider.outputLimit,
    supportsReasoning: provider.supportsReasoning,
    supportsAttachment: provider.supportsAttachment,
  }
}

export function thirdPartyProviderSignature(provider: GuiThirdPartyProvider) {
  return JSON.stringify(thirdPartyProviderRuntimeConfig(provider))
}

export function ThirdPartyApiSettings({
  providers,
  activeProviderId,
  server,
  serverUrl,
  onChange,
}: {
  providers: GuiThirdPartyProvider[]
  activeProviderId: string
  server?: ServerStatus
  serverUrl: string
  onChange: (patch: ThirdPartySettingsPatch) => void
}) {
  const queryClient = useQueryClient()
  const baseUrl = server?.baseUrl ?? serverUrl
  const serverReady = Boolean(server?.healthy && baseUrl)
  const [apiKeys, setApiKeys] = useState<Record<string, string>>({})
  const [visibleKeys, setVisibleKeys] = useState<Record<string, boolean>>({})
  const [editor, setEditor] = useState<ProviderEditorState | null>(null)
  const [dirty, setDirty] = useState(false)
  const [notice, setNotice] = useState<{ tone: "success" | "warning" | "danger"; text: string } | null>(null)

  const activeProvider = providers.find((provider) => provider.id === activeProviderId) ?? null
  const applyProvider = useMutation({
    mutationFn: async ({
      provider,
      originalId,
    }: {
      provider: GuiThirdPartyProvider
      originalId?: string | null
    }) => {
      const apiKey = apiKeys[provider.id]?.trim() ?? ""
      if (!provider.authStored && !apiKey) {
        throw new Error("首次应用供应商时需要输入 API Key。")
      }
      if (apiKey) {
        await thirdPartyProviderModels({
          requestUrl: provider.baseUrl,
          apiKey,
          protocol: provider.protocol,
          headers: provider.headers,
        })
      }
      await thirdPartyProviderApply({
        baseUrl,
        provider: thirdPartyProviderRuntimeConfig(provider),
        apiKey: apiKey || null,
        originalProviderId: originalId && originalId !== provider.id ? originalId : null,
      })
      return { provider, originalId: originalId ?? provider.id, usedKey: Boolean(apiKey) }
    },
    onSuccess: ({ provider, originalId, usedKey }) => {
      const savedProvider = normalizeProviderPatch(
        { ...provider, authStored: provider.authStored || usedKey },
        {},
      )
      const next = upsertProvider(providers, originalId, savedProvider)
      const previousId = originalId ?? provider.id
      const wasDefault = activeProviderId === previousId || activeProviderId === provider.id
      const nextActiveId = wasDefault
        ? canUseThirdPartyProviderAsDefault(savedProvider)
          ? savedProvider.id
          : ""
        : activeProviderId
      updateProviders(next, nextActiveId)
      setEditor((current) => {
        if (!current) return current
        if (current.originalId !== originalId && current.provider.id !== provider.id) return current
        return { mode: "edit", originalId: savedProvider.id, provider: savedProvider }
      })
      setDirty(false)
      setApiKeys((current) => ({ ...current, [provider.id]: "", [savedProvider.id]: "" }))
      setNotice({
        tone: "success",
        text: "已写入 OpenCode provider 配置。是否出现在模型选择器、是否作为默认来源，由开关和“设为默认”单独控制。",
      })
      void queryClient.invalidateQueries({ queryKey: ["execution-options"] })
    },
    onError: (error) => {
      setNotice({ tone: "danger", text: getErrorMessage(error) })
    },
  })

  const removeProvider = useMutation({
    mutationFn: async (provider: GuiThirdPartyProvider) => {
      if (serverReady) {
        await thirdPartyProviderRemove({ baseUrl, providerId: provider.id })
      }
      return provider
    },
    onSuccess: (provider) => {
      const next = providers.filter((item) => item.id !== provider.id)
      onChange({
        thirdPartyProviders: next,
        activeThirdPartyProviderId: activeProviderId === provider.id ? "" : activeProviderId,
      })
      setEditor((current) => {
        if (!current) return current
        return current.originalId === provider.id || current.provider.id === provider.id ? null : current
      })
      setDirty(false)
      setNotice({ tone: "success", text: "已从 GUI 移除，并在 OpenCode 中停用该供应商。" })
      void queryClient.invalidateQueries({ queryKey: ["execution-options"] })
    },
    onError: (error) => {
      setNotice({ tone: "danger", text: getErrorMessage(error) })
    },
  })

  const fetchModels = useMutation({
    mutationFn: async (provider: GuiThirdPartyProvider) => {
      const apiKey = apiKeys[provider.id]?.trim() ?? ""
      if (!apiKey) throw new Error("获取模型列表需要临时输入 API Key。")
      const models = await thirdPartyProviderModels({
        requestUrl: provider.baseUrl,
        apiKey,
        protocol: provider.protocol,
        headers: provider.headers,
      })
      return { provider, models, usedKey: Boolean(apiKey) }
    },
    onSuccess: ({ provider, models, usedKey }) => {
      const patch = providerPatchFromFetchedModels(provider, models)
      if (editor?.provider.id === provider.id) {
        setEditor((current) =>
          current ? { ...current, provider: normalizeProviderPatch(current.provider, patch) } : current,
        )
        setDirty(true)
      } else {
        updateProvider(provider.id, patch)
      }
      setNotice({
        tone: usedKey ? "warning" : "success",
        text: usedKey
          ? `已用 API 返回的 ${models.length} 个模型替换原模型列表。API Key 还没有写入 OpenCode，请点击“应用到 OpenCode”后再使用。`
          : `已用 API 返回的 ${models.length} 个模型替换原模型列表，保存或应用后生效。`,
      })
    },
    onError: (error) => {
      setNotice({ tone: "danger", text: getErrorMessage(error) })
    },
  })

  function updateProviders(next: GuiThirdPartyProvider[], nextActiveId = activeProviderId) {
    onChange({
      thirdPartyProviders: next,
      activeThirdPartyProviderId: next.some((provider) => provider.id === nextActiveId) ? nextActiveId : "",
    })
  }

  function updateProvider(id: string, patch: Partial<GuiThirdPartyProvider>) {
    updateProviders(providers.map((provider) => (provider.id === id ? normalizeProviderPatch(provider, patch) : provider)))
  }

  function addProvider() {
    setEditor({ mode: "new", originalId: null, provider: createThirdPartyProvider(providers.length) })
    setDirty(false)
    setNotice(null)
  }

  function editProvider(provider: GuiThirdPartyProvider) {
    setEditor({
      mode: "edit",
      originalId: provider.id,
      provider: { ...provider, models: [...provider.models] },
    })
    setDirty(false)
    setNotice(null)
  }

  function closeEditor() {
    setEditor(null)
    setDirty(false)
  }

  function updateEditorProvider(patch: Partial<GuiThirdPartyProvider>) {
    const previousId = editor?.provider.id
    const nextId = typeof patch.id === "string" ? patch.id.trim() : null
    const nextPatch =
      previousId && nextId && previousId !== nextId ? { ...patch, authStored: false } : patch
    if (previousId && nextId && previousId !== nextId) {
      setApiKeys((current) => {
        if (!current[previousId] || current[nextId]) return current
        return { ...current, [nextId]: current[previousId] }
      })
      setVisibleKeys((current) => {
        if (!current[previousId] || current[nextId]) return current
        return { ...current, [nextId]: current[previousId] }
      })
    }
    setEditor((current) =>
      current ? { ...current, provider: normalizeProviderPatch(current.provider, nextPatch) } : current,
    )
    setDirty(true)
  }

  function validateProvider(provider: GuiThirdPartyProvider, requireRuntime: boolean) {
    if (!provider.name.trim()) return "请填写供应商名称。"
    if (!isValidProviderId(provider.id)) return "Provider ID 只能使用字母、数字、下划线或短横线。"
    if (providers.some((item) => item.id === provider.id && item.id !== editor?.originalId)) {
      return "这个 Provider ID 已存在，请换一个。"
    }
    if (!provider.baseUrl.trim()) return "请填写 Base URL。"
    if (requireRuntime && !provider.models.some((model) => model.trim())) return "请至少填写一个模型 ID。"
    return null
  }

  function saveEditorProvider() {
    if (!editor) return null
    const provider = normalizeProviderPatch(editor.provider, {})
    const error = validateProvider(provider, false)
    if (error) {
      setNotice({ tone: "warning", text: error })
      return null
    }

    const next = upsertProvider(providers, editor.originalId, provider)
    const nextActiveId = activeProviderId === editor.originalId ? provider.id : activeProviderId
    updateProviders(next, nextActiveId)
    setEditor({ mode: "edit", originalId: provider.id, provider })
    setDirty(false)
    setNotice({
      tone: apiKeys[provider.id]?.trim() ? "warning" : "success",
      text: apiKeys[provider.id]?.trim()
        ? "供应商配置已保存。API Key 不会通过保存写入 OpenCode，请继续点击“应用到 OpenCode”。"
        : "供应商配置已保存。",
    })
    return provider
  }

  async function applyEditorProvider() {
    if (!editor) return
    const provider = normalizeProviderPatch(editor.provider, {})
    const error = validateProvider(provider, true)
    if (error) {
      setNotice({ tone: "warning", text: error })
      return
    }
    await applyProvider.mutateAsync({ provider, originalId: editor.originalId })
  }

  function toggleProvider(provider: GuiThirdPartyProvider, enabled: boolean) {
    const next = providers.map((item) => (item.id === provider.id ? normalizeProviderPatch(item, { enabled }) : item))
    const nextActiveId = !enabled && activeProviderId === provider.id ? "" : activeProviderId
    updateProviders(next, nextActiveId)
    setNotice({
      tone: enabled ? "success" : "warning",
      text: enabled
        ? provider.authStored
          ? "已在 GUI 中启用。它会出现在聊天模型选择器里；需要同步配置时再点击“重新应用”。"
          : "已在 GUI 中启用。首次使用前还需要填写密钥并应用到 OpenCode。"
        : "已在 GUI 中停用。它不会作为聊天模型来源；OpenCode 中已写入的密钥不会被删除。",
    })
  }

  function setActive(provider: GuiThirdPartyProvider) {
    if (!canUseThirdPartyProviderAsDefault(provider)) {
      setNotice({ tone: "warning", text: "设为默认前，需要先启用供应商，并把密钥应用到 OpenCode。" })
      return
    }
    onChange({ activeThirdPartyProviderId: provider.id })
    setNotice({ tone: "success", text: "已设为工作台默认模型来源。发送任务时会优先选择它的默认模型。" })
  }

  const editorProvider = editor?.provider ?? null
  const busy = applyProvider.isPending || removeProvider.isPending || fetchModels.isPending

  if (editor && editorProvider) {
    const title = editor.mode === "new" ? "新增供应商" : "编辑供应商"
    const canApply =
      serverReady &&
      canApplyThirdPartyProvider(editorProvider) &&
      (editorProvider.authStored || Boolean(apiKeys[editorProvider.id]?.trim()))

    return (
      <div className="space-y-4 pb-6">
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--app-divider)] pb-4">
          <div className="flex min-w-0 items-center gap-3">
            <button
              type="button"
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-[var(--app-muted)] hover:bg-[var(--app-hover)] hover:text-[var(--app-text)]"
              onClick={closeEditor}
              title="返回 API 供应商"
            >
              <ArrowLeftIcon className="h-4 w-4" />
            </button>
            <div className="min-w-0">
              <div className="flex min-w-0 flex-wrap items-center gap-2">
                <h2 className="truncate text-[17px] font-medium text-[var(--app-text)]">{title}</h2>
                {activeProviderId === editor.originalId || activeProviderId === editorProvider.id ? (
                  <StatusPill tone="success" text="工作台默认" />
                ) : null}
                {dirty ? <StatusPill tone="muted" text="未保存" /> : null}
              </div>
              <p className="mt-1 truncate text-xs font-medium text-[var(--app-muted)]">
                保存只更新 GUI；应用会把 provider 与 API Key 写入 OpenCode。
              </p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              className="flex h-8 items-center gap-2 rounded-md border border-[var(--app-border)] bg-[var(--app-input)] px-3 text-xs font-medium text-[var(--app-text)] hover:bg-[var(--app-hover)] disabled:opacity-50"
              onClick={saveEditorProvider}
              disabled={!dirty || busy}
            >
              <SaveIcon className="h-3.5 w-3.5" />
              保存
            </button>
            <button
              type="button"
              className="flex h-8 items-center gap-2 rounded-md bg-[var(--app-text)] px-3 text-xs font-medium text-[var(--app-bg)] hover:opacity-90 disabled:opacity-50"
              onClick={() => void applyEditorProvider()}
              disabled={busy || !canApply}
              title={!serverReady ? "OpenCode 服务未就绪，暂时不能应用" : undefined}
            >
              {applyProvider.isPending ? (
                <Loader2Icon className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <CheckCircle2Icon className="h-3.5 w-3.5" />
              )}
              应用到 OpenCode
            </button>
          </div>
        </header>

        {notice ? <Notice tone={notice.tone} text={notice.text} /> : null}

        <ProviderEditorForm
          provider={editorProvider}
          apiKey={apiKeys[editorProvider.id] ?? ""}
          showKey={visibleKeys[editorProvider.id] === true}
          busy={busy}
          onApiKeyChange={(apiKey) => setApiKeys((current) => ({ ...current, [editorProvider.id]: apiKey }))}
          onShowKeyChange={(showKey) => setVisibleKeys((current) => ({ ...current, [editorProvider.id]: showKey }))}
          onChange={updateEditorProvider}
          onFetchModels={() => void fetchModels.mutateAsync(editorProvider)}
        />
      </div>
    )
  }

  return (
    <div className="space-y-8">
      <section>
        <div className="mb-4 flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h2 className="text-[15px] font-semibold tracking-tight text-[var(--app-text)]">API 供应商</h2>
            <p className="mt-1.5 max-w-[700px] text-[13px] leading-6 text-[var(--app-muted)]">
              这里会写入 OpenCode 的 provider 配置；API Key 交给 OpenCode auth 保存，GUI 设置中只保留供应商、地址和模型。
            </p>
            <div className="mt-1 text-[12px] text-[var(--app-subtle)]">
              当前默认：{activeProvider ? activeProvider.name : "未选择"}
            </div>
          </div>
          {providers.length ? (
            <button
              type="button"
              className="flex h-9 shrink-0 items-center gap-1.5 rounded-md bg-[var(--app-text)] px-3 text-[13px] font-medium text-[var(--app-bg)] hover:opacity-90"
              onClick={addProvider}
            >
              <PlusIcon className="h-4 w-4" />
              添加供应商
            </button>
          ) : null}
        </div>

        {notice ? <Notice tone={notice.tone} text={notice.text} /> : null}

        <div className="space-y-3">
          {providers.length ? (
            providers.map((provider) => (
              <ProviderSummaryCard
                key={provider.id}
                provider={provider}
                active={activeProviderId === provider.id}
                busy={busy}
                serverReady={serverReady}
                hasPendingApiKey={Boolean(apiKeys[provider.id]?.trim())}
                onToggle={(enabled) => void toggleProvider(provider, enabled)}
                onApply={() => void applyProvider.mutateAsync({ provider, originalId: provider.id })}
                onSetActive={() => setActive(provider)}
                onEdit={() => editProvider(provider)}
                onRemove={() => void removeProvider.mutateAsync(provider)}
              />
            ))
          ) : (
            <div className="rounded-xl border border-dashed border-[var(--app-border)] bg-[var(--app-panel-2)] px-6 py-12 text-center">
              <KeyRoundIcon className="mx-auto mb-3 h-6 w-6 text-[var(--app-muted)]" />
              <div className="text-[15px] font-semibold text-[var(--app-text)]">还没有第三方供应商</div>
              <div className="mx-auto mt-2 max-w-[440px] text-[13px] leading-6 text-[var(--app-muted)]">
                添加 OpenAI-compatible 或 Anthropic-compatible 端点后，OpenCode 会在模型选择器中显示这些模型。
              </div>
              <button
                className="mt-5 inline-flex h-9 items-center gap-1.5 rounded-md bg-[var(--app-text)] px-3 text-[13px] font-medium text-[var(--app-bg)] hover:opacity-90"
                onClick={addProvider}
              >
                <PlusIcon className="h-4 w-4" />
                添加供应商
              </button>
            </div>
          )}
        </div>
      </section>
    </div>
  )
}

function ProviderSummaryCard({
  provider,
  active,
  busy,
  serverReady,
  hasPendingApiKey,
  onToggle,
  onApply,
  onSetActive,
  onEdit,
  onRemove,
}: {
  provider: GuiThirdPartyProvider
  active: boolean
  busy: boolean
  serverReady: boolean
  hasPendingApiKey: boolean
  onToggle: (enabled: boolean) => void
  onApply: () => void
  onSetActive: () => void
  onEdit: () => void
  onRemove: () => void
}) {
  const protocol = PROTOCOL_OPTIONS.find((item) => item.value === provider.protocol) ?? PROTOCOL_OPTIONS[0]
  const valid = canApplyThirdPartyProvider(provider)
  const applyHasKey = provider.authStored || hasPendingApiKey
  const applyNeedsKey = !applyHasKey
  const applyNeedsEdit = !valid || applyNeedsKey
  const applyDisabled = busy || (!applyNeedsEdit && !serverReady)
  const applyLabel = !valid ? "补全配置" : applyNeedsKey ? "填写密钥" : hasPendingApiKey ? "应用密钥" : "重新应用"
  const canUseAsDefault = canUseThirdPartyProviderAsDefault(provider)
  const defaultModel = provider.defaultModel || provider.models[0] || ""
  const defaultTitle = !provider.enabled
    ? "先打开模型选择开关，让它出现在聊天模型选择器里"
    : !provider.authStored
      ? "先填写 API Key，并应用到 OpenCode"
      : !valid
        ? "请先补全 Base URL 和模型列表"
        : active
          ? "已经是默认模型来源"
          : "设为工作台默认模型来源"
  const applyTitle = applyNeedsEdit
    ? "进入编辑页补全配置或填写 API Key"
    : !serverReady
      ? "OpenCode 服务未就绪，暂时不能应用"
      : hasPendingApiKey
        ? "把当前输入的 API Key 写入 OpenCode auth"
        : "重新写入 OpenCode provider 配置"
  const toggleTitle = provider.enabled
    ? "关闭后不再出现在聊天模型选择器；不会删除 OpenCode 密钥"
    : "开启后会出现在聊天模型选择器；首次使用仍需要应用密钥"

  return (
    <div className="rounded-lg border border-[var(--app-border)] bg-[var(--app-panel-2)] px-4 py-3">
      <div className="flex items-start gap-3">
        <div className="mt-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-[var(--app-input)] text-[var(--app-muted)]">
          <ServerCogIcon className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <div className="truncate text-[15px] font-medium text-[var(--app-text)]">{provider.name || "未命名供应商"}</div>
            {active ? <StatusPill tone="success" text="工作台默认" /> : null}
            <StatusPill tone="muted" text={provider.enabled ? "GUI 已启用" : "GUI 已停用"} />
            {provider.authStored ? (
              <StatusPill tone="muted" text="OpenCode 已应用" />
            ) : hasPendingApiKey ? (
              <StatusPill tone="muted" text="密钥待应用" />
            ) : (
              <StatusPill tone="muted" text="需填写密钥" />
            )}
            {!valid ? <StatusPill tone="muted" text="配置未完整" /> : null}
          </div>
          <div className="mt-1 truncate text-xs font-medium text-[var(--app-muted)]">
            {protocol.label} · {provider.baseUrl || "未填写 Base URL"}
          </div>
          <div className="mt-3 flex flex-wrap gap-2 text-xs font-medium text-[var(--app-muted)]">
            <span className="rounded-md border border-[var(--app-border)] px-2 py-1">模型 {provider.models.length}</span>
            <span className="max-w-[360px] truncate rounded-md border border-[var(--app-border)] px-2 py-1">
              默认 {defaultModel || "未设置"}
            </span>
            {provider.note ? (
              <span className="max-w-[360px] truncate rounded-md border border-[var(--app-border)] px-2 py-1">{provider.note}</span>
            ) : null}
          </div>
        </div>
        <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
          <div
            className="flex h-8 items-center gap-2 rounded-md border border-[var(--app-border)] bg-[var(--app-input)] px-2.5"
            title={toggleTitle}
          >
            <span className="text-xs font-medium text-[var(--app-muted)]">模型选择</span>
            <Switch checked={provider.enabled} disabled={busy} title={toggleTitle} onChange={onToggle} />
          </div>
          <button
            type="button"
            className="flex h-8 items-center gap-2 rounded-md border border-[var(--app-border)] bg-[var(--app-input)] px-2.5 text-xs font-medium text-[var(--app-text)] hover:bg-[var(--app-hover)] disabled:opacity-50"
            onClick={onSetActive}
            disabled={busy || active || !canUseAsDefault}
            title={defaultTitle}
          >
            设为默认
          </button>
          <button
            type="button"
            className="flex h-8 items-center gap-2 rounded-md border border-[var(--app-border)] bg-[var(--app-input)] px-2.5 text-xs font-medium text-[var(--app-text)] hover:bg-[var(--app-hover)] disabled:opacity-50"
            onClick={applyNeedsEdit ? onEdit : onApply}
            disabled={applyDisabled}
            title={applyTitle}
          >
            {busy ? <Loader2Icon className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2Icon className="h-3.5 w-3.5" />}
            {applyLabel}
          </button>
          <button
            type="button"
            className="flex h-8 items-center gap-2 rounded-md border border-[var(--app-border)] bg-[var(--app-input)] px-2.5 text-xs font-medium text-[var(--app-text)] hover:bg-[var(--app-hover)]"
            onClick={onEdit}
          >
            <PencilIcon className="h-3.5 w-3.5" />
            编辑
          </button>
          <button
            type="button"
            className="flex h-8 w-8 items-center justify-center rounded-md text-[var(--app-muted)] hover:bg-[var(--app-danger-soft)] hover:text-[var(--app-danger)] disabled:opacity-50"
            title="删除供应商"
            onClick={onRemove}
            disabled={busy}
          >
            <Trash2Icon className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  )
}

function ProviderEditorForm({
  provider,
  apiKey,
  showKey,
  busy,
  onApiKeyChange,
  onShowKeyChange,
  onChange,
  onFetchModels,
}: {
  provider: GuiThirdPartyProvider
  apiKey: string
  showKey: boolean
  busy: boolean
  onApiKeyChange: (value: string) => void
  onShowKeyChange: (value: boolean) => void
  onChange: (patch: Partial<GuiThirdPartyProvider>) => void
  onFetchModels: () => void
}) {
  const protocol = PROTOCOL_OPTIONS.find((item) => item.value === provider.protocol) ?? PROTOCOL_OPTIONS[0]
  const idValid = isValidProviderId(provider.id)
  const modelOptions = uniqueModels(provider.models)
  const currentDefaultModel = provider.defaultModel ?? ""
  const defaultModelOptions = uniqueModels(currentDefaultModel ? [currentDefaultModel, ...modelOptions] : modelOptions).map(
    (model) => ({ value: model, label: model }),
  )

  return (
    <div className="rounded-xl border border-[var(--app-border)] bg-[var(--app-panel-2)]">
      <EditorSection
        icon={ServerCogIcon}
        title="连接"
        description="定义 OpenCode 识别这个供应商所需的名称、协议和端点。"
      >
        <div className="grid gap-3 md:grid-cols-2">
          <Field label="供应商名称">
            <TextInput value={provider.name} onChange={(value) => onChange({ name: value })} placeholder="OpenRouter" />
          </Field>
          <Field label="Provider ID">
            <TextInput
              value={provider.id}
              onChange={(value) => onChange({ id: value })}
              placeholder="openrouter"
              invalid={!idValid}
              mono
            />
          </Field>
        </div>

        <div className="grid gap-3 md:grid-cols-[200px_minmax(0,1fr)]">
          <Field label="协议">
            <SelectControl
              value={provider.protocol}
              options={PROTOCOL_OPTIONS}
              onChange={(value) => onChange({ protocol: value as ThirdPartyProviderProtocol })}
            />
          </Field>
          <Field label="Base URL">
            <TextInput
              value={provider.baseUrl}
              onChange={(value) => onChange({ baseUrl: value })}
              placeholder={provider.protocol === "anthropic" ? "https://api.anthropic.com" : "https://api.openai.com/v1"}
              mono
            />
          </Field>
        </div>

        <Field label="备注（可选）">
          <TextInput value={provider.note} onChange={(value) => onChange({ note: value })} placeholder="备用、公司网关、个人额度等" />
        </Field>

        <div className="mt-1 flex items-center justify-between gap-4 rounded-lg border border-[var(--app-divider)] bg-[var(--app-panel)] px-4 py-3">
          <div className="min-w-0">
            <div className="text-[13px] font-medium text-[var(--app-text)]">启用供应商</div>
            <div className="mt-0.5 text-[12px] leading-5 text-[var(--app-muted)]">
              关闭后不会出现在聊天模型选择器；不会清除 OpenCode 中已写入的密钥。
            </div>
          </div>
          <Switch
            checked={provider.enabled}
            title="只控制 GUI 是否把这个供应商作为聊天模型来源"
            onChange={(enabled) => onChange({ enabled })}
          />
        </div>

        {!idValid ? (
          <div className="rounded-md border border-[color-mix(in_srgb,var(--app-danger)_45%,transparent)] bg-[var(--app-danger-soft)] px-3 py-2 text-[12px] text-[var(--app-text)]">
            Provider ID 只能使用字母、数字、下划线或短横线。
          </div>
        ) : null}
      </EditorSection>

      <EditorSection
        icon={KeyRoundIcon}
        title="密钥与模型"
        description="API Key 只在应用时写入 OpenCode auth，GUI 不保存明文密钥。"
      >
        <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_220px]">
          <Field label="API Key">
            <div className="flex h-9 w-full items-center rounded-md border border-[var(--app-border)] bg-[var(--app-input)] transition-colors focus-within:border-[var(--app-accent)]">
              <input
                type={showKey ? "text" : "password"}
                value={apiKey}
                onChange={(event) => onApiKeyChange(event.target.value)}
                className="min-w-0 flex-1 bg-transparent px-3 text-[12.5px] text-[var(--app-text)] outline-none [font-family:var(--app-code-font)] placeholder:text-[var(--app-muted)]"
                placeholder={provider.authStored ? "留空表示继续使用已保存密钥" : "首次应用需要填写"}
              />
              <button
                type="button"
                className="flex h-9 w-9 items-center justify-center text-[var(--app-muted)] hover:text-[var(--app-text)]"
                onClick={() => onShowKeyChange(!showKey)}
                title={showKey ? "隐藏 API Key" : "显示 API Key"}
              >
                {showKey ? <EyeOffIcon className="h-4 w-4" /> : <EyeIcon className="h-4 w-4" />}
              </button>
            </div>
          </Field>
          <Field label="默认模型">
            {defaultModelOptions.length ? (
              <SelectControl
                value={currentDefaultModel || defaultModelOptions[0]?.value || ""}
                options={defaultModelOptions}
                onChange={(value) => onChange({ defaultModel: value })}
                mono
              />
            ) : (
              <TextInput
                value={currentDefaultModel}
                onChange={(value) => onChange({ defaultModel: value })}
                placeholder="先添加模型 ID"
                mono
              />
            )}
          </Field>
        </div>

        <Field label="模型 ID">
          <ModelListEditor
            models={modelOptions}
            onChange={(models) =>
              onChange({
                models,
                defaultModel: models.includes(currentDefaultModel) ? currentDefaultModel : models[0] ?? "",
              })
            }
          />
        </Field>

        <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              className="flex h-8 items-center gap-1.5 rounded-md border border-[var(--app-border)] bg-[var(--app-input)] px-3 text-[12px] font-medium text-[var(--app-text)] hover:bg-[var(--app-hover)] disabled:opacity-50"
              onClick={onFetchModels}
              disabled={busy || !provider.baseUrl.trim() || !apiKey.trim()}
            >
              {busy ? <Loader2Icon className="h-3.5 w-3.5 animate-spin" /> : <RefreshCwIcon className="h-3.5 w-3.5" />}
              获取模型列表
            </button>
            {provider.authStored ? <StatusPill tone="muted" text="已保存密钥" /> : null}
          </div>
          <div className="text-[12px] leading-5 text-[var(--app-muted)]">{protocol.hint}</div>
        </div>
      </EditorSection>

      <EditorSection
        icon={RefreshCwIcon}
        title="高级"
        description="只有供应商或中转网关要求时才需要调整这些参数。"
      >
        <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(280px,0.7fr)]">
          <Field label="Headers（KEY=VALUE，可选）">
            <TextareaControl
              value={provider.headers}
              onChange={(value) => onChange({ headers: value })}
              className="h-[110px]"
              placeholder={"HTTP-Referer=https://opencode.ai/\nX-Title=OpenCode GUI"}
              mono
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="上下文">
              <NumberInput
                value={provider.contextLimit ?? DEFAULT_CONTEXT_LIMIT}
                onChange={(value) => onChange({ contextLimit: value })}
              />
            </Field>
            <Field label="输出">
              <NumberInput
                value={provider.outputLimit ?? DEFAULT_OUTPUT_LIMIT}
                onChange={(value) => onChange({ outputLimit: value })}
              />
            </Field>
            <Field label="请求超时">
              <NumberInput
                value={provider.timeout ?? DEFAULT_TIMEOUT}
                onChange={(value) => onChange({ timeout: value })}
              />
            </Field>
            <Field label="流式超时">
              <NumberInput
                value={provider.chunkTimeout ?? DEFAULT_CHUNK_TIMEOUT}
                onChange={(value) => onChange({ chunkTimeout: value })}
              />
            </Field>
          </div>
        </div>

        <div className="flex flex-wrap gap-2 pt-1">
          <ToggleChip
            label="支持推理"
            checked={provider.supportsReasoning}
            onChange={(value) => onChange({ supportsReasoning: value })}
          />
          <ToggleChip
            label="支持附件"
            checked={provider.supportsAttachment}
            onChange={(value) => onChange({ supportsAttachment: value })}
          />
        </div>
      </EditorSection>
    </div>
  )
}

function ModelListEditor({ models, onChange }: { models: string[]; onChange: (models: string[]) => void }) {
  const [draft, setDraft] = useState("")
  const normalizedModels = uniqueModels(models)

  function commitDraft(value = draft) {
    const nextModels = splitModelEntries(value)
    if (!nextModels.length) return
    onChange(uniqueModels([...normalizedModels, ...nextModels]))
    setDraft("")
  }

  function removeModel(model: string) {
    onChange(normalizedModels.filter((item) => item !== model))
  }

  return (
    <div className="overflow-hidden rounded-md border border-[var(--app-border)] bg-[var(--app-input)] transition-colors focus-within:border-[var(--app-accent)]">
      <div className="max-h-[132px] overflow-auto">
        {normalizedModels.length ? (
          <div className="divide-y divide-[var(--app-divider)]">
            {normalizedModels.map((model, index) => (
              <div key={model} className="group flex h-8 min-w-0 items-center gap-2 px-2.5">
                <span className="w-5 shrink-0 text-right text-[11px] tabular-nums text-[var(--app-subtle)]">
                  {index + 1}
                </span>
                <span
                  className="min-w-0 flex-1 truncate text-[12.5px] text-[var(--app-text)] [font-family:var(--app-code-font)]"
                  title={model}
                >
                  {model}
                </span>
                <button
                  type="button"
                  className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-[var(--app-muted)] opacity-70 hover:bg-[var(--app-hover)] hover:text-[var(--app-text)] group-hover:opacity-100"
                  title="移除模型"
                  onClick={() => removeModel(model)}
                >
                  <XIcon className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        ) : (
          <div className="flex h-[72px] items-center justify-center px-3 text-center text-[12px] leading-5 text-[var(--app-muted)]">
            暂无模型，输入模型 ID 后按回车添加。
          </div>
        )}
      </div>
      <div className="flex h-9 items-center border-t border-[var(--app-divider)]">
        <input
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault()
              commitDraft()
            }
          }}
          onPaste={(event) => {
            const text = event.clipboardData.getData("text")
            if (splitModelEntries(text).length > 1) {
              event.preventDefault()
              commitDraft(text)
            }
          }}
          className="min-w-0 flex-1 bg-transparent px-3 text-[12.5px] text-[var(--app-text)] outline-none [font-family:var(--app-code-font)] placeholder:text-[var(--app-muted)]"
          placeholder="输入或粘贴模型 ID，回车添加"
        />
        <button
          type="button"
          className="flex h-9 w-9 shrink-0 items-center justify-center text-[var(--app-muted)] hover:bg-[var(--app-hover)] hover:text-[var(--app-text)] disabled:opacity-40"
          title="添加模型"
          onClick={() => commitDraft()}
          disabled={!draft.trim()}
        >
          <PlusIcon className="h-4 w-4" />
        </button>
      </div>
    </div>
  )
}

function EditorSection({
  icon: Icon,
  title,
  description,
  children,
}: {
  icon: IconComponent
  title: string
  description: string
  children: ReactNode
}) {
  return (
    <section className="border-b border-[var(--app-divider)] px-6 py-5 last:border-b-0">
      <header className="mb-4 flex items-start gap-3">
        <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-[var(--app-muted)]">
          <Icon className="h-4 w-4" />
        </span>
        <div className="min-w-0">
          <div className="text-[14px] font-semibold tracking-tight text-[var(--app-text)]">{title}</div>
          <div className="mt-1 text-[12px] leading-5 text-[var(--app-muted)]">{description}</div>
        </div>
      </header>
      <div className="space-y-3">{children}</div>
    </section>
  )
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-[var(--app-subtle)]">
        {label}
      </span>
      {children}
    </label>
  )
}

const inputBaseClass =
  "h-9 w-full rounded-md border bg-[var(--app-input)] px-3 text-[13px] text-[var(--app-text)] outline-none transition-colors placeholder:text-[var(--app-muted)] focus:border-[var(--app-accent)]"

function TextInput({
  value,
  onChange,
  placeholder,
  invalid,
  mono,
  list,
}: {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  invalid?: boolean
  mono?: boolean
  list?: string
}) {
  return (
    <input
      value={value}
      onChange={(event) => onChange(event.target.value)}
      placeholder={placeholder}
      list={list}
      className={cn(
        inputBaseClass,
        invalid ? "border-[var(--app-danger)]" : "border-[var(--app-border)]",
        mono && "[font-family:var(--app-code-font)] text-[12.5px]",
      )}
    />
  )
}

function TextareaControl({
  value,
  onChange,
  placeholder,
  mono,
  className,
}: {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  mono?: boolean
  className?: string
}) {
  return (
    <textarea
      value={value}
      onChange={(event) => onChange(event.target.value)}
      placeholder={placeholder}
      className={cn(
        "w-full resize-none rounded-md border border-[var(--app-border)] bg-[var(--app-input)] px-3 py-2 text-[13px] leading-5 text-[var(--app-text)] outline-none transition-colors placeholder:text-[var(--app-muted)] focus:border-[var(--app-accent)]",
        mono && "[font-family:var(--app-code-font)] text-[12.5px]",
        className,
      )}
    />
  )
}

function NumberInput({ value, onChange }: { value: number; onChange: (value: number) => void }) {
  return (
    <input
      type="number"
      min={1}
      step={1000}
      value={value}
      onChange={(event) => onChange(Number(event.target.value) || 1)}
      className={cn(inputBaseClass, "border-[var(--app-border)] tabular-nums")}
    />
  )
}

function SelectControl({
  value,
  options,
  onChange,
  mono,
}: {
  value: string
  options: Array<{ value: string; label: string }>
  onChange: (value: string) => void
  mono?: boolean
}) {
  const [open, setOpen] = useState(false)
  const selected = options.find((option) => option.value === value) ?? options[0]

  return (
    <div
      className="relative min-w-0"
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOpen(false)
      }}
    >
      <button
        type="button"
        className={cn(
          "flex h-9 w-full items-center justify-between gap-3 rounded-md border bg-[var(--app-input)] px-3 text-left text-[13px] text-[var(--app-text)] outline-none transition-colors",
          open ? "border-[var(--app-accent)]" : "border-[var(--app-border)] hover:bg-[var(--app-hover)]",
          mono && "[font-family:var(--app-code-font)] text-[12.5px]",
        )}
        onClick={() => setOpen((current) => !current)}
      >
        <span className="min-w-0 flex-1 truncate" title={selected?.label ?? value}>
          {selected?.label ?? value}
        </span>
        <ChevronDownIcon className={cn("h-4 w-4 shrink-0 text-[var(--app-muted)] transition-transform", open && "rotate-180")} />
      </button>
      {open ? (
        <div className="absolute left-0 top-[40px] z-40 max-h-64 w-full overflow-auto rounded-xl border border-[var(--app-border)] bg-[var(--app-panel)] p-1 shadow-xl shadow-black/30 ring-1 ring-black/5">
          {options.map((option) => (
            <button
              key={option.value}
              type="button"
              className={cn(
                "flex h-8 w-full items-center rounded-md px-2.5 text-left text-[13px] transition-colors",
                option.value === value
                  ? "bg-[var(--app-selected)] text-[var(--app-text)]"
                  : "text-[var(--app-muted)] hover:bg-[var(--app-hover)] hover:text-[var(--app-text)]",
                mono && "[font-family:var(--app-code-font)] text-[12.5px]",
              )}
              onClick={() => {
                onChange(option.value)
                setOpen(false)
              }}
            >
              <span className="min-w-0 truncate" title={option.label}>
                {option.label}
              </span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  )
}

function Switch({
  checked,
  disabled,
  title,
  onChange,
}: {
  checked: boolean
  disabled?: boolean
  title?: string
  onChange: (value: boolean) => void
}) {
  return (
    <button
      type="button"
      className={cn(
        "relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors disabled:cursor-not-allowed disabled:opacity-50",
        checked ? "bg-[var(--app-accent)]" : "bg-[var(--app-hover-strong)]",
      )}
      role="switch"
      aria-checked={checked}
      aria-label={title ?? "切换状态"}
      title={title}
      disabled={disabled}
      onClick={() => onChange(!checked)}
    >
      <span
        className={cn(
          "h-4 w-4 rounded-full bg-white shadow-sm transition-transform",
          checked ? "translate-x-[18px]" : "translate-x-0.5",
        )}
      />
    </button>
  )
}

function ToggleChip({ label, checked, onChange }: { label: string; checked: boolean; onChange: (value: boolean) => void }) {
  return (
    <button
      type="button"
      className={cn(
        "flex h-7 items-center gap-1.5 rounded-full border px-2.5 text-[12px] font-medium transition-colors",
        checked
          ? "border-[var(--app-accent)] bg-[var(--app-accent-soft)] text-[var(--app-text)]"
          : "border-[var(--app-border)] bg-transparent text-[var(--app-muted)] hover:bg-[var(--app-hover)] hover:text-[var(--app-text)]",
      )}
      onClick={() => onChange(!checked)}
    >
      <span
        className={cn(
          "h-1.5 w-1.5 rounded-full transition-colors",
          checked ? "bg-[var(--app-accent)]" : "bg-[var(--app-subtle)]",
        )}
      />
      {label}
    </button>
  )
}

function StatusPill({ tone, text }: { tone: "success" | "muted"; text: string }) {
  return (
    <span
      className={cn(
        "shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-medium",
        tone === "success"
          ? "border-[var(--app-border)] bg-[var(--app-selected)] text-[var(--app-text)]"
          : "border-[var(--app-border)] text-[var(--app-muted)]",
      )}
    >
      {text}
    </span>
  )
}

function Notice({ tone, text }: { tone: "success" | "warning" | "danger"; text: string }) {
  return (
    <div
      className={cn(
        "mb-4 rounded-lg border px-4 py-3 text-sm font-medium leading-6",
        tone === "danger"
          ? "border-[var(--app-danger)] bg-[var(--app-danger-soft)] text-[var(--app-text)]"
          : tone === "warning"
            ? "border-[var(--app-warning)] bg-[color-mix(in_srgb,var(--app-warning)_14%,transparent)] text-[var(--app-text)]"
            : "border-[var(--app-border)] bg-[var(--app-panel-2)] text-[var(--app-text)]",
      )}
    >
      {text}
    </div>
  )
}

function upsertProvider(
  providers: GuiThirdPartyProvider[],
  originalId: string | null | undefined,
  provider: GuiThirdPartyProvider,
) {
  const normalized = normalizeProviderPatch(provider, {})
  const targetId = originalId ?? normalized.id
  const index = providers.findIndex((item) => item.id === targetId || item.id === normalized.id)
  if (index < 0) return [...providers, normalized]
  return providers.map((item, itemIndex) => (itemIndex === index ? normalized : item))
}

function normalizeProviderPatch(provider: GuiThirdPartyProvider, patch: Partial<GuiThirdPartyProvider>): GuiThirdPartyProvider {
  const next = { ...provider, ...patch }
  const models = uniqueModels(next.models)
  return {
    ...next,
    id: next.id.trim(),
    models,
    defaultModel: next.defaultModel && models.includes(next.defaultModel) ? next.defaultModel : models[0] || "",
  }
}

export function providerPatchFromFetchedModels(
  provider: Pick<GuiThirdPartyProvider, "defaultModel">,
  fetchedModels: string[],
): Pick<GuiThirdPartyProvider, "models" | "defaultModel"> {
  const models = uniqueModels(fetchedModels)
  return {
    models,
    defaultModel: provider.defaultModel && models.includes(provider.defaultModel) ? provider.defaultModel : models[0] || "",
  }
}

function splitModelEntries(value: string) {
  return uniqueModels(value.split(/[\r\n,;]+/))
}

function uniqueModels(value: string[]) {
  return Array.from(new Set(value.map((model) => model.trim()).filter(Boolean)))
}

function cleanProviderId(value: unknown, index: number) {
  const id = typeof value === "string" ? value.trim() : ""
  if (isValidProviderId(id)) return id
  return `custom-provider-${index + 1}`
}

function isValidProviderId(value: string) {
  return /^[A-Za-z0-9][A-Za-z0-9_-]*$/.test(value.trim())
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : error ? String(error) : "操作失败"
}
