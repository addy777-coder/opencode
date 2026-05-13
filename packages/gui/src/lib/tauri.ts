import { invoke } from "@tauri-apps/api/core"
import { listen } from "@tauri-apps/api/event"
import { getCurrentWindow } from "@tauri-apps/api/window"

export type ServerStatus = {
  healthy: boolean
  mode: "local" | "remote" | "unconfigured"
  baseUrl?: string | null
  message: string
}

export type ServerStartInput = {
  baseUrl?: string
  mode?: "local" | "remote"
  proxy?: NetworkProxyConfig | null
}

export type NetworkProxyConfig = {
  enabled: boolean
  protocol: "http" | "https"
  host: string
  port?: number | null
  username?: string | null
  password?: string | null
  noProxy?: string | null
}

export type GuiUpdateInput = {
  proxy?: NetworkProxyConfig | null
}

export type NetworkProxyTestInput = {
  proxy?: NetworkProxyConfig | null
  targetUrl: string
}

export type NetworkProxyTestResult = {
  ok: boolean
  status?: number | null
  url: string
  message: string
  elapsedMs: number
}

export type WorkspaceRecord = {
  id: string
  path: string
  name?: string | null
  lastOpenedAt: number
}

export type WorkspaceOpenInput = {
  path: string
  name?: string
}

export type WorkspaceRemoveInput = {
  id: string
}

export type ThreadActivityItem = {
  id: string
  kind: string
  status: "pending" | "running" | "success" | "failed" | "waiting" | "warning" | string
  title: string
  detail?: string | null
  sourceEventType: string
  sessionId?: string | null
  directory?: string | null
  createdAt: number
  raw: unknown
}

export type OpenCodeSession = {
  id: string
  title: string
  directory?: string | null
  path?: string | null
  parentId?: string | null
  projectName?: string | null
  updatedAt?: number | null
  createdAt?: number | null
  archivedAt?: number | null
  changedFiles?: number | null
}

export type OpenCodeSessionStatus = {
  type: "idle" | "busy" | "retry" | string
  attempt?: number
  message?: string
  next?: number
}

export type OpenCodeSessionStatusMap = Record<string, OpenCodeSessionStatus>

export type PermissionInfo = {
  id: string
  sessionId?: string | null
  permission: string
  patterns: string[]
  always: string[]
  metadata: unknown
  tool?: unknown
  raw: unknown
}

export type QuestionOption = {
  label: string
  description: string
}

export type QuestionPrompt = {
  question: string
  header: string
  options: QuestionOption[]
  multiple?: boolean
  custom?: boolean
}

export type QuestionToolRef = {
  messageId: string
  callId: string
}

export type QuestionInfo = {
  id: string
  sessionId: string
  questions: QuestionPrompt[]
  tool?: QuestionToolRef | null
  raw: unknown
}

export type OpenCodeEventEnvelope = {
  directory?: string | null
  project?: string | null
  workspace?: string | null
  payload: unknown
}

export type PermissionRule = {
  permission: string
  pattern: string
  action: "allow" | "deny" | "ask"
}

export type OpenCodeMessagePart = {
  id?: string | null
  kind: string
  text?: string | null
  title?: string | null
  status?: string | null
  tool?: string | null
  file?: string | null
  raw: unknown
}

export type OpenCodeMessage = {
  id: string
  sessionId?: string | null
  role: string
  text: string
  agent?: string | null
  model?: string | null
  status?: string | null
  createdAt?: number | null
  completedAt?: number | null
  parts: OpenCodeMessagePart[]
  raw: unknown
}

export type SessionDiffFile = {
  file: string
  patch: string
  additions: number
  deletions: number
  status: "added" | "deleted" | "modified" | string
  raw: unknown
}

export type OpenCodeAgent = {
  name: string
  description?: string | null
  mode: string
  native: boolean
  hidden: boolean
  color?: string | null
  modelProviderId?: string | null
  modelId?: string | null
  raw: unknown
}

export type OpenCodeProvider = {
  id: string
  name: string
  source?: string | null
  connected: boolean
  modelCount: number
  defaultModelId?: string | null
}

export type OpenCodeModel = {
  id: string
  name: string
  providerId: string
  providerName: string
  status: string
  family?: string | null
  context?: number | null
  input?: number | null
  output?: number | null
  supportsReasoning: boolean
  supportsAttachment: boolean
  raw: unknown
}

export type OpenCodeCommand = {
  name: string
  description?: string | null
  source?: string | null
  raw: unknown
}

export type OpenCodeSkill = {
  name: string
  description: string
  location: string
  content: string
  enabled: boolean
}

export type OpenCodeSkillRecommendation = {
  name: string
  title: string
  description: string
  repo: string
  path: string
  refName: string
  installed: boolean
}

export type ExecutionOptions = {
  agents: OpenCodeAgent[]
  providers: OpenCodeProvider[]
  models: OpenCodeModel[]
  defaultAgent?: string | null
  defaultProviderId?: string | null
  defaultModelId?: string | null
}

export type McpStatusInfo = {
  status: "connected" | "disabled" | "failed" | "needs_auth" | "needs_client_registration" | string
  error?: string | null
}

export type McpStatusMap = Record<string, McpStatusInfo>

export type PlaywrightInstallState = {
  rootPath: string
  rootExists: boolean
  envOverride?: string | null
  chromium: boolean
  firefox: boolean
  webkit: boolean
}

export type LocalFilePreview = {
  path: string
  name: string
  size: number
  content?: string | null
  truncated: boolean
  binary: boolean
}

export type FileTreeInput = {
  directory: string
  root?: string
  maxDepth?: number
  maxEntries?: number
}

export type FileTreeEntry = {
  path: string
  name: string
  kind: "directory" | "file" | string
  depth: number
  size?: number | null
  modified?: number | null
}

export type McpServerConfig =
  | {
      type: "local"
      command: string[]
      environment?: Record<string, string>
      enabled?: boolean
      timeout?: number
    }
  | {
      type: "remote"
      url: string
      headers?: Record<string, string>
      oauth?: false | Record<string, string>
      enabled?: boolean
      timeout?: number
    }

export type ThirdPartyProviderProtocol = "openai-compatible" | "anthropic"

export type ThirdPartyProviderConfig = {
  id: string
  name: string
  protocol: ThirdPartyProviderProtocol
  baseUrl: string
  models: string[]
  defaultModel?: string | null
  headers: string
  timeout?: number | null
  chunkTimeout?: number | null
  contextLimit?: number | null
  outputLimit?: number | null
  supportsReasoning: boolean
  supportsAttachment: boolean
}

export type ThirdPartyProviderApplyInput = {
  baseUrl?: string
  provider: ThirdPartyProviderConfig
  apiKey?: string | null
  originalProviderId?: string | null
}

export type ThirdPartyProviderRemoveInput = {
  baseUrl?: string
  providerId: string
}

export type ThirdPartyProviderAuthStatusInput = {
  baseUrl?: string
}

export type ThirdPartyProviderAuthStatus = {
  stored: boolean
  type?: string | null
}

export type ThirdPartyProviderAuthStatusMap = Record<string, ThirdPartyProviderAuthStatus>

export type ThirdPartyProviderModelsInput = {
  requestUrl: string
  apiKey: string
  protocol: ThirdPartyProviderProtocol
  headers: string
}

export type SessionListInput = {
  baseUrl?: string
  directory?: string
  limit?: number
  archived?: boolean
}

export type SessionStatusInput = {
  baseUrl?: string
  directory?: string
}

export type SessionCreateInput = {
  baseUrl?: string
  directory?: string
  title?: string
  permission?: PermissionRule[]
}

export type SessionUpdateTitleInput = {
  baseUrl?: string
  directory?: string
  sessionId: string
  title: string
}

export type SessionUpdatePermissionInput = {
  baseUrl?: string
  directory?: string
  sessionId: string
  permission: PermissionRule[]
}

export type SessionUpdateArchivedInput = {
  baseUrl?: string
  directory?: string
  sessionId: string
  archived: boolean
}

export type SessionForkInput = {
  baseUrl?: string
  directory?: string
  sessionId: string
  messageId?: string
}

export type SessionPromptAttachmentInput = {
  mime: string
  filename?: string
  url: string
}

export type SessionPromptInput = {
  baseUrl?: string
  directory?: string
  sessionId: string
  text: string
  attachments?: SessionPromptAttachmentInput[]
  system?: string
  agent?: string
  providerId?: string
  modelId?: string
  permission?: PermissionRule[]
}

export type SessionAbortInput = {
  baseUrl?: string
  directory?: string
  sessionId: string
}

export type SessionDeleteInput = {
  baseUrl?: string
  directory?: string
  sessionId: string
}

export type SessionMessageDeleteInput = {
  baseUrl?: string
  directory?: string
  sessionId: string
  messageId: string
}

export type SessionMessageUpdateTextInput = {
  baseUrl?: string
  directory?: string
  sessionId: string
  messageId: string
  partId: string
  part: unknown
  text: string
}

export type SessionMessagesInput = {
  baseUrl?: string
  directory?: string
  sessionId: string
  limit?: number
}

export type SessionDiffInput = {
  baseUrl?: string
  directory?: string
  sessionId: string
  messageId?: string
}

export type ExecutionOptionsInput = {
  baseUrl?: string
  directory?: string
}

export type FileSearchInput = {
  baseUrl?: string
  directory?: string
  query: string
  limit?: number
}

export type TextSearchInput = {
  baseUrl?: string
  directory?: string
  pattern: string
  limit?: number
}

export type TextSearchSubmatch = {
  text: string
  start: number
  end: number
}

export type TextSearchMatch = {
  path: string
  line: string
  lineNumber: number
  absoluteOffset: number
  submatches: TextSearchSubmatch[]
  raw: unknown
}

export type SymbolSearchInput = {
  baseUrl?: string
  directory?: string
  query: string
  limit?: number
}

export type OpenCodeSymbol = {
  name: string
  kind: number
  uri?: string | null
  line?: number | null
  character?: number | null
  raw: unknown
}

export type GitStatusInput = {
  baseUrl?: string
  directory: string
}

export type WorkspaceFileDiffInput = {
  baseUrl?: string
  directory: string
  files: string[]
}

export type GitStatus = {
  rootPath: string
  branch?: string | null
  detached: boolean
  dirty: boolean
  ahead: number
  behind: number
}

export type CommandListInput = {
  baseUrl?: string
  directory?: string
}

export type SkillListInput = {
  baseUrl?: string
  directory?: string
}

export type SkillInstallInput = {
  name: string
  repo?: string
  path?: string
  refName?: string
  baseUrl?: string
  directory?: string
}

export type SkillSetEnabledInput = {
  name: string
  enabled: boolean
  baseUrl?: string
  directory?: string
}

export type SkillUninstallInput = {
  name: string
  location: string
  baseUrl?: string
  directory?: string
}

export type PtyListInput = {
  baseUrl?: string
  directory?: string
}

export type PtyShellInfo = {
  path: string
  name: string
  acceptable: boolean
}

export type PtyInfo = {
  id: string
  title: string
  command: string
  args: string[]
  cwd: string
  status: "running" | "exited" | string
  pid: number
}

export type PtySize = {
  rows: number
  cols: number
}

export type PtyCreateInput = PtyListInput & {
  command?: string
  args?: string[]
  cwd?: string
  title?: string
  env?: Record<string, unknown>
}

export type PtyUpdateInput = PtyListInput & {
  ptyId: string
  title?: string
  size?: PtySize
}

export type PtyIdInput = PtyListInput & {
  ptyId: string
}

export type PtyConnectToken = {
  ticket: string
  expiresIn: number
}

export type McpStatusInput = {
  baseUrl?: string
  directory?: string
}

export type McpAddInput = {
  baseUrl?: string
  directory?: string
  name: string
  config: McpServerConfig
}

export type McpNameInput = {
  baseUrl?: string
  directory?: string
  name: string
}

export type PermissionListInput = {
  baseUrl?: string
  directory?: string
}

export type PermissionReplyInput = {
  baseUrl?: string
  directory?: string
  requestId: string
  reply: "once" | "always" | "reject"
  message?: string
}

export type QuestionListInput = {
  baseUrl?: string
  directory?: string
}

export type QuestionReplyInput = {
  baseUrl?: string
  directory?: string
  requestId: string
  /** Per-question selected labels. Inner array has one entry for single-select. */
  answers: string[][]
}

export type QuestionRejectInput = {
  baseUrl?: string
  directory?: string
  requestId: string
}

export type AppInitResult = {
  version: string
  databaseReady: boolean
  server: ServerStatus
}

export type GuiUpdateCheckResult = {
  available: boolean
  currentVersion: string
  version?: string | null
  body?: string | null
  date?: number | null
  releaseUrl: string
}

const hasTauri = () => typeof window !== "undefined" && "__TAURI_INTERNALS__" in window

const fallback: AppInitResult = {
  version: "0.1.0",
  databaseReady: false,
  server: {
    healthy: false,
    mode: "unconfigured",
    baseUrl: null,
    message: "请通过 Tauri 启动以启用本地后端",
  },
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null
}

function stringField(value: unknown, key: string) {
  const field = asRecord(value)?.[key]
  return typeof field === "string" ? field : undefined
}

function numberField(value: unknown, key: string) {
  const field = asRecord(value)?.[key]
  return typeof field === "number" && Number.isFinite(field) ? field : undefined
}

function projectNameFromDirectory(directory?: string | null) {
  return directory?.split(/[\\/]/).filter(Boolean).at(-1) ?? "OpenCode 工作台"
}

function sessionFromApiValue(value: unknown, input: { sessionId?: string; directory?: string | null }): OpenCodeSession {
  const record = asRecord(value) ?? {}
  const time = asRecord(record.time)
  const summary = asRecord(record.summary)
  const project = asRecord(record.project)
  const directory = stringField(record, "directory") ?? input.directory ?? null
  return {
    id: stringField(record, "id") ?? input.sessionId ?? "unknown",
    title: stringField(record, "title")?.trim() || "未命名线程",
    directory,
    path: stringField(record, "path"),
    parentId: stringField(record, "parentID") ?? stringField(record, "parentId"),
    projectName: stringField(project, "name") ?? stringField(project, "id") ?? projectNameFromDirectory(directory),
    updatedAt: numberField(time, "updated") ?? numberField(record, "updatedAt"),
    createdAt: numberField(time, "created") ?? numberField(record, "createdAt"),
    archivedAt: numberField(time, "archived") ?? numberField(record, "archivedAt") ?? null,
    changedFiles: numberField(summary, "files") ?? numberField(record, "changedFiles"),
  }
}

async function responseError(response: Response) {
  const body = await response.text().catch(() => "")
  const preview = body.trim().slice(0, 300)
  return new Error(`HTTP ${response.status}${preview ? `：${preview}` : ""}`)
}

async function sessionUpdateArchivedHttp(input: SessionUpdateArchivedInput): Promise<OpenCodeSession> {
  const baseUrl = input.baseUrl?.trim()
  if (!baseUrl) throw new Error("OpenCode server 地址为空")
  const url = new URL(`${baseUrl.replace(/\/+$/, "")}/session/${encodeURIComponent(input.sessionId)}`)
  if (input.directory?.trim()) url.searchParams.set("directory", input.directory)
  const archivedAt = input.archived ? Date.now() : null
  const response = await fetch(url, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ time: { archived: archivedAt } }),
  })
  if (!response.ok) throw await responseError(response)
  const session = sessionFromApiValue(await response.json(), input)
  if (!input.archived && session.archivedAt) throw new Error("OpenCode server 未清除归档状态")
  if (input.archived && !session.archivedAt) throw new Error("OpenCode server 未写入归档状态")
  return session
}

export async function appInit(): Promise<AppInitResult> {
  if (!hasTauri()) return fallback
  return invoke<AppInitResult>("app_init")
}

export async function guiUpdateCheck(input: GuiUpdateInput = {}): Promise<GuiUpdateCheckResult> {
  if (!hasTauri()) {
    return {
      available: false,
      currentVersion: fallback.version,
      version: null,
      body: null,
      date: null,
      releaseUrl: "https://github.com/addy777-coder/opencode/releases",
    }
  }
  return invoke<GuiUpdateCheckResult>("gui_update_check", { input })
}

export async function guiUpdateInstall(input: GuiUpdateInput = {}): Promise<void> {
  if (!hasTauri()) throw new Error("请通过 Tauri 启动以安装更新")
  return invoke<void>("gui_update_install", { input })
}

export async function networkProxyTest(input: NetworkProxyTestInput): Promise<NetworkProxyTestResult> {
  if (!hasTauri()) {
    return {
      ok: false,
      status: null,
      url: input.targetUrl,
      message: "请通过 Tauri 启动以测试网络代理",
      elapsedMs: 0,
    }
  }
  return invoke<NetworkProxyTestResult>("network_proxy_test", { input })
}

export async function serverStatus(): Promise<ServerStatus> {
  if (!hasTauri()) return fallback.server
  return invoke<ServerStatus>("server_status")
}

export async function threadActivityRecent(): Promise<ThreadActivityItem[]> {
  if (!hasTauri()) return []
  return invoke<ThreadActivityItem[]>("thread_activity_recent")
}

export async function sessionList(input: SessionListInput): Promise<OpenCodeSession[]> {
  if (!hasTauri()) return []
  return invoke<OpenCodeSession[]>("session_list", { input })
}

export async function sessionStatus(input: SessionStatusInput): Promise<OpenCodeSessionStatusMap> {
  if (!hasTauri()) return {}
  return invoke<OpenCodeSessionStatusMap>("session_status", { input })
}

export async function sessionCreate(input: SessionCreateInput): Promise<OpenCodeSession> {
  if (!hasTauri()) {
    const now = Date.now()
    return {
      id: `local_${now}`,
      title: input.title ?? "新对话",
      directory: input.directory,
      projectName: input.directory?.split(/[\\/]/).filter(Boolean).at(-1) ?? "OpenCode 工作台",
      createdAt: now,
      updatedAt: now,
      archivedAt: null,
      changedFiles: 0,
    }
  }
  return invoke<OpenCodeSession>("session_create", { input })
}

export async function sessionUpdateTitle(input: SessionUpdateTitleInput): Promise<OpenCodeSession> {
  if (!hasTauri()) {
    const now = Date.now()
    return {
      id: input.sessionId,
      title: input.title,
      directory: input.directory,
      projectName: input.directory?.split(/[\\/]/).filter(Boolean).at(-1) ?? "OpenCode 工作台",
      createdAt: now,
      updatedAt: now,
      archivedAt: null,
      changedFiles: 0,
    }
  }
  return invoke<OpenCodeSession>("session_update_title", { input })
}

export async function sessionUpdatePermission(input: SessionUpdatePermissionInput): Promise<void> {
  if (!hasTauri()) return
  return invoke<void>("session_update_permission", { input })
}

export async function sessionUpdateArchived(input: SessionUpdateArchivedInput): Promise<OpenCodeSession> {
  if (!hasTauri()) {
    if (input.baseUrl) return sessionUpdateArchivedHttp(input)
    const now = Date.now()
    return {
      id: input.sessionId,
      title: "未命名线程",
      directory: input.directory,
      projectName: projectNameFromDirectory(input.directory),
      createdAt: now,
      updatedAt: now,
      archivedAt: input.archived ? now : null,
      changedFiles: 0,
    }
  }
  try {
    return await invoke<OpenCodeSession>("session_update_archived", { input })
  } catch (error) {
    try {
      return await sessionUpdateArchivedHttp(input)
    } catch (fallbackError) {
      const primary = error instanceof Error ? error.message : String(error)
      const fallback = fallbackError instanceof Error ? fallbackError.message : String(fallbackError)
      throw new Error(`Tauri 调用失败：${primary}；HTTP 兜底失败：${fallback}`)
    }
  }
}

export async function sessionFork(input: SessionForkInput): Promise<OpenCodeSession> {
  if (!hasTauri()) {
    const now = Date.now()
    return {
      id: `${input.sessionId}_fork_${now}`,
      title: "派生对话",
      directory: input.directory,
      projectName: input.directory?.split(/[\\/]/).filter(Boolean).at(-1) ?? "OpenCode 工作台",
      createdAt: now,
      updatedAt: now,
      archivedAt: null,
      changedFiles: 0,
      parentId: input.sessionId,
    }
  }
  return invoke<OpenCodeSession>("session_fork", { input })
}

export async function sessionPrompt(input: SessionPromptInput): Promise<void> {
  if (!hasTauri()) return
  return invoke<void>("session_prompt", { input })
}

export async function sessionAbort(input: SessionAbortInput): Promise<void> {
  if (!hasTauri()) return
  return invoke<void>("session_abort", { input })
}

export async function sessionDelete(input: SessionDeleteInput): Promise<void> {
  if (!hasTauri()) return
  return invoke<void>("session_delete", { input })
}

export async function sessionMessageDelete(input: SessionMessageDeleteInput): Promise<void> {
  if (!hasTauri()) return
  return invoke<void>("session_message_delete", { input })
}

export async function sessionMessageUpdateText(input: SessionMessageUpdateTextInput): Promise<void> {
  if (!hasTauri()) return
  return invoke<void>("session_message_update_text", { input })
}

export async function sessionMessages(input: SessionMessagesInput): Promise<OpenCodeMessage[]> {
  if (!hasTauri()) return []
  return invoke<OpenCodeMessage[]>("session_messages", { input })
}

export async function sessionDiff(input: SessionDiffInput): Promise<SessionDiffFile[]> {
  if (!hasTauri()) return []
  return invoke<SessionDiffFile[]>("session_diff", { input })
}

export async function executionOptions(input: ExecutionOptionsInput): Promise<ExecutionOptions> {
  if (!hasTauri()) {
    return {
      agents: [
        {
          name: "build",
          description: "默认执行 agent",
          mode: "primary",
          native: true,
          hidden: false,
          raw: {},
        },
      ],
      providers: [],
      models: [],
      defaultAgent: "build",
      defaultProviderId: null,
      defaultModelId: null,
    }
  }
  return invoke<ExecutionOptions>("execution_options", { input })
}

export async function fileSearch(input: FileSearchInput): Promise<string[]> {
  if (!hasTauri()) return []
  return invoke<string[]>("file_search", { input })
}

export async function textSearch(input: TextSearchInput): Promise<TextSearchMatch[]> {
  if (!hasTauri()) return []
  return invoke<TextSearchMatch[]>("text_search", { input })
}

export async function symbolSearch(input: SymbolSearchInput): Promise<OpenCodeSymbol[]> {
  if (!hasTauri()) return []
  return invoke<OpenCodeSymbol[]>("symbol_search", { input })
}

export async function gitStatus(input: GitStatusInput): Promise<GitStatus | null> {
  if (!hasTauri()) return null
  return invoke<GitStatus | null>("git_status", { input })
}

export async function workspaceFileDiffs(input: WorkspaceFileDiffInput): Promise<SessionDiffFile[]> {
  if (!hasTauri()) return []
  return invoke<SessionDiffFile[]>("workspace_file_diffs", { input })
}

export async function commandList(input: CommandListInput): Promise<OpenCodeCommand[]> {
  if (!hasTauri()) return []
  return invoke<OpenCodeCommand[]>("command_list", { input })
}

export async function skillList(input: SkillListInput): Promise<OpenCodeSkill[]> {
  if (!hasTauri()) return []
  return invoke<OpenCodeSkill[]>("skill_list", { input })
}

export async function skillRecommendations(): Promise<OpenCodeSkillRecommendation[]> {
  if (!hasTauri()) return []
  return invoke<OpenCodeSkillRecommendation[]>("skill_recommendations")
}

export async function skillInstall(input: SkillInstallInput): Promise<OpenCodeSkill> {
  if (!hasTauri()) {
    return {
      name: input.name,
      description: "",
      location: "",
      content: "",
      enabled: true,
    }
  }
  return invoke<OpenCodeSkill>("skill_install", { input })
}

export async function skillSetEnabled(input: SkillSetEnabledInput): Promise<void> {
  if (!hasTauri()) return
  return invoke<void>("skill_set_enabled", { input })
}

export async function skillUninstall(input: SkillUninstallInput): Promise<void> {
  if (!hasTauri()) return
  return invoke<void>("skill_uninstall", { input })
}

export async function ptyShells(input: PtyListInput): Promise<PtyShellInfo[]> {
  if (!hasTauri()) return []
  return invoke<PtyShellInfo[]>("pty_shells", { input })
}

export async function ptyList(input: PtyListInput): Promise<PtyInfo[]> {
  if (!hasTauri()) return []
  return invoke<PtyInfo[]>("pty_list", { input })
}

export async function ptyCreate(input: PtyCreateInput): Promise<PtyInfo> {
  if (!hasTauri()) {
    const id = `pty_local_${Date.now()}`
    return {
      id,
      title: input.title ?? `Terminal ${id.slice(-4)}`,
      command: input.command ?? "shell",
      args: input.args ?? [],
      cwd: input.cwd ?? input.directory ?? "",
      status: "running",
      pid: 0,
    }
  }
  return invoke<PtyInfo>("pty_create", { input })
}

export async function ptyUpdate(input: PtyUpdateInput): Promise<PtyInfo> {
  if (!hasTauri()) {
    return {
      id: input.ptyId,
      title: input.title ?? `Terminal ${input.ptyId.slice(-4)}`,
      command: "shell",
      args: [],
      cwd: input.directory ?? "",
      status: "running",
      pid: 0,
    }
  }
  return invoke<PtyInfo>("pty_update", { input })
}

export async function ptyRemove(input: PtyIdInput): Promise<void> {
  if (!hasTauri()) return
  return invoke<void>("pty_remove", { input })
}

export async function ptyConnectToken(input: PtyIdInput): Promise<PtyConnectToken> {
  if (!hasTauri()) {
    return { ticket: "local", expiresIn: 60 }
  }
  return invoke<PtyConnectToken>("pty_connect_token", { input })
}

export async function mcpStatus(input: McpStatusInput): Promise<McpStatusMap> {
  if (!hasTauri()) return {}
  return invoke<McpStatusMap>("mcp_status", { input })
}

export async function mcpAdd(input: McpAddInput): Promise<McpStatusMap> {
  if (!hasTauri()) return { [input.name]: { status: input.config.enabled === false ? "disabled" : "connected" } }
  return invoke<McpStatusMap>("mcp_add", { input })
}

export async function mcpConnect(input: McpNameInput): Promise<void> {
  if (!hasTauri()) return
  return invoke<void>("mcp_connect", { input })
}

export async function mcpDisconnect(input: McpNameInput): Promise<void> {
  if (!hasTauri()) return
  return invoke<void>("mcp_disconnect", { input })
}

export async function thirdPartyProviderApply(input: ThirdPartyProviderApplyInput): Promise<unknown> {
  if (!hasTauri()) return {}
  return invoke<unknown>("third_party_provider_apply", { input })
}

export async function thirdPartyProviderRemove(input: ThirdPartyProviderRemoveInput): Promise<unknown> {
  if (!hasTauri()) return {}
  return invoke<unknown>("third_party_provider_remove", { input })
}

export async function thirdPartyProviderAuthStatus(
  input: ThirdPartyProviderAuthStatusInput,
): Promise<ThirdPartyProviderAuthStatusMap> {
  if (!hasTauri()) return {}
  return invoke<ThirdPartyProviderAuthStatusMap>("third_party_provider_auth_status", { input })
}

export async function thirdPartyProviderModels(input: ThirdPartyProviderModelsInput): Promise<string[]> {
  if (!hasTauri()) return []
  return invoke<string[]>("third_party_provider_models", { input })
}

export async function detectPlaywrightInstall(): Promise<PlaywrightInstallState> {
  if (!hasTauri()) {
    return {
      rootPath: "",
      rootExists: false,
      envOverride: null,
      chromium: false,
      firefox: false,
      webkit: false,
    }
  }
  return invoke<PlaywrightInstallState>("detect_playwright_install")
}

export async function permissionList(input: PermissionListInput): Promise<PermissionInfo[]> {
  if (!hasTauri()) return []
  return invoke<PermissionInfo[]>("permission_list", { input })
}

export async function permissionReply(input: PermissionReplyInput): Promise<void> {
  if (!hasTauri()) return
  return invoke<void>("permission_reply", { input })
}

export async function questionList(input: QuestionListInput): Promise<QuestionInfo[]> {
  if (!hasTauri()) return []
  return invoke<QuestionInfo[]>("question_list", { input })
}

export async function questionReply(input: QuestionReplyInput): Promise<void> {
  if (!hasTauri()) return
  return invoke<void>("question_reply", { input })
}

export async function questionReject(input: QuestionRejectInput): Promise<void> {
  if (!hasTauri()) return
  return invoke<void>("question_reject", { input })
}

export async function subscribeThreadActivity(
  handler: (activity: ThreadActivityItem) => void,
): Promise<() => void> {
  if (!hasTauri()) return () => undefined
  return listen<ThreadActivityItem>("thread.activity", (event) => handler(event.payload))
}

export async function subscribeOpenCodeEvent(
  handler: (event: OpenCodeEventEnvelope) => void,
): Promise<() => void> {
  if (!hasTauri()) return () => undefined
  return listen<OpenCodeEventEnvelope>("opencode.event", (event) => handler(event.payload))
}

export async function serverStart(input: ServerStartInput): Promise<ServerStatus> {
  if (!hasTauri()) {
    return {
      healthy: false,
      mode: input.mode ?? "local",
      baseUrl: input.baseUrl ?? "http://127.0.0.1:4096",
      message: "请通过 Tauri 启动以连接 OpenCode server",
    }
  }
  return invoke<ServerStatus>("server_start", { input })
}

export async function serverStop(): Promise<void> {
  if (!hasTauri()) return
  return invoke<void>("server_stop")
}

export async function workspacePick(): Promise<string | null> {
  if (!hasTauri()) return null
  return invoke<string | null>("workspace_pick")
}

export async function workspaceOpen(input: WorkspaceOpenInput): Promise<WorkspaceRecord> {
  if (!hasTauri()) {
    return {
      id: `wks_${input.path}`,
      path: input.path,
      name: input.name ?? input.path.split(/[\\/]/).filter(Boolean).at(-1) ?? input.path,
      lastOpenedAt: Date.now(),
    }
  }
  return invoke<WorkspaceRecord>("workspace_open", { input })
}

export async function workspaceList(): Promise<WorkspaceRecord[]> {
  if (!hasTauri()) {
    const current = await settingsGet<WorkspaceRecord>("currentWorkspace")
    return current ? [current] : []
  }
  return invoke<WorkspaceRecord[]>("workspace_list")
}

export async function workspaceRemove(input: WorkspaceRemoveInput): Promise<void> {
  if (!hasTauri()) return
  return invoke<void>("workspace_remove", { input })
}

export async function settingsGet<T = unknown>(key: string): Promise<T | null> {
  if (!hasTauri()) {
    const raw = window.localStorage.getItem(`opencode-gui:${key}`)
    return raw ? (JSON.parse(raw) as T) : null
  }
  return invoke<T | null>("settings_get", { key })
}

export async function settingsSet(key: string, value: unknown): Promise<void> {
  if (!hasTauri()) {
    window.localStorage.setItem(`opencode-gui:${key}`, JSON.stringify(value))
    return
  }
  return invoke<void>("settings_set", { key, value })
}

export type OpenPathTarget = "terminal" | "editor" | "system" | "cursor" | "explorer"
export type IntegratedShell = "powershell" | "cmd" | "gitbash"

export async function openPath(
  path: string,
  options?: {
    target?: OpenPathTarget
    shell?: IntegratedShell
  },
): Promise<void> {
  if (!hasTauri()) return
  return invoke<void>("open_path", {
    path,
    target: options?.target,
    shell: options?.shell,
  })
}

export async function readFilePreview(path: string): Promise<LocalFilePreview> {
  if (!hasTauri()) {
    return {
      path,
      name: path.split(/[\\/]/).filter(Boolean).at(-1) ?? path,
      size: 0,
      content: null,
      truncated: false,
      binary: true,
    }
  }
  return invoke<LocalFilePreview>("read_file_preview", { path })
}

export async function fileTree(input: FileTreeInput): Promise<FileTreeEntry[]> {
  if (!hasTauri()) return []
  return invoke<FileTreeEntry[]>("file_tree", { input })
}

export async function openUrl(url: string): Promise<void> {
  if (!hasTauri()) {
    window.open(url, "_blank", "noopener,noreferrer")
    return
  }
  return invoke<void>("open_url", { url })
}

export async function windowMinimize(): Promise<void> {
  if (!hasTauri()) return
  return getCurrentWindow().minimize()
}

export async function windowToggleMaximize(): Promise<void> {
  if (!hasTauri()) return
  return getCurrentWindow().toggleMaximize()
}

export async function windowStartDragging(): Promise<void> {
  if (!hasTauri()) return
  return getCurrentWindow().startDragging()
}

export async function windowClose(): Promise<void> {
  if (!hasTauri()) return
  return getCurrentWindow().close()
}
