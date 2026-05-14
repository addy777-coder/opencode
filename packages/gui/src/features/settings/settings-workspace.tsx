import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentType,
  type CSSProperties,
  type ReactNode,
  type SVGProps,
} from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import {
  BarChart3,
  Blocks,
  CheckCircle2,
  ChevronDown,
  Circle,
  Clock3,
  Copy,
  Edit3,
  EyeOff,
  ExternalLink,
  GitBranch,
  Globe2,
  Loader2,
  Monitor,
  Moon,
  Network,
  Plus,
  RotateCcw,
  PanelRight,
  Plug,
  Power,
  RefreshCw,
  Settings,
  ShieldCheck,
  SlidersHorizontal,
  Star,
  Sun,
  TerminalSquare,
  Trash2,
  Type,
  Wrench,
} from "lucide-react"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  applyModelPreferences,
  modelKeyFromRef,
  modelPreferenceKey,
  normalizeModelPreferenceKeys,
  normalizeModelVariants,
  toggleModelFavoriteKey,
  toggleModelHiddenKey,
  type ModelVariant,
} from "@/features/provider/model-preferences"
import {
  ThirdPartyApiSettings,
  normalizeThirdPartyProviders,
  type GuiThirdPartyProvider,
} from "@/features/settings/third-party-api"
import {
  detectPlaywrightInstall,
  mcpAdd,
  mcpDisconnect,
  mcpStatus,
  networkProxyTest,
  openPath,
  sessionList,
  sessionMessages,
  sessionUpdateArchived,
  settingsGet,
  settingsSet,
  type GuiUpdateCheckResult,
  type OpenCodeMessage,
  type OpenCodeModel,
  type OpenCodeSession,
  type McpServerConfig,
  type McpStatusInfo,
  type NetworkProxyConfig,
  type PermissionRule,
  type ServerStatus,
} from "@/lib/tauri"
import { cn } from "@/lib/utils"
import { GUI_UPDATE_RELEASE_URL } from "./update-settings"

type IconComponent = ComponentType<SVGProps<SVGSVGElement>>

const BarChart3Icon = BarChart3 as IconComponent
const BlocksIcon = Blocks as IconComponent
const CheckCircle2Icon = CheckCircle2 as IconComponent
const ChevronDownIcon = ChevronDown as IconComponent
const CircleIcon = Circle as IconComponent
const Clock3Icon = Clock3 as IconComponent
const CopyIcon = Copy as IconComponent
const Edit3Icon = Edit3 as IconComponent
const EyeOffIcon = EyeOff as IconComponent
const ExternalLinkIcon = ExternalLink as IconComponent
const GitBranchIcon = GitBranch as IconComponent
const Globe2Icon = Globe2 as IconComponent
const Loader2Icon = Loader2 as IconComponent
const MonitorIcon = Monitor as IconComponent
const MoonIcon = Moon as IconComponent
const NetworkIcon = Network as IconComponent
const PlusIcon = Plus as IconComponent
const RotateCcwIcon = RotateCcw as IconComponent
const PanelRightIcon = PanelRight as IconComponent
const PlugIcon = Plug as IconComponent
const PowerIcon = Power as IconComponent
const RefreshCwIcon = RefreshCw as IconComponent
const SettingsIcon = Settings as IconComponent
const ShieldCheckIcon = ShieldCheck as IconComponent
const SlidersHorizontalIcon = SlidersHorizontal as IconComponent
const StarIcon = Star as IconComponent
const SunIcon = Sun as IconComponent
const TerminalSquareIcon = TerminalSquare as IconComponent
const Trash2Icon = Trash2 as IconComponent
const TypeIcon = Type as IconComponent
const WrenchIcon = Wrench as IconComponent

export const GUI_SETTINGS_KEY = "guiSettings"
export const DEFAULT_UI_FONT =
  '"Segoe UI Variable Text", "Segoe UI Variable", "Segoe UI", "SF Pro Text", "PingFang SC", "Microsoft YaHei UI", "Microsoft YaHei", "Noto Sans CJK SC", "Source Han Sans SC", ui-sans-serif, system-ui, sans-serif'
export const DEFAULT_CODE_FONT =
  '"Cascadia Code", "Cascadia Mono", "JetBrains Mono", "Maple Mono NF CN", "Sarasa Mono SC", ui-monospace, SFMono-Regular, Menlo, Consolas, "Microsoft YaHei UI", monospace'

const CODEX_THEME = {
  lightAccent: "#6f6f6f",
  lightBackground: "#f7f7f5",
  lightForeground: "#1f1f1f",
  darkAccent: "#8f8f8f",
  darkBackground: "#121212",
  darkForeground: "#f7f7f5",
}

const LEGACY_BLUE_CODEX_THEME = {
  lightAccent: "#3b82f6",
  lightBackground: "#f8fafc",
  lightForeground: "#111827",
  darkAccent: "#60a5fa",
  darkBackground: "#0f172a",
  darkForeground: "#f8fafc",
}

export type GuiSessionRecord = {
  sessionId: string
  directory?: string | null
  workspacePath?: string | null
  projectName?: string | null
  title?: string | null
  createdAt: number
  lastUsedAt: number
}

export type GuiSessionRecordInput = {
  sessionId: string
  directory?: string | null
  workspacePath?: string | null
  projectName?: string | null
  title?: string | null
  createdAt?: number | null
  lastUsedAt?: number | null
}

export type GuiSettings = {
  permissionSettingsVersion: number
  permissionMode: PermissionMode
  permissionModesByWorkspace: Record<string, PermissionMode>
  defaultPermission: boolean
  autoApproval: boolean
  fullAccess: boolean
  defaultOpenTarget: "terminal" | "editor" | "system"
  integratedShell: "powershell" | "cmd" | "gitbash"
  theme: "dark" | "system"
  themeMode: "light" | "dark" | "system"
  presetTheme: "claude" | "codex" | "github" | "custom"
  density: "comfortable" | "compact"
  fontSize: number
  lightAccent: string
  lightBackground: string
  lightForeground: string
  lightUiFont: string
  lightCodeFont: string
  lightTranslucentSidebar: boolean
  lightContrast: number
  darkAccent: string
  darkBackground: string
  darkForeground: string
  darkUiFont: string
  darkCodeFont: string
  darkTranslucentSidebar: boolean
  darkContrast: number
  serverUrl: string
  serverMode: "local" | "remote"
  userName: string
  responseLanguage: "zh-CN" | "auto"
  customInstructions: string
  activeThirdPartyProviderId: string
  thirdPartyProviders: GuiThirdPartyProvider[]
  favoriteModels: string[]
  hiddenModels: string[]
  modelVariants: Record<string, ModelVariant[]>
  mcpEnabled: boolean
  mcpServers: string
  mcpServerList: GuiMcpServer[]
  gitAutoDetect: boolean
  gitDiffView: "inline" | "split"
  networkProxyEnabled: boolean
  networkProxyProtocol: NetworkProxyProtocol
  networkProxyHost: string
  networkProxyPort: string
  networkProxyUsername: string
  networkProxyPassword: string
  networkProxyNoProxy: string
  environmentProfile: "default" | "project"
  environmentVariables: string
  browserMcpSettingsVersion: number
  browserUse: boolean
  browserHeadless: boolean
  computerUse: boolean
  autoUpdateCheck: boolean
  deferredUpdateVersion?: string | null
  deferredUpdateAt?: number | null
  archiveRetention: "30d" | "90d" | "forever"
  guiSessionRegistry: Record<string, GuiSessionRecord>
}

export type NetworkProxyProtocol = "http" | "https"

export type GuiMcpServer = {
  id: string
  name: string
  type: "local" | "remote"
  enabled: boolean
  command: string
  args: string
  url: string
  env: string
  headers: string
  timeout: number
  /** Working directory for local STDIO servers. Empty = use workspace. */
  cwd: string
}

const BROWSER_MCP_KEYWORDS = ["playwright", "browser", "chromium", "chrome", "puppeteer", "webkit"]
const BROWSER_MCP_PERMISSION_PATTERNS = ["*playwright*", "*browser*", "*chromium*", "*chrome*", "*puppeteer*", "*webkit*"]
const PLAYWRIGHT_MCP_NAME = "playwright"
const PLAYWRIGHT_INSTALL_HINT = "npx playwright install chromium"
const LEGACY_PLAYWRIGHT_MCP_TIMEOUT = 30_000
const PLAYWRIGHT_MCP_TIMEOUT = 60_000
const DEFAULT_BROWSER_MCP_SERVER_ID = "mcp-browser-playwright-default"
const BROWSER_MCP_SETTINGS_VERSION = 2
const GUI_SESSION_REGISTRY_LIMIT = 500

function playwrightMcpArgs(headless: boolean) {
  return ["-y", "@playwright/mcp", ...(headless ? ["--headless"] : [])]
}

function createBrowserMcpServer(id: string, headless: boolean): GuiMcpServer {
  return {
    id,
    name: PLAYWRIGHT_MCP_NAME,
    type: "local",
    enabled: true,
    command: "npx",
    args: playwrightMcpArgs(headless).join("\n"),
    url: "",
    env: "",
    headers: "",
    timeout: PLAYWRIGHT_MCP_TIMEOUT,
    cwd: "",
  }
}

const DEFAULT_BROWSER_MCP_SERVER = createBrowserMcpServer(DEFAULT_BROWSER_MCP_SERVER_ID, true)

export type PermissionMode = "ask" | "default" | "auto" | "full"

export type PermissionModeOption = {
  id: PermissionMode
  label: string
  description: string
  tone?: "normal" | "warning" | "danger"
}

export const DEFAULT_GUI_SETTINGS: GuiSettings = {
  permissionSettingsVersion: 2,
  permissionMode: "default",
  permissionModesByWorkspace: {},
  defaultPermission: true,
  autoApproval: false,
  fullAccess: false,
  defaultOpenTarget: "terminal",
  integratedShell: "powershell",
  theme: "dark",
  themeMode: "dark",
  presetTheme: "codex",
  density: "comfortable",
  fontSize: 14,
  lightAccent: CODEX_THEME.lightAccent,
  lightBackground: CODEX_THEME.lightBackground,
  lightForeground: CODEX_THEME.lightForeground,
  lightUiFont: DEFAULT_UI_FONT,
  lightCodeFont: DEFAULT_CODE_FONT,
  lightTranslucentSidebar: false,
  lightContrast: 50,
  darkAccent: CODEX_THEME.darkAccent,
  darkBackground: CODEX_THEME.darkBackground,
  darkForeground: CODEX_THEME.darkForeground,
  darkUiFont: DEFAULT_UI_FONT,
  darkCodeFont: DEFAULT_CODE_FONT,
  darkTranslucentSidebar: false,
  darkContrast: 50,
  serverUrl: "http://127.0.0.1:4096",
  serverMode: "local",
  userName: "",
  responseLanguage: "zh-CN",
  customInstructions: "",
  activeThirdPartyProviderId: "",
  thirdPartyProviders: [],
  favoriteModels: [],
  hiddenModels: [],
  modelVariants: {},
  mcpEnabled: true,
  mcpServers: "",
  mcpServerList: [DEFAULT_BROWSER_MCP_SERVER],
  gitAutoDetect: true,
  gitDiffView: "inline",
  networkProxyEnabled: false,
  networkProxyProtocol: "http",
  networkProxyHost: "127.0.0.1",
  networkProxyPort: "7890",
  networkProxyUsername: "",
  networkProxyPassword: "",
  networkProxyNoProxy: "localhost,127.0.0.1,::1",
  environmentProfile: "default",
  environmentVariables: "",
  browserMcpSettingsVersion: BROWSER_MCP_SETTINGS_VERSION,
  browserUse: true,
  browserHeadless: true,
  computerUse: false,
  autoUpdateCheck: true,
  deferredUpdateVersion: null,
  deferredUpdateAt: null,
  archiveRetention: "90d",
  guiSessionRegistry: {},
}

type SettingsTab =
  | "general"
  | "statistics"
  | "configuration"
  | "personalization"
  | "thirdPartyApi"
  | "models"
  | "mcp"
  | "git"
  | "networkProxy"
  | "environment"
  | "browser"
  | "computer"
  | "archived"

type SettingsWorkspaceProps = {
  server?: ServerStatus
  workspaceDirectory?: string | null
  serverUrl: string
  connectPending?: boolean
  disconnectPending?: boolean
  refreshPending?: boolean
  appVersion?: string | null
  updateCheckPending?: boolean
  updateCheckResult?: GuiUpdateCheckResult | null
  updateCheckError?: unknown
  error?: unknown
  onServerUrlChange: (value: string) => void
  onConnect: (mode?: GuiSettings["serverMode"]) => void
  onDisconnect: () => void
  onRefresh: () => void
  onManualUpdateCheck?: () => void
  onOpenUpdateRelease?: () => void
  onBack: () => void
}

type NavItem = {
  id: SettingsTab
  label: string
  icon: IconComponent
}

const settingsNav: NavItem[] = [
  { id: "general", label: "常规", icon: SlidersHorizontalIcon },
  { id: "statistics", label: "统计", icon: BarChart3Icon },
  { id: "configuration", label: "配置", icon: WrenchIcon },
  { id: "personalization", label: "个性化", icon: Edit3Icon },
  { id: "thirdPartyApi", label: "API 供应商", icon: PlugIcon },
  { id: "models", label: "模型", icon: StarIcon },
  { id: "mcp", label: "MCP 服务器", icon: BlocksIcon },
  { id: "git", label: "Git", icon: GitBranchIcon },
  { id: "networkProxy", label: "网络代理", icon: NetworkIcon },
  { id: "environment", label: "环境", icon: TerminalSquareIcon },
  { id: "browser", label: "浏览器使用", icon: Globe2Icon },
  { id: "computer", label: "电脑操控", icon: PanelRightIcon },
  { id: "archived", label: "已归档对话", icon: Clock3Icon },
]

const presetThemes = [
  { id: "codex", label: "Codex（默认）", colors: ["#6f6f6f", "#f7f7f5", "#1f1f1f", "#121212"] },
  { id: "claude", label: "Claude", colors: ["#cc7d5e", "#f9f9f7", "#2d2d2b", "#3b3b39"] },
  { id: "github", label: "GitHub", colors: ["#3b82f6", "#ffffff", "#24292f", "#0d1117"] },
  { id: "custom", label: "自定义", colors: ["#8f8f8f", "#f7f7f5", "#1f1f1f", "#121212"] },
] as const

function presetPatch(preset: GuiSettings["presetTheme"]): Partial<GuiSettings> {
  if (preset === "codex") {
    return {
      presetTheme: preset,
      ...CODEX_THEME,
    }
  }
  if (preset === "github") {
    return {
      presetTheme: preset,
      lightAccent: "#0969da",
      lightBackground: "#ffffff",
      lightForeground: "#24292f",
      darkAccent: "#58a6ff",
      darkBackground: "#0d1117",
      darkForeground: "#f0f6fc",
    }
  }
  if (preset === "custom") return { presetTheme: preset }
  return {
    presetTheme: "claude",
    lightAccent: "#cc7d5e",
    lightBackground: "#f9f9f7",
    lightForeground: "#2d2d2b",
    darkAccent: "#cc7d5e",
    darkBackground: "#2d2d2b",
    darkForeground: "#f9f9f7",
  }
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : error ? String(error) : null
}

function normalizeUiFont(value?: string | null) {
  const trimmed = value?.trim()
  if (
    !trimmed ||
    /^"?Inter"?($|,|\s)/i.test(trimmed) ||
    /^"?Microsoft YaHei UI"?($|,|\s)/i.test(trimmed) ||
    trimmed === "ui-sans-serif, system-ui"
  ) {
    return DEFAULT_UI_FONT
  }
  return trimmed
}

function normalizeCodeFont(value?: string | null) {
  const trimmed = value?.trim()
  if (
    !trimmed ||
    trimmed === 'ui-monospace, "Cascadia Code", Menlo' ||
    /^"?JetBrains Mono"?($|,|\s)/i.test(trimmed)
  ) {
    return DEFAULT_CODE_FONT
  }
  return trimmed
}

function normalizeFontSize(value?: number | null) {
  if (typeof value !== "number" || !Number.isFinite(value)) return DEFAULT_GUI_SETTINGS.fontSize
  return Math.min(18, Math.max(12, Math.round(value)))
}

function normalizeNetworkProxyProtocol(value: unknown): NetworkProxyProtocol {
  return value === "https" ? "https" : "http"
}

function normalizeNetworkProxyString(value: unknown, fallback = "") {
  return typeof value === "string" ? value : fallback
}

function normalizeNetworkProxyPort(value: unknown) {
  const raw = typeof value === "number" ? String(value) : typeof value === "string" ? value.trim() : ""
  if (!raw) return DEFAULT_GUI_SETTINGS.networkProxyPort
  const numeric = Number(raw)
  if (!Number.isInteger(numeric) || numeric < 1 || numeric > 65535) return DEFAULT_GUI_SETTINGS.networkProxyPort
  return String(numeric)
}

function normalizeOptionalString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null
}

function normalizeTimestamp(value: unknown, fallback: number) {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    return value < 10_000_000_000 ? value * 1000 : value
  }
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value)
    if (Number.isFinite(parsed) && parsed > 0) return parsed < 10_000_000_000 ? parsed * 1000 : parsed
  }
  return fallback
}

export function compactGuiSessionRegistry(
  value: Record<string, GuiSessionRecord>,
  limit = GUI_SESSION_REGISTRY_LIMIT,
): Record<string, GuiSessionRecord> {
  const records = Object.values(value)
    .filter((record) => record.sessionId)
    .sort((left, right) => (right.lastUsedAt || right.createdAt) - (left.lastUsedAt || left.createdAt))
    .slice(0, limit)
  return Object.fromEntries(records.map((record) => [record.sessionId, record]))
}

function normalizeGuiSessionRegistry(value: unknown): Record<string, GuiSessionRecord> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {}
  const now = Date.now()
  const records: Record<string, GuiSessionRecord> = {}
  for (const [key, rawRecord] of Object.entries(value)) {
    if (!rawRecord || typeof rawRecord !== "object" || Array.isArray(rawRecord)) continue
    const record = rawRecord as Record<string, unknown>
    const sessionId = normalizeOptionalString(record.sessionId) ?? normalizeOptionalString(key)
    if (!sessionId) continue
    const createdAt = normalizeTimestamp(record.createdAt, normalizeTimestamp(record.lastUsedAt, now))
    const lastUsedAt = normalizeTimestamp(record.lastUsedAt, createdAt)
    records[sessionId] = {
      sessionId,
      directory: normalizeOptionalString(record.directory),
      workspacePath: normalizeOptionalString(record.workspacePath),
      projectName: normalizeOptionalString(record.projectName),
      title: normalizeOptionalString(record.title),
      createdAt,
      lastUsedAt,
    }
  }
  return compactGuiSessionRegistry(records)
}

export function upsertGuiSessionRecord(settings: GuiSettings, input: GuiSessionRecordInput): GuiSettings {
  const normalized = normalizeGuiSettings(settings)
  const sessionId = input.sessionId.trim()
  if (!sessionId) return normalized

  const previous = normalized.guiSessionRegistry[sessionId]
  const now = Date.now()
  const createdAt = normalizeTimestamp(input.createdAt, previous?.createdAt ?? now)
  const lastUsedAt = Math.max(
    previous?.lastUsedAt ?? createdAt,
    normalizeTimestamp(input.lastUsedAt, now),
  )

  const nextRecord: GuiSessionRecord = {
    sessionId,
    directory: input.directory ?? previous?.directory ?? null,
    workspacePath: input.workspacePath ?? previous?.workspacePath ?? null,
    projectName: input.projectName ?? previous?.projectName ?? null,
    title: input.title ?? previous?.title ?? null,
    createdAt,
    lastUsedAt,
  }

  return normalizeGuiSettings({
    ...normalized,
    guiSessionRegistry: compactGuiSessionRegistry({
      ...normalized.guiSessionRegistry,
      [sessionId]: nextRecord,
    }),
  })
}

export function removeGuiSessionRecord(settings: GuiSettings, sessionId: string): GuiSettings {
  const normalized = normalizeGuiSettings(settings)
  if (!normalized.guiSessionRegistry[sessionId]) return normalized
  const nextRegistry = { ...normalized.guiSessionRegistry }
  delete nextRegistry[sessionId]
  return normalizeGuiSettings({ ...normalized, guiSessionRegistry: nextRegistry })
}

function isLegacyBlueCodexPalette(settings: GuiSettings) {
  return (
    settings.lightAccent === LEGACY_BLUE_CODEX_THEME.lightAccent ||
    settings.lightBackground === LEGACY_BLUE_CODEX_THEME.lightBackground ||
    settings.lightForeground === LEGACY_BLUE_CODEX_THEME.lightForeground ||
    settings.darkAccent === LEGACY_BLUE_CODEX_THEME.darkAccent ||
    settings.darkBackground === LEGACY_BLUE_CODEX_THEME.darkBackground ||
    settings.darkForeground === LEGACY_BLUE_CODEX_THEME.darkForeground
  )
}

function safeObject(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null
  return value as Record<string, unknown>
}

function stringifyRecordLines(value: unknown) {
  const record = safeObject(value)
  if (!record) return ""
  return Object.entries(record)
    .map(([key, item]) => `${key}=${String(item ?? "")}`)
    .join("\n")
}

function parseRecordLines(value: string): Record<string, string> | undefined {
  const entries = value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const index = line.indexOf("=")
      if (index < 0) return [line, ""] as const
      return [line.slice(0, index).trim(), line.slice(index + 1).trim()] as const
    })
    .filter(([key]) => key.length > 0)
  if (!entries.length) return undefined
  return Object.fromEntries(entries)
}

function parseArgs(value: string) {
  return value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
}

function hasPlaywrightMcpPackage(server: GuiMcpServer) {
  return [server.command, server.args].join("\n").toLowerCase().includes("@playwright/mcp")
}

function syncPlaywrightHeadless(server: GuiMcpServer, headless: boolean): GuiMcpServer {
  if (!hasPlaywrightMcpPackage(server)) return server
  const args = parseArgs(server.args).filter((arg) => arg !== "--headless")
  return {
    ...server,
    args: [...args, ...(headless ? ["--headless"] : [])].join("\n"),
  }
}

function migrateBrowserMcpServer(server: GuiMcpServer, version: number): GuiMcpServer {
  if (version >= BROWSER_MCP_SETTINGS_VERSION) return server
  if (!hasPlaywrightMcpPackage(server)) return server
  if (server.timeout !== LEGACY_PLAYWRIGHT_MCP_TIMEOUT) return server
  return { ...server, timeout: PLAYWRIGHT_MCP_TIMEOUT }
}

export function isBrowserMcpServer(server: GuiMcpServer) {
  const haystack = [server.name, server.command, server.args, server.url].join(" ").toLowerCase()
  return BROWSER_MCP_KEYWORDS.some((keyword) => haystack.includes(keyword))
}

export function defaultBrowserMcpServer(index: number, headless: boolean): GuiMcpServer {
  return createBrowserMcpServer(`mcp-browser-${Date.now()}-${index}`, headless)
}

export function browserMcpServerForRuntime(settings: GuiSettings): GuiMcpServer | null {
  if (!settings.browserUse || !settings.mcpEnabled) return null
  const browserServers = settings.mcpServerList.filter(isBrowserMcpServer)
  return (
    browserServers.find((server) => server.enabled) ??
    (browserServers.length ? null : defaultBrowserMcpServer(settings.mcpServerList.length, settings.browserHeadless))
  )
}

function defaultMcpServer(index: number): GuiMcpServer {
  return {
    id: `mcp-${Date.now()}-${index}`,
    name: index === 0 ? "filesystem" : `server-${index + 1}`,
    type: "local",
    enabled: true,
    command: "npx",
    args: "-y\n@modelcontextprotocol/server-filesystem",
    url: "",
    env: "",
    headers: "",
    timeout: 5000,
    cwd: "",
  }
}

function mcpFromConfig(name: string, config: Record<string, unknown>, index: number): GuiMcpServer | null {
  const type = config.type === "remote" ? "remote" : config.type === "local" ? "local" : null
  if (!type) return null
  const command = Array.isArray(config.command) ? config.command.map(String) : []
  return {
    id: `mcp-${name}-${index}`,
    name,
    type,
    enabled: config.enabled !== false,
    command: type === "local" ? command[0] ?? "" : "",
    args: type === "local" ? command.slice(1).join("\n") : "",
    url: type === "remote" ? String(config.url ?? "") : "",
    env: stringifyRecordLines(config.environment),
    headers: stringifyRecordLines(config.headers),
    timeout: typeof config.timeout === "number" ? config.timeout : 5000,
    cwd: type === "local" && typeof config.cwd === "string" ? config.cwd : "",
  }
}

function normalizeMcpServerList(list: unknown, legacyJson?: string) {
  if (Array.isArray(list)) {
    return list
      .map((item, index): GuiMcpServer | null => {
        const record = safeObject(item)
        if (!record) return null
        const type = record.type === "remote" ? "remote" : "local"
        return {
          id: typeof record.id === "string" && record.id ? record.id : `mcp-${index}`,
          name: typeof record.name === "string" && record.name ? record.name : `server-${index + 1}`,
          type,
          enabled: record.enabled !== false,
          command: typeof record.command === "string" ? record.command : "",
          args: typeof record.args === "string" ? record.args : "",
          url: typeof record.url === "string" ? record.url : "",
          env: typeof record.env === "string" ? record.env : "",
          headers: typeof record.headers === "string" ? record.headers : "",
          timeout: typeof record.timeout === "number" ? record.timeout : 5000,
          cwd: typeof record.cwd === "string" ? record.cwd : "",
        }
      })
      .filter((item): item is GuiMcpServer => Boolean(item))
  }

  if (!legacyJson?.trim()) return []
  try {
    const parsed = JSON.parse(legacyJson) as unknown
    const record = safeObject(parsed)
    if (!record) return []
    return Object.entries(record)
      .map(([name, config], index) => {
        const configRecord = safeObject(config)
        return configRecord ? mcpFromConfig(name, configRecord, index) : null
      })
      .filter((item): item is GuiMcpServer => Boolean(item))
  } catch {
    return []
  }
}

export function isValidMcpServerName(value: string) {
  return /^[A-Za-z0-9_-]+$/.test(value.trim())
}

export function canApplyMcpServer(server: GuiMcpServer) {
  return (
    isValidMcpServerName(server.name) &&
    (server.type === "remote" ? server.url.trim().length > 0 : server.command.trim().length > 0)
  )
}

export function mcpServerConfig(server: GuiMcpServer): McpServerConfig {
  if (server.type === "remote") {
    return {
      type: "remote",
      url: server.url.trim(),
      headers: parseRecordLines(server.headers),
      enabled: server.enabled,
      timeout: server.timeout,
    }
  }

  const config: McpServerConfig = {
    type: "local",
    command: [server.command.trim(), ...parseArgs(server.args)].filter(Boolean),
    environment: parseRecordLines(server.env),
    enabled: server.enabled,
    timeout: server.timeout,
  }
  // OpenCode currently uses the workspace directory for local STDIO servers,
  // but include the user-specified cwd as a forward-compatible extension —
  // unknown fields are dropped server-side without breaking validation.
  if (server.cwd.trim()) {
    ;(config as McpServerConfig & { cwd: string }).cwd = server.cwd.trim()
  }
  return config
}

function serializeMcpServers(servers: GuiMcpServer[]) {
  if (!servers.length) return ""
  return JSON.stringify(
    Object.fromEntries(servers.map((server) => [server.name.trim() || server.id, mcpServerConfig(server)])),
    null,
    2,
  )
}

export function normalizeGuiSettings(value?: Partial<GuiSettings> | null): GuiSettings {
  const raw = value ?? {}
  const merged = { ...DEFAULT_GUI_SETTINGS, ...raw }
  const palette = isLegacyBlueCodexPalette(merged) ? CODEX_THEME : null
  const legacyPermissionDefaults =
    !("permissionSettingsVersion" in raw)
      ? {
          permissionSettingsVersion: 2,
          autoApproval: false,
          fullAccess: false,
        }
      : null
  const thirdPartyProviders = normalizeThirdPartyProviders(
    (raw as { thirdPartyProviders?: unknown }).thirdPartyProviders,
  )
  const activeThirdPartyProviderId = thirdPartyProviders.some((provider) => provider.id === merged.activeThirdPartyProviderId)
    ? merged.activeThirdPartyProviderId
    : ""
  const apiModelKeys = new Set(
    thirdPartyProviders.flatMap((provider) =>
      provider.models.map((model) => modelPreferenceKey(provider.id, model)),
    ),
  )
  const favoriteModels = normalizeModelPreferenceKeys((raw as { favoriteModels?: unknown }).favoriteModels).filter((key) =>
    apiModelKeys.has(key),
  )
  const hiddenModels = normalizeModelPreferenceKeys((raw as { hiddenModels?: unknown }).hiddenModels).filter((key) =>
    apiModelKeys.has(key),
  )
  const modelVariants = Object.fromEntries(
    Object.entries(normalizeModelVariants((raw as { modelVariants?: unknown }).modelVariants)).filter(([key]) =>
      apiModelKeys.has(key),
    ),
  )
  const guiSessionRegistry = normalizeGuiSessionRegistry(
    (raw as { guiSessionRegistry?: unknown }).guiSessionRegistry,
  )
  const browserMcpSettingsVersion =
    typeof (raw as { browserMcpSettingsVersion?: unknown }).browserMcpSettingsVersion === "number"
      ? (raw as { browserMcpSettingsVersion: number }).browserMcpSettingsVersion
      : 0
  const normalizedMcpServers = normalizeMcpServerList((raw as { mcpServerList?: unknown }).mcpServerList, merged.mcpServers)
  const needsDefaultBrowserMcp =
    !normalizedMcpServers.some(isBrowserMcpServer) &&
    (!("browserMcpSettingsVersion" in raw) || merged.browserUse)
  const mcpServerListBase = needsDefaultBrowserMcp
    ? [
        ...normalizedMcpServers,
        createBrowserMcpServer(DEFAULT_BROWSER_MCP_SERVER_ID, merged.browserHeadless),
      ]
    : normalizedMcpServers
  const mcpServerList = mcpServerListBase.map((server) => migrateBrowserMcpServer(server, browserMcpSettingsVersion))
  const normalized: GuiSettings = {
    ...merged,
    ...(palette ?? {}),
    ...(legacyPermissionDefaults ?? {}),
    browserMcpSettingsVersion: BROWSER_MCP_SETTINGS_VERSION,
    activeThirdPartyProviderId,
    thirdPartyProviders,
    favoriteModels,
    hiddenModels,
    modelVariants,
    guiSessionRegistry,
    mcpServerList,
    lightUiFont: normalizeUiFont(merged.lightUiFont),
    lightCodeFont: normalizeCodeFont(merged.lightCodeFont),
    darkUiFont: normalizeUiFont(merged.darkUiFont),
    darkCodeFont: normalizeCodeFont(merged.darkCodeFont),
    fontSize: normalizeFontSize(merged.fontSize),
    networkProxyEnabled: typeof merged.networkProxyEnabled === "boolean" ? merged.networkProxyEnabled : false,
    networkProxyProtocol: normalizeNetworkProxyProtocol(merged.networkProxyProtocol),
    networkProxyHost: normalizeNetworkProxyString(merged.networkProxyHost, DEFAULT_GUI_SETTINGS.networkProxyHost),
    networkProxyPort: normalizeNetworkProxyPort(merged.networkProxyPort),
    networkProxyUsername: normalizeNetworkProxyString(merged.networkProxyUsername),
    networkProxyPassword: normalizeNetworkProxyString(merged.networkProxyPassword),
    networkProxyNoProxy: normalizeNetworkProxyString(merged.networkProxyNoProxy, DEFAULT_GUI_SETTINGS.networkProxyNoProxy),
    autoUpdateCheck: typeof merged.autoUpdateCheck === "boolean" ? merged.autoUpdateCheck : true,
    deferredUpdateVersion: normalizeOptionalString((raw as { deferredUpdateVersion?: unknown }).deferredUpdateVersion),
    deferredUpdateAt: normalizeTimestamp((raw as { deferredUpdateAt?: unknown }).deferredUpdateAt, 0) || null,
  }
  normalized.permissionMode = coercePermissionMode(normalized.permissionMode, normalized)
  normalized.permissionModesByWorkspace = normalizePermissionModesByWorkspace(
    (raw as { permissionModesByWorkspace?: unknown }).permissionModesByWorkspace,
    normalized,
  )
  return normalized
}

export function buildNetworkProxyConfig(settings: GuiSettings): NetworkProxyConfig | null {
  if (!settings.networkProxyEnabled) return null
  const port = Number(settings.networkProxyPort)
  return {
    enabled: true,
    protocol: settings.networkProxyProtocol,
    host: settings.networkProxyHost.trim(),
    port: Number.isInteger(port) ? port : null,
    username: normalizeOptionalString(settings.networkProxyUsername),
    password: settings.networkProxyPassword || null,
    noProxy: normalizeOptionalString(settings.networkProxyNoProxy),
  }
}

export function networkProxySettingsSignature(settings: GuiSettings) {
  const proxy = buildNetworkProxyConfig(settings)
  return proxy ? JSON.stringify(proxy) : "disabled"
}

function proxyUrlPreview(settings: GuiSettings, maskPassword = true) {
  const proxy = buildNetworkProxyConfig(settings)
  if (!proxy?.host || !proxy.port) return null
  const auth = proxy.username
    ? `${encodeURIComponent(proxy.username)}${
        proxy.password ? `:${maskPassword ? "******" : encodeURIComponent(proxy.password)}` : ""
      }@`
    : ""
  return `${proxy.protocol}://${auth}${proxy.host}:${proxy.port}`
}

function isPermissionMode(value: unknown): value is PermissionMode {
  return value === "ask" || value === "default" || value === "auto" || value === "full"
}

export function permissionWorkspaceKey(workspacePath?: string | null) {
  const normalized = workspacePath?.trim().replace(/\\/g, "/").replace(/\/+$/, "")
  if (!normalized) return null
  return normalized.replace(/^([A-Z]):/, (_match, drive: string) => `${drive.toLowerCase()}:`)
}

function normalizePermissionModesByWorkspace(value: unknown, settings: GuiSettings): Record<string, PermissionMode> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {}
  const result: Record<string, PermissionMode> = {}
  for (const [rawKey, rawMode] of Object.entries(value)) {
    if (!isPermissionMode(rawMode)) continue
    const key = permissionWorkspaceKey(rawKey)
    if (!key) continue
    result[key] = coercePermissionMode(rawMode, settings)
  }
  return result
}

function basePermissionRules(): PermissionRule[] {
  return [
    { permission: "*", pattern: "*", action: "ask" },
    { permission: "question", pattern: "*", action: "allow" },
    { permission: "plan_enter", pattern: "*", action: "allow" },
    { permission: "plan_exit", pattern: "*", action: "deny" },
    { permission: "doom_loop", pattern: "*", action: "ask" },
    { permission: "external_directory", pattern: "*", action: "ask" },
    { permission: "read", pattern: "*.env", action: "ask" },
    { permission: "read", pattern: "*.env.*", action: "ask" },
    { permission: "read", pattern: "*.env.example", action: "allow" },
  ]
}

function workspacePermissionRules(): PermissionRule[] {
  return [
    ...basePermissionRules(),
    { permission: "read", pattern: "*", action: "allow" },
    { permission: "edit", pattern: "*", action: "allow" },
    { permission: "grep", pattern: "*", action: "allow" },
    { permission: "glob", pattern: "*", action: "allow" },
    { permission: "lsp", pattern: "*", action: "allow" },
    { permission: "todowrite", pattern: "*", action: "allow" },
    { permission: "external_directory", pattern: "*", action: "ask" },
    { permission: "read", pattern: "*.env", action: "ask" },
    { permission: "read", pattern: "*.env.*", action: "ask" },
    { permission: "read", pattern: "*.env.example", action: "allow" },
  ]
}

export function getAvailablePermissionModes(settings: GuiSettings): PermissionModeOption[] {
  const options: PermissionModeOption[] = []
  if (settings.defaultPermission) {
    options.push({
      id: "default",
      label: "默认权限",
      description: "默认允许读取和编辑当前工作区，其他敏感操作需要确认。",
    })
  }
  if (settings.autoApproval) {
    options.push({
      id: "auto",
      label: "自动审核",
      description: "默认允许工作区读写，额外权限请求由 GUI 自动允许一次。",
      tone: "warning",
    })
  }
  if (settings.fullAccess) {
    options.push({
      id: "full",
      label: "完全访问",
      description: "向 OpenCode 会话写入全局允许规则，不再弹出审批。",
      tone: "danger",
    })
  }

  if (options.length) return options

  return [
    {
      id: "ask",
      label: "逐项审批",
      description: "所有敏感操作都进入权限审批。",
    },
  ]
}

export function coercePermissionMode(mode: PermissionMode, settings: GuiSettings): PermissionMode {
  const options = getAvailablePermissionModes(settings)
  return options.some((item) => item.id === mode) ? mode : options[0].id
}

export function getProjectPermissionMode(settings: GuiSettings, workspacePath?: string | null): PermissionMode {
  const key = permissionWorkspaceKey(workspacePath)
  const projectMode = key ? settings.permissionModesByWorkspace[key] : undefined
  return coercePermissionMode(projectMode ?? settings.permissionMode, settings)
}

export function setProjectPermissionMode(
  settings: GuiSettings,
  workspacePath: string | null | undefined,
  mode: PermissionMode,
): GuiSettings {
  const normalized = normalizeGuiSettings(settings)
  const nextMode = coercePermissionMode(mode, normalized)
  const key = permissionWorkspaceKey(workspacePath)
  if (!key) return normalizeGuiSettings({ ...normalized, permissionMode: nextMode })
  return normalizeGuiSettings({
    ...normalized,
    permissionModesByWorkspace: {
      ...normalized.permissionModesByWorkspace,
      [key]: nextMode,
    },
  })
}

export function getPermissionModeLabel(mode: PermissionMode, settings: GuiSettings) {
  return getAvailablePermissionModes(settings).find((item) => item.id === mode)?.label ?? "逐项审批"
}

export function buildOpenCodePermissionRules(settings: GuiSettings, mode: PermissionMode): PermissionRule[] {
  const activeMode = coercePermissionMode(mode, settings)
  const browserRules: PermissionRule[] = !settings.browserUse
    ? BROWSER_MCP_PERMISSION_PATTERNS.map((permission) => ({ permission, pattern: "*", action: "deny" }))
    : activeMode === "default" || activeMode === "auto"
      ? BROWSER_MCP_PERMISSION_PATTERNS.map((permission) => ({ permission, pattern: "*", action: "allow" }))
      : []

  if (activeMode === "full") return [{ permission: "*", pattern: "*", action: "allow" }, ...browserRules]
  if (activeMode === "default" || activeMode === "auto") return [...workspacePermissionRules(), ...browserRules]
  return [...basePermissionRules(), ...browserRules]
}

export function shouldAutoApprovePermission(mode: PermissionMode, settings: GuiSettings) {
  return coercePermissionMode(mode, settings) === "auto"
}

export function buildPersonalizationSystemPrompt(settings: GuiSettings) {
  const lines: string[] = []
  const userName = settings.userName.trim()
  const customInstructions = settings.customInstructions.trim()

  if (settings.responseLanguage === "zh-CN") {
    lines.push("除非用户明确要求使用其他语言，否则所有面向用户的回复、计划、任务步骤、进度说明、总结和错误说明都必须使用简体中文。")
    lines.push("不要把内部检查清单、调试细节、原始返回值或压缩摘要作为正文输出给用户；只用简体中文概括用户真正需要知道的结果。")
    lines.push("文件路径、命令、代码、API 名称、模型名称和项目名称可以保留原文。")
  } else {
    lines.push("请优先使用用户当前消息的语言回复。")
  }

  if (userName) {
    lines.push(`用户希望被称呼为：${userName}。`)
  }

  if (customInstructions) {
    lines.push("用户为这个桌面工作台设置了以下长期偏好，请在不违反当前任务和系统规则的前提下遵守：")
    lines.push(customInstructions)
  }

  return lines.join("\n")
}

function mergeSettings(value?: Partial<GuiSettings> | null): GuiSettings {
  return normalizeGuiSettings(value)
}

function settingsResolvedTheme(settings: GuiSettings): "light" | "dark" {
  const useLight =
    settings.themeMode === "light" ||
    (settings.themeMode === "system" &&
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-color-scheme: light)").matches)
  return useLight ? "light" : "dark"
}

function settingsThemeVars(settings: GuiSettings): CSSProperties {
  const useLight = settingsResolvedTheme(settings) === "light"
  const accent = useLight ? settings.lightAccent : settings.darkAccent
  const background = useLight ? settings.lightBackground : settings.darkBackground
  const foreground = useLight ? settings.lightForeground : settings.darkForeground
  const muted = useLight ? "rgba(45,45,43,0.58)" : "rgba(249,249,247,0.52)"

  return {
    "--app-bg": background,
    "--app-panel": useLight ? "#ffffff" : "#202020",
    "--app-panel-2": useLight ? "#f3f2ef" : "#1f1f1f",
    "--app-chrome": useLight ? "#f0efec" : "#202020",
    "--app-input": useLight ? "#ffffff" : "#2d2d2d",
    "--app-border": useLight ? "rgba(45,45,43,0.14)" : "rgba(255,255,255,0.08)",
    "--app-divider": useLight ? "rgba(45,45,43,0.10)" : "rgba(255,255,255,0.06)",
    "--app-text": foreground,
    "--app-muted": muted,
    "--app-subtle": useLight ? "rgba(45,45,43,0.42)" : "rgba(249,249,247,0.36)",
    "--app-hover": useLight ? "rgba(45,45,43,0.08)" : "rgba(255,255,255,0.07)",
    "--app-hover-strong": useLight ? "rgba(45,45,43,0.12)" : "rgba(255,255,255,0.12)",
    "--app-selected": useLight ? "rgba(45,45,43,0.10)" : "rgba(255,255,255,0.10)",
    "--app-accent": accent,
    "--app-accent-soft": `color-mix(in srgb, ${accent} 16%, transparent)`,
    "--app-accent-contrast": "#ffffff",
    "--app-composer": useLight ? "#ffffff" : "#2b2b2b",
    "--app-inspector": useLight ? "#f4f3f0" : "#171717",
    "--app-code-bg": useLight ? "rgba(45,45,43,0.06)" : "rgba(0,0,0,0.30)",
    "--app-dot": useLight ? "rgba(45,45,43,0.30)" : "rgba(249,249,247,0.28)",
    "--app-success": "#34d399",
    "--app-warning": "#f59e0b",
    "--app-danger": "#ef4444",
    "--app-danger-soft": "rgba(239,68,68,0.12)",
    "--app-ui-font": useLight ? settings.lightUiFont : settings.darkUiFont,
    "--app-code-font": useLight ? settings.lightCodeFont : settings.darkCodeFont,
    fontFamily: useLight ? settings.lightUiFont : settings.darkUiFont,
  } as CSSProperties
}

export function SettingsWorkspace({
  server,
  workspaceDirectory,
  serverUrl,
  connectPending = false,
  disconnectPending = false,
  refreshPending = false,
  appVersion,
  updateCheckPending = false,
  updateCheckResult,
  updateCheckError,
  error,
  onServerUrlChange,
  onConnect,
  onDisconnect,
  onRefresh,
  onManualUpdateCheck,
  onOpenUpdateRelease,
  onBack,
}: SettingsWorkspaceProps) {
  const queryClient = useQueryClient()
  const loadedSettingsRef = useRef(false)
  const [activeTab, setActiveTab] = useState<SettingsTab>("general")
  const [settings, setSettings] = useState<GuiSettings>(() => ({
    ...DEFAULT_GUI_SETTINGS,
    serverUrl,
  }))

  const savedSettings = useQuery({
    queryKey: ["settings", GUI_SETTINGS_KEY],
    queryFn: () => settingsGet<Partial<GuiSettings>>(GUI_SETTINGS_KEY),
  })

  const saveSettings = useMutation({
    mutationFn: (next: GuiSettings) => settingsSet(GUI_SETTINGS_KEY, next),
    onSuccess: (_result, next) => {
      queryClient.setQueryData(["settings", GUI_SETTINGS_KEY], next)
    },
  })

  useEffect(() => {
    if (!savedSettings.data || loadedSettingsRef.current) return
    loadedSettingsRef.current = true
    const next = mergeSettings(savedSettings.data)
    setSettings(next)
    if (!server?.baseUrl && next.serverUrl) {
      onServerUrlChange(next.serverUrl)
    }
  }, [onServerUrlChange, savedSettings.data, server?.baseUrl])

  useEffect(() => {
    if (!serverUrl) return
    setSettings((current) => (current.serverUrl === serverUrl ? current : { ...current, serverUrl }))
  }, [serverUrl])

  const errorMessage = getErrorMessage(error ?? saveSettings.error)

  function updateSettings(patch: Partial<GuiSettings>) {
    const next = { ...settings, ...patch }
    setSettings(next)
    if (typeof patch.serverUrl === "string") {
      onServerUrlChange(patch.serverUrl)
    }
    saveSettings.mutate(next)
  }

  const content = useMemo(() => {
    switch (activeTab) {
      case "general":
        return (
          <GeneralSettings
            settings={settings}
            appVersion={appVersion}
            updateCheckPending={updateCheckPending}
            updateCheckResult={updateCheckResult}
            updateCheckError={updateCheckError}
            onChange={updateSettings}
            onManualUpdateCheck={onManualUpdateCheck}
            onOpenUpdateRelease={onOpenUpdateRelease}
          />
        )
      case "statistics":
        return (
          <StatisticsSettings
            settings={settings}
            server={server}
            workspaceDirectory={workspaceDirectory}
            onChange={updateSettings}
          />
        )
      case "configuration":
        return (
          <ConfigurationSettings
            settings={settings}
            server={server}
            connectPending={connectPending}
            disconnectPending={disconnectPending}
            refreshPending={refreshPending}
            onChange={updateSettings}
            onConnect={onConnect}
            onDisconnect={onDisconnect}
            onRefresh={onRefresh}
          />
        )
      case "personalization":
        return <PersonalizationSettings settings={settings} onChange={updateSettings} />
      case "thirdPartyApi":
        return (
          <ThirdPartyApiSettings
            providers={settings.thirdPartyProviders}
            activeProviderId={settings.activeThirdPartyProviderId}
            server={server}
            serverUrl={settings.serverUrl}
            onChange={updateSettings}
          />
        )
      case "models":
        return (
          <ModelSettings
            settings={settings}
            onChange={updateSettings}
          />
        )
      case "mcp":
        return (
          <McpSettings
            settings={settings}
            server={server}
            workspaceDirectory={workspaceDirectory}
            onChange={updateSettings}
          />
        )
      case "git":
        return <GitSettings settings={settings} onChange={updateSettings} />
      case "networkProxy":
        return <NetworkProxySettings settings={settings} onChange={updateSettings} />
      case "environment":
        return <EnvironmentSettings settings={settings} onChange={updateSettings} />
      case "browser":
        return (
          <BrowserSettings
            settings={settings}
            server={server}
            workspaceDirectory={workspaceDirectory}
            onChange={updateSettings}
          />
        )
      case "computer":
        return <ComputerSettings settings={settings} onChange={updateSettings} />
      case "archived":
        return (
          <ArchivedSettings
            settings={settings}
            server={server}
            workspaceDirectory={workspaceDirectory}
            onChange={updateSettings}
          />
        )
      default:
        return null
    }
  }, [
    activeTab,
    appVersion,
    connectPending,
    disconnectPending,
    refreshPending,
    server,
    settings,
    updateCheckError,
    updateCheckPending,
    updateCheckResult,
    workspaceDirectory,
    onConnect,
    onDisconnect,
    onManualUpdateCheck,
    onOpenUpdateRelease,
    onRefresh,
  ])

  return (
    <div
      className="flex h-full min-w-0 bg-[var(--app-bg)] text-[var(--app-text)]"
      style={settingsThemeVars(settings)}
      data-theme={settingsResolvedTheme(settings)}
    >
      <aside className="flex w-[260px] shrink-0 flex-col border-r border-[var(--app-divider)] bg-[var(--app-panel)]">
        <div className="px-4 pb-2 pt-5">
          <div className="flex items-center gap-2 px-2 text-[11px] font-semibold uppercase tracking-wider text-[var(--app-subtle)]">
            <SettingsIcon className="h-3.5 w-3.5 shrink-0" />
            <span className="min-w-0 flex-1 truncate">设置</span>
          </div>
        </div>
        <ScrollArea className="min-h-0 flex-1">
          <nav className="space-y-0.5 px-2 pb-3">
            {settingsNav.map((item) => {
              const Icon = item.icon
              const selected = activeTab === item.id
              return (
                <button
                  key={item.id}
                  className={cn(
                    "flex h-8 w-full items-center gap-2.5 rounded-md px-2.5 text-left text-[14px] font-medium transition-colors",
                    selected
                      ? "bg-[var(--app-selected)] text-[var(--app-text)]"
                      : "text-[var(--app-muted)] hover:bg-[var(--app-hover)] hover:text-[var(--app-text)]",
                  )}
                  onClick={() => setActiveTab(item.id)}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  <span className="min-w-0 flex-1 truncate">{item.label}</span>
                </button>
              )
            })}
          </nav>
        </ScrollArea>
      </aside>

      <main className="min-w-0 flex-1 bg-[var(--app-bg)]">
        <ScrollArea className="h-full">
          <div
            className={cn(
              "mx-auto min-h-full w-full px-10 pb-16 pt-10",
              activeTab === "statistics" ? "max-w-[1180px]" : "max-w-[820px]",
            )}
          >
            <div className="mb-8 flex items-start justify-between gap-5">
              <div className="min-w-0">
                <h1 className="text-[24px] font-semibold tracking-tight text-[var(--app-text)]">
                  {settingsNav.find((item) => item.id === activeTab)?.label ?? "常规"}
                </h1>
              </div>
            </div>

            {errorMessage ? (
              <div className="mb-5 rounded-lg border border-[color-mix(in_srgb,var(--app-danger)_45%,transparent)] bg-[var(--app-danger-soft)] px-4 py-3 text-sm leading-6 text-[var(--app-text)]">
                {errorMessage}
              </div>
            ) : null}

            {content}
          </div>
        </ScrollArea>
      </main>
    </div>
  )
}

const STATS_WINDOW_DAYS = 30

type UsageTotals = {
  cost: number
  input: number
  output: number
  reasoning: number
  cacheRead: number
  cacheWrite: number
}

type UsageEvent = {
  sessionId: string
  timestamp: number
  providerId: string | null
  modelId: string | null
  usage: UsageTotals
}

type ModelBucketValue = {
  calls: number
  cost: number
  tokens: number
}

type ModelUsageBucket = ModelBucketValue & {
  key: string
  label: string
  shortLabel: string
  start: number
  models: Record<string, ModelBucketValue>
}

type SessionMessageResult = {
  record: GuiSessionRecord
  messages: OpenCodeMessage[]
  error?: string
}

type DailyStatistics = UsageTotals & {
  key: string
  label: string
  shortLabel: string
  start: number
  messages: number
  runs: number
  sessionCount: number
  hourly: number[]
}

type ModelStatistics = UsageTotals & {
  key: string
  providerId: string | null
  modelId: string | null
  sessionCount: number
  callCount: number
}

type StatisticsSnapshot = {
  totalSessionCount: number
  activeSessionCount: number
  loadedSessionCount: number
  failedSessionCount: number
  messageCount: number
  totals: UsageTotals
  daily: DailyStatistics[]
  models: ModelStatistics[]
  modelBuckets: ModelUsageBucket[]
  usageEventCount: number
  usageTimeSpanMinutes: number
}

function emptyUsageTotals(): UsageTotals {
  return {
    cost: 0,
    input: 0,
    output: 0,
    reasoning: 0,
    cacheRead: 0,
    cacheWrite: 0,
  }
}

function addUsageTotals(target: UsageTotals, usage: UsageTotals) {
  target.cost += usage.cost
  target.input += usage.input
  target.output += usage.output
  target.reasoning += usage.reasoning
  target.cacheRead += usage.cacheRead
  target.cacheWrite += usage.cacheWrite
}

function usageTokenCount(usage: UsageTotals) {
  return usage.input + usage.output + usage.reasoning + usage.cacheRead + usage.cacheWrite
}

function statsRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null
}

function statsString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null
}

function statsNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) return parsed
  }
  return null
}

function statsNumberField(record: Record<string, unknown> | null, keys: string[]) {
  if (!record) return null
  for (const key of keys) {
    const value = statsNumber(record[key])
    if (value !== null) return value
  }
  return null
}

function usageTotalsFromRecord(record: Record<string, unknown> | null): UsageTotals | null {
  if (!record) return null
  const tokens = statsRecord(record.tokens) ?? record
  const cache = statsRecord(tokens.cache)
  const usage = {
    cost: statsNumberField(record, ["cost"]) ?? 0,
    input: statsNumberField(tokens, ["input", "inputTokens", "input_tokens", "promptTokens", "prompt_tokens"]) ?? 0,
    output:
      statsNumberField(tokens, ["output", "outputTokens", "output_tokens", "completionTokens", "completion_tokens"]) ?? 0,
    reasoning: statsNumberField(tokens, ["reasoning", "reasoningTokens", "reasoning_tokens"]) ?? 0,
    cacheRead:
      statsNumberField(cache, ["read", "cacheRead", "cacheReadTokens", "cache_read_tokens"]) ??
      statsNumberField(tokens, ["cacheRead", "cacheReadTokens", "cachedInputTokens", "cached_tokens"]) ??
      0,
    cacheWrite:
      statsNumberField(cache, ["write", "cacheWrite", "cacheWriteTokens", "cache_write_tokens"]) ??
      statsNumberField(tokens, ["cacheWrite", "cacheWriteTokens", "cacheCreationInputTokens"]) ??
      0,
  }
  const hasUsage = Object.values(usage).some((value) => value > 0)
  return hasUsage ? usage : null
}

function messageInfoRecord(message: OpenCodeMessage) {
  const raw = statsRecord(message.raw)
  return statsRecord(raw?.info) ?? raw
}

function messageTimestamp(message: OpenCodeMessage) {
  const direct = normalizeTimestamp(message.completedAt ?? message.createdAt, 0)
  if (direct) return direct
  const info = messageInfoRecord(message)
  const time = statsRecord(info?.time)
  return normalizeTimestamp(time?.completed ?? time?.created, 0)
}

function messageModelIds(message: OpenCodeMessage) {
  const info = messageInfoRecord(message)
  const model = statsRecord(info?.model)
  return {
    modelId:
      statsString(message.model) ??
      statsString(info?.modelID) ??
      statsString(model?.modelID) ??
      statsString(model?.id),
    providerId: statsString(info?.providerID) ?? statsString(model?.providerID),
  }
}

function extractUsageEvents(message: OpenCodeMessage, record: GuiSessionRecord): UsageEvent[] {
  if (message.role !== "assistant") return []
  const timestamp = messageTimestamp(message) || record.lastUsedAt || record.createdAt
  const model = messageModelIds(message)
  const stepUsages = message.parts
    .filter((part) => part.kind === "step-finish")
    .map((part) => usageTotalsFromRecord(statsRecord(part.raw)))
    .filter((usage): usage is UsageTotals => Boolean(usage))
  const usages = stepUsages.length ? stepUsages : [usageTotalsFromRecord(messageInfoRecord(message))].filter(
    (usage): usage is UsageTotals => Boolean(usage),
  )

  return usages.map((usage) => ({
    sessionId: record.sessionId,
    timestamp,
    providerId: model.providerId,
    modelId: model.modelId,
    usage,
  }))
}

function localDayKey(timestamp: number) {
  const date = new Date(timestamp)
  const year = date.getFullYear()
  const month = `${date.getMonth() + 1}`.padStart(2, "0")
  const day = `${date.getDate()}`.padStart(2, "0")
  return `${year}-${month}-${day}`
}

function localHourKey(timestamp: number) {
  const date = new Date(timestamp)
  return `${localDayKey(timestamp)}-${`${date.getHours()}`.padStart(2, "0")}`
}

function localHourLabel(timestamp: number) {
  const date = new Date(timestamp)
  return `${`${date.getMonth() + 1}`.padStart(2, "0")}-${`${date.getDate()}`.padStart(2, "0")} ${`${date.getHours()}`.padStart(2, "0")}:00`
}

function localHourShortLabel(timestamp: number) {
  const date = new Date(timestamp)
  return `${date.getMonth() + 1}-${date.getDate()} ${date.getHours()}:00`
}

function localHourStart(timestamp: number) {
  const date = new Date(timestamp)
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), date.getHours()).getTime()
}

function buildStatsWindow(now = Date.now()) {
  const anchor = new Date(now)
  const startDate = new Date(anchor.getFullYear(), anchor.getMonth(), anchor.getDate() - (STATS_WINDOW_DAYS - 1))
  const endDate = new Date(anchor.getFullYear(), anchor.getMonth(), anchor.getDate() + 1)
  const days = Array.from({ length: STATS_WINDOW_DAYS }, (_, index) => {
    const date = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate() + index)
    const timestamp = date.getTime()
    return {
      key: localDayKey(timestamp),
      label: `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`,
      shortLabel: `${date.getMonth() + 1}/${date.getDate()}`,
      start: timestamp,
    }
  })
  return {
    days,
    rangeStart: days[0]?.start ?? startDate.getTime(),
    rangeEnd: endDate.getTime(),
    todayKey: localDayKey(now),
  }
}

function isInStatsWindow(timestamp: number, rangeStart: number, rangeEnd: number) {
  return timestamp >= rangeStart && timestamp < rangeEnd
}

function addHourlyActivity(day: DailyStatistics, timestamp: number, count = 1) {
  const hour = new Date(timestamp).getHours()
  day.hourly[hour] = (day.hourly[hour] ?? 0) + count
}

function addModelBucket(
  buckets: Map<string, ModelUsageBucket>,
  event: UsageEvent,
  modelKey: string,
) {
  const start = localHourStart(event.timestamp)
  const key = localHourKey(start)
  const bucket = buckets.get(key) ?? {
    key,
    label: localHourLabel(start),
    shortLabel: localHourShortLabel(start),
    start,
    calls: 0,
    cost: 0,
    tokens: 0,
    models: {},
  }
  const tokens = usageTokenCount(event.usage)
  bucket.calls += 1
  bucket.cost += event.usage.cost
  bucket.tokens += tokens
  const model = bucket.models[modelKey] ?? { calls: 0, cost: 0, tokens: 0 }
  model.calls += 1
  model.cost += event.usage.cost
  model.tokens += tokens
  bucket.models[modelKey] = model
  buckets.set(key, bucket)
}

function buildStatisticsSnapshot(
  records: GuiSessionRecord[],
  results: SessionMessageResult[],
  now = Date.now(),
): StatisticsSnapshot {
  const windowInfo = buildStatsWindow(now)
  const totals = emptyUsageTotals()
  const activeSessionIds = new Set<string>()
  const dailyMap = new Map<string, DailyStatistics & { sessions: Set<string> }>(
    windowInfo.days.map((day) => [
      day.key,
      {
        ...emptyUsageTotals(),
        ...day,
        messages: 0,
        runs: 0,
        sessionCount: 0,
        hourly: Array.from({ length: 24 }, () => 0),
        sessions: new Set<string>(),
      },
    ]),
  )
  const modelMap = new Map<string, ModelStatistics & { sessions: Set<string> }>()
  const modelBucketMap = new Map<string, ModelUsageBucket>()
  let usageEventCount = 0
  let firstUsageAt: number | null = null
  let lastUsageAt: number | null = null

  for (const record of records) {
    const lastUsedAt = normalizeTimestamp(record.lastUsedAt, record.createdAt)
    if (!isInStatsWindow(lastUsedAt, windowInfo.rangeStart, windowInfo.rangeEnd)) continue
    activeSessionIds.add(record.sessionId)
    const day = dailyMap.get(localDayKey(lastUsedAt))
    if (day) {
      day.runs += 1
      addHourlyActivity(day, lastUsedAt)
      day.sessions.add(record.sessionId)
    }
  }

  let messageCount = 0
  for (const result of results) {
    for (const message of result.messages) {
      const timestamp = messageTimestamp(message)
      if (timestamp && isInStatsWindow(timestamp, windowInfo.rangeStart, windowInfo.rangeEnd)) {
        messageCount += 1
        activeSessionIds.add(result.record.sessionId)
        const day = dailyMap.get(localDayKey(timestamp))
        if (day) {
          day.messages += 1
          addHourlyActivity(day, timestamp)
          day.sessions.add(result.record.sessionId)
        }
      }

      for (const event of extractUsageEvents(message, result.record)) {
        if (!isInStatsWindow(event.timestamp, windowInfo.rangeStart, windowInfo.rangeEnd)) continue
        activeSessionIds.add(result.record.sessionId)
        addUsageTotals(totals, event.usage)

        const day = dailyMap.get(localDayKey(event.timestamp))
        if (day) {
          addUsageTotals(day, event.usage)
          day.sessions.add(result.record.sessionId)
        }

        const modelKey = `${event.providerId ?? "unknown"}/${event.modelId ?? "unknown"}`
        const model = modelMap.get(modelKey) ?? {
          ...emptyUsageTotals(),
          key: modelKey,
          providerId: event.providerId,
          modelId: event.modelId,
          sessionCount: 0,
          callCount: 0,
          sessions: new Set<string>(),
        }
        addUsageTotals(model, event.usage)
        model.callCount += 1
        model.sessions.add(event.sessionId)
        modelMap.set(modelKey, model)
        addModelBucket(modelBucketMap, event, modelKey)
        usageEventCount += 1
        firstUsageAt = firstUsageAt === null ? event.timestamp : Math.min(firstUsageAt, event.timestamp)
        lastUsageAt = lastUsageAt === null ? event.timestamp : Math.max(lastUsageAt, event.timestamp)
      }
    }
  }

  const daily = [...dailyMap.values()].map(({ sessions, ...day }) => ({
    ...day,
    sessionCount: sessions.size,
  }))
  const models = [...modelMap.values()]
    .map(({ sessions, ...model }) => ({ ...model, sessionCount: sessions.size }))
    .sort((left, right) => right.cost - left.cost || right.input + right.output - (left.input + left.output))
  const modelBuckets = [...modelBucketMap.values()].sort((left, right) => left.start - right.start)
  const usageTimeSpanMinutes =
    firstUsageAt === null || lastUsageAt === null
      ? 0
      : Math.max(1, Math.ceil((lastUsageAt - firstUsageAt) / 60_000))

  return {
    totalSessionCount: records.length,
    activeSessionCount: activeSessionIds.size,
    loadedSessionCount: results.filter((result) => !result.error).length,
    failedSessionCount: results.filter((result) => result.error).length,
    messageCount,
    totals,
    daily,
    models,
    modelBuckets,
    usageEventCount,
    usageTimeSpanMinutes,
  }
}

function formatStatsNumber(value: number) {
  return new Intl.NumberFormat("zh-CN").format(Math.round(value))
}

function formatStatsCost(value: number) {
  if (!value) return "$0.00"
  return `$${value < 1 ? value.toFixed(4) : value.toFixed(2)}`
}

function formatModelName(model: ModelStatistics) {
  if (!model.modelId && !model.providerId) return "未知模型"
  if (!model.providerId) return model.modelId ?? "未知模型"
  if (!model.modelId) return model.providerId
  return `${model.providerId}/${model.modelId}`
}

const MODEL_CHART_COLORS = ["#facc3d", "#62c980", "#fb923c", "#3b6ff5", "#6ec7f5", "#8b5cf6", "#f472b6", "#94a3b8"]

type ModelChartMetric = "cost" | "calls" | "tokens"
type ModelMetricPreference = "auto" | ModelChartMetric

function modelChartColor(index: number) {
  return MODEL_CHART_COLORS[index % MODEL_CHART_COLORS.length]
}

function modelShortName(model: ModelStatistics) {
  return model.modelId ?? model.providerId ?? "未知模型"
}

function visibleModelBuckets(buckets: ModelUsageBucket[]) {
  const nonEmpty = buckets.filter((bucket) => bucket.calls > 0 || bucket.cost > 0 || bucket.tokens > 0)
  return (nonEmpty.length ? nonEmpty : buckets).slice(-36)
}

function modelBucketValue(value: ModelBucketValue | undefined, metric: ModelChartMetric) {
  if (!value) return 0
  if (metric === "cost") return value.cost
  if (metric === "tokens") return value.tokens
  return value.calls
}

function bucketVisibleModelTotal(bucket: ModelUsageBucket, models: ModelStatistics[], metric: ModelChartMetric) {
  return models.reduce((total, model) => total + modelBucketValue(bucket.models[model.key], metric), 0)
}

function modelMetricTotal(model: ModelStatistics, metric: ModelChartMetric) {
  if (metric === "cost") return model.cost
  if (metric === "tokens") return usageTokenCount(model)
  return model.callCount
}

function preferredUsageMetric(snapshot: StatisticsSnapshot): ModelChartMetric {
  if (snapshot.totals.cost > 0) return "cost"
  if (usageTokenCount(snapshot.totals) > 0) return "tokens"
  return "calls"
}

function resolveUsageMetric(snapshot: StatisticsSnapshot, preference: ModelMetricPreference): ModelChartMetric {
  return preference === "auto" ? preferredUsageMetric(snapshot) : preference
}

function formatChartMetric(value: number, metric: ModelChartMetric) {
  if (metric === "cost") return formatStatsCost(value)
  if (metric === "tokens") return formatStatsNumber(value)
  return formatStatsNumber(value)
}

function formatStatsDecimal(value: number) {
  if (!Number.isFinite(value) || value <= 0) return "0"
  return value >= 100 ? value.toFixed(0) : value.toFixed(2)
}

function distributionTitle(metric: ModelChartMetric) {
  if (metric === "cost") return "消耗分布"
  if (metric === "tokens") return "Token 分布"
  return "调用分布"
}

function ModelUsageAnalytics({ snapshot }: { snapshot: StatisticsSnapshot }) {
  const [activeInsight, setActiveInsight] = useState<"model" | "user">("model")
  const [distributionMode, setDistributionMode] = useState<"bar" | "area">("bar")
  const [callView, setCallView] = useState<"trend" | "distribution" | "ranking">("trend")
  const [metricPreference, setMetricPreference] = useState<ModelMetricPreference>("auto")
  const [topModelCount, setTopModelCount] = useState<"4" | "6" | "8" | "12">("6")
  const [minimumCalls, setMinimumCalls] = useState<"0" | "2" | "5">("0")
  const [showPreferences, setShowPreferences] = useState(false)
  const [showFilters, setShowFilters] = useState(false)
  const filteredModels = snapshot.models.filter((model) => model.callCount >= Number(minimumCalls))
  const chartModels = filteredModels.slice(0, Number(topModelCount))
  const buckets = visibleModelBuckets(snapshot.modelBuckets)
  const distributionMetric = resolveUsageMetric(snapshot, metricPreference)
  const totalTokens = usageTokenCount(snapshot.totals)
  const distributionTotal = chartModels.reduce((total, model) => total + modelMetricTotal(model, distributionMetric), 0)
  const avgRpm = snapshot.usageTimeSpanMinutes ? snapshot.usageEventCount / snapshot.usageTimeSpanMinutes : 0
  const avgTpm = snapshot.usageTimeSpanMinutes ? totalTokens / snapshot.usageTimeSpanMinutes : 0

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <SegmentedButtons
          value={activeInsight}
          options={[
            { value: "model", label: "模型调用分析" },
            { value: "user", label: "用户统计" },
          ]}
          onChange={setActiveInsight}
        />
        {activeInsight === "model" ? (
          <div className="flex items-center gap-2">
            <button
              type="button"
              className={cn(
                "flex h-8 items-center gap-1.5 rounded-md border border-[var(--app-border)] px-3 text-[12px] font-medium transition-colors",
                showPreferences
                  ? "bg-[var(--app-selected)] text-[var(--app-text)]"
                  : "bg-[var(--app-panel-2)] text-[var(--app-muted)] hover:bg-[var(--app-hover)] hover:text-[var(--app-text)]",
              )}
              onClick={() => setShowPreferences((value) => !value)}
            >
              <SettingsIcon className="h-3.5 w-3.5" />
              偏好设置
            </button>
            <button
              type="button"
              className={cn(
                "flex h-8 items-center gap-1.5 rounded-md border border-[var(--app-border)] px-3 text-[12px] font-medium transition-colors",
                showFilters
                  ? "bg-[var(--app-selected)] text-[var(--app-text)]"
                  : "bg-[var(--app-panel-2)] text-[var(--app-muted)] hover:bg-[var(--app-hover)] hover:text-[var(--app-text)]",
              )}
              onClick={() => setShowFilters((value) => !value)}
            >
              <SlidersHorizontalIcon className="h-3.5 w-3.5" />
              筛选
            </button>
          </div>
        ) : null}
      </div>

      {activeInsight === "model" && (showPreferences || showFilters) ? (
        <div className="grid gap-3 rounded-lg border border-[var(--app-border)] bg-[var(--app-panel-2)] p-3 md:grid-cols-2">
          {showPreferences ? (
            <ModelControlGroup label="图表指标">
              <SegmentedButtons
                value={metricPreference}
                options={[
                  { value: "auto", label: "自动" },
                  { value: "cost", label: "成本" },
                  { value: "tokens", label: "Token" },
                  { value: "calls", label: "调用" },
                ]}
                onChange={setMetricPreference}
              />
            </ModelControlGroup>
          ) : null}
          {showPreferences ? (
            <ModelControlGroup label="展示模型">
              <SegmentedButtons
                value={topModelCount}
                options={[
                  { value: "4", label: "Top 4" },
                  { value: "6", label: "Top 6" },
                  { value: "8", label: "Top 8" },
                  { value: "12", label: "Top 12" },
                ]}
                onChange={setTopModelCount}
              />
            </ModelControlGroup>
          ) : null}
          {showFilters ? (
            <ModelControlGroup label="最低调用">
              <SegmentedButtons
                value={minimumCalls}
                options={[
                  { value: "0", label: "全部" },
                  { value: "2", label: "2+" },
                  { value: "5", label: "5+" },
                ]}
                onChange={setMinimumCalls}
              />
            </ModelControlGroup>
          ) : null}
        </div>
      ) : null}

      {activeInsight === "user" ? <UserStatisticsAnalytics snapshot={snapshot} /> : null}

      {activeInsight === "model" ? (
        <>
          <div className="grid overflow-hidden rounded-lg border border-[var(--app-border)] bg-[var(--app-panel-2)] md:grid-cols-5">
            <ModelOverviewCell label="总数" value={formatStatsNumber(snapshot.usageEventCount)} detail="统计调用" />
            <ModelOverviewCell label="总额度" value={formatStatsCost(snapshot.totals.cost)} detail="统计成本" />
            <ModelOverviewCell label="总 TOKEN 数" value={formatStatsNumber(totalTokens)} detail="统计 Token 数" />
            <ModelOverviewCell label="平均 RPM" value={formatStatsDecimal(avgRpm)} detail="每分钟请求数" />
            <ModelOverviewCell label="平均 TPM" value={formatStatsDecimal(avgTpm)} detail="每分钟 Token 数" />
          </div>

          <ChartPanel
            title={distributionTitle(distributionMetric)}
            subtitle={`总计：${formatChartMetric(distributionTotal, distributionMetric)}`}
            actions={
              <SegmentedButtons
                value={distributionMode}
                options={[
                  { value: "bar", label: "柱状图" },
                  { value: "area", label: "面积图" },
                ]}
                onChange={setDistributionMode}
              />
            }
          >
            {distributionMode === "bar" ? (
              <ModelStackedBarChart buckets={buckets} models={chartModels} metric={distributionMetric} />
            ) : (
              <ModelLineChart buckets={buckets} models={chartModels} metric={distributionMetric} filled />
            )}
            <ModelLegend models={chartModels} />
          </ChartPanel>

          <ChartPanel
            title="模型调用分析"
            subtitle={`总计：${formatStatsNumber(snapshot.usageEventCount)}`}
            actions={
              <SegmentedButtons
                value={callView}
                options={[
                  { value: "trend", label: "调用趋势" },
                  { value: "distribution", label: "调用次数分布" },
                  { value: "ranking", label: "调用次数排行" },
                ]}
                onChange={setCallView}
              />
            }
          >
            {callView === "trend" ? (
              <>
                <ModelLineChart buckets={buckets} models={chartModels} metric="calls" filled />
                <ModelLegend models={chartModels} />
              </>
            ) : callView === "distribution" ? (
              <ModelTotalsBarChart models={chartModels} metric="calls" />
            ) : (
              <ModelRankingList models={chartModels} />
            )}
          </ChartPanel>

          <ModelUsageTable
            models={filteredModels}
            failedSessionCount={snapshot.failedSessionCount}
            emptyText={minimumCalls === "0" ? undefined : "当前筛选条件下没有模型用量"}
          />
        </>
      ) : null}
    </div>
  )
}

function ModelControlGroup({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-wrap items-center justify-between gap-3">
      <span className="text-[12px] font-semibold text-[var(--app-muted)]">{label}</span>
      <div className="min-w-0">{children}</div>
    </div>
  )
}

function UserStatisticsAnalytics({ snapshot }: { snapshot: StatisticsSnapshot }) {
  return (
    <div className="space-y-5">
      <div className="grid overflow-hidden rounded-lg border border-[var(--app-border)] bg-[var(--app-panel-2)] md:grid-cols-5">
        <ModelOverviewCell label="GUI 会话" value={formatStatsNumber(snapshot.totalSessionCount)} detail="桌面端登记" />
        <ModelOverviewCell
          label="活跃会话"
          value={formatStatsNumber(snapshot.activeSessionCount)}
          detail="最近 30 天"
        />
        <ModelOverviewCell label="消息数" value={formatStatsNumber(snapshot.messageCount)} detail="已读取消息" />
        <ModelOverviewCell
          label="已读取"
          value={formatStatsNumber(snapshot.loadedSessionCount)}
          detail="会话详情"
        />
        <ModelOverviewCell
          label="读取失败"
          value={formatStatsNumber(snapshot.failedSessionCount)}
          detail="暂不可用"
        />
      </div>
      <ChartPanel title="用户统计" subtitle={`最近 30 天：${formatStatsNumber(snapshot.messageCount)} 条消息`}>
        <DailyActivityBarChart daily={snapshot.daily} />
      </ChartPanel>
    </div>
  )
}

function ModelOverviewCell({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <div className="min-w-0 border-b border-[var(--app-divider)] px-4 py-4 md:border-b-0 md:border-r last:md:border-r-0 md:border-[var(--app-divider)]">
      <div className="text-[11px] font-semibold uppercase tracking-wider text-[var(--app-subtle)]">{label}</div>
      <div className="mt-3 truncate text-[22px] font-semibold tabular-nums text-[var(--app-text)]">{value}</div>
      <div className="mt-1 text-[12px] font-medium text-[var(--app-muted)]">{detail}</div>
    </div>
  )
}

function ChartPanel({
  title,
  subtitle,
  actions,
  children,
}: {
  title: string
  subtitle?: string
  actions?: ReactNode
  children: ReactNode
}) {
  return (
    <section className="overflow-hidden rounded-lg border border-[var(--app-border)] bg-[var(--app-panel-2)]">
      <header className="flex min-h-14 items-center justify-between gap-3 border-b border-[var(--app-divider)] px-4 py-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[14px] font-semibold text-[var(--app-text)]">{title}</span>
            {subtitle ? <span className="text-[12px] font-medium text-[var(--app-muted)]">{subtitle}</span> : null}
          </div>
        </div>
        {actions ? <div className="shrink-0">{actions}</div> : null}
      </header>
      <div className="px-4 py-4">{children}</div>
    </section>
  )
}

function SegmentedButtons<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T
  options: Array<{ value: T; label: string }>
  onChange: (value: T) => void
}) {
  return (
    <div className="inline-flex rounded-lg border border-[var(--app-border)] bg-[var(--app-panel)] p-1">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          className={cn(
            "h-7 rounded-md px-2.5 text-[12px] font-semibold transition-colors",
            value === option.value
              ? "bg-[var(--app-selected)] text-[var(--app-text)]"
              : "text-[var(--app-muted)] hover:bg-[var(--app-hover)] hover:text-[var(--app-text)]",
          )}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}

function ModelStackedBarChart({
  buckets,
  models,
  metric,
}: {
  buckets: ModelUsageBucket[]
  models: ModelStatistics[]
  metric: ModelChartMetric
}) {
  const maxVisibleValue = Math.max(...buckets.map((bucket) => bucketVisibleModelTotal(bucket, models, metric)), 1)
  if (!buckets.length || !models.length) return <EmptyChartState />

  return (
    <div className="relative h-[260px]">
      <ChartGrid maxValue={maxVisibleValue} metric={metric} />
      <div className="absolute bottom-9 left-8 right-3 top-4 flex items-end gap-1.5">
        {buckets.map((bucket) => {
          const total = bucketVisibleModelTotal(bucket, models, metric)
          const height = total > 0 ? Math.max(2, (total / maxVisibleValue) * 100) : 0
          return (
            <div key={bucket.key} className="flex h-full min-w-[12px] flex-1 items-end" title={`${bucket.label}：${formatChartMetric(total, metric)}`}>
              <div
                className="flex w-full flex-col-reverse overflow-hidden rounded-t-[3px]"
                style={{ height: `${height}%` }}
              >
                {total > 0
                  ? models.map((model, index) => {
                      const value = modelBucketValue(bucket.models[model.key], metric)
                      if (value <= 0) return null
                      return (
                        <span
                          key={model.key}
                          className="block w-full"
                          style={{
                            height: `${Math.max(4, (value / total) * 100)}%`,
                            backgroundColor: modelChartColor(index),
                          }}
                        />
                      )
                    })
                  : null}
              </div>
            </div>
          )
        })}
      </div>
      <ChartXAxis buckets={buckets} />
    </div>
  )
}

function ModelLineChart({
  buckets,
  models,
  metric,
  filled = false,
}: {
  buckets: ModelUsageBucket[]
  models: ModelStatistics[]
  metric: ModelChartMetric
  filled?: boolean
}) {
  const width = 900
  const height = 260
  const left = 34
  const right = 10
  const top = 12
  const bottom = 36
  const plotWidth = width - left - right
  const plotHeight = height - top - bottom
  const maxValue = Math.max(
    ...buckets.flatMap((bucket) => models.map((model) => modelBucketValue(bucket.models[model.key], metric))),
    1,
  )
  if (!buckets.length || !models.length) return <EmptyChartState />

  const xFor = (index: number) => left + (buckets.length <= 1 ? 0 : (index / (buckets.length - 1)) * plotWidth)
  const yFor = (value: number) => top + plotHeight - (value / maxValue) * plotHeight

  return (
    <div className="relative h-[260px]">
      <svg className="h-full w-full" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" role="img">
        {[0, 0.25, 0.5, 0.75, 1].map((ratio) => {
          const y = top + ratio * plotHeight
          return (
            <line
              key={ratio}
              x1={left}
              x2={width - right}
              y1={y}
              y2={y}
              stroke="var(--app-divider)"
              strokeWidth="1"
            />
          )
        })}
        {models.map((model, index) => {
          const points = buckets.map((bucket, bucketIndex) => {
            const value = modelBucketValue(bucket.models[model.key], metric)
            return [xFor(bucketIndex), yFor(value)] as const
          })
          const path = points.map(([x, y], pointIndex) => `${pointIndex === 0 ? "M" : "L"} ${x} ${y}`).join(" ")
          const area = `${path} L ${points.at(-1)?.[0] ?? left} ${top + plotHeight} L ${points[0]?.[0] ?? left} ${top + plotHeight} Z`
          return (
            <g key={model.key}>
              {filled && index === 0 ? <path d={area} fill={modelChartColor(index)} opacity="0.12" /> : null}
              <path d={path} fill="none" stroke={modelChartColor(index)} strokeWidth={index === 0 ? 2.5 : 2} />
            </g>
          )
        })}
      </svg>
      <ChartXAxis buckets={buckets} />
    </div>
  )
}

function ChartGrid({ maxValue, metric }: { maxValue: number; metric: ModelChartMetric }) {
  const ticks = [1, 0.75, 0.5, 0.25, 0]
  return (
    <div className="absolute bottom-9 left-8 right-3 top-4">
      {ticks.map((tick) => (
        <div
          key={tick}
          className="absolute left-0 right-0 border-t border-[var(--app-divider)]"
          style={{ top: `${(1 - tick) * 100}%` }}
        >
          <span className="absolute -left-8 -top-2 text-[10px] tabular-nums text-[var(--app-subtle)]">
            {formatChartMetric(maxValue * tick, metric)}
          </span>
        </div>
      ))}
    </div>
  )
}

function ChartXAxis({ buckets }: { buckets: ModelUsageBucket[] }) {
  const labelEvery = Math.max(1, Math.ceil(buckets.length / 6))
  return (
    <div className="absolute bottom-0 left-8 right-3 grid text-[10px] text-[var(--app-subtle)]" style={{ gridTemplateColumns: `repeat(${Math.max(1, buckets.length)}, minmax(0, 1fr))` }}>
      {buckets.map((bucket, index) => (
        <span key={bucket.key} className="truncate text-center">
          {index % labelEvery === 0 ? bucket.shortLabel : ""}
        </span>
      ))}
    </div>
  )
}

function DailyActivityBarChart({ daily }: { daily: DailyStatistics[] }) {
  const maxValue = Math.max(...daily.map((day) => day.messages + day.runs), 1)
  const labelEvery = Math.max(1, Math.ceil(daily.length / 6))

  return (
    <div className="relative h-[260px]">
      <div className="absolute bottom-9 left-8 right-3 top-4">
        {[1, 0.75, 0.5, 0.25, 0].map((tick) => (
          <div
            key={tick}
            className="absolute left-0 right-0 border-t border-[var(--app-divider)]"
            style={{ top: `${(1 - tick) * 100}%` }}
          >
            <span className="absolute -left-8 -top-2 text-[10px] tabular-nums text-[var(--app-subtle)]">
              {formatStatsNumber(maxValue * tick)}
            </span>
          </div>
        ))}
      </div>
      <div className="absolute bottom-9 left-8 right-3 top-4 flex items-end gap-1.5">
        {daily.map((day) => {
          const total = day.messages + day.runs
          const messageHeight = total ? Math.max(4, (day.messages / total) * 100) : 0
          const runHeight = total ? Math.max(4, (day.runs / total) * 100) : 0
          return (
            <div key={day.key} className="flex h-full min-w-[10px] flex-1 items-end" title={`${day.label}：${formatStatsNumber(total)} 次活动`}>
              <div
                className="flex w-full flex-col-reverse overflow-hidden rounded-t-[3px]"
                style={{ height: total > 0 ? `${Math.max(2, (total / maxValue) * 100)}%` : "0%" }}
              >
                {day.messages ? <span className="block w-full bg-[#62c980]" style={{ height: `${messageHeight}%` }} /> : null}
                {day.runs ? <span className="block w-full bg-[#3b6ff5]" style={{ height: `${runHeight}%` }} /> : null}
              </div>
            </div>
          )
        })}
      </div>
      <div
        className="absolute bottom-0 left-8 right-3 grid text-[10px] text-[var(--app-subtle)]"
        style={{ gridTemplateColumns: `repeat(${Math.max(1, daily.length)}, minmax(0, 1fr))` }}
      >
        {daily.map((day, index) => (
          <span key={day.key} className="truncate text-center">
            {index % labelEvery === 0 ? day.shortLabel : ""}
          </span>
        ))}
      </div>
      <div className="absolute right-3 top-0 flex items-center gap-4 text-[12px] text-[var(--app-muted)]">
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-[2px] bg-[#62c980]" />
          消息
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-[2px] bg-[#3b6ff5]" />
          会话
        </span>
      </div>
    </div>
  )
}

function ModelTotalsBarChart({ models, metric }: { models: ModelStatistics[]; metric: ModelChartMetric }) {
  const maxValue = Math.max(...models.map((model) => modelMetricTotal(model, metric)), 1)
  if (!models.length) return <EmptyChartState />
  return (
    <div className="space-y-3 py-2">
      {models.map((model, index) => {
        const value = modelMetricTotal(model, metric)
        return (
          <div key={model.key} className="grid grid-cols-[160px_minmax(0,1fr)_80px] items-center gap-3">
            <div className="truncate text-[12px] font-medium text-[var(--app-text)]" title={formatModelName(model)}>
              {modelShortName(model)}
            </div>
            <div className="h-3 overflow-hidden rounded-full bg-[var(--app-hover)]">
              <div className="h-full rounded-full" style={{ width: `${(value / maxValue) * 100}%`, backgroundColor: modelChartColor(index) }} />
            </div>
            <div className="text-right text-[12px] tabular-nums text-[var(--app-muted)]">{formatStatsNumber(value)}</div>
          </div>
        )
      })}
    </div>
  )
}

function ModelRankingList({ models }: { models: ModelStatistics[] }) {
  if (!models.length) return <EmptyChartState />
  return (
    <div className="divide-y divide-[var(--app-divider)]">
      {models.map((model, index) => (
        <div key={model.key} className="grid grid-cols-[32px_minmax(0,1fr)_90px_90px] items-center gap-3 py-2.5 text-[13px]">
          <span className="text-[var(--app-subtle)]">{index + 1}</span>
          <span className="truncate font-medium text-[var(--app-text)]" title={formatModelName(model)}>
            {formatModelName(model)}
          </span>
          <span className="text-right tabular-nums text-[var(--app-muted)]">{formatStatsNumber(model.callCount)}</span>
          <span className="text-right tabular-nums text-[var(--app-muted)]">{formatStatsCost(model.cost)}</span>
        </div>
      ))}
    </div>
  )
}

function ModelLegend({ models }: { models: ModelStatistics[] }) {
  if (!models.length) return null
  return (
    <div className="mt-3 flex flex-wrap justify-center gap-x-5 gap-y-2">
      {models.map((model, index) => (
        <span key={model.key} className="flex items-center gap-1.5 text-[12px] text-[var(--app-muted)]">
          <span className="h-2.5 w-2.5 rounded-[2px]" style={{ backgroundColor: modelChartColor(index) }} />
          <span>{modelShortName(model)}</span>
        </span>
      ))}
    </div>
  )
}

function EmptyChartState() {
  return (
    <div className="flex h-[220px] items-center justify-center text-[13px] font-medium text-[var(--app-muted)]">
      暂无最近 30 天的模型调用数据
    </div>
  )
}

function ModelUsageTable({
  models,
  failedSessionCount,
  emptyText = "暂无最近 30 天的模型用量",
}: {
  models: ModelStatistics[]
  failedSessionCount: number
  emptyText?: string
}) {
  return (
    <section>
      <div className="mb-3 text-[14px] font-semibold text-[var(--app-text)]">模型明细</div>
      <div className="overflow-hidden rounded-lg border border-[var(--app-border)] bg-[var(--app-panel-2)]">
        <table className="w-full border-collapse text-left text-[12px]">
          <thead className="border-b border-[var(--app-divider)] text-[11px] uppercase tracking-wider text-[var(--app-subtle)]">
            <tr>
              <th className="px-4 py-3 font-semibold">模型</th>
              <th className="px-3 py-3 text-right font-semibold">调用</th>
              <th className="px-3 py-3 text-right font-semibold">会话</th>
              <th className="px-3 py-3 text-right font-semibold">成本</th>
              <th className="px-3 py-3 text-right font-semibold">输入</th>
              <th className="px-3 py-3 text-right font-semibold">输出</th>
              <th className="px-4 py-3 text-right font-semibold">缓存</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--app-divider)]">
            {models.length ? (
              models.slice(0, 12).map((model) => (
                <tr key={model.key} className="text-[var(--app-text)]">
                  <td className="max-w-[320px] truncate px-4 py-3 font-medium" title={formatModelName(model)}>
                    {formatModelName(model)}
                  </td>
                  <td className="px-3 py-3 text-right tabular-nums text-[var(--app-muted)]">
                    {formatStatsNumber(model.callCount)}
                  </td>
                  <td className="px-3 py-3 text-right tabular-nums text-[var(--app-muted)]">
                    {formatStatsNumber(model.sessionCount)}
                  </td>
                  <td className="px-3 py-3 text-right tabular-nums">{formatStatsCost(model.cost)}</td>
                  <td className="px-3 py-3 text-right tabular-nums text-[var(--app-muted)]">
                    {formatStatsNumber(model.input)}
                  </td>
                  <td className="px-3 py-3 text-right tabular-nums text-[var(--app-muted)]">
                    {formatStatsNumber(model.output)}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-[var(--app-muted)]">
                    {formatStatsNumber(model.cacheRead + model.cacheWrite)}
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td className="px-4 py-10 text-center text-[13px] text-[var(--app-muted)]" colSpan={7}>
                  {emptyText}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {failedSessionCount ? (
        <div className="mt-3 text-[12px] leading-5 text-[var(--app-muted)]">
          有 {formatStatsNumber(failedSessionCount)} 个会话暂时无法读取，通常是项目目录不可用或 server 未连接到对应实例。
        </div>
      ) : null}
    </section>
  )
}

function projectNameFromPath(path?: string | null) {
  return path?.split(/[\\/]/).filter(Boolean).at(-1) ?? null
}

function guiRecordInputFromSession(session: OpenCodeSession, workspaceDirectory?: string | null): GuiSessionRecordInput {
  const directory = session.directory ?? workspaceDirectory ?? null
  const updatedAt = normalizeTimestamp(session.updatedAt, 0)
  const createdAt = normalizeTimestamp(session.createdAt, updatedAt || Date.now())
  return {
    sessionId: session.id,
    directory,
    workspacePath: workspaceDirectory ?? directory,
    projectName: session.projectName ?? projectNameFromPath(directory),
    title: session.title,
    createdAt,
    lastUsedAt: updatedAt || createdAt,
  }
}

function StatisticsSettings({
  settings,
  server,
  workspaceDirectory,
  onChange,
}: {
  settings: GuiSettings
  server?: ServerStatus
  workspaceDirectory?: string | null
  onChange: (patch: Partial<GuiSettings>) => void
}) {
  const queryClient = useQueryClient()
  const baseUrl = server?.baseUrl ?? settings.serverUrl
  const records = useMemo(
    () =>
      Object.values(settings.guiSessionRegistry).sort(
        (left, right) => (right.lastUsedAt || right.createdAt) - (left.lastUsedAt || left.createdAt),
      ),
    [settings.guiSessionRegistry],
  )
  const statsWindow = buildStatsWindow()
  const recentRecords = useMemo(
    () =>
      records.filter((record) => {
        const createdAt = normalizeTimestamp(record.createdAt, 0)
        const lastUsedAt = normalizeTimestamp(record.lastUsedAt, createdAt)
        return (
          isInStatsWindow(createdAt, statsWindow.rangeStart, statsWindow.rangeEnd) ||
          isInStatsWindow(lastUsedAt, statsWindow.rangeStart, statsWindow.rangeEnd)
        )
      }),
    [records, statsWindow.rangeEnd, statsWindow.rangeStart],
  )
  const registrySignature = records
    .map((record) => `${record.sessionId}:${record.lastUsedAt}:${record.directory ?? record.workspacePath ?? ""}`)
    .join("|")
  const serverReady = Boolean(server?.healthy && baseUrl)

  const currentProjectSessions = useQuery({
    queryKey: ["settings-statistics-current-sessions", baseUrl, workspaceDirectory],
    queryFn: () =>
      sessionList({
        baseUrl,
        directory: workspaceDirectory ?? undefined,
        limit: 200,
      }),
    enabled: serverReady && Boolean(workspaceDirectory),
    staleTime: 30_000,
  })

  const importCandidates = useMemo(
    () => (currentProjectSessions.data ?? []).filter((session) => !settings.guiSessionRegistry[session.id]),
    [currentProjectSessions.data, settings.guiSessionRegistry],
  )

  function importCurrentProjectSessions() {
    if (!importCandidates.length) return
    let nextSettings = normalizeGuiSettings(settings)
    for (const session of importCandidates) {
      nextSettings = upsertGuiSessionRecord(nextSettings, guiRecordInputFromSession(session, workspaceDirectory))
    }
    onChange({ guiSessionRegistry: nextSettings.guiSessionRegistry })
    void queryClient.invalidateQueries({ queryKey: ["settings-statistics"] })
  }

  const statisticsQuery = useQuery({
    queryKey: ["settings-statistics", baseUrl, registrySignature, statsWindow.todayKey],
    queryFn: async () => {
      const results = await Promise.all(
        recentRecords.map(async (record): Promise<SessionMessageResult> => {
          const directory = record.directory ?? record.workspacePath ?? workspaceDirectory ?? undefined
          if (!directory) return { record, messages: [], error: "missing-directory" }
          try {
            const messages = await sessionMessages({
              baseUrl,
              directory,
              sessionId: record.sessionId,
              limit: 200,
            })
            return { record, messages }
          } catch (error) {
            return { record, messages: [], error: getErrorMessage(error) ?? "读取失败" }
          }
        }),
      )
      return buildStatisticsSnapshot(records, results)
    },
    enabled: serverReady && records.length > 0,
    staleTime: 30_000,
  })

  const snapshot = statisticsQuery.data ?? buildStatisticsSnapshot(records, [])
  const maxHourlyActivity = Math.max(...snapshot.daily.flatMap((day) => day.hourly), 1)
  const cacheTokens = snapshot.totals.cacheRead + snapshot.totals.cacheWrite
  const totalTokens = snapshot.totals.input + snapshot.totals.output + snapshot.totals.reasoning + cacheTokens

  return (
    <div className="space-y-8">
      <SettingsSection
        title="GUI 会话统计"
        description="只统计在桌面端 GUI 新建、分叉或发送过消息的会话；直接在终端使用 CLI 的会话不会进入这里。"
        framed={false}
      >
        <div className="flex items-center justify-between gap-4 rounded-lg border border-[var(--app-border)] bg-[var(--app-panel-2)] px-4 py-3">
          <div className="min-w-0 text-[12px] leading-5 text-[var(--app-muted)]">
            最近 30 天按本地时区统计。当前已登记 {formatStatsNumber(records.length)} 个 GUI 会话。
            {statisticsQuery.isError ? " 用量读取失败，请确认 OpenCode server 已连接。" : null}
            {!serverReady && records.length ? " 连接 server 后可读取模型用量和成本。" : null}
            {workspaceDirectory && importCandidates.length
              ? ` 当前项目还有 ${formatStatsNumber(importCandidates.length)} 个历史会话可手动纳入统计。`
              : null}
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              className="flex h-8 items-center gap-1.5 rounded-md border border-[var(--app-border)] bg-[var(--app-panel)] px-3 text-[12px] font-medium text-[var(--app-text)] transition-colors hover:bg-[var(--app-hover)] disabled:opacity-50"
              disabled={!serverReady || !workspaceDirectory || !importCandidates.length || currentProjectSessions.isFetching}
              onClick={importCurrentProjectSessions}
              title="历史会话无法自动判断是否来自 GUI，请确认后手动纳入。"
            >
              {currentProjectSessions.isFetching ? (
                <Loader2Icon className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <PlusIcon className="h-3.5 w-3.5" />
              )}
              导入当前项目
            </button>
            <button
              type="button"
              className="flex h-8 items-center gap-1.5 rounded-md border border-[var(--app-border)] bg-[var(--app-panel)] px-3 text-[12px] font-medium text-[var(--app-text)] transition-colors hover:bg-[var(--app-hover)] disabled:opacity-50"
              disabled={!serverReady || !records.length || statisticsQuery.isFetching}
              onClick={() => void queryClient.invalidateQueries({ queryKey: ["settings-statistics"] })}
            >
              <RefreshCwIcon className={cn("h-3.5 w-3.5", statisticsQuery.isFetching && "animate-spin")} />
              刷新
            </button>
          </div>
        </div>
      </SettingsSection>

      {records.length ? (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
            <StatisticsMetricCard
              label="GUI 会话"
              value={formatStatsNumber(snapshot.totalSessionCount)}
              detail={`近 30 天活跃 ${formatStatsNumber(snapshot.activeSessionCount)}`}
            />
            <StatisticsMetricCard
              label="总成本"
              value={formatStatsCost(snapshot.totals.cost)}
              detail={`已读取 ${formatStatsNumber(snapshot.loadedSessionCount)} 个会话`}
            />
            <StatisticsMetricCard
              label="输入 Tokens"
              value={formatStatsNumber(snapshot.totals.input)}
              detail={`总量 ${formatStatsNumber(totalTokens)}`}
            />
            <StatisticsMetricCard
              label="输出 Tokens"
              value={formatStatsNumber(snapshot.totals.output)}
              detail={`推理 ${formatStatsNumber(snapshot.totals.reasoning)}`}
            />
            <StatisticsMetricCard
              label="缓存 Tokens"
              value={formatStatsNumber(cacheTokens)}
              detail={`读 ${formatStatsNumber(snapshot.totals.cacheRead)} / 写 ${formatStatsNumber(snapshot.totals.cacheWrite)}`}
            />
          </div>

          <SettingsSection
            title="最近 30 天活跃度"
            description="日期和小时都使用本机时区，深色格子表示该小时消息或会话活动更多。"
            framed={false}
          >
            <div className="rounded-lg border border-[var(--app-border)] bg-[var(--app-panel-2)] p-4">
              <div className="mb-3 flex items-center justify-between text-[12px] text-[var(--app-muted)]">
                <span>消息 {formatStatsNumber(snapshot.messageCount)}</span>
                <span>{Intl.DateTimeFormat().resolvedOptions().timeZone || "Local time"}</span>
              </div>
              <div className="grid grid-cols-[28px_minmax(0,1fr)] gap-x-2 gap-y-1">
                {Array.from({ length: 24 }, (_, hour) => (
                  <div key={hour} className="contents">
                    <div className="h-2.5 text-right text-[9px] leading-[10px] text-[var(--app-subtle)]">
                      {hour % 6 === 0 ? `${hour}` : ""}
                    </div>
                    <div
                      className="grid gap-1"
                      style={{ gridTemplateColumns: `repeat(${STATS_WINDOW_DAYS}, minmax(6px, 1fr))` }}
                    >
                      {snapshot.daily.map((day) => {
                        const value = day.hourly[hour] ?? 0
                        const intensity = value ? Math.max(18, Math.round((value / maxHourlyActivity) * 86)) : 0
                        return (
                          <div
                            key={`${day.key}-${hour}`}
                            className="h-2.5 rounded-[3px] border border-[var(--app-divider)]"
                            style={{
                              background: value
                                ? `color-mix(in srgb, var(--app-accent) ${intensity}%, transparent)`
                                : "var(--app-hover)",
                            }}
                            title={`${day.label} ${`${hour}`.padStart(2, "0")}:00：${formatStatsNumber(value)} 次活动`}
                          />
                        )
                      })}
                    </div>
                  </div>
                ))}
              </div>
              <div
                className="ml-[36px] mt-2 grid gap-1 text-[10px] text-[var(--app-subtle)]"
                style={{ gridTemplateColumns: "repeat(6, 1fr)" }}
              >
                {snapshot.daily.filter((_, index) => index % 5 === 0).map((day) => (
                  <span key={day.key}>{day.shortLabel}</span>
                ))}
              </div>
            </div>
          </SettingsSection>

          <SettingsSection
            title="模型用量"
            description="按 OpenCode 返回的模型成本和 token 用量汇总，最近 30 天范围内统计。"
            framed={false}
          >
            <ModelUsageAnalytics snapshot={snapshot} />
          </SettingsSection>
        </>
      ) : (
        <div className="rounded-lg border border-dashed border-[var(--app-border)] px-6 py-12 text-center">
          <BarChart3Icon className="mx-auto mb-3 h-6 w-6 text-[var(--app-muted)]" />
          <div className="text-[15px] font-semibold text-[var(--app-text)]">还没有 GUI 会话统计</div>
          <div className="mx-auto mt-2 max-w-[460px] text-[13px] leading-6 text-[var(--app-muted)]">
            从桌面端 GUI 创建会话、分叉会话或发送消息后，这里会开始记录。
          </div>
        </div>
      )}
    </div>
  )
}

function StatisticsMetricCard({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <div className="rounded-lg border border-[var(--app-border)] bg-[var(--app-panel-2)] px-4 py-3">
      <div className="text-[11px] font-medium uppercase tracking-wider text-[var(--app-subtle)]">{label}</div>
      <div className="mt-2 truncate text-[20px] font-semibold tabular-nums text-[var(--app-text)]">{value}</div>
      <div className="mt-1 truncate text-[11px] text-[var(--app-muted)]">{detail}</div>
    </div>
  )
}

function GeneralSettings({
  settings,
  appVersion,
  updateCheckPending,
  updateCheckResult,
  updateCheckError,
  onChange,
  onManualUpdateCheck,
  onOpenUpdateRelease,
}: {
  settings: GuiSettings
  appVersion?: string | null
  updateCheckPending?: boolean
  updateCheckResult?: GuiUpdateCheckResult | null
  updateCheckError?: unknown
  onChange: (patch: Partial<GuiSettings>) => void
  onManualUpdateCheck?: () => void
  onOpenUpdateRelease?: () => void
}) {
  const updateStatus = updateCheckPending
    ? "正在检查更新..."
    : updateCheckError
      ? `检查失败：${getErrorMessage(updateCheckError)}`
      : updateCheckResult?.available
        ? `发现新版本 v${updateCheckResult.version}`
        : updateCheckResult
          ? "已是最新版本"
          : "启动时检查 GitHub release，发现新版本时提示安装并重启。"

  return (
    <div className="space-y-11">
      <SettingsSection title="更新">
        <div className="divide-y divide-[var(--app-divider)]">
          <SettingRow
            icon={RefreshCwIcon}
            title="自动检查更新"
            description="启动时检查 GitHub release，发现新版本时提示安装并重启。"
            control={
              <Switch checked={settings.autoUpdateCheck} onChange={(value) => onChange({ autoUpdateCheck: value })} />
            }
          />
          <SettingRow
            icon={ExternalLinkIcon}
            title="当前版本"
            description={
              <div className="space-y-1">
                <div className="font-medium text-[var(--app-text)]">v{appVersion ?? "未知"}</div>
                <button
                  type="button"
                  className="inline-flex max-w-full items-center gap-1.5 truncate text-left text-[13px] font-medium text-[var(--app-text)] hover:text-[var(--app-accent)]"
                  onClick={onOpenUpdateRelease}
                >
                  <ExternalLinkIcon className="h-3.5 w-3.5 shrink-0" />
                  <span className="truncate">{GUI_UPDATE_RELEASE_URL}</span>
                </button>
                <div
                  className={cn(
                    "text-[12px] leading-5",
                    updateCheckError ? "text-[var(--app-danger)]" : "text-[var(--app-muted)]",
                  )}
                >
                  {updateStatus}
                </div>
              </div>
            }
            control={
              <button
                type="button"
                className="inline-flex h-9 items-center gap-2 rounded-md border border-[var(--app-border)] bg-[var(--app-input)] px-3 text-[13px] font-medium text-[var(--app-text)] hover:bg-[var(--app-hover)] disabled:cursor-not-allowed disabled:opacity-50"
                disabled={updateCheckPending || !onManualUpdateCheck}
                onClick={onManualUpdateCheck}
              >
                <RefreshCwIcon className={cn("h-4 w-4", updateCheckPending && "animate-spin")} />
                立即检查
              </button>
            }
          />
        </div>
      </SettingsSection>

      <SettingsSection title="权限">
        <div className="divide-y divide-[var(--app-divider)]">
          <SettingRow
            icon={ShieldCheckIcon}
            title="默认权限"
            description="允许 OpenCode 默认读取并编辑当前工作区文件。关闭后，读写操作也会进入权限审批。"
            control={<Switch checked={settings.defaultPermission} onChange={(value) => onChange({ defaultPermission: value })} />}
          />
          <SettingRow
            icon={CheckCircle2Icon}
            title="自动审核"
            description="当 OpenCode 发起待审批权限请求时，GUI 会自动回复一次允许。仍然会保留活动记录。"
            control={<Switch checked={settings.autoApproval} onChange={(value) => onChange({ autoApproval: value })} />}
          />
          <SettingRow
            icon={CircleIcon}
            title="完全访问权限"
            description="向 OpenCode 会话写入全局 allow 规则。打开后，访问工作区外文件和运行联网命令也不会再询问。"
            control={<Switch checked={settings.fullAccess} onChange={(value) => onChange({ fullAccess: value })} />}
          />
        </div>
      </SettingsSection>

      <SettingsSection title="常规">
        <div className="divide-y divide-[var(--app-divider)]">
          <SettingRow
            icon={TerminalSquareIcon}
            title="默认打开目标"
            description="点击文件或路径时优先打开的位置。"
            control={
              <SelectControl
                value={settings.defaultOpenTarget}
                onChange={(value) => onChange({ defaultOpenTarget: value as GuiSettings["defaultOpenTarget"] })}
                options={[
                  { value: "terminal", label: "终端" },
                  { value: "editor", label: "编辑器" },
                  { value: "system", label: "系统默认" },
                ]}
              />
            }
          />
          <SettingRow
            icon={TerminalSquareIcon}
            title="集成终端 Shell"
            description="工作台终端默认使用的 Shell。"
            control={
              <SelectControl
                value={settings.integratedShell}
                onChange={(value) => onChange({ integratedShell: value as GuiSettings["integratedShell"] })}
                options={[
                  { value: "powershell", label: "PowerShell" },
                  { value: "cmd", label: "Command Prompt" },
                  { value: "gitbash", label: "Git Bash" },
                ]}
              />
            }
          />
        </div>
      </SettingsSection>

      <AppearanceControls settings={settings} onChange={onChange} />
    </div>
  )
}

function AppearanceControls({
  settings,
  onChange,
}: {
  settings: GuiSettings
  onChange: (patch: Partial<GuiSettings>) => void
}) {
  return (
    <SettingsSection title="外观" description="浅色与深色独立配置，实时保存。" framed={false}>
      <div className="space-y-8">
        <div className="grid gap-3 md:grid-cols-3">
          <ThemeModeButton
            icon={SunIcon}
            label="浅色"
            selected={settings.themeMode === "light"}
            onClick={() => onChange({ themeMode: "light", theme: "system" })}
          />
          <ThemeModeButton
            icon={MoonIcon}
            label="深色"
            selected={settings.themeMode === "dark"}
            onClick={() => onChange({ themeMode: "dark", theme: "dark" })}
          />
          <ThemeModeButton
            icon={MonitorIcon}
            label="跟随系统"
            selected={settings.themeMode === "system"}
            onClick={() => onChange({ themeMode: "system", theme: "system" })}
          />
        </div>

        <div className="rounded-lg border border-[var(--app-border)] bg-[var(--app-panel-2)] px-4 py-3">
          <div className="grid grid-cols-[92px_minmax(0,1fr)_48px] items-center gap-4">
            <span className="text-sm font-medium text-[var(--app-text)]">界面字号</span>
            <input
              type="range"
              min={12}
              max={18}
              value={settings.fontSize}
              onChange={(event) => onChange({ fontSize: Number(event.target.value) })}
              className="h-2 accent-[var(--app-accent)]"
            />
            <span className="text-right text-sm font-medium text-[var(--app-muted)]">{settings.fontSize}px</span>
          </div>
        </div>

        <div className="border-t border-[var(--app-border)] pt-7">
          <div className="mb-4 flex items-center justify-between">
            <div className="text-[15px] font-medium text-[var(--app-text)]">预设主题</div>
            <button
              className="flex h-8 items-center gap-2 rounded-md px-2 text-sm font-medium text-[var(--app-muted)] hover:bg-[var(--app-hover)] hover:text-[var(--app-text)]"
              onClick={() =>
                onChange({
                  presetTheme: "claude",
                  lightAccent: DEFAULT_GUI_SETTINGS.lightAccent,
                  lightBackground: DEFAULT_GUI_SETTINGS.lightBackground,
                  lightForeground: DEFAULT_GUI_SETTINGS.lightForeground,
                  darkAccent: DEFAULT_GUI_SETTINGS.darkAccent,
                  darkBackground: DEFAULT_GUI_SETTINGS.darkBackground,
                  darkForeground: DEFAULT_GUI_SETTINGS.darkForeground,
                })
              }
            >
              <RotateCcwIcon className="h-4 w-4" />
              全部重置
            </button>
          </div>
          <div className="grid gap-3 md:grid-cols-4">
            {presetThemes.map((preset) => (
              <PresetThemeButton
                key={preset.id}
                label={preset.label}
                colors={preset.colors}
                selected={settings.presetTheme === preset.id}
                onClick={() => onChange(presetPatch(preset.id))}
              />
            ))}
          </div>
        </div>

        <ThemeEditor
          title="浅色主题"
          accent={settings.lightAccent}
          background={settings.lightBackground}
          foreground={settings.lightForeground}
          uiFont={settings.lightUiFont}
          codeFont={settings.lightCodeFont}
          translucentSidebar={settings.lightTranslucentSidebar}
          contrast={settings.lightContrast}
          onReset={() =>
            onChange({
              lightAccent: DEFAULT_GUI_SETTINGS.lightAccent,
              lightBackground: DEFAULT_GUI_SETTINGS.lightBackground,
              lightForeground: DEFAULT_GUI_SETTINGS.lightForeground,
              lightUiFont: DEFAULT_GUI_SETTINGS.lightUiFont,
              lightCodeFont: DEFAULT_GUI_SETTINGS.lightCodeFont,
              lightTranslucentSidebar: DEFAULT_GUI_SETTINGS.lightTranslucentSidebar,
              lightContrast: DEFAULT_GUI_SETTINGS.lightContrast,
            })
          }
          onChange={(patch) =>
            onChange({
              lightAccent: patch.accent ?? settings.lightAccent,
              lightBackground: patch.background ?? settings.lightBackground,
              lightForeground: patch.foreground ?? settings.lightForeground,
              lightUiFont: patch.uiFont ?? settings.lightUiFont,
              lightCodeFont: patch.codeFont ?? settings.lightCodeFont,
              lightTranslucentSidebar: patch.translucentSidebar ?? settings.lightTranslucentSidebar,
              lightContrast: patch.contrast ?? settings.lightContrast,
            })
          }
        />

        <ThemeEditor
          title="深色主题"
          accent={settings.darkAccent}
          background={settings.darkBackground}
          foreground={settings.darkForeground}
          uiFont={settings.darkUiFont}
          codeFont={settings.darkCodeFont}
          translucentSidebar={settings.darkTranslucentSidebar}
          contrast={settings.darkContrast}
          onReset={() =>
            onChange({
              darkAccent: DEFAULT_GUI_SETTINGS.darkAccent,
              darkBackground: DEFAULT_GUI_SETTINGS.darkBackground,
              darkForeground: DEFAULT_GUI_SETTINGS.darkForeground,
              darkUiFont: DEFAULT_GUI_SETTINGS.darkUiFont,
              darkCodeFont: DEFAULT_GUI_SETTINGS.darkCodeFont,
              darkTranslucentSidebar: DEFAULT_GUI_SETTINGS.darkTranslucentSidebar,
              darkContrast: DEFAULT_GUI_SETTINGS.darkContrast,
            })
          }
          onChange={(patch) =>
            onChange({
              darkAccent: patch.accent ?? settings.darkAccent,
              darkBackground: patch.background ?? settings.darkBackground,
              darkForeground: patch.foreground ?? settings.darkForeground,
              darkUiFont: patch.uiFont ?? settings.darkUiFont,
              darkCodeFont: patch.codeFont ?? settings.darkCodeFont,
              darkTranslucentSidebar: patch.translucentSidebar ?? settings.darkTranslucentSidebar,
              darkContrast: patch.contrast ?? settings.darkContrast,
            })
          }
        />
      </div>
    </SettingsSection>
  )
}

function ConfigurationSettings({
  settings,
  server,
  connectPending,
  disconnectPending,
  refreshPending,
  onChange,
  onConnect,
  onDisconnect,
  onRefresh,
}: {
  settings: GuiSettings
  server?: ServerStatus
  connectPending: boolean
  disconnectPending: boolean
  refreshPending: boolean
  onChange: (patch: Partial<GuiSettings>) => void
  onConnect: (mode?: GuiSettings["serverMode"]) => void
  onDisconnect: () => void
  onRefresh: () => void
}) {
  const busy = connectPending || disconnectPending
  const connected = Boolean(server?.healthy)
  const modeLabel = server?.mode === "remote" ? "连接已有服务" : server?.mode === "local" ? "本地托管" : "未连接"
  const statusText = connected ? "已连接" : "未连接"
  const statusDetail = server?.message ?? "尚未配置 OpenCode server"
  const effectiveUrl = server?.baseUrl ?? settings.serverUrl
  const canConnect = settings.serverUrl.trim().length > 0 && !busy

  return (
    <div className="space-y-9">
      <SettingsSection title="OpenCode 连接" framed={false}>
        <div className="rounded-lg border border-[var(--app-border)] bg-[var(--app-panel-2)] px-4 py-4">
          <div className="flex flex-wrap items-center gap-3">
            <div
              className={cn(
                "flex h-10 min-w-[132px] items-center gap-2 rounded-md border px-3 text-sm font-medium",
                connected
                  ? "border-transparent bg-[var(--app-accent-soft)] text-[var(--app-text)]"
                  : "border-[var(--app-border)] bg-[var(--app-input)] text-[var(--app-muted)]",
              )}
            >
              <CircleIcon className={cn("h-2.5 w-2.5 fill-current", connected ? "text-[var(--app-success)]" : "text-[var(--app-warning)]")} />
              {statusText}
            </div>
            <div className="min-w-[220px] flex-1">
              <div className="truncate text-[15px] font-medium text-[var(--app-text)]">{effectiveUrl}</div>
              <div className="mt-1 truncate text-xs font-medium text-[var(--app-muted)]">
                {modeLabel} · {statusDetail}
              </div>
            </div>
            <button
              className="flex h-9 w-9 items-center justify-center rounded-md border border-[var(--app-border)] bg-[var(--app-input)] text-[var(--app-muted)] hover:bg-[var(--app-hover)] hover:text-[var(--app-text)] disabled:opacity-50"
              title="刷新连接状态"
              onClick={onRefresh}
              disabled={refreshPending}
            >
              <RefreshCwIcon className={cn("h-4 w-4", refreshPending && "animate-spin")} />
            </button>
            <button
              className={cn(
                "flex h-9 min-w-[92px] items-center justify-center gap-2 rounded-md px-3 text-sm font-medium transition-colors disabled:opacity-50",
                connected
                  ? "bg-[var(--app-selected)] text-[var(--app-text)] hover:bg-[var(--app-hover-strong)]"
                  : "bg-[var(--app-accent)] text-[var(--app-accent-contrast)] hover:opacity-90",
              )}
              onClick={connected ? onDisconnect : () => onConnect(settings.serverMode)}
              disabled={connected ? busy : !canConnect}
            >
              {busy ? (
                <Loader2Icon className="h-4 w-4 animate-spin" />
              ) : connected ? (
                <PlugIcon className="h-4 w-4" />
              ) : (
                <PowerIcon className="h-4 w-4" />
              )}
              {connected ? "断开" : "连接"}
            </button>
          </div>
        </div>
      </SettingsSection>

      <SettingsSection title="连接方式" framed={false}>
        <div className="grid gap-3 md:grid-cols-2">
          <ModeOption
            icon={TerminalSquareIcon}
            title="本地托管"
            description="由桌面工作台启动并管理当前仓库中的 OpenCode server。"
            selected={settings.serverMode === "local"}
            onClick={() => onChange({ serverMode: "local" })}
          />
          <ModeOption
            icon={Globe2Icon}
            title="连接已有服务"
            description="用于连接你已在终端、WSL、Docker 或其他机器上启动的 OpenCode HTTP 服务。"
            selected={settings.serverMode === "remote"}
            onClick={() => onChange({ serverMode: "remote" })}
          />
        </div>
      </SettingsSection>

      <SettingsSection title="HTTP 地址">
        <div className="divide-y divide-[var(--app-divider)]">
          <SettingRow
            icon={Globe2Icon}
            title="Server 地址"
            description={
              settings.serverMode === "local"
                ? "本地托管模式会按这个地址启动 OpenCode server。"
                : "连接已有服务时，GUI 只访问这个地址，不会启动或停止对方进程。"
            }
            control={
              <input
                value={settings.serverUrl}
                onChange={(event) => onChange({ serverUrl: event.target.value })}
                className="h-10 w-[320px] rounded-lg border border-[var(--app-border)] bg-[var(--app-input)] px-3 text-sm font-medium text-[var(--app-text)] outline-none placeholder:text-[var(--app-muted)] focus:border-[var(--app-accent)]"
                placeholder="http://127.0.0.1:4096"
              />
            }
          />
        </div>
      </SettingsSection>
    </div>
  )
}

function PersonalizationSettings({
  settings,
  onChange,
}: {
  settings: GuiSettings
  onChange: (patch: Partial<GuiSettings>) => void
}) {
  return (
    <div className="space-y-8">
      <SettingsSection title="个性化">
        <div className="divide-y divide-[var(--app-divider)]">
          <SettingRow
            icon={Edit3Icon}
            title="称呼"
            description="会随任务发送给 OpenCode，用于回复和任务总结里的称呼。"
            control={
              <input
                value={settings.userName}
                onChange={(event) => onChange({ userName: event.target.value })}
                className="h-9 w-[220px] rounded-md border border-[var(--app-border)] bg-[var(--app-input)] px-3 text-sm font-medium text-[var(--app-text)] outline-none placeholder:text-[var(--app-muted)] focus:border-[var(--app-accent)]"
                placeholder="可选"
              />
            }
          />
          <SettingRow
            icon={Globe2Icon}
            title="回答语言"
            description="会影响后续发送给 OpenCode 的回复语言。"
            control={
              <SelectControl
                value={settings.responseLanguage}
                onChange={(value) => onChange({ responseLanguage: value as GuiSettings["responseLanguage"] })}
                options={[
                  { value: "zh-CN", label: "中文" },
                  { value: "auto", label: "自动" },
                ]}
              />
            }
          />
        </div>
      </SettingsSection>

      <SettingsSection title="自定义指令">
        <textarea
          value={settings.customInstructions}
          onChange={(event) => onChange({ customInstructions: event.target.value })}
          className="h-[160px] w-full resize-none rounded-lg border border-[var(--app-border)] bg-[var(--app-panel-2)] px-4 py-3 text-sm leading-6 text-[var(--app-text)] outline-none placeholder:text-[var(--app-muted)] focus:border-[var(--app-accent)]"
          placeholder="例如：回复要简洁；改代码前先说明影响；优先保持现有项目风格。"
        />
      </SettingsSection>
    </div>
  )
}

function McpSettings({
  settings,
  server,
  workspaceDirectory,
  onChange,
}: {
  settings: GuiSettings
  server?: ServerStatus
  workspaceDirectory?: string | null
  onChange: (patch: Partial<GuiSettings>) => void
}) {
  const queryClient = useQueryClient()
  const baseUrl = server?.baseUrl ?? settings.serverUrl
  const serverReady = Boolean(server?.healthy && baseUrl)
  const servers = settings.mcpServerList

  const statusQuery = useQuery({
    queryKey: ["mcp-status", baseUrl, workspaceDirectory],
    queryFn: () =>
      mcpStatus({
        baseUrl,
        directory: workspaceDirectory ?? undefined,
      }),
    enabled: serverReady,
    refetchInterval: serverReady ? 5_000 : false,
  })

  const addServer = useMutation({
    mutationFn: async (item: GuiMcpServer) =>
      mcpAdd({
        baseUrl,
        directory: workspaceDirectory ?? undefined,
        name: item.name.trim(),
        config: mcpServerConfig(item),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["mcp-status"] })
    },
  })

  const connectServer = useMutation({
    mutationFn: async (item: GuiMcpServer) =>
      mcpAdd({
        baseUrl,
        directory: workspaceDirectory ?? undefined,
        name: item.name.trim(),
        config: mcpServerConfig({ ...item, enabled: true }),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["mcp-status"] })
    },
  })

  const disconnectServer = useMutation({
    mutationFn: async (item: GuiMcpServer) =>
      mcpDisconnect({
        baseUrl,
        directory: workspaceDirectory ?? undefined,
        name: item.name.trim(),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["mcp-status"] })
    },
  })

  function updateServers(next: GuiMcpServer[]) {
    onChange({
      mcpServerList: next,
      mcpServers: serializeMcpServers(next),
    })
  }

  function updateServer(id: string, patch: Partial<GuiMcpServer>) {
    updateServers(servers.map((item) => (item.id === id ? { ...item, ...patch } : item)))
  }

  function addNewServer() {
    updateServers([...servers, defaultMcpServer(servers.length)])
  }

  function removeServer(item: GuiMcpServer) {
    updateServers(servers.filter((server) => server.id !== item.id))
    if (serverReady && item.name.trim()) {
      void disconnectServer.mutateAsync(item).catch(() => undefined)
    }
  }

  async function toggleServer(item: GuiMcpServer, enabled: boolean) {
    const next = { ...item, enabled }
    updateServer(item.id, { enabled })
    if (!serverReady || !settings.mcpEnabled || !item.name.trim()) return
    if (enabled) {
      await connectServer.mutateAsync(next)
      return
    }
    await disconnectServer.mutateAsync(next)
  }

  async function applyServer(item: GuiMcpServer) {
    if (!serverReady || !settings.mcpEnabled || !item.name.trim()) return
    if (item.enabled) {
      await connectServer.mutateAsync(item)
      return
    }
    await addServer.mutateAsync(item)
  }

  const [editingId, setEditingId] = useState<string | null>(null)

  function startAdd() {
    const next = defaultMcpServer(servers.length)
    updateServers([...servers, next])
    setEditingId(next.id)
  }

  async function saveAndClose(item: GuiMcpServer) {
    setEditingId(null)
    if (!serverReady || !settings.mcpEnabled || !item.name.trim()) return
    if (!canApplyMcpServer(item)) return
    await applyServer(item)
  }

  function deleteAndClose(item: GuiMcpServer) {
    setEditingId((current) => (current === item.id ? null : current))
    removeServer(item)
  }

  const busy = addServer.isPending || connectServer.isPending || disconnectServer.isPending

  return (
    <div className="space-y-6">
      <SettingsSection
        title="MCP 服务器"
        description="连接外部工具和数据源。"
        framed={false}
      >
        <div className="mb-4 flex items-start justify-between gap-4 rounded-xl border border-[var(--app-border)] bg-[var(--app-panel-2)] px-5 py-3.5">
          <div className="flex min-w-0 items-start gap-3">
            <BlocksIcon className="mt-0.5 h-4 w-4 shrink-0 text-[var(--app-muted)]" />
            <div className="min-w-0">
              <div className="text-[13px] font-medium text-[var(--app-text)]">启用 MCP</div>
              <div className="mt-0.5 text-[12px] leading-5 text-[var(--app-muted)]">
                关闭后，GUI 不会主动连接这里配置的 MCP 服务。
              </div>
            </div>
          </div>
          <Switch
            checked={settings.mcpEnabled}
            onChange={(value) => {
              onChange({ mcpEnabled: value })
              if (!value && serverReady) {
                for (const item of servers) {
                  if (item.enabled) void disconnectServer.mutateAsync(item).catch(() => undefined)
                }
              }
            }}
          />
        </div>

        {/* Server list */}
        {servers.length ? (
          <div className="overflow-hidden rounded-xl border border-[var(--app-border)] bg-[var(--app-panel-2)]">
            <header className="flex items-center justify-between gap-3 border-b border-[var(--app-divider)] px-5 py-3">
              <span className="text-[13px] font-semibold text-[var(--app-text)]">服务器</span>
              <button
                type="button"
                className="flex h-7 items-center gap-1.5 rounded-md border border-[var(--app-border)] bg-[var(--app-panel)] px-2.5 text-[12px] font-medium text-[var(--app-text)] transition-colors hover:bg-[var(--app-hover)]"
                onClick={startAdd}
              >
                <PlusIcon className="h-3.5 w-3.5" />
                添加服务器
              </button>
            </header>

            <div className="divide-y divide-[var(--app-divider)]">
              {servers.map((item) => {
                const editing = editingId === item.id
                if (editing) {
                  return (
                    <McpServerEditor
                      key={item.id}
                      item={item}
                      status={statusQuery.data?.[item.name]}
                      disabled={!settings.mcpEnabled}
                      busy={busy}
                      onChange={(patch) => updateServer(item.id, patch)}
                      onToggle={(enabled) => void toggleServer(item, enabled)}
                      onSave={() => void saveAndClose(item)}
                      onCancel={() => setEditingId(null)}
                      onRemove={() => deleteAndClose(item)}
                    />
                  )
                }
                return (
                  <McpServerSummary
                    key={item.id}
                    item={item}
                    status={statusQuery.data?.[item.name]}
                    disabled={!settings.mcpEnabled}
                    onEdit={() => setEditingId(item.id)}
                    onToggle={(enabled) => void toggleServer(item, enabled)}
                  />
                )
              })}
            </div>
          </div>
        ) : (
          <div className="rounded-xl border border-dashed border-[var(--app-border)] bg-[var(--app-panel-2)] px-6 py-12 text-center">
            <BlocksIcon className="mx-auto mb-3 h-6 w-6 text-[var(--app-muted)]" />
            <div className="text-[15px] font-semibold text-[var(--app-text)]">没有 MCP 服务</div>
            <div className="mx-auto mt-2 max-w-[440px] text-[13px] leading-6 text-[var(--app-muted)]">
              添加本地命令或远程 URL 后，OpenCode 可以把这些工具加入任务上下文。
            </div>
            <button
              type="button"
              className="mt-5 inline-flex h-9 items-center gap-1.5 rounded-md bg-[var(--app-text)] px-3 text-[13px] font-medium text-[var(--app-bg)] hover:opacity-90"
              onClick={startAdd}
            >
              <PlusIcon className="h-4 w-4" />
              添加服务器
            </button>
          </div>
        )}
      </SettingsSection>
    </div>
  )
}

function mcpStatusText(status?: McpStatusInfo) {
  if (!status) return "未应用"
  if (status.status === "connected") return "已连接"
  if (status.status === "disabled") return "已停用"
  if (status.status === "failed") return "连接失败"
  if (status.status === "needs_auth") return "需要认证"
  if (status.status === "needs_client_registration") return "需要客户端注册"
  return status.status
}

function mcpStatusTone(status?: McpStatusInfo): {
  text: string
  dot: string
} {
  if (status?.status === "connected") {
    return { text: "text-[var(--app-success)]", dot: "bg-[var(--app-success)]" }
  }
  if (status?.status === "failed" || status?.status === "needs_client_registration") {
    return { text: "text-[var(--app-danger)]", dot: "bg-[var(--app-danger)]" }
  }
  if (status?.status === "needs_auth") {
    return { text: "text-[var(--app-warning)]", dot: "bg-[var(--app-warning)]" }
  }
  return { text: "text-[var(--app-muted)]", dot: "bg-[var(--app-subtle)]" }
}

function McpServerSummary({
  item,
  status,
  disabled,
  onEdit,
  onToggle,
}: {
  item: GuiMcpServer
  status?: McpStatusInfo
  disabled: boolean
  onEdit: () => void
  onToggle: (enabled: boolean) => void
}) {
  const tone = mcpStatusTone(status)
  return (
    <div
      className={cn(
        "flex items-center gap-3 px-5 py-3 transition-colors hover:bg-[var(--app-hover)]",
        disabled && "opacity-60",
      )}
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", tone.dot)} title={mcpStatusText(status)} />
          <span className="truncate text-[14px] font-semibold text-[var(--app-text)]">
            {item.name.trim() || <span className="font-normal text-[var(--app-muted)]">未命名服务</span>}
          </span>
        </div>
        {status?.error ? (
          <div className="mt-0.5 truncate text-[11px] text-[var(--app-danger)]">{status.error}</div>
        ) : null}
      </div>
      <button
        type="button"
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-[var(--app-muted)] transition-colors hover:bg-[var(--app-hover-strong)] hover:text-[var(--app-text)]"
        onClick={onEdit}
        title="编辑"
      >
        <SettingsIcon className="h-4 w-4" />
      </button>
      <Switch checked={item.enabled} onChange={onToggle} />
    </div>
  )
}

function McpServerEditor({
  item,
  status,
  disabled,
  busy,
  onChange,
  onToggle,
  onSave,
  onCancel,
  onRemove,
}: {
  item: GuiMcpServer
  status?: McpStatusInfo
  disabled: boolean
  busy: boolean
  onChange: (patch: Partial<GuiMcpServer>) => void
  onToggle: (enabled: boolean) => void
  onSave: () => void
  onCancel: () => void
  onRemove: () => void
}) {
  const nameValid = isValidMcpServerName(item.name)
  const canApply = canApplyMcpServer(item)
  const tone = mcpStatusTone(status)
  const isLocal = item.type === "local"

  return (
    <div className={cn("transition-opacity", disabled && "opacity-60")}>
      {/* Header — current name, type chip, status, toggle, collapse */}
      <header className="flex items-center gap-3 bg-[var(--app-panel)] px-5 py-3">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-[var(--app-hover)] text-[var(--app-muted)]">
          {isLocal ? <TerminalSquareIcon className="h-3.5 w-3.5" /> : <Globe2Icon className="h-3.5 w-3.5" />}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="truncate text-[13px] font-medium text-[var(--app-text)]">
              {item.name.trim() || <span className="text-[var(--app-muted)]">未命名服务</span>}
            </span>
            <span className="rounded-full border border-[var(--app-border)] px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider text-[var(--app-muted)]">
              {isLocal ? "STDIO" : "HTTP"}
            </span>
            <span className={cn("flex items-center gap-1.5 text-[11px]", tone.text)}>
              <span className={cn("h-1.5 w-1.5 rounded-full", tone.dot)} />
              {mcpStatusText(status)}
            </span>
          </div>
          {status?.error ? (
            <div className="mt-0.5 truncate text-[11px] text-[var(--app-muted)]">{status.error}</div>
          ) : null}
        </div>
        <Switch checked={item.enabled} onChange={onToggle} />
      </header>

      <div className="space-y-5 border-t border-[var(--app-divider)] px-5 py-5">
        {/* 名称 */}
        <McpFieldGroup label="名称">
          <input
            value={item.name}
            onChange={(event) => onChange({ name: event.target.value })}
            className={cn(mcpInputClass, nameValid ? "border-[var(--app-border)]" : "border-[var(--app-danger)]")}
            placeholder="MCP server name"
          />
          {!nameValid ? (
            <div className="mt-1 text-[11px] text-[var(--app-danger)]">
              名称只能使用字母、数字、下划线或短横线。
            </div>
          ) : null}
        </McpFieldGroup>

        {/* Tabs: STDIO / 流式 HTTP */}
        <McpTabs
          value={item.type}
          onChange={(value) => onChange({ type: value })}
          options={[
            { value: "local", label: "STDIO" },
            { value: "remote", label: "流式 HTTP" },
          ]}
        />

        {isLocal ? (
          <>
            <McpFieldGroup label="启动命令">
              <input
                value={item.command}
                onChange={(event) => onChange({ command: event.target.value })}
                className={cn(mcpInputClass, "border-[var(--app-border)] [font-family:var(--app-code-font)] text-[12.5px]")}
                placeholder="opencode-dev-mcp serve-sqlite"
              />
            </McpFieldGroup>

            <McpFieldGroup label="参数">
              <ArgsListEditor
                value={item.args}
                onChange={(value) => onChange({ args: value })}
                placeholder="--flag 或 path/to/something"
              />
            </McpFieldGroup>

            <McpFieldGroup label="环境变量">
              <KeyValueListEditor
                value={item.env}
                onChange={(value) => onChange({ env: value })}
              />
            </McpFieldGroup>

            <McpFieldGroup label="工作目录">
              <input
                value={item.cwd}
                onChange={(event) => onChange({ cwd: event.target.value })}
                className={cn(mcpInputClass, "border-[var(--app-border)] [font-family:var(--app-code-font)] text-[12.5px]")}
                placeholder="留空则使用当前工作区目录"
              />
            </McpFieldGroup>
          </>
        ) : (
          <>
            <McpFieldGroup label="URL">
              <input
                value={item.url}
                onChange={(event) => onChange({ url: event.target.value })}
                className={cn(mcpInputClass, "border-[var(--app-border)] [font-family:var(--app-code-font)] text-[12.5px]")}
                placeholder="https://example.com/mcp"
              />
            </McpFieldGroup>

            <McpFieldGroup label="Headers">
              <KeyValueListEditor
                value={item.headers}
                onChange={(value) => onChange({ headers: value })}
                keyPlaceholder="header"
                valuePlaceholder="value"
              />
            </McpFieldGroup>
          </>
        )}

        <McpFieldGroup label="超时（毫秒）">
          <input
            type="number"
            min={1000}
            step={500}
            value={item.timeout}
            onChange={(event) => onChange({ timeout: Number(event.target.value) || 5000 })}
            className={cn(mcpInputClass, "border-[var(--app-border)] tabular-nums")}
          />
        </McpFieldGroup>
      </div>

      {/* Footer */}
      <footer className="flex items-center justify-between gap-2 border-t border-[var(--app-divider)] bg-[var(--app-panel)] px-5 py-2.5">
        <button
          type="button"
          className="flex h-7 items-center gap-1.5 rounded-md px-2.5 text-[12px] font-medium text-[var(--app-muted)] transition-colors hover:bg-[var(--app-danger-soft)] hover:text-[var(--app-danger)]"
          onClick={onRemove}
        >
          <Trash2Icon className="h-3.5 w-3.5" />
          删除
        </button>
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="flex h-8 items-center gap-1.5 rounded-md border border-[var(--app-border)] bg-[var(--app-panel)] px-3 text-[12px] font-medium text-[var(--app-text)] hover:bg-[var(--app-hover)] disabled:opacity-50"
            onClick={onCancel}
          >
            收起
          </button>
          <button
            type="button"
            className="flex h-8 items-center gap-1.5 rounded-md bg-[var(--app-text)] px-4 text-[12px] font-medium text-[var(--app-bg)] hover:opacity-90 disabled:opacity-50"
            onClick={onSave}
            disabled={disabled || busy || !canApply}
            title={canApply ? "保存并应用到 OpenCode" : "请先填写必填字段"}
          >
            {busy ? <Loader2Icon className="h-3.5 w-3.5 animate-spin" /> : <PlugIcon className="h-3.5 w-3.5" />}
            保存
          </button>
        </div>
      </footer>
    </div>
  )
}

const mcpInputClass =
  "h-9 w-full rounded-md border bg-[var(--app-input)] px-3 text-[13px] text-[var(--app-text)] outline-none transition-colors placeholder:text-[var(--app-muted)] focus:border-[var(--app-accent)]"

function McpFieldGroup({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <div className="mb-2 text-[13px] font-semibold text-[var(--app-text)]">{label}</div>
      {children}
    </div>
  )
}

function McpTabs<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T
  options: Array<{ value: T; label: string }>
  onChange: (value: T) => void
}) {
  return (
    <div className="grid grid-cols-2 gap-1 rounded-md border border-[var(--app-border)] bg-[var(--app-panel)] p-1">
      {options.map((option) => {
        const active = option.value === value
        return (
          <button
            key={option.value}
            type="button"
            className={cn(
              "h-8 rounded text-[12px] font-medium transition-colors",
              active
                ? "bg-[var(--app-hover-strong)] text-[var(--app-text)]"
                : "text-[var(--app-muted)] hover:bg-[var(--app-hover)] hover:text-[var(--app-text)]",
            )}
            onClick={() => onChange(option.value)}
          >
            {option.label}
          </button>
        )
      })}
    </div>
  )
}

/** Edit a list of arguments (strings). Stored as newline-separated text. */
function ArgsListEditor({
  value,
  onChange,
  placeholder,
}: {
  value: string
  onChange: (value: string) => void
  placeholder?: string
}) {
  // Each newline corresponds to a row in the editor — including blank rows
  // the user is currently typing into. parseArgs() strips empty lines when
  // building the runtime config, so we can persist verbatim.
  const items = value.split(/\r?\n/)
  const display = items.length === 0 ? [""] : items

  function commit(next: string[]) {
    onChange(next.join("\n"))
  }

  function setAt(index: number, val: string) {
    const next = [...display]
    next[index] = val
    commit(next)
  }

  function addRow() {
    commit([...display, ""])
  }

  function removeAt(index: number) {
    if (display.length === 1) {
      commit([""])
      return
    }
    commit(display.filter((_, i) => i !== index))
  }

  return (
    <div className="space-y-2">
      {display.map((arg, index) => (
        <div key={index} className="flex items-center gap-2">
          <input
            value={arg}
            onChange={(event) => setAt(index, event.target.value)}
            className={cn(mcpInputClass, "border-[var(--app-border)] [font-family:var(--app-code-font)] text-[12.5px]")}
            placeholder={placeholder}
          />
          <button
            type="button"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-[var(--app-muted)] transition-colors hover:bg-[var(--app-danger-soft)] hover:text-[var(--app-danger)] disabled:opacity-40"
            onClick={() => removeAt(index)}
            disabled={display.length === 1 && !arg}
            title="移除参数"
          >
            <Trash2Icon className="h-3.5 w-3.5" />
          </button>
        </div>
      ))}
      <button
        type="button"
        className="flex h-9 w-full items-center justify-center gap-1.5 rounded-md border border-dashed border-[var(--app-border)] bg-transparent text-[12px] font-medium text-[var(--app-muted)] transition-colors hover:bg-[var(--app-hover)] hover:text-[var(--app-text)]"
        onClick={addRow}
      >
        <PlusIcon className="h-3.5 w-3.5" />
        添加参数
      </button>
    </div>
  )
}

/**
 * Key-value list editor. Stored as `KEY=VALUE` lines. The last empty trailing
 * row is rendered as an editable placeholder so the user always has a free
 * row to type into without having to click "add" first.
 */
function KeyValueListEditor({
  value,
  onChange,
  keyPlaceholder = "键",
  valuePlaceholder = "值",
}: {
  value: string
  onChange: (value: string) => void
  keyPlaceholder?: string
  valuePlaceholder?: string
}) {
  // Keep blank rows the user is editing — parseRecordLines drops them when
  // the config is applied to OpenCode, so they don't pollute the runtime.
  const lines = value === "" ? [] : value.split(/\r?\n/)
  const rows = lines.map((line) => {
    const eq = line.indexOf("=")
    if (eq < 0) return { key: line, value: "" }
    return { key: line.slice(0, eq), value: line.slice(eq + 1) }
  })
  const display = rows.length ? rows : [{ key: "", value: "" }]

  function commit(next: Array<{ key: string; value: string }>) {
    onChange(next.map((row) => `${row.key}=${row.value}`).join("\n"))
  }

  function setAt(index: number, patch: Partial<{ key: string; value: string }>) {
    const next = [...display]
    next[index] = { ...next[index], ...patch }
    commit(next)
  }

  function addRow() {
    commit([...display, { key: "", value: "" }])
  }

  function removeAt(index: number) {
    if (display.length === 1) {
      commit([{ key: "", value: "" }])
      return
    }
    commit(display.filter((_, i) => i !== index))
  }

  return (
    <div className="space-y-2">
      {display.map((row, index) => (
        <div key={index} className="flex items-center gap-2">
          <input
            value={row.key}
            onChange={(event) => setAt(index, { key: event.target.value })}
            className={cn(mcpInputClass, "border-[var(--app-border)] [font-family:var(--app-code-font)] text-[12.5px]")}
            placeholder={keyPlaceholder}
          />
          <input
            value={row.value}
            onChange={(event) => setAt(index, { value: event.target.value })}
            className={cn(mcpInputClass, "border-[var(--app-border)] [font-family:var(--app-code-font)] text-[12.5px]")}
            placeholder={valuePlaceholder}
          />
          <button
            type="button"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-[var(--app-muted)] transition-colors hover:bg-[var(--app-danger-soft)] hover:text-[var(--app-danger)] disabled:opacity-40"
            onClick={() => removeAt(index)}
            disabled={display.length === 1 && !row.key && !row.value}
            title="移除变量"
          >
            <Trash2Icon className="h-3.5 w-3.5" />
          </button>
        </div>
      ))}
      <button
        type="button"
        className="flex h-9 w-full items-center justify-center gap-1.5 rounded-md border border-dashed border-[var(--app-border)] bg-transparent text-[12px] font-medium text-[var(--app-muted)] transition-colors hover:bg-[var(--app-hover)] hover:text-[var(--app-text)]"
        onClick={addRow}
      >
        <PlusIcon className="h-3.5 w-3.5" />
        添加环境变量
      </button>
    </div>
  )
}

function apiModelsFromThirdPartyProviders(providers: GuiThirdPartyProvider[]): OpenCodeModel[] {
  return providers.flatMap((provider) =>
    provider.models.map((model): OpenCodeModel => ({
      id: model,
      name: model,
      providerId: provider.id,
      providerName: provider.name,
      status: !provider.enabled ? "disabled" : provider.authStored ? "active" : "needs_auth",
      family: null,
      context: provider.contextLimit,
      input: provider.contextLimit,
      output: provider.outputLimit,
      supportsReasoning: provider.supportsReasoning,
      supportsAttachment: provider.supportsAttachment,
      raw: { source: "third-party-api", providerId: provider.id },
    })),
  )
}

function ModelSettings({
  settings,
  onChange,
}: {
  settings: GuiSettings
  onChange: (patch: Partial<GuiSettings>) => void
}) {
  const [query, setQuery] = useState("")
  const [providerFilter, setProviderFilter] = useState("all")
  const activeModels = useMemo(
    () => apiModelsFromThirdPartyProviders(settings.thirdPartyProviders),
    [settings.thirdPartyProviders],
  )
  const orderedModels = useMemo(
    () =>
      applyModelPreferences(
        activeModels,
        {
          favoriteModels: settings.favoriteModels,
          hiddenModels: settings.hiddenModels,
        },
        { includeHidden: true },
      ),
    [activeModels, settings.favoriteModels, settings.hiddenModels],
  )
  const providerOptions = useMemo(() => {
    const providers = Array.from(
      new Map(orderedModels.map((model) => [model.providerId, model.providerName || model.providerId])).entries(),
    ).sort((left, right) => left[1].localeCompare(right[1]))
    return [{ value: "all", label: "全部供应商" }, ...providers.map(([value, label]) => ({ value, label }))]
  }, [orderedModels])
  const normalizedQuery = query.trim().toLowerCase()
  const filteredModels = orderedModels.filter((model) => {
    if (providerFilter !== "all" && model.providerId !== providerFilter) return false
    if (!normalizedQuery) return true
    return [model.name, model.id, model.providerName, model.providerId]
      .filter(Boolean)
      .some((value) => String(value).toLowerCase().includes(normalizedQuery))
  })
  const favoriteKeys = new Set(settings.favoriteModels)
  const hiddenKeys = new Set(settings.hiddenModels)
  const hiddenCount = orderedModels.filter((model) => hiddenKeys.has(modelKeyFromRef(model))).length

  function toggleFavorite(model: OpenCodeModel) {
    const key = modelKeyFromRef(model)
    onChange({ favoriteModels: toggleModelFavoriteKey(settings.favoriteModels, key) })
  }

  function toggleHidden(model: OpenCodeModel) {
    const key = modelKeyFromRef(model)
    onChange({ hiddenModels: toggleModelHiddenKey(settings.hiddenModels, key) })
  }

  return (
    <div className="space-y-8">
      <SettingsSection title="API 模型偏好">
        <div className="border-b border-[var(--app-divider)] px-5 py-4">
          <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_220px]">
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              className="h-9 min-w-0 rounded-md border border-[var(--app-border)] bg-[var(--app-input)] px-3 text-sm font-medium text-[var(--app-text)] outline-none placeholder:text-[var(--app-muted)] focus:border-[var(--app-accent)]"
              placeholder="搜索模型"
            />
            <SelectControl value={providerFilter} onChange={setProviderFilter} options={providerOptions} />
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2 text-[12px] font-medium text-[var(--app-muted)]">
            <span>{formatStatsNumber(activeModels.length)} 个 API 模型</span>
            <span className="h-1 w-1 rounded-full bg-[var(--app-dot)]" />
            <span>{formatStatsNumber(settings.favoriteModels.length)} 个收藏</span>
            <span className="h-1 w-1 rounded-full bg-[var(--app-dot)]" />
            <span>{formatStatsNumber(hiddenCount)} 个已隐藏</span>
          </div>
        </div>
        <div className="max-h-[520px] divide-y divide-[var(--app-divider)] overflow-auto">
          {filteredModels.length ? (
            filteredModels.map((model) => {
              const key = modelKeyFromRef(model)
              const favorite = favoriteKeys.has(key)
              const hidden = hiddenKeys.has(key)
              const variants = settings.modelVariants[key] ?? []
              return (
                <div key={key} className={cn("flex min-w-0 items-center gap-3 px-5 py-3", hidden && "opacity-55")}>
                  <button
                    type="button"
                    className={cn(
                      "flex h-8 w-8 shrink-0 items-center justify-center rounded-md transition-colors",
                      favorite
                        ? "text-[var(--app-warning)] hover:bg-[var(--app-hover)]"
                        : "text-[var(--app-muted)] hover:bg-[var(--app-hover)] hover:text-[var(--app-text)]",
                    )}
                    title={favorite ? "取消收藏" : "收藏模型"}
                    onClick={() => toggleFavorite(model)}
                  >
                    <StarIcon className={cn("h-4 w-4", favorite && "fill-current")} />
                  </button>
                  <div className="min-w-0 flex-1">
                    <div className="flex min-w-0 items-center gap-2">
                      <span className="truncate text-[13px] font-semibold text-[var(--app-text)]">{model.name}</span>
                      {model.supportsReasoning ? (
                        <span className="shrink-0 rounded-full border border-[var(--app-border)] px-1.5 py-0.5 text-[10px] font-medium text-[var(--app-accent)]">
                          推理
                        </span>
                      ) : null}
                      {variants.length ? (
                        <span className="shrink-0 rounded-full border border-[var(--app-border)] px-1.5 py-0.5 text-[10px] font-medium text-[var(--app-muted)]">
                          {variants.length} variant
                        </span>
                      ) : null}
                    </div>
                    <div className="mt-1 flex min-w-0 flex-wrap items-center gap-2 text-[11.5px] text-[var(--app-muted)]">
                      <span className="truncate">{model.providerName}</span>
                      <span className="h-1 w-1 rounded-full bg-[var(--app-dot)]" />
                      <span className="truncate [font-family:var(--app-code-font)]">{model.id}</span>
                      {model.context ? (
                        <>
                          <span className="h-1 w-1 rounded-full bg-[var(--app-dot)]" />
                          <span>{formatStatsNumber(model.context)} context</span>
                        </>
                      ) : null}
                    </div>
                  </div>
                  <button
                    type="button"
                    className={cn(
                      "flex h-8 items-center gap-1.5 rounded-md px-2.5 text-[12px] font-medium transition-colors",
                      hidden
                        ? "bg-[var(--app-selected)] text-[var(--app-text)] hover:bg-[var(--app-hover)]"
                        : "text-[var(--app-muted)] hover:bg-[var(--app-hover)] hover:text-[var(--app-text)]",
                    )}
                    title={hidden ? "恢复显示" : "隐藏模型"}
                    onClick={() => toggleHidden(model)}
                  >
                    <EyeOffIcon className="h-3.5 w-3.5" />
                    {hidden ? "已隐藏" : "隐藏"}
                  </button>
                </div>
              )
            })
          ) : (
            <div className="px-5 py-8 text-sm font-medium text-[var(--app-muted)]">
              {activeModels.length ? "没有匹配的模型" : "在 API 供应商设置里添加或获取模型后，可在这里收藏或隐藏模型。"}
            </div>
          )}
        </div>
      </SettingsSection>
    </div>
  )
}

function GitSettings({
  settings,
  onChange,
}: {
  settings: GuiSettings
  onChange: (patch: Partial<GuiSettings>) => void
}) {
  return (
    <div className="space-y-8">
      <SettingsSection title="Git">
        <div className="divide-y divide-[var(--app-divider)]">
          <SettingRow
            icon={GitBranchIcon}
            title="自动检测仓库"
            description="切换项目后自动读取分支和工作区状态，并显示在聊天工作台。"
            control={<Switch checked={settings.gitAutoDetect} onChange={(value) => onChange({ gitAutoDetect: value })} />}
          />
          <SettingRow
            icon={WrenchIcon}
            title="Diff 展示"
            description="右侧变更面板默认使用的 diff 视图。"
            control={
              <SelectControl
                value={settings.gitDiffView}
                onChange={(value) => onChange({ gitDiffView: value as GuiSettings["gitDiffView"] })}
                options={[
                  { value: "inline", label: "内联" },
                  { value: "split", label: "左右对照" },
                ]}
              />
            }
          />
        </div>
      </SettingsSection>
    </div>
  )
}

const NETWORK_PROXY_TEST_TARGETS = [
  { value: "https://api.anthropic.com/", label: "Anthropic API" },
  { value: "https://api.github.com/repos/addy777-coder/opencode/releases/latest", label: "GitHub Release" },
  { value: "https://api.openai.com/v1/models", label: "OpenAI API" },
]

function NetworkProxySettings({
  settings,
  onChange,
}: {
  settings: GuiSettings
  onChange: (patch: Partial<GuiSettings>) => void
}) {
  const [targetUrl, setTargetUrl] = useState(NETWORK_PROXY_TEST_TARGETS[0].value)
  const preview = proxyUrlPreview(settings)
  const enabled = settings.networkProxyEnabled
  const configComplete = Boolean(preview)
  const testConnection = useMutation({
    mutationFn: () =>
      networkProxyTest({
        proxy: buildNetworkProxyConfig(settings),
        targetUrl,
      }),
  })
  const status = !enabled ? "未启用" : configComplete ? "已启用" : "配置不完整"
  const statusDetail = !enabled
    ? "状态：未启用"
    : configComplete
      ? `状态：${preview}`
      : "状态：请填写主机和端口"
  const testResult = testConnection.data

  return (
    <div className="space-y-8">
      <SettingsSection title="网络代理" description="给本地 OpenCode server、GitHub release 检查和应用更新设置网络代理。">
        <div className="divide-y divide-[var(--app-divider)]">
          <SettingRow
            icon={NetworkIcon}
            title="启用代理"
            description="启用后，重新连接本地 OpenCode server 会带上 HTTP_PROXY、HTTPS_PROXY、ALL_PROXY 和 NO_PROXY。"
            control={<Switch checked={enabled} onChange={(value) => onChange({ networkProxyEnabled: value })} />}
          />
          <div className="space-y-5 px-5 py-5">
            <div className="grid gap-4 md:grid-cols-[180px_minmax(0,1fr)]">
              <div>
                <div className="mb-2 text-[13px] font-semibold text-[var(--app-text)]">协议</div>
                <SelectControl
                  className="min-w-0"
                  value={settings.networkProxyProtocol}
                  onChange={(value) => onChange({ networkProxyProtocol: value as NetworkProxyProtocol })}
                  options={[
                    { value: "http", label: "HTTP" },
                    { value: "https", label: "HTTPS" },
                  ]}
                />
              </div>
              <div>
                <div className="mb-2 text-[13px] font-semibold text-[var(--app-text)]">主机</div>
                <input
                  value={settings.networkProxyHost}
                  disabled={!enabled}
                  onChange={(event) => onChange({ networkProxyHost: event.target.value })}
                  className={cn(mcpInputClass, "border-[var(--app-border)] [font-family:var(--app-code-font)]", !enabled && "opacity-60")}
                  placeholder="127.0.0.1"
                />
              </div>
            </div>
            <div className="grid gap-4 md:grid-cols-[150px_minmax(0,1fr)_minmax(0,1fr)]">
              <div>
                <div className="mb-2 text-[13px] font-semibold text-[var(--app-text)]">端口</div>
                <input
                  value={settings.networkProxyPort}
                  disabled={!enabled}
                  inputMode="numeric"
                  onChange={(event) => onChange({ networkProxyPort: event.target.value.replace(/[^\d]/g, "") })}
                  className={cn(mcpInputClass, "border-[var(--app-border)] tabular-nums", !enabled && "opacity-60")}
                  placeholder="7890"
                />
              </div>
              <div>
                <div className="mb-2 text-[13px] font-semibold text-[var(--app-text)]">用户名</div>
                <input
                  value={settings.networkProxyUsername}
                  disabled={!enabled}
                  onChange={(event) => onChange({ networkProxyUsername: event.target.value })}
                  className={cn(mcpInputClass, "border-[var(--app-border)]", !enabled && "opacity-60")}
                  placeholder="可选"
                />
              </div>
              <div>
                <div className="mb-2 text-[13px] font-semibold text-[var(--app-text)]">密码</div>
                <input
                  value={settings.networkProxyPassword}
                  disabled={!enabled}
                  type="password"
                  onChange={(event) => onChange({ networkProxyPassword: event.target.value })}
                  className={cn(mcpInputClass, "border-[var(--app-border)]", !enabled && "opacity-60")}
                  placeholder="可选"
                />
              </div>
            </div>
            <div>
              <div className="mb-2 text-[13px] font-semibold text-[var(--app-text)]">不走代理（NO_PROXY）</div>
              <textarea
                value={settings.networkProxyNoProxy}
                disabled={!enabled}
                onChange={(event) => onChange({ networkProxyNoProxy: event.target.value })}
                className={cn(
                  "h-[86px] w-full resize-none rounded-md border border-[var(--app-border)] bg-[var(--app-input)] px-3 py-2 [font-family:var(--app-code-font)] text-[13px] leading-5 text-[var(--app-text)] outline-none placeholder:text-[var(--app-muted)] focus:border-[var(--app-accent)]",
                  !enabled && "opacity-60",
                )}
                placeholder="localhost,127.0.0.1,::1"
              />
            </div>
          </div>
        </div>
      </SettingsSection>

      <SettingsSection title="当前预览">
        <div className="px-5 py-4">
          <div className="text-[15px] font-semibold text-[var(--app-text)]">{status}</div>
          <div className="mt-2 break-all [font-family:var(--app-code-font)] text-[12.5px] leading-5 text-[var(--app-muted)]">
            {statusDetail}
          </div>
        </div>
      </SettingsSection>

      <SettingsSection title="测试连接" description="通过代理访问目标 URL，只检测连通性，不修改设置。">
        <div className="flex flex-col gap-4 px-5 py-4 md:flex-row md:items-center">
          <div className="min-w-0 flex-1">
            <div className="mb-2 text-[13px] font-semibold text-[var(--app-text)]">目标</div>
            <SelectControl value={targetUrl} onChange={setTargetUrl} options={NETWORK_PROXY_TEST_TARGETS} />
          </div>
          <button
            type="button"
            className="inline-flex h-9 items-center justify-center gap-2 rounded-md bg-[var(--app-accent)] px-4 text-[13px] font-medium text-[var(--app-accent-contrast)] hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50 md:mt-7"
            disabled={testConnection.isPending || (enabled && !configComplete)}
            onClick={() => testConnection.mutate()}
          >
            {testConnection.isPending ? <Loader2Icon className="h-4 w-4 animate-spin" /> : <PlugIcon className="h-4 w-4" />}
            测试
          </button>
        </div>
        {testConnection.error || testResult ? (
          <div
            className={cn(
              "border-t border-[var(--app-divider)] px-5 py-4 text-[13px] leading-6",
              testResult?.ok ? "text-[var(--app-text)]" : "text-[var(--app-danger)]",
            )}
          >
            {testConnection.error ? getErrorMessage(testConnection.error) : testResult?.message}
          </div>
        ) : null}
      </SettingsSection>
    </div>
  )
}

function EnvironmentSettings({
  settings,
  onChange,
}: {
  settings: GuiSettings
  onChange: (patch: Partial<GuiSettings>) => void
}) {
  return (
    <div className="space-y-8">
      <SettingsSection title="环境">
        <div className="divide-y divide-[var(--app-divider)]">
          <SettingRow
            icon={TerminalSquareIcon}
            title="环境配置"
            description="默认配置跟随当前系统和项目目录。"
            control={
              <SelectControl
                value={settings.environmentProfile}
                onChange={(value) => onChange({ environmentProfile: value as GuiSettings["environmentProfile"] })}
                options={[
                  { value: "default", label: "默认" },
                  { value: "project", label: "项目" },
                ]}
              />
            }
          />
        </div>
        <textarea
          value={settings.environmentVariables}
          onChange={(event) => onChange({ environmentVariables: event.target.value })}
          className="mt-4 h-[180px] w-full resize-none rounded-lg border border-[var(--app-border)] bg-[var(--app-panel-2)] px-4 py-3 font-mono text-xs leading-5 text-[var(--app-text)] outline-none placeholder:text-[var(--app-muted)] focus:border-[var(--app-accent)]"
          placeholder={"NODE_ENV=development\nRUST_LOG=info"}
        />
      </SettingsSection>
    </div>
  )
}

function BrowserSettings({
  settings,
  server,
  workspaceDirectory,
  onChange,
}: {
  settings: GuiSettings
  server?: ServerStatus
  workspaceDirectory?: string | null
  onChange: (patch: Partial<GuiSettings>) => void
}) {
  const queryClient = useQueryClient()
  const [copiedInstall, setCopiedInstall] = useState(false)
  const [browserError, setBrowserError] = useState<string | null>(null)
  const baseUrl = server?.baseUrl ?? settings.serverUrl
  const serverReady = Boolean(server?.healthy && baseUrl)
  const browserRows = settings.mcpServerList.filter(isBrowserMcpServer)
  const enabledBrowserRows = browserRows.filter((row) => row.enabled)

  const statusQuery = useQuery({
    queryKey: ["mcp-status", baseUrl, workspaceDirectory],
    queryFn: () =>
      mcpStatus({
        baseUrl,
        directory: workspaceDirectory ?? undefined,
      }),
    enabled: serverReady,
    refetchInterval: serverReady ? 5_000 : false,
  })

  const playwrightQuery = useQuery({
    queryKey: ["playwright-install"],
    queryFn: detectPlaywrightInstall,
  })

  const connectBrowser = useMutation({
    mutationFn: async (item: GuiMcpServer) =>
      mcpAdd({
        baseUrl,
        directory: workspaceDirectory ?? undefined,
        name: item.name.trim(),
        config: mcpServerConfig({ ...item, enabled: true }),
      }),
    onSuccess: (status) => {
      queryClient.setQueryData(["mcp-status", baseUrl, workspaceDirectory], {
        ...(statusQuery.data ?? {}),
        ...status,
      })
      void queryClient.invalidateQueries({ queryKey: ["mcp-status"] })
    },
  })

  const hasChromium = playwrightQuery.data?.chromium === true
  const connectedBrowserCount = enabledBrowserRows.filter((row) => statusQuery.data?.[row.name]?.status === "connected").length
  const browserReady = settings.browserUse && settings.mcpEnabled && enabledBrowserRows.length > 0 && hasChromium && (!serverReady || connectedBrowserCount > 0)
  const readiness = !settings.browserUse
    ? "已关闭"
    : !settings.mcpEnabled
      ? "MCP 已关闭"
      : enabledBrowserRows.length === 0
        ? "缺少浏览器 MCP"
        : !hasChromium
          ? "缺少 Chromium"
          : serverReady && connectedBrowserCount === 0
            ? "未连接"
            : serverReady
              ? "可用"
              : "等待连接"

  function updateServers(next: GuiMcpServer[], patch?: Partial<GuiSettings>) {
    onChange({
      ...patch,
      mcpServerList: next,
      mcpServers: serializeMcpServers(next),
    })
  }

  function updateBrowserUse(value: boolean) {
    if (value && browserRows.length === 0) {
      updateServers([...settings.mcpServerList, defaultBrowserMcpServer(settings.mcpServerList.length, settings.browserHeadless)], {
        browserUse: true,
        mcpEnabled: true,
      })
      return
    }
    onChange({ browserUse: value, mcpEnabled: value ? true : settings.mcpEnabled })
  }

  function updateBrowserHeadless(value: boolean) {
    const nextServers = settings.mcpServerList.map((server) => syncPlaywrightHeadless(server, value))
    updateServers(nextServers, { browserHeadless: value })
  }

  async function addOrConnectBrowser() {
    setBrowserError(null)
    const existing = enabledBrowserRows[0] ?? browserRows[0]
    const item = existing
      ? syncPlaywrightHeadless({ ...existing, enabled: true }, settings.browserHeadless)
      : defaultBrowserMcpServer(settings.mcpServerList.length, settings.browserHeadless)
    const nextServers = existing
      ? settings.mcpServerList.map((server) => (server.id === existing.id ? item : server))
      : [...settings.mcpServerList, item]

    updateServers(nextServers, {
      browserUse: true,
      mcpEnabled: true,
    })

    if (!serverReady) return
    try {
      await connectBrowser.mutateAsync(item)
    } catch (error) {
      setBrowserError(error instanceof Error ? error.message : String(error))
    }
  }

  async function copyInstallCommand() {
    try {
      await navigator.clipboard.writeText(PLAYWRIGHT_INSTALL_HINT)
      setCopiedInstall(true)
      window.setTimeout(() => setCopiedInstall(false), 1500)
    } catch (error) {
      setBrowserError(error instanceof Error ? error.message : String(error))
    }
  }

  function refresh() {
    if (serverReady) void statusQuery.refetch()
    void playwrightQuery.refetch()
  }

  return (
    <div className="space-y-6">
      {/* 顶部：可用性概览 */}
      <SettingsSection title="浏览器使用" description="通过 Playwright MCP 暴露浏览器工具，任务发送前会按这里的设置注入到 OpenCode server。" framed={false}>
        <div className="mb-4 flex items-center justify-between gap-3 rounded-xl border border-[var(--app-border)] bg-[var(--app-panel-2)] px-5 py-3">
          <div className="flex min-w-0 items-center gap-2.5">
            <span
              className={cn(
                "h-2 w-2 shrink-0 rounded-full",
                browserReady ? "bg-[var(--app-success)]" : "bg-[var(--app-subtle)]",
              )}
            />
            <span
              className={cn(
                "text-[13px] font-medium",
                browserReady ? "text-[var(--app-success)]" : "text-[var(--app-text)]",
              )}
            >
              {readiness}
            </span>
            <span className="hidden text-[12px] text-[var(--app-muted)] sm:inline">
              · 浏览器工具{browserReady ? "可用" : "尚未就绪"}
            </span>
          </div>
          <button
            type="button"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-[var(--app-muted)] transition-colors hover:bg-[var(--app-hover)] hover:text-[var(--app-text)]"
            title="刷新浏览器诊断"
            onClick={refresh}
          >
            <RefreshCwIcon className={cn("h-4 w-4", (statusQuery.isFetching || playwrightQuery.isFetching) && "animate-spin")} />
          </button>
        </div>

        <div className="overflow-hidden rounded-xl border border-[var(--app-border)] bg-[var(--app-panel-2)]">
          <div className="divide-y divide-[var(--app-divider)]">
            <SettingRow
              icon={Globe2Icon}
              title="启用浏览器"
              description="允许任务使用浏览器 MCP 工具打开、读取和操作页面。关闭后会从工具列表中禁用浏览器类 MCP。"
              control={<Switch checked={settings.browserUse} onChange={updateBrowserUse} />}
            />
            <SettingRow
              icon={MonitorIcon}
              title="无头模式"
              description="对默认 Playwright MCP 添加 --headless；关闭后会显示可见浏览器窗口。"
              control={<Switch checked={settings.browserHeadless} disabled={!settings.browserUse} onChange={updateBrowserHeadless} />}
            />
          </div>
        </div>
      </SettingsSection>

      {/* 浏览器 MCP */}
      <SettingsSection title="浏览器 MCP" description="对接 Playwright MCP 的状态与控制。" framed={false}>
        <div className="grid gap-3 md:grid-cols-3">
          <BrowserStatItem
            icon={Globe2Icon}
            label="浏览器 MCP"
            value={enabledBrowserRows.length > 0 ? `${enabledBrowserRows.length} 个已启用` : "未配置"}
            ok={enabledBrowserRows.length > 0}
          />
          <BrowserStatItem
            icon={MonitorIcon}
            label="Playwright Chromium"
            value={hasChromium ? "已安装" : "未安装"}
            ok={hasChromium}
          />
          <BrowserStatItem
            icon={PlugIcon}
            label="OpenCode 连接"
            value={
              serverReady
                ? connectedBrowserCount > 0
                  ? `${connectedBrowserCount} 个已连接`
                  : "等待应用"
                : "未连接 server"
            }
            ok={!settings.browserUse || !serverReady || connectedBrowserCount > 0}
          />
        </div>

        {browserRows.length > 0 ? (
          <div className="mt-3 overflow-hidden rounded-xl border border-[var(--app-border)] bg-[var(--app-panel-2)]">
            <div className="divide-y divide-[var(--app-divider)]">
              {browserRows.map((row) => (
                <BrowserMcpRowView key={row.id} row={row} status={statusQuery.data?.[row.name]} />
              ))}
            </div>
          </div>
        ) : (
          <div className="mt-3 rounded-xl border border-dashed border-[var(--app-border)] bg-[var(--app-panel-2)] px-6 py-10 text-center">
            <Globe2Icon className="mx-auto mb-3 h-6 w-6 text-[var(--app-muted)]" />
            <div className="text-[15px] font-semibold text-[var(--app-text)]">未找到浏览器 MCP</div>
            <div className="mx-auto mt-2 max-w-[480px] text-[13px] leading-6 text-[var(--app-muted)]">
              没有名称或命令包含 playwright、browser、chromium、chrome、puppeteer 的 MCP 服务。
            </div>
          </div>
        )}

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button
            type="button"
            className="flex h-8 items-center gap-1.5 rounded-md bg-[var(--app-text)] px-3 text-[12px] font-medium text-[var(--app-bg)] hover:opacity-90 disabled:opacity-50"
            onClick={() => void addOrConnectBrowser()}
            disabled={connectBrowser.isPending}
          >
            {connectBrowser.isPending ? <Loader2Icon className="h-3.5 w-3.5 animate-spin" /> : <PlusIcon className="h-3.5 w-3.5" />}
            {browserRows.length ? "应用浏览器 MCP" : "添加 Playwright MCP"}
          </button>
          <button
            type="button"
            className="flex h-8 items-center gap-1.5 rounded-md border border-[var(--app-border)] bg-[var(--app-panel)] px-3 text-[12px] font-medium text-[var(--app-text)] transition-colors hover:bg-[var(--app-hover)]"
            onClick={copyInstallCommand}
          >
            <CopyIcon className="h-3.5 w-3.5" />
            {copiedInstall ? "已复制" : "复制 Chromium 安装命令"}
          </button>
        </div>

        {browserError ? (
          <div className="mt-3 rounded-md border border-[color-mix(in_srgb,var(--app-danger)_45%,transparent)] bg-[var(--app-danger-soft)] px-3 py-2 text-[12px] leading-5 text-[var(--app-danger)]">
            {browserError}
          </div>
        ) : null}
      </SettingsSection>

      {/* Playwright 浏览器（本地缓存） */}
      <SettingsSection title="Playwright 浏览器" description="检测本地已安装的 Playwright 浏览器内核。" framed={false}>
        <div className="rounded-xl border border-[var(--app-border)] bg-[var(--app-panel-2)] px-5 py-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <div className="text-[13px] font-semibold text-[var(--app-text)]">浏览器缓存目录</div>
              <div className="mt-1 break-all text-[12px] leading-5 text-[var(--app-muted)] [font-family:var(--app-code-font)]">
                {playwrightQuery.data?.rootPath || (playwrightQuery.isFetching ? "检测中..." : "未检测到")}
              </div>
              {playwrightQuery.data?.envOverride ? (
                <div className="mt-1 text-[11px] font-medium text-[var(--app-warning)]">
                  路径来自 PLAYWRIGHT_BROWSERS_PATH
                </div>
              ) : null}
            </div>
            <button
              type="button"
              className="flex h-8 shrink-0 items-center gap-1.5 rounded-md border border-[var(--app-border)] bg-[var(--app-panel)] px-3 text-[12px] font-medium text-[var(--app-text)] transition-colors hover:bg-[var(--app-hover)] disabled:opacity-50"
              disabled={!playwrightQuery.data?.rootExists}
              onClick={() => {
                const path = playwrightQuery.data?.rootPath
                if (path) void openPath(path, { target: "system" }).catch((error) => setBrowserError(String(error)))
              }}
            >
              <ExternalLinkIcon className="h-3.5 w-3.5" />
              打开
            </button>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <BrowserChip label="Chromium" ok={playwrightQuery.data?.chromium} />
            <BrowserChip label="Firefox" ok={playwrightQuery.data?.firefox} />
            <BrowserChip label="WebKit" ok={playwrightQuery.data?.webkit} />
          </div>
          {playwrightQuery.data && !playwrightQuery.data.rootExists ? (
            <div className="mt-4 rounded-md border border-[color-mix(in_srgb,var(--app-warning)_45%,transparent)] bg-[color-mix(in_srgb,var(--app-warning)_10%,transparent)] px-3 py-2 text-[12px] leading-5 text-[var(--app-text)]">
              尚未安装 Playwright 浏览器。在终端运行{" "}
              <code className="rounded bg-[var(--app-code-bg)] px-1.5 py-0.5 [font-family:var(--app-code-font)] text-[11.5px] text-[var(--app-text)]">
                {PLAYWRIGHT_INSTALL_HINT}
              </code>{" "}
              安装 Chromium。
            </div>
          ) : null}
        </div>
      </SettingsSection>
    </div>
  )
}

function BrowserStatItem({
  icon: Icon,
  label,
  value,
  ok,
}: {
  icon: IconComponent
  label: string
  value: string
  ok: boolean
}) {
  return (
    <div className="rounded-xl border border-[var(--app-border)] bg-[var(--app-panel-2)] px-4 py-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2 text-[var(--app-muted)]">
          <Icon className="h-3.5 w-3.5 shrink-0" />
          <span className="truncate text-[11px] font-semibold uppercase tracking-wider">{label}</span>
        </div>
        <span
          className={cn(
            "h-1.5 w-1.5 shrink-0 rounded-full",
            ok ? "bg-[var(--app-success)]" : "bg-[var(--app-subtle)]",
          )}
        />
      </div>
      <div className={cn("mt-1.5 truncate text-[13px] font-medium", ok ? "text-[var(--app-text)]" : "text-[var(--app-muted)]")}>
        {value}
      </div>
    </div>
  )
}

function BrowserMcpRowView({ row, status }: { row: GuiMcpServer; status?: McpStatusInfo }) {
  const summary = row.type === "remote" ? row.url : [row.command, ...parseArgs(row.args)].filter(Boolean).join(" ")
  return (
    <div className="flex items-center gap-3 px-5 py-3">
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-[var(--app-hover)] text-[var(--app-muted)]">
        <Globe2Icon className="h-3.5 w-3.5" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[13px] font-medium text-[var(--app-text)]">{row.name}</span>
          <span className="rounded-full border border-[var(--app-border)] px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider text-[var(--app-muted)]">
            {row.enabled ? "已启用" : "已禁用"}
          </span>
        </div>
        <div className="mt-0.5 truncate text-[11.5px] text-[var(--app-muted)] [font-family:var(--app-code-font)]">
          {summary || "未配置命令"}
        </div>
      </div>
      <div className={cn("flex shrink-0 items-center gap-1.5 text-[11px]", mcpStatusTone(status).text)}>
        <span className={cn("h-1.5 w-1.5 rounded-full", mcpStatusTone(status).dot)} />
        {mcpStatusText(status)}
      </div>
    </div>
  )
}

function BrowserChip({ label, ok }: { label: string; ok?: boolean }) {
  return (
    <span
      className={cn(
        "inline-flex h-7 items-center gap-1.5 rounded-full border px-2.5 text-[12px] font-medium",
        ok
          ? "border-[color-mix(in_srgb,var(--app-success)_40%,transparent)] bg-[color-mix(in_srgb,var(--app-success)_15%,transparent)] text-[var(--app-success)]"
          : "border-[var(--app-border)] bg-transparent text-[var(--app-muted)]",
      )}
    >
      <span
        className={cn(
          "h-1.5 w-1.5 rounded-full",
          ok ? "bg-[var(--app-success)]" : "bg-[var(--app-subtle)]",
        )}
      />
      {label}
    </span>
  )
}

function ComputerSettings({
  settings,
  onChange,
}: {
  settings: GuiSettings
  onChange: (patch: Partial<GuiSettings>) => void
}) {
  return (
    <div className="space-y-8">
      <SettingsSection title="电脑操控">
        <div className="divide-y divide-[var(--app-divider)]">
          <SettingRow
            icon={PanelRightIcon}
            title="启用电脑操控"
            description="允许后续任务请求鼠标、键盘和窗口控制。"
            control={<Switch checked={settings.computerUse} onChange={(value) => onChange({ computerUse: value })} />}
          />
          <div className="py-4 text-sm leading-6 text-[var(--app-muted)]">
            电脑操控属于高权限能力，默认关闭。打开后仍会进入权限审批。
          </div>
        </div>
      </SettingsSection>
    </div>
  )
}

function ArchivedSettings({
  settings,
  server,
  workspaceDirectory,
  onChange,
}: {
  settings: GuiSettings
  server?: ServerStatus
  workspaceDirectory?: string | null
  onChange: (patch: Partial<GuiSettings>) => void
}) {
  const queryClient = useQueryClient()
  const baseUrl = server?.baseUrl ?? settings.serverUrl
  const serverReady = Boolean(server?.healthy && baseUrl)
  const archivedSessionsQueryKey = ["archived-sessions", baseUrl, workspaceDirectory] as const
  const archivedSessions = useQuery({
    queryKey: archivedSessionsQueryKey,
    queryFn: async () => {
      const sessions = await sessionList({
        baseUrl,
        directory: workspaceDirectory ?? undefined,
        limit: 200,
        archived: true,
      })
      return sessions
        .filter((session) => session.archivedAt)
        .sort((left, right) => normalizeTimestamp(right.archivedAt, 0) - normalizeTimestamp(left.archivedAt, 0))
    },
    enabled: serverReady && Boolean(workspaceDirectory),
    staleTime: 10_000,
  })
  const restoreSession = useMutation({
    mutationFn: (session: OpenCodeSession) =>
      sessionUpdateArchived({
        baseUrl,
        directory: session.directory ?? workspaceDirectory ?? undefined,
        sessionId: session.id,
        archived: false,
      }),
    onMutate: async (session) => {
      await queryClient.cancelQueries({ queryKey: archivedSessionsQueryKey })
      const previous = queryClient.getQueryData<OpenCodeSession[]>(archivedSessionsQueryKey)
      queryClient.setQueryData<OpenCodeSession[]>(archivedSessionsQueryKey, (current) =>
        current?.filter((item) => item.id !== session.id) ?? current,
      )
      return { previous }
    },
    onError: (_error, _session, context) => {
      if (context?.previous) queryClient.setQueryData(archivedSessionsQueryKey, context.previous)
    },
    onSuccess: () => {
      void archivedSessions.refetch()
      void queryClient.invalidateQueries({ queryKey: ["sessions"] })
      void queryClient.invalidateQueries({ queryKey: ["archived-sessions"] })
    },
  })
  const restoreError = getErrorMessage(restoreSession.error)

  return (
    <div className="space-y-8">
      <SettingsSection title="已归档对话">
        <div className="divide-y divide-[var(--app-divider)]">
          <SettingRow
            icon={Clock3Icon}
            title="保留时间"
            description="归档对话在本地索引中的保留策略。"
            control={
              <SelectControl
                value={settings.archiveRetention}
                onChange={(value) => onChange({ archiveRetention: value as GuiSettings["archiveRetention"] })}
                options={[
                  { value: "30d", label: "30 天" },
                  { value: "90d", label: "90 天" },
                  { value: "forever", label: "永久" },
                ]}
              />
            }
          />
        </div>
        <div className="mt-4 overflow-hidden rounded-lg border border-[var(--app-border)] bg-[var(--app-panel-2)]">
          {!serverReady ? (
            <div className="px-4 py-8 text-center text-sm font-medium text-[var(--app-muted)]">
              连接 OpenCode server 后显示已归档对话。
            </div>
          ) : !workspaceDirectory ? (
            <div className="px-4 py-8 text-center text-sm font-medium text-[var(--app-muted)]">
              选择项目后显示该项目的已归档对话。
            </div>
          ) : archivedSessions.isLoading ? (
            <div className="flex items-center justify-center gap-2 px-4 py-8 text-sm font-medium text-[var(--app-muted)]">
              <Loader2Icon className="h-4 w-4 animate-spin" />
              正在读取已归档对话
            </div>
          ) : archivedSessions.data?.length ? (
            <div className="divide-y divide-[var(--app-divider)]">
              {archivedSessions.data.map((session) => (
                <div key={session.id} className="flex items-center gap-3 px-4 py-3">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-[var(--app-hover)] text-[var(--app-muted)]">
                    <Clock3Icon className="h-4 w-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-semibold text-[var(--app-text)]">
                      {session.title?.trim() || "未命名线程"}
                    </div>
                    <div className="mt-0.5 truncate text-[12px] text-[var(--app-muted)]">
                      {projectNameFromPath(session.directory ?? workspaceDirectory) ?? "当前项目"} · {formatSettingsDate(session.archivedAt)}
                    </div>
                  </div>
                  <button
                    type="button"
                    className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md border border-[var(--app-border)] px-2.5 text-xs font-semibold text-[var(--app-text)] hover:bg-[var(--app-hover)] disabled:opacity-50"
                    onClick={() => restoreSession.mutate(session)}
                    disabled={restoreSession.isPending && restoreSession.variables?.id === session.id}
                  >
                    {restoreSession.isPending && restoreSession.variables?.id === session.id ? (
                      <Loader2Icon className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <RotateCcwIcon className="h-3.5 w-3.5" />
                    )}
                    {restoreSession.isPending && restoreSession.variables?.id === session.id ? "恢复中" : "恢复"}
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <div className="px-4 py-8 text-center text-sm font-medium text-[var(--app-muted)]">
              暂无已归档对话
            </div>
          )}
        </div>
        {archivedSessions.error ? (
          <div className="mt-3 rounded-md border border-[var(--app-danger-soft)] bg-[var(--app-danger-soft)] px-3 py-2 text-xs text-[var(--app-danger)]">
            读取失败：{getErrorMessage(archivedSessions.error)}
          </div>
        ) : null}
        {restoreError ? (
          <div className="mt-3 rounded-md border border-[var(--app-danger-soft)] bg-[var(--app-danger-soft)] px-3 py-2 text-xs text-[var(--app-danger)]">
            恢复失败：{restoreError}
          </div>
        ) : null}
      </SettingsSection>
    </div>
  )
}

function formatSettingsDate(value?: number | null) {
  const timestamp = normalizeTimestamp(value, 0)
  if (!timestamp) return "归档时间未知"
  return new Intl.DateTimeFormat(undefined, {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(timestamp))
}

function ThemeModeButton({
  icon: Icon,
  label,
  selected,
  onClick,
}: {
  icon: IconComponent
  label: string
  selected: boolean
  onClick: () => void
}) {
  return (
    <button
      className={cn(
        "flex h-[72px] flex-col items-center justify-center rounded-lg border text-sm font-medium transition-colors",
        selected
          ? "border-transparent bg-[var(--app-accent)] text-[var(--app-accent-contrast)]"
          : "border-[var(--app-border)] bg-[var(--app-panel-2)] text-[var(--app-text)] hover:bg-[var(--app-hover)]",
      )}
      onClick={onClick}
    >
      <Icon className="mb-1.5 h-5 w-5" />
      {label}
    </button>
  )
}

function PresetThemeButton({
  label,
  colors,
  selected,
  onClick,
}: {
  label: string
  colors: readonly string[]
  selected: boolean
  onClick: () => void
}) {
  return (
    <button
      className={cn(
        "flex h-[66px] flex-col items-center justify-center rounded-lg border text-sm font-medium transition-colors",
        selected
          ? "border-transparent bg-[var(--app-accent)] text-[var(--app-accent-contrast)]"
          : "border-[var(--app-border)] bg-[var(--app-panel-2)] text-[var(--app-text)] hover:bg-[var(--app-hover)]",
      )}
      onClick={onClick}
    >
      <div className="mb-2 flex items-center gap-1">
        {colors.map((color) => (
          <span key={color} className="h-3 w-3 rounded-full border border-[var(--app-border)]" style={{ backgroundColor: color }} />
        ))}
      </div>
      {label}
    </button>
  )
}

type ThemeEditorPatch = {
  accent?: string
  background?: string
  foreground?: string
  uiFont?: string
  codeFont?: string
  translucentSidebar?: boolean
  contrast?: number
}

function ThemeEditor({
  title,
  accent,
  background,
  foreground,
  uiFont,
  codeFont,
  translucentSidebar,
  contrast,
  onReset,
  onChange,
}: {
  title: string
  accent: string
  background: string
  foreground: string
  uiFont: string
  codeFont: string
  translucentSidebar: boolean
  contrast: number
  onReset: () => void
  onChange: (patch: ThemeEditorPatch) => void
}) {
  return (
    <section className="rounded-lg border border-[var(--app-border)] bg-[var(--app-panel-2)] p-4">
      <div className="mb-5 flex items-center justify-between">
        <h3 className="text-[17px] font-medium text-[var(--app-text)]">{title}</h3>
        <button
          className="flex h-8 items-center gap-2 rounded-md px-2 text-sm font-medium text-[var(--app-muted)] hover:bg-[var(--app-hover)] hover:text-[var(--app-text)]"
          onClick={onReset}
        >
          <RotateCcwIcon className="h-4 w-4" />
          重置此主题
        </button>
      </div>
      <div className="space-y-3">
        <ThemeColorRow label="强调色" value={accent} onChange={(value) => onChange({ accent: value })} />
        <ThemeColorRow label="背景" value={background} onChange={(value) => onChange({ background: value })} />
        <ThemeColorRow label="前景" value={foreground} onChange={(value) => onChange({ foreground: value })} />
        <ThemeTextRow icon={TypeIcon} label="UI 字体" value={uiFont} onChange={(value) => onChange({ uiFont: value })} />
        <ThemeTextRow
          icon={TerminalSquareIcon}
          label="代码字体"
          value={codeFont}
          onChange={(value) => onChange({ codeFont: value })}
        />
        <div className="grid grid-cols-[92px_minmax(0,1fr)_auto] items-center gap-4">
          <span className="text-sm font-medium text-[var(--app-text)]">半透明侧栏</span>
          <div />
          <Switch checked={translucentSidebar} onChange={(value) => onChange({ translucentSidebar: value })} />
        </div>
        <div className="grid grid-cols-[92px_minmax(0,1fr)_44px] items-center gap-4">
          <span className="text-sm font-medium text-[var(--app-text)]">对比度</span>
          <input
            type="range"
            min={0}
            max={100}
            value={contrast}
            onChange={(event) => onChange({ contrast: Number(event.target.value) })}
            className="h-2 accent-[var(--app-accent)]"
          />
          <span className="text-right text-sm font-medium text-[var(--app-muted)]">{contrast}</span>
        </div>
      </div>
    </section>
  )
}

function ThemeColorRow({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <div className="grid grid-cols-[92px_44px_minmax(0,1fr)] items-center gap-3">
      <span className="text-sm font-medium text-[var(--app-text)]">{label}</span>
      <input
        type="color"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-9 w-9 rounded-md border border-[var(--app-border)] bg-[var(--app-input)] p-1"
      />
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-9 min-w-0 rounded-md border border-[var(--app-border)] bg-[var(--app-input)] px-3 text-sm font-medium text-[var(--app-text)] outline-none focus:border-[var(--app-accent)]"
        style={{ fontFamily: "var(--app-code-font)" }}
      />
    </div>
  )
}

function ThemeTextRow({
  icon: Icon,
  label,
  value,
  onChange,
}: {
  icon: IconComponent
  label: string
  value: string
  onChange: (value: string) => void
}) {
  return (
    <div className="grid grid-cols-[92px_minmax(0,1fr)] items-center gap-4">
      <span className="text-sm font-medium text-[var(--app-text)]">{label}</span>
      <div className="flex h-9 min-w-0 items-center gap-2 rounded-md border border-[var(--app-border)] bg-[var(--app-input)] px-3">
        <Icon className="h-4 w-4 shrink-0 text-[var(--app-muted)]" />
        <input
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className="min-w-0 flex-1 bg-transparent text-sm font-medium text-[var(--app-text)] outline-none"
          style={{ fontFamily: "var(--app-code-font)" }}
        />
      </div>
    </div>
  )
}

function SettingsSection({
  title,
  description,
  framed = true,
  children,
}: {
  title: string
  description?: string
  framed?: boolean
  children: ReactNode
}) {
  return (
    <section>
      <div className="mb-4">
        <h2 className="text-[15px] font-semibold tracking-tight text-[var(--app-text)]">{title}</h2>
        {description ? <p className="mt-1.5 text-[13px] leading-5 text-[var(--app-muted)]">{description}</p> : null}
      </div>
      {framed ? (
        // No overflow-hidden here: popovers like SelectControl render
        // outside the row and would otherwise be clipped at the rounded
        // corners. Inner rows already have horizontal padding, so the
        // divide-y lines never reach the rounded edge.
        <div className="rounded-xl border border-[var(--app-border)] bg-[var(--app-panel-2)]">{children}</div>
      ) : (
        children
      )}
    </section>
  )
}

function SettingRow({
  icon: Icon,
  title,
  description,
  control,
}: {
  icon: IconComponent
  title: string
  description: ReactNode
  control: ReactNode
}) {
  return (
    <div className="flex items-start gap-4 px-5 py-4">
      <Icon className="mt-0.5 h-[18px] w-[18px] shrink-0 text-[var(--app-muted)]" />
      <div className="min-w-0 flex-1">
        <div className="text-[14px] font-medium text-[var(--app-text)]">{title}</div>
        <div className="mt-1 max-w-[620px] text-[13px] leading-6 text-[var(--app-muted)]">{description}</div>
      </div>
      <div className="shrink-0 self-center">{control}</div>
    </div>
  )
}

function ModeOption({
  icon: Icon,
  title,
  description,
  selected,
  onClick,
}: {
  icon: IconComponent
  title: string
  description: string
  selected: boolean
  onClick: () => void
}) {
  return (
    <button
      className={cn(
        "rounded-xl border px-4 py-3.5 text-left transition-colors",
        selected
          ? "border-[var(--app-accent)] bg-[var(--app-accent-soft)]"
          : "border-[var(--app-border)] bg-transparent hover:bg-[var(--app-hover)]",
      )}
      onClick={onClick}
    >
      <div className="flex items-center gap-3">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center text-[var(--app-text)]">
          <Icon className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-[13px] font-medium text-[var(--app-text)]">{title}</div>
          <div className="mt-0.5 text-[12px] leading-5 text-[var(--app-muted)]">{description}</div>
        </div>
        <span
          className={cn(
            "flex h-4 w-4 shrink-0 items-center justify-center rounded-full border",
            selected ? "border-[var(--app-accent)] bg-[var(--app-accent)]" : "border-[var(--app-border)]",
          )}
        >
          {selected ? <span className="h-1.5 w-1.5 rounded-full bg-white" /> : null}
        </span>
      </div>
    </button>
  )
}

function Switch({
  checked,
  disabled,
  onChange,
}: {
  checked: boolean
  disabled?: boolean
  onChange: (value: boolean) => void
}) {
  return (
    <button
      type="button"
      className={cn(
        "relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--app-accent)]",
        checked ? "bg-[var(--app-accent)]" : "bg-[var(--app-hover-strong)]",
        disabled && "cursor-not-allowed opacity-50",
      )}
      role="switch"
      aria-checked={checked}
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

function SelectControl({
  value,
  options,
  onChange,
  className,
}: {
  value: string
  options: Array<{ value: string; label: string }>
  onChange: (value: string) => void
  className?: string
}) {
  const [open, setOpen] = useState(false)
  const selected = options.find((option) => option.value === value) ?? options[0]

  return (
    <div
      className={cn("relative min-w-[210px]", className)}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
          setOpen(false)
        }
      }}
    >
      <button
        type="button"
        className={cn(
          "flex h-9 w-full items-center justify-between gap-3 rounded-md border border-[var(--app-border)] bg-[var(--app-input)] px-3 text-left text-[13px] font-medium text-[var(--app-text)] outline-none transition-colors focus-visible:border-[var(--app-accent)]",
          open ? "border-[var(--app-accent)]" : "hover:bg-[var(--app-hover)]",
        )}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <span className="min-w-0 flex-1 truncate">{selected?.label ?? value}</span>
        <ChevronDownIcon className={cn("h-4 w-4 shrink-0 text-[var(--app-muted)] transition-transform", open && "rotate-180")} />
      </button>

      {open ? (
        <div
          className="absolute right-0 top-[44px] z-40 w-full overflow-hidden rounded-xl border border-[var(--app-border)] bg-[var(--app-panel)] p-1 shadow-xl shadow-black/30 ring-1 ring-black/5"
          role="listbox"
        >
          {options.map((option) => {
            const active = option.value === value
            return (
              <button
                key={option.value}
                type="button"
                className={cn(
                  "flex h-9 w-full items-center rounded-md px-3 text-left text-sm font-medium transition-colors",
                  active
                    ? "bg-[var(--app-selected)] text-[var(--app-text)]"
                    : "text-[var(--app-muted)] hover:bg-[var(--app-hover)] hover:text-[var(--app-text)]",
                )}
                role="option"
                aria-selected={active}
                onClick={() => {
                  onChange(option.value)
                  setOpen(false)
                }}
              >
                <span className="min-w-0 flex-1 truncate">{option.label}</span>
              </button>
            )
          })}
        </div>
      ) : null}
    </div>
  )
}

function NumberStepper({
  value,
  min,
  max,
  suffix,
  onChange,
}: {
  value: number
  min: number
  max: number
  suffix: string
  onChange: (value: number) => void
}) {
  function setNext(next: number) {
    onChange(Math.min(max, Math.max(min, next)))
  }

  return (
    <div className="flex h-9 items-center overflow-hidden rounded-md border border-[var(--app-border)] bg-[var(--app-input)]">
      <button
        className="flex h-full w-9 items-center justify-center text-[var(--app-muted)] hover:bg-[var(--app-hover)] hover:text-[var(--app-text)]"
        onClick={() => setNext(value - 1)}
      >
        -
      </button>
      <div className="min-w-[62px] px-3 text-center text-sm font-medium text-[var(--app-text)]">
        {value}
        {suffix}
      </div>
      <button
        className="flex h-full w-9 items-center justify-center text-[var(--app-muted)] hover:bg-[var(--app-hover)] hover:text-[var(--app-text)]"
        onClick={() => setNext(value + 1)}
      >
        +
      </button>
    </div>
  )
}
