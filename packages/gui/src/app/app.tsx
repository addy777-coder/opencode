import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentType,
  type CSSProperties,
  type MouseEvent as ReactMouseEvent,
  type SVGProps,
} from "react"
import { useMutation, useQueries, useQuery, useQueryClient } from "@tanstack/react-query"
import {
  Archive,
  Blocks,
  Box,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Copy,
  Download,
  Edit3,
  ExternalLink,
  FileText,
  Folder,
  FolderOpen,
  GitBranch,
  Hash,
  Loader2,
  Mail,
  MailOpen,
  Maximize2,
  Minus,
  PanelLeftClose,
  PanelLeftOpen,
  Pin,
  Plus,
  Search,
  Settings,
  SlidersHorizontal,
  Trash2,
  X,
} from "lucide-react"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  buildOpenCodePermissionRules,
  buildNetworkProxyConfig,
  buildPersonalizationSystemPrompt,
  browserMcpServerForRuntime,
  canApplyMcpServer,
  DEFAULT_GUI_SETTINGS,
  getAvailablePermissionModes,
  getProjectPermissionMode,
  getPermissionModeLabel,
  GUI_SETTINGS_KEY,
  mcpServerConfig,
  normalizeGuiSettings,
  networkProxySettingsSignature,
  permissionWorkspaceKey,
  removeGuiSessionRecord,
  setProjectPermissionMode,
  shouldAutoApprovePermission,
  SettingsWorkspace,
  upsertGuiSessionRecord,
  type GuiSettings,
  type GuiSessionRecordInput,
  type PermissionMode,
} from "@/features/settings/settings-workspace"
import {
  canApplyThirdPartyProvider,
  thirdPartyProviderRuntimeConfig,
  thirdPartyProviderSignature,
  type GuiThirdPartyProvider,
} from "@/features/settings/third-party-api"
import {
  applyModelPreferences,
  modelKeyFromRef,
  toggleModelFavoriteKey,
  toggleModelHiddenKey,
} from "@/features/provider/model-preferences"
import { chooseSelectableModel, selectedModelExists } from "@/features/provider/model-selection"
import { buildGuiDeepLink, parseGuiDeepLink, type GuiDeepLinkTarget } from "@/features/deeplink/deep-link"
import { SkillsWorkspace } from "@/features/skills/skills-workspace"
import { ThreadWorkspace, type PromptAttachment, type ThreadSummary } from "@/features/thread/thread-workspace"
import { prefetchWorkspaceBootstrap } from "@/features/sync/bootstrap"
import {
  applyOpenCodeEventToQueryCache,
  invalidateSessionDiff,
  invalidateSessionMessages,
  invalidateArchivedSessions,
  invalidateSessions,
  upsertSessionInQueryCache,
} from "@/features/sync/query-cache"
import { prefetchSessionMessages } from "@/features/sync/prefetch"
import {
  getOpenCodeEventSessionId as syncGetOpenCodeEventSessionId,
  getOpenCodeEventType as syncGetOpenCodeEventType,
  getOpenCodePartDelta as syncGetOpenCodePartDelta,
  getOpenCodePartUpdated as syncGetOpenCodePartUpdated,
  getOpenCodeSessionStatusType as syncGetOpenCodeSessionStatusType,
} from "@/features/sync/opencode-event"
import { syncQueryKeys } from "@/features/sync/query-keys"
import { filterVisibleSidebarSessions } from "@/features/sync/session-visibility"
import {
  appInit,
  commandList,
  executionOptions,
  fileSearch,
  gitStatus,
  guiUpdateCheck,
  guiUpdateInstall,
  mcpAdd,
  mcpStatus,
  openPath,
  openUrl,
  permissionList,
  permissionReply,
  questionList,
  questionReply,
  questionReject,
  serverStart,
  serverStatus,
  serverStop,
  sessionAbort,
  sessionCreate,
  sessionDelete,
  sessionDiff,
  sessionFork,
  sessionMessageDelete,
  sessionList,
  sessionMessages,
  sessionPrompt,
  sessionStatus,
  sessionUpdateArchived,
  sessionUpdatePermission,
  sessionUpdateTitle,
  settingsGet,
  settingsSet,
  symbolSearch,
  thirdPartyProviderApply,
  thirdPartyProviderAuthStatus,
  textSearch,
  subscribeOpenCodeEvent,
  subscribeThreadActivity,
  threadActivityRecent,
  windowClose,
  windowMinimize,
  windowStartDragging,
  windowToggleMaximize,
  workspaceList,
  workspaceOpen,
  workspacePick,
  workspaceRemove,
  type OpenCodeModel,
  type OpenCodeMessage,
  type OpenCodeSession,
  type PermissionInfo,
  type QuestionInfo,
  type GitStatus,
  type GuiUpdateCheckResult,
  type OpenCodeSymbol,
  type TextSearchMatch,
  type ThreadActivityItem,
  type WorkspaceRecord,
} from "@/lib/tauri"
import { useOutsideClick } from "@/lib/use-outside-click"
import { cn } from "@/lib/utils"
import { GUI_UPDATE_RELEASE_URL, shouldSuppressDeferredUpdatePrompt } from "@/features/settings/update-settings"

type IconComponent = ComponentType<SVGProps<SVGSVGElement>>

const BlocksIcon = Blocks as IconComponent
const BoxIcon = Box as IconComponent
const ArchiveIcon = Archive as IconComponent
const CheckIcon = Check as IconComponent
const ChevronLeftIcon = ChevronLeft as IconComponent
const ChevronRightIcon = ChevronRight as IconComponent
const Clock3Icon = Clock3 as IconComponent
const CopyIcon = Copy as IconComponent
const DownloadIcon = Download as IconComponent
const Edit3Icon = Edit3 as IconComponent
const ExternalLinkIcon = ExternalLink as IconComponent
const FileTextIcon = FileText as IconComponent
const FolderIcon = Folder as IconComponent
const FolderOpenIcon = FolderOpen as IconComponent
const GitBranchIcon = GitBranch as IconComponent
const HashIcon = Hash as IconComponent
const Loader2Icon = Loader2 as IconComponent
const MailIcon = Mail as IconComponent
const MailOpenIcon = MailOpen as IconComponent
const Maximize2Icon = Maximize2 as IconComponent
const MinusIcon = Minus as IconComponent
const PanelLeftCloseIcon = PanelLeftClose as IconComponent
const PanelLeftOpenIcon = PanelLeftOpen as IconComponent
const PinIcon = Pin as IconComponent
const PlusIcon = Plus as IconComponent
const SearchIcon = Search as IconComponent
const SettingsIcon = Settings as IconComponent
const SlidersHorizontalIcon = SlidersHorizontal as IconComponent
const Trash2Icon = Trash2 as IconComponent
const XIcon = X as IconComponent

type UtilitySearchMode = "all" | "files" | "content" | "symbols"

const UTILITY_SEARCH_MODES: Array<{ id: UtilitySearchMode; label: string; icon: IconComponent }> = [
  { id: "all", label: "全部", icon: SearchIcon },
  { id: "files", label: "文件", icon: FolderIcon },
  { id: "content", label: "内容", icon: FileTextIcon },
  { id: "symbols", label: "符号", icon: HashIcon },
]

const DEFAULT_SERVER_URL = "http://127.0.0.1:4096"
const CURRENT_WORKSPACE_KEY = "currentWorkspace"
const SESSION_UI_STATE_KEY = "sessionUiState"
const LOCAL_THREAD_ID = "local-ready"

type SessionUiFlags = {
  pinned?: boolean
  archived?: boolean
  unread?: boolean
}

type SessionUiState = Record<string, SessionUiFlags>

type SidebarThread = {
  id?: string
  title: string
  meta?: string
  changed?: number
  running?: boolean
  directory?: string | null
  pinned?: boolean
  archived?: boolean
  unread?: boolean
}

type RenameThreadDraft = {
  project: WorkspaceRecord
  thread: SidebarThread
  value: string
}

type SelectedModel = {
  providerId: string
  modelId: string
}

function modelStatusFromGuiProvider(provider: GuiThirdPartyProvider) {
  if (!provider.enabled) return "disabled"
  if (!provider.authStored) return "needs_auth"
  return "active"
}

function modelsFromGuiProviders(providers: GuiThirdPartyProvider[]): OpenCodeModel[] {
  return providers.flatMap((provider) =>
    provider.models.map((model): OpenCodeModel => ({
      id: model,
      name: model,
      providerId: provider.id,
      providerName: provider.name,
      status: modelStatusFromGuiProvider(provider),
      family: null,
      context: provider.contextLimit ?? null,
      input: provider.contextLimit ?? null,
      output: provider.outputLimit ?? null,
      supportsReasoning: provider.supportsReasoning,
      supportsAttachment: provider.supportsAttachment,
      raw: { source: "gui-settings", provider },
    })),
  )
}

type ConnectServerInput = {
  baseUrl?: string
  mode?: GuiSettings["serverMode"]
}

type PrimaryNavItem = {
  id: "new" | "search" | "skills" | "plugins" | "automation"
  label: string
  icon: IconComponent
  shortcut?: string
  disabled?: boolean
}

const primaryNav = [
  { id: "new", label: "新对话", icon: Edit3Icon, shortcut: "Ctrl+N" },
  { id: "search", label: "搜索", icon: SearchIcon },
  { id: "skills", label: "技能", icon: BoxIcon },
  { id: "plugins", label: "插件", icon: BlocksIcon, disabled: true },
  { id: "automation", label: "自动化", icon: Clock3Icon },
] satisfies PrimaryNavItem[]

type PrimaryNavId = (typeof primaryNav)[number]["id"]
type UtilityPanel = Exclude<PrimaryNavId, "new">
type AppView = "workbench" | "settings"
type AppMenu = "file" | "edit" | "view" | "window" | "help"
type ProjectSortMode = "recent" | "name"

const appMenus: Array<{ id: AppMenu; label: string }> = [
  { id: "file", label: "文件" },
  { id: "edit", label: "编辑" },
  { id: "view", label: "查看" },
  { id: "window", label: "窗口" },
  { id: "help", label: "帮助" },
]

function getPathName(path?: string | null) {
  if (!path) return "未选择项目"
  return path.split(/[\\/]/).filter(Boolean).at(-1) ?? path
}

function isOpenCodeDefaultTitle(title: string) {
  return /^(New session - |Child session - )\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(title)
}

const TITLE_MAX_LENGTH = 18

function stripTitleDecorations(value?: string | null) {
  const firstLine = value
    ?.replace(/<think>[\s\S]*?<\/think>/g, "")
    .split("\n")
    .map((line) => line.trim())
    .find(Boolean)
  if (!firstLine) return ""

  let title = firstLine
    .replace(/^(?:[-*#\s]*)(?:title|name|标题|名称|会话标题|对话标题)\s*[:：-]\s*/i, "")
    .replace(/\s+/g, " ")
    .trim()

  for (const [start, end] of [
    ["“", "”"],
    ["‘", "’"],
    ['"', '"'],
    ["'", "'"],
    ["`", "`"],
  ] as const) {
    if (title.startsWith(start) && title.endsWith(end) && title.length > start.length + end.length) {
      title = title.slice(start.length, title.length - end.length).trim()
      break
    }
  }

  return title.replace(/[\s"'“”‘’`*。.!！?？,，;；:：-]+$/g, "").trim()
}

function compactTitleText(value?: string | null) {
  return stripTitleDecorations(value)
    .toLowerCase()
    .replace(/[\s"'“”‘’`*。.!！?？,，;；:：\-_/\\()[\]{}<>]+/g, "")
}

function isGreetingTitle(value?: string | null) {
  return /^(你好|您好|嗨|哈喽|哈啰|hello|hi|hey|在吗|早上好|上午好|中午好|下午好|晚上好)$/.test(
    compactTitleText(value),
  )
}

function SessionRow({
  thread,
  projectPath,
  selected,
  deleteBusy,
  forkBusy,
  archiveBusy,
  onSelect,
  onRename,
  onStateChange,
  onArchive,
  onForkLocal,
  onDelete,
}: {
  thread: SidebarThread
  projectPath?: string | null
  selected?: boolean
  deleteBusy?: boolean
  forkBusy?: boolean
  archiveBusy?: boolean
  onSelect?: () => void
  onRename?: (thread: SidebarThread) => void
  onStateChange?: (thread: SidebarThread, patch: SessionUiFlags) => void
  onArchive?: (thread: SidebarThread) => void
  onForkLocal?: (thread: SidebarThread) => void
  onDelete?: (thread: SidebarThread) => void
}) {
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null)
  const threadId = thread.id
  const directory = thread.directory ?? projectPath
  const canUseSession = Boolean(threadId)
  const deepLink = buildSessionDeepLink(thread, directory)

  useEffect(() => {
    if (!contextMenu) return
    const close = () => setContextMenu(null)
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") close()
    }
    window.addEventListener("click", close)
    window.addEventListener("resize", close)
    window.addEventListener("scroll", close, true)
    window.addEventListener("keydown", closeOnEscape)
    return () => {
      window.removeEventListener("click", close)
      window.removeEventListener("resize", close)
      window.removeEventListener("scroll", close, true)
      window.removeEventListener("keydown", closeOnEscape)
    }
  }, [contextMenu])

  function openContextMenu(event: ReactMouseEvent<HTMLDivElement>) {
    event.preventDefault()
    event.stopPropagation()
    setContextMenu({ x: event.clientX, y: event.clientY })
  }

  function runContextAction(action?: () => void) {
    setContextMenu(null)
    action?.()
  }

  function copyText(value?: string | null) {
    if (!value) return
    void navigator.clipboard?.writeText(value)
  }

  function openDirectory() {
    if (!directory) return
    void openPath(directory, { target: "system" }).catch((error) => {
      window.alert(`打开失败：${getErrorMessage(error)}`)
    })
  }

  const menuLeft =
    contextMenu && typeof window !== "undefined"
      ? Math.max(8, Math.min(contextMenu.x, window.innerWidth - 244))
      : contextMenu?.x
  const menuTop =
    contextMenu && typeof window !== "undefined"
      ? Math.max(8, Math.min(contextMenu.y, window.innerHeight - 396))
      : contextMenu?.y

  return (
    <div
      className={cn(
        "group group/session relative flex h-8 w-full items-center gap-2 rounded-[var(--app-radius-sm)] px-2.5 text-left text-[13px] font-medium transition-[background-color,color] duration-150",
        selected
          ? "bg-[var(--app-selected)] text-[var(--app-text)]"
          : "text-[var(--app-muted)] hover:bg-[var(--app-hover)] hover:text-[var(--app-text)]",
        thread.running && !selected && "bg-[var(--app-hover)] text-[var(--app-text)]",
      )}
      onContextMenu={openContextMenu}
    >
      {thread.running ? (
        <span className="absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-r-full bg-[var(--app-accent)] shadow-[0_0_8px_color-mix(in_srgb,var(--app-accent)_55%,transparent)]" />
      ) : selected ? (
        <span className="absolute left-0 top-1/2 h-4 w-[2px] -translate-y-1/2 rounded-r-full bg-[var(--app-accent)]" />
      ) : thread.unread ? (
        <span className="absolute left-1 top-1/2 h-1.5 w-1.5 -translate-y-1/2 rounded-full bg-[var(--app-accent)]" />
      ) : null}
      <button
        type="button"
        className={cn("flex min-w-0 flex-1 items-center gap-2 text-left", onDelete && threadId && "pr-7")}
        onClick={onSelect}
        disabled={!canUseSession}
        title={thread.title}
      >
        {thread.running ? (
          <Loader2Icon className="h-3.5 w-3.5 shrink-0 animate-spin text-[var(--app-accent)]" />
        ) : thread.pinned ? (
          <PinIcon className="h-3.5 w-3.5 shrink-0 text-[var(--app-accent)]" />
        ) : null}
        <span className={cn("min-w-0 flex-1 truncate", thread.unread && "font-semibold text-[var(--app-text)]")}>
          {thread.title}
        </span>
        {thread.running ? (
          <span className="shrink-0 rounded-full bg-[var(--app-accent-soft)] px-2 py-0.5 text-[10.5px] font-semibold uppercase tracking-[0.06em] text-[var(--app-accent)] transition-opacity group-hover:opacity-0 group-focus-within:opacity-0">
            处理中
          </span>
        ) : thread.archived ? (
          <span className="shrink-0 rounded-full border border-[var(--app-border)] px-1.5 py-0.5 text-[10.5px] uppercase tracking-[0.06em] text-[var(--app-subtle)] transition-opacity group-hover:opacity-0 group-focus-within:opacity-0">
            已归档
          </span>
        ) : thread.meta ? (
          <span className="shrink-0 text-[11px] tabular-nums text-[var(--app-subtle)] transition-opacity group-hover:opacity-0 group-focus-within:opacity-0">
            {thread.meta}
          </span>
        ) : null}
      </button>
      {onDelete && threadId ? (
        <button
          type="button"
          className={cn(
            "pointer-events-none absolute right-1 top-1/2 z-10 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-md text-[var(--app-muted)] opacity-0 transition-opacity hover:bg-[var(--app-danger-soft)] hover:text-[var(--app-danger)] disabled:opacity-50 group-hover:pointer-events-auto group-hover:opacity-100 group-focus-within:pointer-events-auto group-focus-within:opacity-100",
            deleteBusy && "pointer-events-auto opacity-100",
          )}
          title="删除会话"
          onClick={() => onDelete(thread)}
          disabled={deleteBusy}
        >
          {deleteBusy ? <Loader2Icon className="h-3.5 w-3.5 animate-spin" /> : <Trash2Icon className="h-3.5 w-3.5" />}
        </button>
      ) : null}
      {contextMenu ? (
        <div
          className="fixed z-[90] w-56 overflow-hidden rounded-[var(--app-radius-md)] border border-[var(--app-border)] bg-[var(--app-panel)] p-1.5 text-sm shadow-[var(--app-elevation-3)]"
          style={{ left: menuLeft, top: menuTop }}
          data-no-window-drag
          onClick={(event) => event.stopPropagation()}
          onContextMenu={(event) => event.preventDefault()}
        >
          <ProjectContextMenuButton
            icon={PinIcon}
            label={thread.pinned ? "取消置顶" : "置顶对话"}
            disabled={!canUseSession}
            onClick={() => runContextAction(() => onStateChange?.(thread, { pinned: !thread.pinned }))}
          />
          <ProjectContextMenuButton
            icon={Edit3Icon}
            label="重命名对话"
            disabled={!canUseSession || !onRename}
            onClick={() => runContextAction(() => onRename?.(thread))}
          />
          <ProjectContextMenuButton
            icon={ArchiveIcon}
            label={thread.archived ? "取消归档" : "归档对话"}
            disabled={!canUseSession || !onArchive || archiveBusy}
            loading={archiveBusy}
            title="归档状态会同步到 OpenCode 会话"
            onClick={() => runContextAction(() => onArchive?.(thread))}
          />
          <ProjectContextMenuButton
            icon={thread.unread ? MailOpenIcon : MailIcon}
            label={thread.unread ? "标记为已读" : "标记为未读"}
            disabled={!canUseSession}
            onClick={() => runContextAction(() => onStateChange?.(thread, { unread: !thread.unread }))}
          />

          <div className="my-1 h-px bg-[var(--app-divider)]" />
          <ProjectContextMenuButton
            icon={FolderOpenIcon}
            label="在资源管理器中打开"
            disabled={!directory}
            onClick={() => runContextAction(openDirectory)}
          />
          <ProjectContextMenuButton
            icon={CopyIcon}
            label="复制工作目录"
            disabled={!directory}
            onClick={() => runContextAction(() => copyText(directory))}
          />
          <ProjectContextMenuButton
            icon={CopyIcon}
            label="复制会话 ID"
            disabled={!canUseSession}
            onClick={() => runContextAction(() => copyText(threadId))}
          />
          <ProjectContextMenuButton
            icon={ExternalLinkIcon}
            label="复制深度链接"
            disabled={!deepLink}
            title="复制 opencode-gui:// 会话链接"
            onClick={() => runContextAction(() => copyText(deepLink))}
          />

          <div className="my-1 h-px bg-[var(--app-divider)]" />
          <ProjectContextMenuButton
            icon={GitBranchIcon}
            label="派生到本地"
            disabled={!canUseSession || !onForkLocal || forkBusy}
            loading={forkBusy}
            onClick={() => runContextAction(() => onForkLocal?.(thread))}
          />

          {onDelete ? (
            <>
              <div className="my-1 h-px bg-[var(--app-divider)]" />
              <ProjectContextMenuButton
                icon={Trash2Icon}
                label="删除会话"
                danger
                disabled={!canUseSession || deleteBusy}
                loading={deleteBusy}
                onClick={() => runContextAction(() => onDelete(thread))}
              />
            </>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}

function clampSessionTitle(title: string) {
  const normalized = stripTitleDecorations(title)
  if (normalized.length <= TITLE_MAX_LENGTH) return normalized
  return `${normalized.slice(0, TITLE_MAX_LENGTH - 3)}...`
}

function formatSessionTitle(title?: string | null) {
  const normalized = stripTitleDecorations(title)
  if (!normalized || isOpenCodeDefaultTitle(normalized)) return "新对话"
  if (isGreetingTitle(normalized)) return "打招呼"
  if (/^新(会话|对话|任务)$/.test(normalized)) return "新对话"
  if (/^(untitled|new chat|new session)$/i.test(normalized)) return "新对话"
  return normalized
}

function hasAnyText(source: string, keywords: string[]) {
  const lower = source.toLowerCase()
  return keywords.some((keyword) => lower.includes(keyword.toLowerCase()))
}

function inferCodexStyleTitle(text?: string | null) {
  const source = text?.replace(/\s+/g, " ").trim()
  if (!source) return null
  if (isGreetingTitle(source)) return "打招呼"

  const has = (keywords: string[]) => hasAnyText(source, keywords)
  if (has(["会话", "对话", "聊天"]) && has(["命名", "标题", "名称"])) return "调整会话命名"
  if (has(["claudeGui", "claudinal", "参考项目"]) && has(["聊天交互", "完全按照", "迁移"])) return "迁移聊天交互"
  if (has(["浏览器", "browser"]) && has(["迁移", "参考"])) return "迁移浏览器功能"
  if (has(["浏览器", "browser"]) && has(["可用", "使用", "功能", "可以吗", "是否", "对吗"])) return "确认浏览器功能"
  if (has(["模型"]) && has(["选择", "供应商", "provider"])) return "调整模型选择"
  if (has(["聊天"]) && has(["粘贴", "图片", "附件", "上传"])) return "支持聊天附件"
  if (has(["聊天"]) && has(["添加", "新建", "创建", "没法"])) return "修复聊天创建"
  if (has(["计划模式", "交互模式"])) return "调整计划模式"
  if (has(["工作台"]) && has(["删", "去掉", "移除"])) return "移除工作台入口"
  if (has(["项目"]) && has(["导入", "删除", "添加", "移除", "没法"])) return "修复项目管理"
  if (has(["开发服务器", "dev server"]) && has(["关掉", "关闭", "停止"])) return "关闭开发服务器"
  if (has(["待修改计划", "计划.md"])) return "整理修改计划"
  if (has(["没有返回", "没返回", "停止按钮", "运行状态"])) return "排查聊天状态"
  if (has(["回车"]) && has(["发送"])) return "修复回车发送"
  if (has(["删除", "删掉", "去掉", "移除"])) return "移除界面元素"
  if (has(["为什么", "什么东西", "什么意思", "这是什么"])) return "排查界面问题"
  if (has(["可用", "是否", "可以吗", "对吗", "能不能"])) return "确认功能可用性"
  if (has(["修复", "没法", "无法", "不能", "不行"])) return "修复功能问题"
  if (has(["添加", "新增", "支持"])) return "添加功能支持"
  if (has(["修改", "调整", "改成", "优化", "完善"])) return "调整界面功能"

  const firstSentence =
    source
      .split(/[。！？?!.；;]/)
      .map((item) => item.trim())
      .find(Boolean) ?? source
  const compact = firstSentence
    .replace(/[A-Za-z]:\\[^\s，。！？]+/g, "")
    .replace(/https?:\/\/\S+/g, "")
    .replace(/`[^`]*`/g, "")
    .replace(/^(请|麻烦|帮我|你可以|你需要|我建议|把|将|这个|当前|现在|还有|就是|先|然后)+/g, "")
    .replace(/\s+/g, "")
    .trim()

  return compact ? clampSessionTitle(compact) : "整理需求"
}

function firstUserText(messages?: OpenCodeMessage[]) {
  return messages?.find((message) => message.role === "user" && message.text.trim().length > 0)?.text ?? null
}

function shouldApplyInferredTitle(currentTitle: string | undefined, firstText: string, inferred: string) {
  const raw = currentTitle?.trim() ?? ""
  const cleaned = stripTitleDecorations(raw)
  if (!cleaned) return true
  if (cleaned === inferred) return false
  if (isOpenCodeDefaultTitle(raw) || cleaned === "新对话") return true
  if (isGreetingTitle(cleaned)) return true
  if (/^(untitled|new chat|new session)$/i.test(cleaned)) return true
  if (/[?？]/.test(raw)) return true
  if (cleaned.length > TITLE_MAX_LENGTH + 6) return true

  const currentCompact = compactTitleText(cleaned)
  const firstCompact = compactTitleText(firstText)
  if (currentCompact && firstCompact && currentCompact === firstCompact) return true
  return currentCompact.length >= 8 && firstCompact.startsWith(currentCompact)
}

function formatCompactTime(value?: number | null) {
  if (!value) return ""
  const timestamp = value < 10_000_000_000 ? value * 1000 : value
  const diff = Date.now() - timestamp
  if (diff < 60_000) return "刚刚"
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} 分`
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)} 小时`
  if (diff < 604_800_000) return `${Math.floor(diff / 86_400_000)} 天`
  const date = new Date(timestamp)
  return `${date.getMonth() + 1}/${date.getDate()}`
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : error ? String(error) : "操作失败"
}

function compactSessionUiFlags(flags: SessionUiFlags) {
  const next: SessionUiFlags = {}
  if (flags.pinned) next.pinned = true
  if (flags.archived) next.archived = true
  if (flags.unread) next.unread = true
  return next
}

const PROMPT_IDLE_RECONCILE_GRACE_MS = 2_500

function isSessionStatusBusy(status: unknown) {
  const record = asRecord(status)
  const type = typeof record?.type === "string" ? record.type : null
  return Boolean(type && type !== "idle")
}

function sameStringSet(left: Set<string>, right: Set<string>) {
  if (left.size !== right.size) return false
  for (const value of left) {
    if (!right.has(value)) return false
  }
  return true
}

function buildSessionDeepLink(thread: SidebarThread, directory?: string | null) {
  if (!thread.id) return ""
  return buildGuiDeepLink({ type: "session", sessionId: thread.id, directory })
}

function sessionToThread(session: OpenCodeSession, workspaceName: string, workspacePath?: string | null): ThreadSummary {
  return {
    id: session.id,
    title: formatSessionTitle(session.title),
    project: session.projectName ?? getPathName(session.directory) ?? workspaceName,
    directory: session.directory ?? workspacePath ?? null,
    status: "idle",
    changed: session.changedFiles ?? 0,
    local: false,
  }
}

function isConversationActivity(activity: ThreadActivityItem) {
  if (!activity.sessionId) return false
  if (activity.kind === "event") return false
  if (activity.sourceEventType.startsWith("message.")) return false
  return ![
    "session.created",
    "session.updated",
    "session.deleted",
    "session.status",
    "session.idle",
  ].includes(activity.sourceEventType)
}

function isDisplayableActivity(activity: ThreadActivityItem) {
  if (activity.kind === "event") return false
  if (activity.sourceEventType.startsWith("message.")) return false
  return true
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null
}

function stripOpenCodeEventVersion(value: string) {
  const index = value.lastIndexOf(".")
  if (index < 0) return value
  const suffix = value.slice(index + 1)
  return /^\d+$/.test(suffix) ? value.slice(0, index) : value
}

function unwrapOpenCodeEvent(payload: unknown) {
  const record = asRecord(payload)
  const type = typeof record?.type === "string" ? record.type : null
  if (!record || !type) return null

  if (type === "sync") {
    const sync = asRecord(record.syncEvent)
    const syncType = typeof sync?.type === "string" ? stripOpenCodeEventVersion(sync.type) : "sync"
    return {
      type: syncType,
      data: asRecord(sync?.data) ?? sync ?? record,
      payload: record,
    }
  }

  return {
    type,
    data: asRecord(record.properties) ?? record,
    payload: record,
  }
}

function getOpenCodeEventType(payload: unknown) {
  return unwrapOpenCodeEvent(payload)?.type ?? null
}

function getOpenCodeEventSessionId(payload: unknown) {
  const event = unwrapOpenCodeEvent(payload)
  const direct = event?.data ? event.data.sessionID : null
  if (typeof direct === "string") return direct
  const properties = asRecord(event?.payload.properties)
  const fallback = properties?.sessionID
  return typeof fallback === "string" ? fallback : null
}

function getOpenCodeSessionStatusType(payload: unknown) {
  const event = unwrapOpenCodeEvent(payload)
  const status = asRecord(event?.data?.status)
  const type = status?.type
  return typeof type === "string" ? type : null
}

function getOpenCodePartDelta(payload: unknown) {
  const event = unwrapOpenCodeEvent(payload)
  if (event?.type !== "message.part.delta") return null
  const sessionId = event.data?.sessionID
  const messageId = event.data?.messageID
  const partId = event.data?.partID
  const field = event.data?.field
  const delta = event.data?.delta
  if (
    typeof sessionId !== "string" ||
    typeof messageId !== "string" ||
    typeof partId !== "string" ||
    field !== "text" ||
    typeof delta !== "string" ||
    !delta
  ) {
    return null
  }
  return { sessionId, messageId, partId, delta }
}

function getOpenCodePartUpdated(payload: unknown) {
  const event = unwrapOpenCodeEvent(payload)
  if (event?.type !== "message.part.updated") return null
  const part = asRecord(event.data?.part)
  const sessionId = event.data?.sessionID
  const messageId = part?.messageID
  const partId = part?.id
  const text = part?.text
  if (typeof sessionId !== "string" || typeof messageId !== "string" || typeof partId !== "string") return null
  return { sessionId, messageId, partId, text: typeof text === "string" ? text : "" }
}

function streamingPartKey(sessionId: string, messageId: string, partId: string) {
  return `${sessionId}/${messageId}/${partId}`
}

function resolvedThemeMode(settings?: Partial<GuiSettings> | null): "light" | "dark" {
  const merged = normalizeGuiSettings({ ...DEFAULT_GUI_SETTINGS, ...(settings ?? {}) })
  const useLight =
    merged.themeMode === "light" ||
    (merged.themeMode === "system" &&
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-color-scheme: light)").matches)
  return useLight ? "light" : "dark"
}

function themeVars(settings?: Partial<GuiSettings> | null): CSSProperties {
  const merged = normalizeGuiSettings({ ...DEFAULT_GUI_SETTINGS, ...(settings ?? {}) })
  const useLight = resolvedThemeMode(settings) === "light"
  const accent = useLight ? merged.lightAccent : merged.darkAccent
  const background = useLight ? merged.lightBackground : merged.darkBackground
  const foreground = useLight ? merged.lightForeground : merged.darkForeground
  // Layered neutrals — every surface gets its own tinted value so the eye can
  // separate sidebar / chrome / panel / input without harsh borders.
  const panel = useLight ? "#f5f4f1" : "#13151a"
  const panel2 = useLight ? "#ecebe7" : "#181a20"
  const chrome = useLight ? "#f1f0ec" : "#0d0e12"
  const input = useLight ? "#ffffff" : "#15171d"
  const border = useLight ? "rgba(20,22,28,0.10)" : "rgba(255,255,255,0.07)"
  const divider = useLight ? "rgba(20,22,28,0.06)" : "rgba(255,255,255,0.045)"
  const muted = useLight ? "rgba(20,22,28,0.60)" : "rgba(244,246,250,0.58)"
  const subtle = useLight ? "rgba(20,22,28,0.42)" : "rgba(244,246,250,0.38)"
  const hover = useLight ? "rgba(20,22,28,0.05)" : "rgba(255,255,255,0.045)"
  const hoverStrong = useLight ? "rgba(20,22,28,0.09)" : "rgba(255,255,255,0.085)"
  // Tinted selection so the eye locks onto the active row.
  const selected = useLight
    ? `color-mix(in srgb, ${accent} 12%, transparent)`
    : `color-mix(in srgb, ${accent} 16%, transparent)`
  const composer = useLight ? "#ffffff" : "#11141a"
  const inspector = useLight ? "#efeeea" : "#0f1116"
  const code = useLight ? "rgba(20,22,28,0.05)" : "rgba(255,255,255,0.035)"
  const dot = useLight ? "rgba(20,22,28,0.20)" : "rgba(244,246,250,0.16)"
  const ringSoft = useLight
    ? `color-mix(in srgb, ${accent} 18%, transparent)`
    : `color-mix(in srgb, ${accent} 28%, transparent)`
  const elevation1 = useLight
    ? "0 1px 0 rgba(20,22,28,0.04) inset, 0 1px 2px rgba(20,22,28,0.05), 0 1px 1px rgba(20,22,28,0.03)"
    : "0 1px 0 rgba(255,255,255,0.04) inset, 0 1px 2px rgba(0,0,0,0.45), 0 4px 16px rgba(0,0,0,0.25)"
  const elevation2 = useLight
    ? "0 2px 4px rgba(20,22,28,0.05), 0 12px 32px rgba(20,22,28,0.10)"
    : "0 1px 0 rgba(255,255,255,0.04) inset, 0 12px 36px rgba(0,0,0,0.45), 0 2px 6px rgba(0,0,0,0.35)"
  const elevation3 = useLight
    ? "0 4px 12px rgba(20,22,28,0.08), 0 24px 60px rgba(20,22,28,0.14)"
    : "0 1px 0 rgba(255,255,255,0.05) inset, 0 28px 64px rgba(0,0,0,0.55), 0 4px 10px rgba(0,0,0,0.45)"
  const uiFont = useLight ? merged.lightUiFont : merged.darkUiFont
  const codeFont = useLight ? merged.lightCodeFont : merged.darkCodeFont
  const fontSize = merged.fontSize

  return {
    "--app-bg": background,
    "--app-panel": panel,
    "--app-panel-2": panel2,
    "--app-chrome": chrome,
    "--app-input": input,
    "--app-border": border,
    "--app-divider": divider,
    "--app-text": foreground,
    "--app-muted": muted,
    "--app-subtle": subtle,
    "--app-hover": hover,
    "--app-hover-strong": hoverStrong,
    "--app-selected": selected,
    "--app-accent": accent,
    "--app-accent-soft": `color-mix(in srgb, ${accent} 14%, transparent)`,
    "--app-accent-hover": `color-mix(in srgb, ${accent} 88%, ${useLight ? "#000" : "#fff"})`,
    "--app-accent-contrast": useLight ? "#ffffff" : "#0a0b0d",
    "--app-ring": ringSoft,
    "--app-composer": composer,
    "--app-inspector": inspector,
    "--app-code-bg": code,
    "--app-dot": dot,
    "--app-success": "#34d399",
    "--app-warning": "#f59e0b",
    "--app-danger": "#ef4444",
    "--app-danger-soft": "rgba(239,68,68,0.12)",
    "--app-elevation-1": elevation1,
    "--app-elevation-2": elevation2,
    "--app-elevation-3": elevation3,
    "--app-radius-sm": "6px",
    "--app-radius-md": "10px",
    "--app-radius-lg": "14px",
    "--app-radius-xl": "20px",
    "--app-ui-font": uiFont,
    "--app-code-font": codeFont,
    "--app-font-size": `${fontSize}px`,
    "--app-prose-font-size": `${fontSize}px`,
    "--app-code-font-size": `${Math.max(12, fontSize - 1)}px`,
    fontFamily: uiFont,
  } as CSSProperties
}

export function App() {
  const queryClient = useQueryClient()
  const [serverUrl, setServerUrl] = useState(DEFAULT_SERVER_URL)
  const [liveActivities, setLiveActivities] = useState<ThreadActivityItem[]>([])
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null)
  const [runningSessionIds, setRunningSessionIds] = useState<Set<string>>(() => new Set())
  const [streamingPartText, setStreamingPartText] = useState<Record<string, string>>({})
  const [activeView, setActiveView] = useState<AppView>("workbench")
  const [previousView, setPreviousView] = useState<AppView | null>(null)
  const [nextView, setNextView] = useState<AppView | null>(null)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [expandedProjectIds, setExpandedProjectIds] = useState<Set<string>>(() => new Set())
  const [previousExpandedProjectIds, setPreviousExpandedProjectIds] = useState<Set<string> | null>(null)
  const [projectSortMode, setProjectSortMode] = useState<ProjectSortMode>("recent")
  const [projectOrganizeOpen, setProjectOrganizeOpen] = useState(false)
  const [utilityPanel, setUtilityPanel] = useState<UtilityPanel | null>(null)
  useEffect(() => {
    if (utilityPanel === "plugins") setUtilityPanel(null)
  }, [utilityPanel])
  const [openMenu, setOpenMenu] = useState<AppMenu | null>(null)
  const [renameThreadDraft, setRenameThreadDraft] = useState<RenameThreadDraft | null>(null)
  const [updatePrompt, setUpdatePrompt] = useState<GuiUpdateCheckResult | null>(null)
  const [manualUpdateResult, setManualUpdateResult] = useState<GuiUpdateCheckResult | null>(null)
  const titleMenuRegionRef = useRef<HTMLDivElement>(null)
  const projectOrganizeRegionRef = useRef<HTMLDivElement>(null)
  useOutsideClick(titleMenuRegionRef, () => setOpenMenu(null), Boolean(openMenu))
  useOutsideClick(projectOrganizeRegionRef, () => setProjectOrganizeOpen(false), projectOrganizeOpen)
  const [selectedAgent, setSelectedAgent] = useState<string | null>(null)
  const [selectedModel, setSelectedModel] = useState<SelectedModel | null>(null)
  const [pendingPromptRefresh, setPendingPromptRefresh] = useState<{ threadId: string; startedAt: number } | null>(null)
  const autoConnectAttempted = useRef(false)
  const mcpApplySignature = useRef<string | null>(null)
  const thirdPartyAuthStatusSignature = useRef<string | null>(null)
  const thirdPartyApplySignature = useRef<string | null>(null)
  const permissionSettingsMigrationRef = useRef<string | null>(null)
  const deepLinkSignatureRef = useRef<string | null>(null)
  const renamedTitleSignature = useRef(new Set<string>())
  const sessionStatusSignature = useRef<string | null>(null)
  const startupUpdateCheckSignature = useRef<string | null>(null)

  function switchView(view: AppView) {
    setOpenMenu(null)
    if (view === activeView) return
    setPreviousView(activeView)
    setNextView(null)
    setActiveView(view)
  }

  function goBack() {
    if (!previousView) return
    setNextView(activeView)
    setActiveView(previousView)
    setPreviousView(null)
    setOpenMenu(null)
  }

  function goForward() {
    if (!nextView) return
    setPreviousView(activeView)
    setActiveView(nextView)
    setNextView(null)
    setOpenMenu(null)
  }

  const init = useQuery({
    queryKey: syncQueryKeys.appInit(),
    queryFn: appInit,
  })
  const status = useQuery({
    queryKey: syncQueryKeys.serverStatus(),
    queryFn: serverStatus,
    refetchInterval: 10_000,
  })
  const currentWorkspace = useQuery({
    queryKey: ["settings", CURRENT_WORKSPACE_KEY],
    queryFn: () => settingsGet<WorkspaceRecord>(CURRENT_WORKSPACE_KEY),
  })
  const guiSettings = useQuery({
    queryKey: ["settings", GUI_SETTINGS_KEY],
    queryFn: () => settingsGet<Partial<GuiSettings>>(GUI_SETTINGS_KEY),
  })
  const sessionUiState = useQuery({
    queryKey: ["settings", SESSION_UI_STATE_KEY],
    queryFn: () => settingsGet<SessionUiState>(SESSION_UI_STATE_KEY),
  })
  const recentWorkspaces = useQuery({
    queryKey: ["workspaces"],
    queryFn: workspaceList,
  })
  const recentActivities = useQuery({
    queryKey: ["thread-activity-recent"],
    queryFn: threadActivityRecent,
  })
  const workspace = currentWorkspace.data ?? null
  const resolvedGuiSettings = useMemo(() => normalizeGuiSettings(guiSettings.data), [guiSettings.data])
  const resolvedSessionUiState = useMemo(() => sessionUiState.data ?? {}, [sessionUiState.data])
  const activePermissionMode = useMemo(
    () => getProjectPermissionMode(resolvedGuiSettings, workspace?.path),
    [resolvedGuiSettings, workspace?.path],
  )
  const permissionOptions = useMemo(() => getAvailablePermissionModes(resolvedGuiSettings), [resolvedGuiSettings])
  const permissionRules = useMemo(
    () => buildOpenCodePermissionRules(resolvedGuiSettings, activePermissionMode),
    [activePermissionMode, resolvedGuiSettings],
  )
  const permissionStatusLabel = useMemo(
    () => getPermissionModeLabel(activePermissionMode, resolvedGuiSettings),
    [activePermissionMode, resolvedGuiSettings],
  )
  const personalizationSystemPrompt = useMemo(
    () => buildPersonalizationSystemPrompt(resolvedGuiSettings),
    [resolvedGuiSettings],
  )
  const networkProxyConfig = useMemo(() => buildNetworkProxyConfig(resolvedGuiSettings), [resolvedGuiSettings])
  const networkProxySignature = useMemo(
    () => networkProxySettingsSignature(resolvedGuiSettings),
    [resolvedGuiSettings],
  )

  const server = status.data ?? init.data?.server
  const workspaceName = workspace?.name ?? getPathName(workspace?.path)
  const connectedBaseUrl = (server?.baseUrl ?? serverUrl.trim()) || DEFAULT_SERVER_URL
  const browserRuntimeServer = useMemo(() => browserMcpServerForRuntime(resolvedGuiSettings), [resolvedGuiSettings])
  const manualUpdateCheck = useMutation({
    mutationFn: () => guiUpdateCheck({ proxy: networkProxyConfig }),
    onSuccess: (result) => {
      setManualUpdateResult(result)
      if (result.available) setUpdatePrompt(result)
    },
  })
  const installGuiUpdate = useMutation({
    mutationFn: () => guiUpdateInstall({ proxy: networkProxyConfig }),
  })

  useEffect(() => {
    if (!init.data || !guiSettings.isFetched || !resolvedGuiSettings.autoUpdateCheck) return
    const signature = [
      init.data.version,
      resolvedGuiSettings.deferredUpdateVersion ?? "",
      resolvedGuiSettings.deferredUpdateAt ?? 0,
      networkProxySignature,
    ].join("\0")
    if (startupUpdateCheckSignature.current === signature) return
    startupUpdateCheckSignature.current = signature

    let disposed = false
    void guiUpdateCheck({ proxy: networkProxyConfig })
      .then((result) => {
        if (disposed || !result.available) return
        if (shouldSuppressDeferredUpdatePrompt(resolvedGuiSettings, result.version)) return
        setUpdatePrompt(result)
      })
      .catch(() => {
        // Startup update checks are opportunistic; manual checks surface errors in settings.
      })

    return () => {
      disposed = true
    }
  }, [
    guiSettings.isFetched,
    init.data,
    networkProxyConfig,
    networkProxySignature,
    resolvedGuiSettings,
  ])

  const sessions = useQuery({
    queryKey: syncQueryKeys.sessions(server?.baseUrl, workspace?.path),
    queryFn: () =>
      sessionList({
        baseUrl: server?.baseUrl ?? undefined,
        directory: workspace?.path ?? undefined,
        limit: 50,
      }),
    enabled: Boolean(server?.healthy && server?.baseUrl && workspace?.path),
  })
  const activeSessions = useMemo(
    () => filterVisibleSidebarSessions(sessions.data),
    [sessions.data],
  )

  const options = useQuery({
    queryKey: syncQueryKeys.executionOptions(server?.baseUrl, workspace?.path),
    queryFn: () =>
      executionOptions({
        baseUrl: server?.baseUrl ?? undefined,
        directory: workspace?.path ?? undefined,
      }),
    enabled: Boolean(server?.healthy && server?.baseUrl),
    staleTime: 30_000,
  })

  const commands = useQuery({
    queryKey: syncQueryKeys.commands(server?.baseUrl, workspace?.path),
    queryFn: () =>
      commandList({
        baseUrl: server?.baseUrl ?? undefined,
        directory: workspace?.path ?? undefined,
      }),
    enabled: Boolean(server?.healthy && server?.baseUrl && workspace?.path),
    staleTime: 30_000,
  })

  const currentGitStatus = useQuery<GitStatus | null>({
    queryKey: ["git-status", server?.baseUrl, workspace?.path, resolvedGuiSettings.gitAutoDetect],
    queryFn: () =>
      workspace?.path
        ? gitStatus({
            baseUrl: server?.baseUrl ?? undefined,
            directory: workspace.path,
          })
        : null,
    enabled: Boolean(resolvedGuiSettings.gitAutoDetect && server?.healthy && server?.baseUrl && workspace?.path),
    refetchInterval: resolvedGuiSettings.gitAutoDetect ? 5_000 : false,
    refetchOnWindowFocus: true,
    retry: false,
    staleTime: 5_000,
  })

  const threads = useMemo<ThreadSummary[]>(() => {
    const sessionThreads = activeSessions.map((session) => sessionToThread(session, workspaceName, workspace?.path))
    const localThread: ThreadSummary = {
      id: LOCAL_THREAD_ID,
      title: "新对话",
      project: workspaceName,
      status: "idle",
      changed: 0,
      local: true,
    }
    const shouldShowLocalThread =
      activeThreadId === LOCAL_THREAD_ID ||
      !workspace?.path ||
      !sessions.data ||
      sessionThreads.length === 0

    return shouldShowLocalThread ? [localThread, ...sessionThreads] : sessionThreads
  }, [activeSessions, activeThreadId, sessions.data, workspace?.path, workspaceName])

  const activeThread = threads.find((thread) => thread.id === activeThreadId) ?? threads[0]
  const activeRealThread = activeThread && !activeThread.local ? activeThread : null
  const activeSession = activeSessions.find((session) => session.id === activeRealThread?.id) ?? null
  const activeSessionDirectory =
    activeSession?.directory ??
    activeRealThread?.directory ??
    workspace?.path ??
    null
  const activeActivities = useMemo(() => {
    if (!activeThread || activeThread.local) return []
    return liveActivities.filter((activity) => activity.sessionId === activeThread.id && isConversationActivity(activity))
  }, [activeThread, liveActivities])

  const pendingPermissions = useQuery({
    queryKey: syncQueryKeys.permissions(server?.baseUrl, activeSessionDirectory),
    queryFn: () =>
      permissionList({
        baseUrl: server?.baseUrl ?? undefined,
        directory: activeSessionDirectory ?? undefined,
      }),
    enabled: Boolean(server?.healthy && server?.baseUrl && activeSessionDirectory),
    refetchInterval: 2_000,
  })

  const pendingQuestions = useQuery({
    queryKey: syncQueryKeys.questions(server?.baseUrl, activeSessionDirectory),
    queryFn: () =>
      questionList({
        baseUrl: server?.baseUrl ?? undefined,
        directory: activeSessionDirectory ?? undefined,
      }),
    enabled: Boolean(server?.healthy && server?.baseUrl && activeSessionDirectory),
    refetchInterval: 2_000,
  })

  const sessionStatuses = useQuery({
    queryKey: syncQueryKeys.sessionStatus(server?.baseUrl, activeSessionDirectory),
    queryFn: () =>
      sessionStatus({
        baseUrl: server?.baseUrl ?? undefined,
        directory: activeSessionDirectory ?? undefined,
      }),
    enabled: Boolean(server?.healthy && server?.baseUrl && activeSessionDirectory),
    refetchInterval: runningSessionIds.size > 0 || pendingPromptRefresh ? 1_000 : 4_000,
  })

  const activePermissions = useMemo(() => {
    if (!activeThread || activeThread.local) return []
    return (pendingPermissions.data ?? []).filter(
      (permission) => !permission.sessionId || permission.sessionId === activeThread.id,
    )
  }, [activeThread, pendingPermissions.data])
  const activeQuestions = useMemo(() => {
    if (!activeThread || activeThread.local) return []
    return (pendingQuestions.data ?? []).filter((question) => question.sessionId === activeThread.id)
  }, [activeThread, pendingQuestions.data])
  const activePromptRefreshing = Boolean(pendingPromptRefresh && activeThread?.id === pendingPromptRefresh.threadId)
  const activeRunning = Boolean(
    activeRealThread && (runningSessionIds.has(activeRealThread.id) || activePromptRefreshing),
  )
  const abortableRunning = Boolean(activeRealThread && activeRunning)
  const selectableAgents = useMemo(
    () => (options.data?.agents ?? []).filter((agent) => !agent.hidden && agent.mode !== "subagent"),
    [options.data?.agents],
  )
  const guiProviderModels = useMemo(
    () => modelsFromGuiProviders(resolvedGuiSettings.thirdPartyProviders),
    [resolvedGuiSettings.thirdPartyProviders],
  )
  const activeModels = useMemo(
    () => guiProviderModels.filter((model) => model.status !== "deprecated"),
    [guiProviderModels],
  )
  const selectableModels = useMemo(
    () =>
      applyModelPreferences(activeModels, {
        favoriteModels: resolvedGuiSettings.favoriteModels,
        hiddenModels: resolvedGuiSettings.hiddenModels,
      }),
    [activeModels, resolvedGuiSettings.favoriteModels, resolvedGuiSettings.hiddenModels],
  )
  const activeThirdPartyProvider = useMemo(
    () =>
      resolvedGuiSettings.thirdPartyProviders.find(
        (provider) => provider.enabled && provider.id === resolvedGuiSettings.activeThirdPartyProviderId,
      ) ?? null,
    [resolvedGuiSettings.activeThirdPartyProviderId, resolvedGuiSettings.thirdPartyProviders],
  )
  const selectedModelStillSelectable = useMemo(
    () => selectedModelExists(selectableModels, selectedModel),
    [selectableModels, selectedModel],
  )
  const currentModelProviderId =
    (selectedModelStillSelectable ? selectedModel?.providerId : null) ??
    activeThirdPartyProvider?.id ??
    selectableModels[0]?.providerId ??
    null
  const currentProviderModels = useMemo(
    () =>
      currentModelProviderId
        ? selectableModels.filter((model) => model.providerId === currentModelProviderId)
        : selectableModels,
    [currentModelProviderId, selectableModels],
  )
  const selectedAgentInfo = selectableAgents.find((agent) => agent.name === selectedAgent) ?? null
  const selectedModelInfo =
    selectableModels.find(
      (model) => model.providerId === selectedModel?.providerId && model.id === selectedModel.modelId,
    ) ??
    null
  const defaultSelectableModel = useMemo(
    () =>
      chooseSelectableModel({
        models: selectableModels,
        selectedModel: null,
        defaultProviderId: activeThirdPartyProvider?.id ?? null,
        defaultModelId: activeThirdPartyProvider?.defaultModel || activeThirdPartyProvider?.models[0] || null,
      }),
    [activeThirdPartyProvider, selectableModels],
  )
  const currentModelProviderName =
    currentProviderModels[0]?.providerName ?? activeThirdPartyProvider?.name ?? currentModelProviderId

  const threadMessages = useQuery({
    queryKey: syncQueryKeys.sessionMessages(server?.baseUrl, activeSessionDirectory, activeThread?.id),
    queryFn: () =>
      sessionMessages({
        baseUrl: server?.baseUrl ?? undefined,
        directory: activeSessionDirectory ?? undefined,
        sessionId: activeThread?.id ?? "",
        limit: 120,
      }),
    enabled: Boolean(server?.healthy && server?.baseUrl && activeSessionDirectory && activeThread && !activeThread.local),
    refetchInterval: activeRunning || activePromptRefreshing ? 1_000 : false,
  })

  const threadDiff = useQuery({
    queryKey: syncQueryKeys.sessionDiff(server?.baseUrl, activeSessionDirectory, activeThread?.id),
    queryFn: () =>
      sessionDiff({
        baseUrl: server?.baseUrl ?? undefined,
        directory: activeSessionDirectory ?? undefined,
        sessionId: activeThread?.id ?? "",
      }),
    enabled: Boolean(server?.healthy && server?.baseUrl && activeSessionDirectory && activeThread && !activeThread.local),
    refetchInterval: activeRunning ? 2_500 : 10_000,
  })

  useEffect(() => {
    if (!activeThread || activeThread.local) return
    if (!server?.healthy || !activeSessionDirectory) return
    if (!threadMessages.data?.length) return
    void queryClient.invalidateQueries({
      queryKey: syncQueryKeys.sessionDiff(server?.baseUrl, activeSessionDirectory, activeThread.id),
    })
  }, [
    activeSessionDirectory,
    activeThread?.id,
    activeThread?.local,
    queryClient,
    server?.baseUrl,
    server?.healthy,
    threadMessages.dataUpdatedAt,
    threadMessages.data?.length,
  ])

  useEffect(() => {
    const statuses = sessionStatuses.data
    if (!statuses) return

    const busyIds = new Set(
      Object.entries(statuses)
        .filter(([, status]) => isSessionStatusBusy(status))
        .map(([sessionId]) => sessionId),
    )

    setRunningSessionIds((current) => (sameStringSet(current, busyIds) ? current : busyIds))
    const signature = [...busyIds].sort().join("\0")
    if (sessionStatusSignature.current !== signature) {
      sessionStatusSignature.current = signature
      invalidateSessionMessages(queryClient, { baseUrl: server?.baseUrl, directory: activeSessionDirectory })
      invalidateSessions(queryClient, { baseUrl: server?.baseUrl, directory: activeSessionDirectory })
    }
  }, [activeSessionDirectory, queryClient, server?.baseUrl, sessionStatuses.data])

  useEffect(() => {
    if (!pendingPromptRefresh || !sessionStatuses.data) return

    const remaining = Math.max(0, PROMPT_IDLE_RECONCILE_GRACE_MS - (Date.now() - pendingPromptRefresh.startedAt))
    const timeout = window.setTimeout(() => {
      setPendingPromptRefresh((current) => {
        if (!current) return current
        if (current.threadId !== pendingPromptRefresh.threadId || current.startedAt !== pendingPromptRefresh.startedAt) {
          return current
        }
        return isSessionStatusBusy(sessionStatuses.data?.[current.threadId]) ? current : null
      })
    }, remaining)

    return () => window.clearTimeout(timeout)
  }, [pendingPromptRefresh, sessionStatuses.data])

  useEffect(() => {
    if (server?.baseUrl) setServerUrl(server.baseUrl)
  }, [server?.baseUrl])

  useEffect(() => {
    if (!guiSettings.isFetched || !currentWorkspace.isFetched) return
    const raw = guiSettings.data
    if (!raw) return
    const version = typeof raw.permissionSettingsVersion === "number" ? raw.permissionSettingsVersion : 0
    if (version >= 2) return

    const signature = [version, workspace?.path ?? "", raw.permissionMode ?? ""].join("\0")
    if (permissionSettingsMigrationRef.current === signature) return
    permissionSettingsMigrationRef.current = signature

    const key = permissionWorkspaceKey(workspace?.path)
    const permissionModesByWorkspace = { ...resolvedGuiSettings.permissionModesByWorkspace }
    if (key && !permissionModesByWorkspace[key]) {
      permissionModesByWorkspace[key] = resolvedGuiSettings.permissionMode
    }
    const nextSettings = normalizeGuiSettings({
      ...resolvedGuiSettings,
      permissionSettingsVersion: 2,
      permissionMode: DEFAULT_GUI_SETTINGS.permissionMode,
      permissionModesByWorkspace,
    })

    queryClient.setQueryData(["settings", GUI_SETTINGS_KEY], nextSettings)
    void settingsSet(GUI_SETTINGS_KEY, nextSettings)
  }, [
    currentWorkspace.isFetched,
    guiSettings.data,
    guiSettings.isFetched,
    queryClient,
    resolvedGuiSettings,
    workspace?.path,
  ])

  useEffect(() => {
    const savedServerUrl = guiSettings.data?.serverUrl?.trim()
    if (!savedServerUrl || server?.baseUrl) return
    setServerUrl(savedServerUrl)
  }, [guiSettings.data?.serverUrl, server?.baseUrl])

  useEffect(() => {
    if (!selectableAgents.length) return
    if (
      selectedAgent &&
      (selectedAgent === "build" || selectedAgent === "plan") &&
      selectableAgents.some((agent) => agent.name === selectedAgent)
    ) {
      return
    }
    const preferred =
      selectableAgents.find((agent) => agent.name === "build") ??
      selectableAgents.find((agent) => agent.name === "plan") ??
      selectableAgents.find((agent) => agent.name === options.data?.defaultAgent) ??
      selectableAgents[0]
    setSelectedAgent(preferred.name)
  }, [options.data?.defaultAgent, selectableAgents, selectedAgent])

  useEffect(() => {
    const preferred = chooseSelectableModel({
      models: selectableModels,
      selectedModel,
      defaultProviderId: activeThirdPartyProvider?.id ?? null,
      defaultModelId: activeThirdPartyProvider?.defaultModel || activeThirdPartyProvider?.models[0] || null,
    })
    if (!preferred) {
      if (selectedModel) setSelectedModel(null)
      return
    }
    if (selectedModel?.providerId === preferred.providerId && selectedModel.modelId === preferred.id) return
    setSelectedModel({ providerId: preferred.providerId, modelId: preferred.id })
  }, [
    activeThirdPartyProvider,
    selectableModels,
    selectedModel,
  ])

  useEffect(() => {
    setLiveActivities((recentActivities.data ?? []).filter(isDisplayableActivity))
  }, [recentActivities.data])

  useEffect(() => {
    if (!threads.length) return
    if (activeThreadId && threads.some((thread) => thread.id === activeThreadId)) return
    const fallback = threads.find((thread) => !thread.local) ?? threads[0]
    if (fallback.local && workspace?.path && !sessions.data) return
    setActiveThreadId(fallback.id)
  }, [activeThreadId, sessions.data, threads, workspace?.path])

  useEffect(() => {
    if (!server?.healthy || !server.baseUrl || !workspace?.path) return
    const baseUrl = server.baseUrl
    const directory = workspace.path
    void prefetchWorkspaceBootstrap({
      queryClient,
      baseUrl,
      directory,
      loaders: {
        sessions: () => sessionList({ baseUrl, directory, limit: 50 }),
        executionOptions: () => executionOptions({ baseUrl, directory }),
        commands: () => commandList({ baseUrl, directory }),
        sessionStatus: () => sessionStatus({ baseUrl, directory }),
        permissions: () => permissionList({ baseUrl, directory }),
        questions: () => questionList({ baseUrl, directory }),
      },
    })
  }, [queryClient, server?.baseUrl, server?.healthy, workspace?.path])

  useEffect(() => {
    if (!server?.healthy || !server.baseUrl || !workspace?.path || !activeSessions.length) return
    const baseUrl = server.baseUrl
    const activeId = activeRealThread?.id
    const warm = activeSessions
      .filter((session) => session.id !== activeId)
      .slice(0, 3)

    for (const session of warm) {
      const directory = session.directory ?? workspace.path
      void prefetchSessionMessages({
        queryClient,
        baseUrl,
        directory,
        sessionId: session.id,
        queryFn: () =>
          sessionMessages({
            baseUrl,
            directory,
            sessionId: session.id,
            limit: 120,
          }),
      })
    }
  }, [activeRealThread?.id, activeSessions, queryClient, server?.baseUrl, server?.healthy, sessions.dataUpdatedAt, workspace?.path])

  useEffect(() => {
    let disposed = false
    let unsubscribe: (() => void) | undefined

    void subscribeThreadActivity((activity) => {
      if (!isDisplayableActivity(activity)) return
      setLiveActivities((current) => {
        const next = [activity, ...current.filter((item) => item.id !== activity.id)]
        return next.slice(0, 120)
      })
      if (activity.sessionId) {
        const target = {
          baseUrl: server?.baseUrl,
          directory: activity.directory ?? activeSessionDirectory ?? workspace?.path,
          sessionId: activity.sessionId,
        }
        invalidateSessionMessages(queryClient, target)
        if (activity.kind === "file_edit" || activity.sourceEventType === "session.diff") {
          invalidateSessionDiff(queryClient, target)
        }
      }
    }).then((cleanup) => {
      if (disposed) {
        cleanup()
        return
      }
      unsubscribe = cleanup
    })

    return () => {
      disposed = true
      unsubscribe?.()
    }
  }, [activeSessionDirectory, queryClient, server?.baseUrl, workspace?.path])

  useEffect(() => {
    let disposed = false
    let unsubscribe: (() => void) | undefined

    void subscribeOpenCodeEvent((event) => {
      const applied = applyOpenCodeEventToQueryCache(queryClient, event, {
        baseUrl: server?.baseUrl,
        directory: event.directory ?? activeSessionDirectory ?? workspace?.path,
      })
      const type = applied.type ?? syncGetOpenCodeEventType(event.payload)
      if (!type) return
      const sessionId = applied.sessionId ?? syncGetOpenCodeEventSessionId(event.payload)
      const partDelta = syncGetOpenCodePartDelta(event.payload)

      if (partDelta) {
        const key = streamingPartKey(partDelta.sessionId, partDelta.messageId, partDelta.partId)
        setStreamingPartText((current) => ({
          ...current,
          [key]: `${current[key] ?? ""}${partDelta.delta}`,
        }))
      }

      if (sessionId) {
        if (type === "session.status") {
          const statusType = syncGetOpenCodeSessionStatusType(event.payload)
          setRunningSessionIds((current) => {
            const next = new Set(current)
            if (statusType && statusType !== "idle") next.add(sessionId)
            else next.delete(sessionId)
            return next
          })
        } else if (
          type === "session.idle" ||
          type === "session.error" ||
          type === "session.deleted" ||
          type === "session.next.step.failed"
        ) {
          setRunningSessionIds((current) => {
            if (!current.has(sessionId)) return current
            const next = new Set(current)
            next.delete(sessionId)
            return next
          })
        }
      }

      const updatedPart = syncGetOpenCodePartUpdated(event.payload)
      if (updatedPart?.text && updatedPart.sessionId) {
        const key = streamingPartKey(updatedPart.sessionId, updatedPart.messageId, updatedPart.partId)
        window.setTimeout(() => {
          setStreamingPartText((current) => {
            if (!(key in current)) return current
            const next = { ...current }
            delete next[key]
            return next
          })
        }, 1_500)
      }
    }).then((cleanup) => {
      if (disposed) {
        cleanup()
        return
      }
      unsubscribe = cleanup
    })

    return () => {
      disposed = true
      unsubscribe?.()
    }
  }, [activeSessionDirectory, queryClient, server?.baseUrl, workspace?.path])

  useEffect(() => {
    if (!pendingPromptRefresh) return
    const timeout = window.setTimeout(() => {
      setPendingPromptRefresh((current) =>
        current?.threadId === pendingPromptRefresh.threadId && current.startedAt === pendingPromptRefresh.startedAt
          ? null
          : current,
      )
    }, 120_000)
    return () => window.clearTimeout(timeout)
  }, [pendingPromptRefresh])

  useEffect(() => {
    if (!pendingPromptRefresh || activeThread?.id !== pendingPromptRefresh.threadId) return
    const lastAssistant = (threadMessages.data ?? []).filter((message) => message.role === "assistant").at(-1)
    if (!lastAssistant) return
    if (lastAssistant.completedAt || lastAssistant.status) {
      setPendingPromptRefresh((current) =>
        current?.threadId === pendingPromptRefresh.threadId && current.startedAt === pendingPromptRefresh.startedAt
          ? null
          : current,
      )
    }
  }, [activeThread?.id, pendingPromptRefresh, threadMessages.data])

  useEffect(() => {
    if (!server?.healthy || !connectedBaseUrl || !activeSessionDirectory || !activeRealThread) return
    const text = firstUserText(threadMessages.data)
    const inferred = inferCodexStyleTitle(text)
    const currentTitle = activeSession?.title ?? activeRealThread.title
    if (!text || !inferred || !shouldApplyInferredTitle(currentTitle, text, inferred)) return

    const signature = `${activeRealThread.id}:${currentTitle}->${inferred}`
    if (renamedTitleSignature.current.has(signature)) return
    renamedTitleSignature.current.add(signature)

    void sessionUpdateTitle({
      baseUrl: connectedBaseUrl,
      directory: activeSessionDirectory,
      sessionId: activeRealThread.id,
      title: inferred,
    })
      .then((updated) => {
        queryClient.setQueryData<OpenCodeSession[]>(
          ["sessions", server?.baseUrl, activeSessionDirectory],
          (current) =>
            current?.map((session) =>
              session.id === updated.id ? { ...session, title: updated.title, updatedAt: updated.updatedAt } : session,
            ),
        )
        void queryClient.invalidateQueries({ queryKey: ["sessions"] })
      })
      .catch(() => {
        renamedTitleSignature.current.delete(signature)
      })
  }, [
    activeRealThread?.id,
    activeRealThread?.title,
    activeSession?.title,
    activeSessionDirectory,
    connectedBaseUrl,
    queryClient,
    server?.baseUrl,
    server?.healthy,
    threadMessages.data,
  ])

  const pickWorkspace = useMutation({
    mutationFn: async () => {
      const path = await workspacePick()
      if (!path) return null
      const saved = await workspaceOpen({ path, name: getPathName(path) })
      await settingsSet(CURRENT_WORKSPACE_KEY, saved)
      return saved
    },
    onSuccess: (saved) => {
      if (saved) {
        queryClient.setQueryData(["settings", CURRENT_WORKSPACE_KEY], saved)
        setActiveThreadId(null)
        setActiveView("workbench")
        void queryClient.invalidateQueries({ queryKey: ["workspaces"] })
        void queryClient.invalidateQueries({ queryKey: ["sessions"] })
        void queryClient.invalidateQueries({ queryKey: ["permissions"] })
        void queryClient.invalidateQueries({ queryKey: ["git-status"] })
      }
    },
  })

  const selectWorkspace = useMutation({
    mutationFn: async (target: WorkspaceRecord) => {
      const saved = await workspaceOpen({
        path: target.path,
        name: target.name ?? getPathName(target.path),
      })
      await settingsSet(CURRENT_WORKSPACE_KEY, saved)
      return saved
    },
    onSuccess: (saved) => {
      queryClient.setQueryData(["settings", CURRENT_WORKSPACE_KEY], saved)
      setActiveThreadId(null)
      setActiveView("workbench")
      void queryClient.invalidateQueries({ queryKey: ["workspaces"] })
      void queryClient.invalidateQueries({ queryKey: ["sessions"] })
      void queryClient.invalidateQueries({ queryKey: ["permissions"] })
      void queryClient.invalidateQueries({ queryKey: ["git-status"] })
    },
  })

  const pickWorkspaceForNewThread = useMutation({
    mutationFn: async () => {
      const path = await workspacePick()
      if (!path) return null
      const saved = await workspaceOpen({ path, name: getPathName(path) })
      await settingsSet(CURRENT_WORKSPACE_KEY, saved)
      return saved
    },
    onSuccess: (saved) => {
      if (!saved) return
      queryClient.setQueryData(["settings", CURRENT_WORKSPACE_KEY], saved)
      resetSelectedModelToDefault()
      setActiveThreadId(LOCAL_THREAD_ID)
      setActiveView("workbench")
      setUtilityPanel(null)
      void queryClient.invalidateQueries({ queryKey: ["workspaces"] })
      void queryClient.invalidateQueries({ queryKey: ["sessions"] })
      void queryClient.invalidateQueries({ queryKey: ["permissions"] })
      void queryClient.invalidateQueries({ queryKey: ["git-status"] })
    },
  })

  const selectWorkspaceForNewThread = useMutation({
    mutationFn: async (target: WorkspaceRecord) => {
      const saved = await workspaceOpen({
        path: target.path,
        name: target.name ?? getPathName(target.path),
      })
      await settingsSet(CURRENT_WORKSPACE_KEY, saved)
      return saved
    },
    onSuccess: (saved) => {
      queryClient.setQueryData(["settings", CURRENT_WORKSPACE_KEY], saved)
      resetSelectedModelToDefault()
      setActiveThreadId(LOCAL_THREAD_ID)
      setActiveView("workbench")
      setUtilityPanel(null)
      void queryClient.invalidateQueries({ queryKey: ["workspaces"] })
      void queryClient.invalidateQueries({ queryKey: ["sessions"] })
      void queryClient.invalidateQueries({ queryKey: ["permissions"] })
      void queryClient.invalidateQueries({ queryKey: ["git-status"] })
    },
  })

  const selectProjectSession = useMutation({
    mutationFn: async (input: { workspace: WorkspaceRecord; sessionId: string }) => {
      await settingsSet(CURRENT_WORKSPACE_KEY, input.workspace)
      return { workspace: input.workspace, sessionId: input.sessionId }
    },
    onSuccess: ({ workspace: saved, sessionId }) => {
      queryClient.setQueryData(["settings", CURRENT_WORKSPACE_KEY], saved)
      setActiveThreadId(sessionId)
      setActiveView("workbench")
      setUtilityPanel(null)
      void queryClient.invalidateQueries({ queryKey: ["sessions"] })
      void queryClient.invalidateQueries({ queryKey: ["permissions"] })
      void queryClient.invalidateQueries({ queryKey: ["session-messages"] })
      void queryClient.invalidateQueries({ queryKey: ["session-diff"] })
      void queryClient.invalidateQueries({ queryKey: ["git-status"] })
    },
  })

  const removeWorkspace = useMutation({
    mutationFn: async (target: WorkspaceRecord) => {
      await workspaceRemove({ id: target.id })
      if (target.id === workspace?.id) {
        await settingsSet(CURRENT_WORKSPACE_KEY, null)
      }
      const key = permissionWorkspaceKey(target.path)
      let nextSettings: GuiSettings | null = null
      if (key && resolvedGuiSettings.permissionModesByWorkspace[key]) {
        const permissionModesByWorkspace = { ...resolvedGuiSettings.permissionModesByWorkspace }
        delete permissionModesByWorkspace[key]
        nextSettings = normalizeGuiSettings({ ...resolvedGuiSettings, permissionModesByWorkspace })
        await settingsSet(GUI_SETTINGS_KEY, nextSettings)
      }
      return { target, nextSettings }
    },
    onSuccess: ({ target: removed, nextSettings }) => {
      if (removed.id === workspace?.id) {
        queryClient.setQueryData(["settings", CURRENT_WORKSPACE_KEY], null)
        setActiveThreadId(null)
      }
      if (nextSettings) {
        queryClient.setQueryData(["settings", GUI_SETTINGS_KEY], nextSettings)
      }
      void queryClient.invalidateQueries({ queryKey: ["workspaces"] })
      void queryClient.invalidateQueries({ queryKey: ["sessions"] })
      void queryClient.invalidateQueries({ queryKey: ["permissions"] })
    },
  })

  const renameThread = useMutation({
    mutationFn: async (input: { project: WorkspaceRecord; thread: SidebarThread; title: string }) => {
      if (!server?.healthy) throw new Error("请先连接 OpenCode server")
      if (!input.thread.id) throw new Error("会话 ID 不存在")
      const updated = await sessionUpdateTitle({
        baseUrl: connectedBaseUrl,
        directory: input.thread.directory ?? input.project.path,
        sessionId: input.thread.id,
        title: input.title,
      })
      return { project: input.project, updated }
    },
    onSuccess: ({ project, updated }) => {
      queryClient.setQueryData<OpenCodeSession[]>(
        ["sessions", server?.baseUrl, project.path],
        (current) =>
          current?.map((session) =>
            session.id === updated.id ? { ...session, ...updated } : session,
          ),
      )
      setRenameThreadDraft(null)
      void queryClient.invalidateQueries({ queryKey: ["sessions"] })
    },
  })

  const archiveThread = useMutation({
    mutationFn: async (input: { project: WorkspaceRecord; thread: SidebarThread; archived: boolean }) => {
      if (!server?.healthy) throw new Error("请先连接 OpenCode server")
      if (!input.thread.id) throw new Error("会话 ID 不存在")
      const updated = await sessionUpdateArchived({
        baseUrl: connectedBaseUrl,
        directory: input.thread.directory ?? input.project.path,
        sessionId: input.thread.id,
        archived: input.archived,
      })
      return { ...input, updated }
    },
    onSuccess: ({ project, thread, archived, updated }) => {
      queryClient.setQueryData<OpenCodeSession[]>(
        syncQueryKeys.sessions(server?.baseUrl, project.path),
        (current) => {
          if (!current) return current
          if (archived) return current.filter((session) => session.id !== updated.id)
          const restored = { ...updated, archivedAt: null }
          const next = [restored, ...current.filter((session) => session.id !== restored.id)]
          return next.sort((left, right) => (right.updatedAt ?? 0) - (left.updatedAt ?? 0))
        },
      )
      if (thread.id) {
        patchSessionUiState(thread.id, { archived: false })
        if (archived && activeThreadId === thread.id) setActiveThreadId(null)
      }
      void queryClient.invalidateQueries({ queryKey: ["sessions"] })
      invalidateArchivedSessions(queryClient)
    },
  })

  const connectServer = useMutation({
    mutationFn: (input?: ConnectServerInput) =>
      serverStart({
        baseUrl: input?.baseUrl?.trim() || serverUrl.trim() || DEFAULT_SERVER_URL,
        mode: input?.mode ?? resolvedGuiSettings.serverMode,
        proxy: networkProxyConfig,
      }),
    onSuccess: (next) => {
      queryClient.setQueryData(["server-status"], next)
      void queryClient.invalidateQueries({ queryKey: ["sessions"] })
      void queryClient.invalidateQueries({ queryKey: ["thread-activity-recent"] })
      void queryClient.invalidateQueries({ queryKey: ["permissions"] })
    },
  })

  const disconnectServer = useMutation({
    mutationFn: serverStop,
    onSuccess: () => {
      queryClient.setQueryData(["server-status"], {
        healthy: false,
        mode: "unconfigured",
        baseUrl: null,
        message: "尚未配置 OpenCode server",
      })
      void queryClient.invalidateQueries({ queryKey: ["permissions"] })
    },
  })

  const refreshServer = useMutation({
    mutationFn: serverStatus,
    onSuccess: (next) => {
      queryClient.setQueryData(["server-status"], next)
    },
  })

  useEffect(() => {
    if (autoConnectAttempted.current || connectServer.isPending || server?.healthy) return
    if (!guiSettings.isFetched) return
    if (!init.isSuccess && !status.isSuccess) return
    autoConnectAttempted.current = true
    connectServer.mutate({
      baseUrl: resolvedGuiSettings.serverUrl,
      mode: resolvedGuiSettings.serverMode,
    })
  }, [
    connectServer,
    guiSettings.isFetched,
    init.isSuccess,
    resolvedGuiSettings.serverMode,
    resolvedGuiSettings.serverUrl,
    server?.healthy,
    status.isSuccess,
  ])

  useEffect(() => {
    if (!server?.healthy || !connectedBaseUrl || !guiSettings.isFetched) return
    const enabledServers = resolvedGuiSettings.mcpEnabled
      ? resolvedGuiSettings.mcpServerList.filter((item) => item.enabled && canApplyMcpServer(item))
      : []
    if (
      browserRuntimeServer &&
      canApplyMcpServer(browserRuntimeServer) &&
      !enabledServers.some((item) => item.name.trim() === browserRuntimeServer.name.trim())
    ) {
      enabledServers.push(browserRuntimeServer)
    }
    const signature = JSON.stringify({
      baseUrl: connectedBaseUrl,
      directory: workspace?.path ?? "",
      servers: enabledServers.map((item) => [item.name, mcpServerConfig(item)]),
    })
    if (mcpApplySignature.current === signature) return
    mcpApplySignature.current = signature

    for (const item of enabledServers) {
      void mcpAdd({
        baseUrl: connectedBaseUrl,
        directory: workspace?.path ?? undefined,
        name: item.name.trim(),
        config: mcpServerConfig(item),
      }).catch(() => {
        mcpApplySignature.current = null
      })
    }
  }, [
    connectedBaseUrl,
    browserRuntimeServer,
    guiSettings.isFetched,
    resolvedGuiSettings.mcpEnabled,
    resolvedGuiSettings.mcpServerList,
    server?.healthy,
    workspace?.path,
  ])

  useEffect(() => {
    if (!server?.healthy || !connectedBaseUrl || !guiSettings.isFetched) return
    const providers = resolvedGuiSettings.thirdPartyProviders.filter(canApplyThirdPartyProvider)
    if (!providers.length) return

    const signature = JSON.stringify({
      baseUrl: connectedBaseUrl,
      providers: providers.map((provider) => [provider.id, provider.authStored]),
    })
    if (thirdPartyAuthStatusSignature.current === signature) return
    thirdPartyAuthStatusSignature.current = signature

    let disposed = false
    void thirdPartyProviderAuthStatus({ baseUrl: connectedBaseUrl })
      .then((status) => {
        if (disposed) return
        const current = normalizeGuiSettings(
          queryClient.getQueryData<Partial<GuiSettings>>(["settings", GUI_SETTINGS_KEY]) ?? resolvedGuiSettings,
        )
        let changed = false
        const nextProviders = current.thirdPartyProviders.map((provider) => {
          if (!canApplyThirdPartyProvider(provider)) return provider
          const authStored = Boolean(status[provider.id]?.stored)
          if (provider.authStored === authStored) return provider
          changed = true
          return { ...provider, authStored }
        })
        if (!changed) return

        const activeProviderStillUsable = nextProviders.some(
          (provider) =>
            provider.id === current.activeThirdPartyProviderId &&
            provider.enabled &&
            provider.authStored &&
            canApplyThirdPartyProvider(provider),
        )
        const nextSettings = normalizeGuiSettings({
          ...current,
          thirdPartyProviders: nextProviders,
          activeThirdPartyProviderId: activeProviderStillUsable ? current.activeThirdPartyProviderId : "",
        })
        queryClient.setQueryData(["settings", GUI_SETTINGS_KEY], nextSettings)
        void settingsSet(GUI_SETTINGS_KEY, nextSettings)
        void queryClient.invalidateQueries({ queryKey: ["execution-options"] })
      })
      .catch(() => {
        thirdPartyAuthStatusSignature.current = null
      })

    return () => {
      disposed = true
    }
  }, [connectedBaseUrl, guiSettings.isFetched, queryClient, resolvedGuiSettings, server?.healthy])

  useEffect(() => {
    if (!server?.healthy || !connectedBaseUrl || !guiSettings.isFetched) return
    const providers = resolvedGuiSettings.thirdPartyProviders.filter(
      (provider) => provider.enabled && provider.authStored && canApplyThirdPartyProvider(provider),
    )
    const signature = JSON.stringify({
      baseUrl: connectedBaseUrl,
      providers: providers.map((provider) => [provider.id, thirdPartyProviderSignature(provider)]),
    })
    if (thirdPartyApplySignature.current === signature) return
    thirdPartyApplySignature.current = signature

    void Promise.all(
      providers.map((provider) =>
        thirdPartyProviderApply({
          baseUrl: connectedBaseUrl,
          provider: thirdPartyProviderRuntimeConfig(provider),
          apiKey: null,
        }),
      ),
    )
      .then(() => {
        void queryClient.invalidateQueries({ queryKey: ["execution-options"] })
      })
      .catch(() => {
        thirdPartyApplySignature.current = null
      })
  }, [
    connectedBaseUrl,
    guiSettings.isFetched,
    queryClient,
    resolvedGuiSettings.thirdPartyProviders,
    server?.healthy,
  ])

  async function persistGuiSessionRecord(input: GuiSessionRecordInput) {
    const current = normalizeGuiSettings(
      queryClient.getQueryData<Partial<GuiSettings>>(["settings", GUI_SETTINGS_KEY]) ?? resolvedGuiSettings,
    )
    const nextSettings = upsertGuiSessionRecord(current, input)
    queryClient.setQueryData(["settings", GUI_SETTINGS_KEY], nextSettings)
    try {
      await settingsSet(GUI_SETTINGS_KEY, nextSettings)
    } catch {
      // Statistics are opportunistic local metadata; failed persistence should not break a prompt.
    } finally {
      void queryClient.invalidateQueries({ queryKey: ["settings-statistics"] })
    }
  }

  async function forgetGuiSessionRecord(sessionId: string) {
    const current = normalizeGuiSettings(
      queryClient.getQueryData<Partial<GuiSettings>>(["settings", GUI_SETTINGS_KEY]) ?? resolvedGuiSettings,
    )
    if (!current.guiSessionRegistry[sessionId]) return
    const nextSettings = removeGuiSessionRecord(current, sessionId)
    queryClient.setQueryData(["settings", GUI_SETTINGS_KEY], nextSettings)
    try {
      await settingsSet(GUI_SETTINGS_KEY, nextSettings)
    } catch {
      // Statistics are opportunistic local metadata; failed persistence should not break deleting a session.
    } finally {
      void queryClient.invalidateQueries({ queryKey: ["settings-statistics"] })
    }
  }

  async function persistGuiSettingsPatch(patch: Partial<GuiSettings>) {
    const current = normalizeGuiSettings(
      queryClient.getQueryData<Partial<GuiSettings>>(["settings", GUI_SETTINGS_KEY]) ?? resolvedGuiSettings,
    )
    const nextSettings = normalizeGuiSettings({ ...current, ...patch })
    queryClient.setQueryData(["settings", GUI_SETTINGS_KEY], nextSettings)
    await settingsSet(GUI_SETTINGS_KEY, nextSettings)
  }

  function openGuiUpdateRelease() {
    void openUrl(GUI_UPDATE_RELEASE_URL).catch((error) => {
      window.alert(`打开失败：${getErrorMessage(error)}`)
    })
  }

  function runManualUpdateCheck() {
    manualUpdateCheck.reset()
    manualUpdateCheck.mutate()
  }

  function installPromptUpdate() {
    installGuiUpdate.reset()
    installGuiUpdate.mutate()
  }

  function deferPromptUpdate() {
    const version = updatePrompt?.version
    setUpdatePrompt(null)
    installGuiUpdate.reset()
    if (!version) return
    void persistGuiSettingsPatch({
      deferredUpdateVersion: version,
      deferredUpdateAt: Date.now(),
    }).catch(() => {
      // Deferral persistence is best-effort; the dialog is already dismissed for this run.
    })
  }

  function toggleModelFavorite(model: { providerId: string; id: string }) {
    const current = normalizeGuiSettings(
      queryClient.getQueryData<Partial<GuiSettings>>(["settings", GUI_SETTINGS_KEY]) ?? resolvedGuiSettings,
    )
    const key = modelKeyFromRef(model)
    void persistGuiSettingsPatch({
      favoriteModels: toggleModelFavoriteKey(current.favoriteModels, key),
    })
  }

  function toggleModelHidden(model: { providerId: string; id: string }) {
    const current = normalizeGuiSettings(
      queryClient.getQueryData<Partial<GuiSettings>>(["settings", GUI_SETTINGS_KEY]) ?? resolvedGuiSettings,
    )
    const key = modelKeyFromRef(model)
    void persistGuiSettingsPatch({
      hiddenModels: toggleModelHiddenKey(current.hiddenModels, key),
    })
    if (selectedModel?.providerId === model.providerId && selectedModel.modelId === model.id) {
      setSelectedModel(null)
    }
  }

  function resetSelectedModelToDefault() {
    setSelectedModel((current) => {
      if (!defaultSelectableModel) return current ? null : current
      if (current?.providerId === defaultSelectableModel.providerId && current.modelId === defaultSelectableModel.id) {
        return current
      }
      return { providerId: defaultSelectableModel.providerId, modelId: defaultSelectableModel.id }
    })
  }

  function guiRecordFromSession(
    session: OpenCodeSession,
    targetWorkspace?: WorkspaceRecord | null,
    lastUsedAt = Date.now(),
  ): GuiSessionRecordInput {
    const directory = session.directory ?? targetWorkspace?.path ?? workspace?.path ?? null
    return {
      sessionId: session.id,
      directory,
      workspacePath: targetWorkspace?.path ?? directory,
      projectName: session.projectName ?? targetWorkspace?.name ?? getPathName(directory) ?? workspaceName,
      title: session.title,
      createdAt: session.createdAt ?? lastUsedAt,
      lastUsedAt,
    }
  }

  function cacheWorkspaceSession(session: OpenCodeSession, targetWorkspace?: WorkspaceRecord | null) {
    const directory = session.directory ?? targetWorkspace?.path ?? workspace?.path ?? null
    const cached = directory && session.directory !== directory ? { ...session, directory } : session
    upsertSessionInQueryCache(queryClient, { baseUrl: server?.baseUrl, directory }, cached)
    return cached
  }

  async function ensureBrowserMcp() {
    if (!server?.healthy || !connectedBaseUrl || !workspace?.path) return
    if (!browserRuntimeServer || !canApplyMcpServer(browserRuntimeServer)) return
    const name = browserRuntimeServer.name.trim()
    const current = await mcpStatus({
      baseUrl: connectedBaseUrl,
      directory: workspace.path,
    })
    if (current[name]?.status === "connected") return
    await mcpAdd({
      baseUrl: connectedBaseUrl,
      directory: workspace.path,
      name,
      config: mcpServerConfig(browserRuntimeServer),
    })
  }

  function warmBrowserMcp() {
    void ensureBrowserMcp().catch(() => undefined)
  }

  function ensureSelectedProviderReady() {
    if (!selectedModelInfo) {
      throw new Error("请先到设置 > API 供应商添加供应商、添加或获取模型，并选择一个可用模型。")
    }
    const provider = resolvedGuiSettings.thirdPartyProviders.find((item) => item.id === selectedModelInfo.providerId)
    if (!provider) {
      throw new Error("当前选择的模型不属于 GUI API 供应商，请重新选择模型。")
    }
    if (!provider.enabled) {
      throw new Error(`供应商「${provider.name}」还没有启用，请到设置 > API 供应商启用并应用。`)
    }
    if (!provider.authStored) {
      throw new Error(`供应商「${provider.name}」还没有写入 API Key，请到设置 > API 供应商编辑并应用。`)
    }
  }

  const createThread = useMutation({
    mutationFn: async (target: WorkspaceRecord) => {
      if (!server?.healthy) throw new Error("请先连接 OpenCode server")
      if (!target.path) throw new Error("请先选择项目")
      const saved = await workspaceOpen({
        path: target.path,
        name: target.name ?? getPathName(target.path),
      })
      await settingsSet(CURRENT_WORKSPACE_KEY, saved)
      const targetPermissionMode = getProjectPermissionMode(resolvedGuiSettings, saved.path)
      const targetPermissionRules = buildOpenCodePermissionRules(resolvedGuiSettings, targetPermissionMode)
      const session = await sessionCreate({
        baseUrl: connectedBaseUrl,
        directory: saved.path,
        permission: targetPermissionRules,
      })
      return { session, workspace: saved }
    },
    onSuccess: ({ session, workspace: saved }) => {
      queryClient.setQueryData(["settings", CURRENT_WORKSPACE_KEY], saved)
      const cachedSession = cacheWorkspaceSession(session, saved)
      void persistGuiSessionRecord(guiRecordFromSession(cachedSession, saved))
      setActiveThreadId(cachedSession.id)
      setActiveView("workbench")
      setUtilityPanel(null)
      void queryClient.invalidateQueries({ queryKey: ["workspaces"] })
      void queryClient.invalidateQueries({ queryKey: ["sessions"] })
      void queryClient.invalidateQueries({ queryKey: ["permissions"] })
      void queryClient.invalidateQueries({ queryKey: ["session-messages"] })
      void queryClient.invalidateQueries({ queryKey: ["session-diff"] })
      void queryClient.invalidateQueries({ queryKey: ["git-status"] })
    },
  })

  const forkThread = useMutation({
    mutationFn: async (input: { workspace: WorkspaceRecord; thread: SidebarThread }) => {
      if (!server?.healthy) throw new Error("请先连接 OpenCode server")
      if (!input.thread.id) throw new Error("会话 ID 不存在")
      const saved = await workspaceOpen({
        path: input.workspace.path,
        name: input.workspace.name ?? getPathName(input.workspace.path),
      })
      await settingsSet(CURRENT_WORKSPACE_KEY, saved)
      const session = await sessionFork({
        baseUrl: connectedBaseUrl,
        directory: input.thread.directory ?? saved.path,
        sessionId: input.thread.id,
      })
      return { session, workspace: saved }
    },
    onSuccess: ({ session, workspace: saved }) => {
      queryClient.setQueryData(["settings", CURRENT_WORKSPACE_KEY], saved)
      const cachedSession = cacheWorkspaceSession(session, saved)
      void persistGuiSessionRecord(guiRecordFromSession(cachedSession, saved))
      setActiveThreadId(cachedSession.id)
      setActiveView("workbench")
      setUtilityPanel(null)
      void queryClient.invalidateQueries({ queryKey: ["workspaces"] })
      void queryClient.invalidateQueries({ queryKey: ["sessions"] })
      void queryClient.invalidateQueries({ queryKey: ["permissions"] })
      void queryClient.invalidateQueries({ queryKey: ["session-messages"] })
      void queryClient.invalidateQueries({ queryKey: ["session-diff"] })
      void queryClient.invalidateQueries({ queryKey: ["git-status"] })
    },
  })

  const submitPrompt = useMutation({
    mutationFn: async (input: { text: string; attachments: PromptAttachment[] }) => {
      if (!server?.healthy) throw new Error("请先连接 OpenCode server")
      if (!workspace?.path) throw new Error("请先选择项目")
      ensureSelectedProviderReady()
      warmBrowserMcp()

      let target = activeThread
      if (!target || target.local) {
        const session = await sessionCreate({
          baseUrl: connectedBaseUrl,
          directory: workspace.path,
          permission: permissionRules,
        })
        const cachedSession = cacheWorkspaceSession(session, workspace)
        target = sessionToThread(cachedSession, workspaceName, workspace.path)
        setActiveThreadId(cachedSession.id)
        setActiveView("workbench")
      }

      const targetDirectory = target.directory ?? activeSessionDirectory ?? workspace.path
      setPendingPromptRefresh({ threadId: target.id, startedAt: Date.now() })
      setRunningSessionIds((current) => {
        const next = new Set(current)
        next.add(target.id)
        return next
      })
      await sessionPrompt({
        baseUrl: connectedBaseUrl,
        directory: targetDirectory,
        sessionId: target.id,
        text: input.text,
        attachments: input.attachments.map((attachment) => ({
          mime: attachment.mime,
          filename: attachment.name,
          url: attachment.url,
        })),
        system: personalizationSystemPrompt,
        agent: selectedAgent ?? undefined,
        providerId: selectedModelInfo?.providerId,
        modelId: selectedModelInfo?.id,
        permission: permissionRules,
      })
      const completedAt = Date.now()
      await persistGuiSessionRecord({
        sessionId: target.id,
        directory: targetDirectory,
        workspacePath: workspace.path,
        projectName: target.project ?? workspaceName,
        title: target.title,
        createdAt: target.local ? completedAt : undefined,
        lastUsedAt: completedAt,
      })
      return target.id
    },
    onError: () => {
      setPendingPromptRefresh(null)
    },
    onSuccess: (threadId) => {
      setActiveThreadId(threadId)
      setActiveView("workbench")
      void queryClient.invalidateQueries({ queryKey: ["sessions"] })
      void queryClient.invalidateQueries({ queryKey: ["thread-activity-recent"] })
      void queryClient.invalidateQueries({ queryKey: ["permissions"] })
      void queryClient.invalidateQueries({ queryKey: ["session-messages"] })
      void queryClient.invalidateQueries({ queryKey: ["session-status"] })
      void queryClient.invalidateQueries({ queryKey: ["git-status"] })
    },
  })

  const abortThread = useMutation({
    mutationFn: async () => {
      if (!server?.healthy) throw new Error("请先连接 OpenCode server")
      if (!activeSessionDirectory) throw new Error("请先选择项目")
      if (!activeThread || activeThread.local) throw new Error("当前没有正在运行的任务")
      await sessionAbort({
        baseUrl: connectedBaseUrl,
        directory: activeSessionDirectory,
        sessionId: activeThread.id,
      })
      return activeThread.id
    },
    onSuccess: (sessionId) => {
      if (sessionId) {
        setRunningSessionIds((current) => {
          if (!current.has(sessionId)) return current
          const next = new Set(current)
          next.delete(sessionId)
          return next
        })
      }
      setPendingPromptRefresh(null)
      void queryClient.invalidateQueries({ queryKey: ["sessions"] })
      void queryClient.invalidateQueries({ queryKey: ["thread-activity-recent"] })
      void queryClient.invalidateQueries({ queryKey: ["session-messages"] })
      void queryClient.invalidateQueries({ queryKey: ["session-status"] })
      void queryClient.invalidateQueries({ queryKey: ["git-status"] })
    },
  })

  const deleteThread = useMutation({
    mutationFn: async (input: { workspace: WorkspaceRecord; sessionId: string; title: string }) => {
      if (!server?.healthy) throw new Error("请先连接 OpenCode server")
      await sessionDelete({
        baseUrl: connectedBaseUrl,
        directory: input.workspace.path,
        sessionId: input.sessionId,
      })
      return input
    },
    onSuccess: ({ workspace: targetWorkspace, sessionId }) => {
      if (workspace?.path === targetWorkspace.path && activeThreadId === sessionId) {
        setActiveThreadId(null)
      }
      setRunningSessionIds((current) => {
        if (!current.has(sessionId)) return current
        const next = new Set(current)
        next.delete(sessionId)
        return next
      })
      removeSessionUiState(sessionId)
      void forgetGuiSessionRecord(sessionId)
      void queryClient.invalidateQueries({ queryKey: ["sessions"] })
      void queryClient.invalidateQueries({ queryKey: ["thread-activity-recent"] })
      void queryClient.invalidateQueries({ queryKey: ["permissions"] })
      void queryClient.invalidateQueries({ queryKey: ["session-messages"] })
      void queryClient.invalidateQueries({ queryKey: ["session-diff"] })
      void queryClient.invalidateQueries({ queryKey: ["session-status"] })
    },
  })

  const deleteMessage = useMutation({
    mutationFn: async (input: { sessionId: string; messageId: string }) => {
      if (!server?.healthy) throw new Error("请先连接 OpenCode server")
      if (!activeSessionDirectory) throw new Error("请先选择项目")
      await sessionMessageDelete({
        baseUrl: connectedBaseUrl,
        directory: activeSessionDirectory,
        sessionId: input.sessionId,
        messageId: input.messageId,
      })
      return input
    },
    onMutate: async (input) => {
      const key = ["session-messages", server?.baseUrl, activeSessionDirectory, input.sessionId]
      await queryClient.cancelQueries({ queryKey: key })
      const previous = queryClient.getQueryData<OpenCodeMessage[]>(key)
      queryClient.setQueryData<OpenCodeMessage[]>(key, (current) =>
        current?.filter((message) => message.id !== input.messageId) ?? current,
      )
      return { key, previous }
    },
    onError: (_error, _input, context) => {
      if (context?.previous) queryClient.setQueryData(context.key, context.previous)
    },
    onSettled: (_data, _error, input) => {
      void queryClient.invalidateQueries({ queryKey: ["session-messages", server?.baseUrl, activeSessionDirectory, input?.sessionId] })
      void queryClient.invalidateQueries({ queryKey: ["sessions"] })
    },
  })

  const forkMessage = useMutation({
    mutationFn: async (input: {
      sessionId: string
      message: OpenCodeMessage
      text?: string
      boundaryMessageId?: string | null
    }) => {
      if (!server?.healthy) throw new Error("请先连接 OpenCode server")
      if (!activeSessionDirectory) throw new Error("请先选择项目")
      const text = input.text?.trim()
      if (text) warmBrowserMcp()
      const session = await sessionFork({
        baseUrl: connectedBaseUrl,
        directory: activeSessionDirectory,
        sessionId: input.sessionId,
        messageId: input.boundaryMessageId === undefined ? input.message.id : input.boundaryMessageId ?? undefined,
      })
      const cachedSession = cacheWorkspaceSession(session, workspace)

      if (text) {
        ensureSelectedProviderReady()
        setPendingPromptRefresh({ threadId: cachedSession.id, startedAt: Date.now() })
        setRunningSessionIds((current) => {
          const next = new Set(current)
          next.add(cachedSession.id)
          return next
        })
        try {
          await sessionPrompt({
            baseUrl: connectedBaseUrl,
            directory: cachedSession.directory ?? activeSessionDirectory,
            sessionId: cachedSession.id,
            text,
            system: personalizationSystemPrompt,
            agent: selectedAgent ?? undefined,
            providerId: selectedModelInfo?.providerId,
            modelId: selectedModelInfo?.id,
            permission: permissionRules,
          })
        } catch (error) {
          setPendingPromptRefresh((current) => (current?.threadId === cachedSession.id ? null : current))
          setRunningSessionIds((current) => {
            if (!current.has(cachedSession.id)) return current
            const next = new Set(current)
            next.delete(cachedSession.id)
            return next
          })
          throw error
        }
      }

      return { session: cachedSession }
    },
    onSuccess: ({ session }) => {
      void persistGuiSessionRecord(guiRecordFromSession(session, workspace))
      setActiveThreadId(session.id)
      setActiveView("workbench")
      setUtilityPanel(null)
      void queryClient.invalidateQueries({ queryKey: ["sessions"] })
      void queryClient.invalidateQueries({ queryKey: ["thread-activity-recent"] })
      void queryClient.invalidateQueries({ queryKey: ["permissions"] })
      void queryClient.invalidateQueries({ queryKey: ["session-messages"] })
      void queryClient.invalidateQueries({ queryKey: ["session-diff"] })
    },
  })

  const replyPermission = useMutation({
    mutationFn: async (input: { permission: PermissionInfo; reply: "once" | "always" | "reject"; message?: string }) => {
      await permissionReply({
        baseUrl: connectedBaseUrl,
        directory: activeSessionDirectory ?? undefined,
        requestId: input.permission.id,
        reply: input.reply,
        message: input.message,
      })
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["permissions"] })
      void queryClient.invalidateQueries({ queryKey: ["thread-activity-recent"] })
    },
  })

  const replyQuestion = useMutation({
    mutationFn: async (input: { question: QuestionInfo; answers: string[][] }) => {
      await questionReply({
        baseUrl: connectedBaseUrl,
        directory: activeSessionDirectory ?? undefined,
        requestId: input.question.id,
        answers: input.answers,
      })
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["questions"] })
      void queryClient.invalidateQueries({ queryKey: ["thread-activity-recent"] })
    },
  })

  const rejectQuestion = useMutation({
    mutationFn: async (input: { question: QuestionInfo }) => {
      await questionReject({
        baseUrl: connectedBaseUrl,
        directory: activeSessionDirectory ?? undefined,
        requestId: input.question.id,
      })
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["questions"] })
      void queryClient.invalidateQueries({ queryKey: ["thread-activity-recent"] })
    },
  })

  const changePermissionMode = useMutation({
    mutationFn: async (mode: PermissionMode) => {
      const nextSettings = setProjectPermissionMode(resolvedGuiSettings, workspace?.path, mode)
      const nextMode = getProjectPermissionMode(nextSettings, workspace?.path)
      const nextPermissionRules = buildOpenCodePermissionRules(nextSettings, nextMode)

      await settingsSet(GUI_SETTINGS_KEY, nextSettings)

      if (server?.healthy && connectedBaseUrl && activeRealThread && activeSessionDirectory) {
        await sessionUpdatePermission({
          baseUrl: connectedBaseUrl,
          directory: activeSessionDirectory,
          sessionId: activeRealThread.id,
          permission: nextPermissionRules,
        })

        if (nextMode === "full" && activePermissions.length) {
          await Promise.all(
            activePermissions.map((permission) =>
              permissionReply({
                baseUrl: connectedBaseUrl,
                directory: activeSessionDirectory,
                requestId: permission.id,
                reply: "once",
              }),
            ),
          )
        }
      }
    },
    onMutate: (mode) => {
      const nextSettings = setProjectPermissionMode(resolvedGuiSettings, workspace?.path, mode)
      queryClient.setQueryData(["settings", GUI_SETTINGS_KEY], nextSettings)
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ["permissions"] })
      void queryClient.invalidateQueries({ queryKey: ["sessions"] })
      void queryClient.invalidateQueries({ queryKey: ["thread-activity-recent"] })
    },
  })

  const autoApprovedPermissions = useRef(new Set<string>())
  useEffect(() => {
    if (!shouldAutoApprovePermission(activePermissionMode, resolvedGuiSettings)) {
      autoApprovedPermissions.current.clear()
      return
    }
    if (!server?.healthy || !connectedBaseUrl || !activeSessionDirectory) return

    for (const permission of pendingPermissions.data ?? []) {
      if (!permission.id || autoApprovedPermissions.current.has(permission.id)) continue
      autoApprovedPermissions.current.add(permission.id)
      void permissionReply({
        baseUrl: connectedBaseUrl,
        directory: activeSessionDirectory,
        requestId: permission.id,
        reply: "once",
      })
        .then(() => {
          void queryClient.invalidateQueries({ queryKey: ["permissions"] })
          void queryClient.invalidateQueries({ queryKey: ["thread-activity-recent"] })
        })
        .catch(() => {
          autoApprovedPermissions.current.delete(permission.id)
        })
    }
  }, [
    connectedBaseUrl,
    pendingPermissions.data,
    queryClient,
    activePermissionMode,
    activeSessionDirectory,
    resolvedGuiSettings,
    server?.healthy,
  ])

  const recentProjects = useMemo(() => recentWorkspaces.data ?? [], [recentWorkspaces.data])
  const workbenchError =
    pickWorkspaceForNewThread.error ??
    selectWorkspaceForNewThread.error ??
    createThread.error ??
    forkThread.error ??
    submitPrompt.error ??
    changePermissionMode.error ??
    (activeRealThread ? abortThread.error : null)
  const sidebarProjects = useMemo(() => {
    const seen = new Set<string>()
    const items: WorkspaceRecord[] = []
    const add = (item?: WorkspaceRecord | null) => {
      if (!item?.path || seen.has(item.path)) return
      seen.add(item.path)
      items.push(item)
    }
    recentProjects.forEach(add)
    add(workspace)
    if (projectSortMode === "name") {
      return [...items].sort((left, right) =>
        (left.name ?? getPathName(left.path)).localeCompare(right.name ?? getPathName(right.path), "zh-Hans-CN"),
      )
    }
    return items
  }, [projectSortMode, recentProjects, workspace])

  const sidebarSessionQueries = useQueries({
    queries: sidebarProjects.map((project) => ({
      queryKey: ["sessions", server?.baseUrl, project.path],
      queryFn: () =>
        sessionList({
          baseUrl: server?.baseUrl ?? undefined,
          directory: project.path,
          limit: 50,
        }),
      enabled: Boolean(server?.healthy && server?.baseUrl && project.path),
      staleTime: 8_000,
    })),
  })
  const visibleProjectIds = useMemo(() => sidebarProjects.map((project) => project.id), [sidebarProjects])
  const hasExpandedProjects = visibleProjectIds.some((id) => expandedProjectIds.has(id))
  const allProjectsExpanded = visibleProjectIds.length > 0 && visibleProjectIds.every((id) => expandedProjectIds.has(id))
  const canRestorePreviousProjectGroups = Boolean(
    previousExpandedProjectIds && visibleProjectIds.some((id) => previousExpandedProjectIds.has(id)),
  )

  useEffect(() => {
    if (!workspace?.id) return
    setExpandedProjectIds((current) => {
      if (current.has(workspace.id)) return current
      const next = new Set(current)
      next.add(workspace.id)
      return next
    })
  }, [workspace?.id])

  useEffect(() => {
    const visible = new Set(visibleProjectIds)
    setExpandedProjectIds((current) => {
      const next = new Set([...current].filter((id) => visible.has(id)))
      return next.size === current.size ? current : next
    })
    setPreviousExpandedProjectIds((current) => {
      if (!current) return current
      const next = new Set([...current].filter((id) => visible.has(id)))
      return next.size ? next : null
    })
  }, [visibleProjectIds])

  function expandAllProjects() {
    setExpandedProjectIds(new Set(visibleProjectIds))
  }

  function collapseAllProjects() {
    const snapshot = new Set([...expandedProjectIds].filter((id) => visibleProjectIds.includes(id)))
    if (snapshot.size) setPreviousExpandedProjectIds(snapshot)
    setExpandedProjectIds(new Set())
  }

  function restorePreviousProjectGroups() {
    const restored = new Set([...(previousExpandedProjectIds ?? new Set<string>())].filter((id) => visibleProjectIds.includes(id)))
    setExpandedProjectIds(restored.size ? restored : new Set(visibleProjectIds))
  }

  function toggleProjectSection() {
    if (hasExpandedProjects) {
      collapseAllProjects()
      return
    }
    if (canRestorePreviousProjectGroups) {
      restorePreviousProjectGroups()
      return
    }
    expandAllProjects()
  }

  function toggleProjectExpanded(projectId: string) {
    setExpandedProjectIds((current) => {
      const next = new Set(current)
      if (next.has(projectId)) {
        next.delete(projectId)
      } else {
        next.add(projectId)
      }
      return next
    })
  }

  function getSessionUiStateSnapshot() {
    return (
      queryClient.getQueryData<SessionUiState | null>(["settings", SESSION_UI_STATE_KEY]) ??
      resolvedSessionUiState ??
      {}
    )
  }

  function writeSessionUiState(next: SessionUiState) {
    queryClient.setQueryData(["settings", SESSION_UI_STATE_KEY], next)
    void settingsSet(SESSION_UI_STATE_KEY, next).catch(() => {
      void queryClient.invalidateQueries({ queryKey: ["settings", SESSION_UI_STATE_KEY] })
    })
  }

  function patchSessionUiState(sessionId: string, patch: SessionUiFlags) {
    const current = getSessionUiStateSnapshot()
    const entry = compactSessionUiFlags({ ...(current[sessionId] ?? {}), ...patch })
    const next = { ...current }
    if (Object.keys(entry).length) {
      next[sessionId] = entry
    } else {
      delete next[sessionId]
    }
    writeSessionUiState(next)
  }

  function removeSessionUiState(sessionId: string) {
    const current = getSessionUiStateSnapshot()
    if (!current[sessionId]) return
    const next = { ...current }
    delete next[sessionId]
    writeSessionUiState(next)
  }

  function selectSidebarThread(project: WorkspaceRecord, threadId: string) {
    patchSessionUiState(threadId, { unread: false })
    if (workspace?.path === project.path) {
      setActiveThreadId(threadId)
      setActiveView("workbench")
      setUtilityPanel(null)
      return
    }
    selectProjectSession.mutate({ workspace: project, sessionId: threadId })
  }

  function renameSidebarThread(project: WorkspaceRecord, thread: SidebarThread) {
    if (!thread.id) return
    renameThread.reset()
    setRenameThreadDraft({ project, thread, value: thread.title })
  }

  function archiveSidebarThread(project: WorkspaceRecord, thread: SidebarThread) {
    if (!thread.id) return
    archiveThread.mutate({ project, thread, archived: !thread.archived })
  }

  function deleteSidebarThread(project: WorkspaceRecord, thread: { id?: string; title: string }) {
    if (!thread.id) return
    const ok = window.confirm(`删除会话“${thread.title}”？此操作会删除 OpenCode 中的会话数据。`)
    if (!ok) return
    deleteThread.mutate({ workspace: project, sessionId: thread.id, title: thread.title })
  }

  function startNewThread(target?: WorkspaceRecord) {
    resetSelectedModelToDefault()
    if (!target) {
      setActiveThreadId(LOCAL_THREAD_ID)
      setActiveView("workbench")
      setUtilityPanel(null)
      setOpenMenu(null)
      return
    }
    const targetWorkspace = target
    if (!targetWorkspace?.path) {
      pickWorkspace.mutate()
      return
    }
    createThread.mutate(targetWorkspace)
  }

  function openUserPath(path: string) {
    void openPath(path, {
      target: resolvedGuiSettings.defaultOpenTarget,
      shell: resolvedGuiSettings.integratedShell,
    })
  }

  async function ensureDeepLinkWorkspace(directory?: string | null) {
    const targetDirectory = directory?.trim()
    if (!targetDirectory || workspace?.path === targetDirectory) return workspace
    const saved = await workspaceOpen({ path: targetDirectory, name: getPathName(targetDirectory) })
    await settingsSet(CURRENT_WORKSPACE_KEY, saved)
    queryClient.setQueryData(["settings", CURRENT_WORKSPACE_KEY], saved)
    void queryClient.invalidateQueries({ queryKey: ["workspaces"] })
    void queryClient.invalidateQueries({ queryKey: ["sessions"] })
    void queryClient.invalidateQueries({ queryKey: ["git-status"] })
    return saved
  }

  async function applyDeepLinkTarget(target: GuiDeepLinkTarget) {
    if ("directory" in target) {
      await ensureDeepLinkWorkspace(target.directory)
    }
    if (target.type === "project") {
      setActiveView("workbench")
      setUtilityPanel(null)
      return
    }
    if (target.type === "session") {
      setActiveThreadId(target.sessionId)
      setActiveView("workbench")
      setUtilityPanel(null)
      return
    }
    if (target.type === "review") {
      if (target.sessionId) setActiveThreadId(target.sessionId)
      setActiveView("workbench")
      setUtilityPanel(null)
      return
    }
    if (target.type === "file") {
      const path = target.directory && !/^(?:[A-Za-z]:[\\/]|\/|\\)/.test(target.path)
        ? `${target.directory.replace(/[\\/]+$/, "")}/${target.path.replace(/^[\\/]+/, "")}`
        : target.path
      setActiveView("workbench")
      setUtilityPanel(null)
      openUserPath(path)
    }
  }

  useEffect(() => {
    if (typeof window === "undefined") return
    let disposed = false
    const run = () => {
      const target = parseGuiDeepLink(window.location.hash || window.location.href)
      if (!target) return
      const signature = JSON.stringify(target)
      if (deepLinkSignatureRef.current === signature) return
      deepLinkSignatureRef.current = signature
      void applyDeepLinkTarget(target).catch((error) => {
        if (!disposed) {
          deepLinkSignatureRef.current = null
          console.warn("Failed to apply OpenCode GUI deep link", error)
        }
      })
    }
    run()
    window.addEventListener("hashchange", run)
    return () => {
      disposed = true
      window.removeEventListener("hashchange", run)
    }
  }, [queryClient, resolvedGuiSettings.defaultOpenTarget, resolvedGuiSettings.integratedShell, workspace?.path])

  function handleTitlebarMouseDown(event: ReactMouseEvent<HTMLElement>) {
    if (event.button !== 0) return
    const target = event.target instanceof Element ? event.target : null
    if (target?.closest("button,a,input,textarea,select,[role='button'],[data-no-window-drag]")) return
    const dragRegion = target?.closest("[data-tauri-drag-region]")
    if (!dragRegion && target !== event.currentTarget) return
    if (event.detail === 2) {
      void windowToggleMaximize()
      return
    }
    void windowStartDragging()
  }

  return (
    <div
      className="flex h-screen flex-col overflow-hidden bg-[var(--app-bg)] text-[var(--app-text)]"
      style={themeVars(resolvedGuiSettings)}
      data-theme={resolvedThemeMode(resolvedGuiSettings)}
    >
      <header
        className="relative flex h-[48px] shrink-0 items-center border-b border-[var(--app-divider)] bg-[var(--app-chrome)] before:pointer-events-none before:absolute before:inset-x-0 before:bottom-[-1px] before:h-px before:bg-gradient-to-r before:from-transparent before:via-[color-mix(in_srgb,var(--app-text)_8%,transparent)] before:to-transparent"
        onMouseDown={handleTitlebarMouseDown}
      >
        <div ref={titleMenuRegionRef} className="relative flex h-full min-w-0 flex-1 items-center gap-0.5 px-2">
          <button
            className="flex h-8 w-8 items-center justify-center rounded-md text-[var(--app-muted)] transition-colors hover:bg-[var(--app-hover)] hover:text-[var(--app-text)]"
            title={sidebarCollapsed ? "展开侧边栏" : "收起侧边栏"}
            onClick={() => setSidebarCollapsed((value) => !value)}
          >
            {sidebarCollapsed ? <PanelLeftOpenIcon className="h-4 w-4" /> : <PanelLeftCloseIcon className="h-4 w-4" />}
          </button>
          <button
            className="flex h-8 w-8 items-center justify-center rounded-md text-[var(--app-muted)] transition-colors hover:bg-[var(--app-hover)] hover:text-[var(--app-text)] disabled:opacity-30 disabled:hover:bg-transparent"
            title="返回"
            onClick={goBack}
            disabled={!previousView}
          >
            <ChevronLeftIcon className="h-4 w-4" />
          </button>
          <button
            className="flex h-8 w-8 items-center justify-center rounded-md text-[var(--app-muted)] transition-colors hover:bg-[var(--app-hover)] hover:text-[var(--app-text)] disabled:opacity-30 disabled:hover:bg-transparent"
            title="前进"
            onClick={goForward}
            disabled={!nextView}
          >
            <ChevronRightIcon className="h-4 w-4" />
          </button>
          <nav className="ml-4 flex min-w-0 items-center gap-0.5 text-[13px] font-medium text-[var(--app-muted)]">
            {appMenus.map((menu) => (
              <button
                key={menu.id}
                className={cn(
                  "h-8 whitespace-nowrap rounded-md px-2.5 leading-none transition-colors hover:bg-[var(--app-hover)] hover:text-[var(--app-text)]",
                  openMenu === menu.id && "bg-[var(--app-selected)] text-[var(--app-text)]",
                )}
                onClick={() => setOpenMenu((value) => (value === menu.id ? null : menu.id))}
              >
                {menu.label}
              </button>
            ))}
          </nav>
          <div className="min-w-[24px] flex-1 self-stretch" data-tauri-drag-region />
          {openMenu ? (
            <AppMenuPanel
              menu={openMenu}
              serverHealthy={Boolean(server?.healthy)}
              sidebarCollapsed={sidebarCollapsed}
              onClose={() => setOpenMenu(null)}
              onCreateThread={startNewThread}
              onPickWorkspace={() => pickWorkspace.mutate()}
              onOpenWorkspace={workspace?.path ? () => openUserPath(workspace.path) : undefined}
              onSearch={() => {
                switchView("workbench")
                setUtilityPanel("search")
              }}
              onWorkbench={() => switchView("workbench")}
              onSettings={() => switchView("settings")}
              onToggleSidebar={() => setSidebarCollapsed((value) => !value)}
              onRefreshServer={() => refreshServer.mutate()}
              onMinimize={() => void windowMinimize()}
              onMaximize={() => void windowToggleMaximize()}
              onCloseWindow={() => void windowClose()}
              onOpenHelp={() => void openUrl("https://opencode.ai")}
            />
          ) : null}
        </div>
        <div className="flex shrink-0 items-center justify-end px-1.5">
          <button
            className="flex h-8 w-11 items-center justify-center rounded-md text-[var(--app-muted)] transition-colors hover:bg-[var(--app-hover)] hover:text-[var(--app-text)]"
            title="最小化"
            onClick={() => void windowMinimize()}
          >
            <MinusIcon className="h-4 w-4" />
          </button>
          <button
            className="flex h-8 w-11 items-center justify-center rounded-md text-[var(--app-muted)] transition-colors hover:bg-[var(--app-hover)] hover:text-[var(--app-text)]"
            title="最大化"
            onClick={() => void windowToggleMaximize()}
          >
            <Maximize2Icon className="h-3.5 w-3.5" />
          </button>
          <button
            className="ml-px flex h-8 w-11 items-center justify-center rounded-md text-[var(--app-muted)] transition-colors hover:bg-[var(--app-danger)] hover:text-white"
            title="关闭"
            onClick={() => void windowClose()}
          >
            <XIcon className="h-4 w-4" />
          </button>
        </div>
      </header>

      {activeView === "settings" ? (
        <div className="min-h-0 flex-1 bg-[var(--app-bg)]">
          <SettingsWorkspace
            server={server}
            workspaceDirectory={workspace?.path}
            serverUrl={serverUrl}
            connectPending={connectServer.isPending}
            disconnectPending={disconnectServer.isPending}
            refreshPending={refreshServer.isPending}
            appVersion={init.data?.version}
            updateCheckPending={manualUpdateCheck.isPending}
            updateCheckResult={manualUpdateResult}
            updateCheckError={manualUpdateCheck.error}
            error={connectServer.error ?? disconnectServer.error ?? refreshServer.error}
            onServerUrlChange={setServerUrl}
            onConnect={(mode) => connectServer.mutate({ mode })}
            onDisconnect={() => disconnectServer.mutate()}
            onRefresh={() => refreshServer.mutate()}
            onManualUpdateCheck={runManualUpdateCheck}
            onOpenUpdateRelease={openGuiUpdateRelease}
            onBack={() => switchView("workbench")}
          />
        </div>
      ) : (
      <div className="flex min-h-0 flex-1">
        {!sidebarCollapsed ? (
        <aside className="relative flex w-[264px] shrink-0 flex-col border-r border-[var(--app-border)] bg-[var(--app-panel)] before:pointer-events-none before:absolute before:inset-y-0 before:right-[-1px] before:w-px before:bg-gradient-to-b before:from-transparent before:via-[color-mix(in_srgb,var(--app-text)_6%,transparent)] before:to-transparent">
          <div className="space-y-0.5 px-2.5 pb-1 pt-3">
            {primaryNav.map((item) => {
              const Icon = item.icon
              const disabled = item.disabled
              const selected = !disabled && (item.id === "new" ? !utilityPanel && Boolean(activeThread?.local) : utilityPanel === item.id)

              return (
                <button
                  key={item.id}
                  className={cn(
                    "relative flex h-10 w-full items-center gap-3 rounded-[var(--app-radius-md)] px-3 text-left text-[13px] font-medium transition-[background-color,color] duration-150",
                    disabled
                      ? "cursor-not-allowed text-[var(--app-subtle)] opacity-45"
                      : selected
                        ? "bg-[var(--app-selected)] text-[var(--app-text)] before:absolute before:left-0 before:top-1/2 before:h-5 before:w-[2px] before:-translate-y-1/2 before:rounded-r-full before:bg-[var(--app-accent)] before:content-['']"
                        : "text-[var(--app-muted)] hover:bg-[var(--app-hover)] hover:text-[var(--app-text)]",
                  )}
                  disabled={disabled}
                  title={disabled ? `${item.label} 暂未开放` : item.label}
                  onClick={() => {
                    if (disabled) return
                    switchView("workbench")
                    if (item.id === "new") {
                      startNewThread()
                      return
                    }
                    setUtilityPanel((value) => (value === item.id ? null : item.id))
                  }}
                >
                  <Icon className={cn("h-[17px] w-[17px] shrink-0", selected && "text-[var(--app-accent)]")} />
                  <span className="min-w-0 flex-1">{item.label}</span>
                  {item.shortcut ? (
                    <span className="rounded-[5px] border border-[var(--app-border)] bg-[var(--app-input)] px-1.5 py-0.5 font-mono text-[10px] tracking-tight text-[var(--app-subtle)]">
                      {item.shortcut}
                    </span>
                  ) : null}
                </button>
              )
            })}
          </div>

          {utilityPanel && utilityPanel !== "skills" && utilityPanel !== "search" ? (
            <UtilityPanelView
              panel={utilityPanel}
              baseUrl={connectedBaseUrl}
              directory={workspace?.path}
              threads={threads}
              workspaces={recentProjects}
              activeThreadId={activeThread?.id}
              onThreadSelect={(id) => {
                setUtilityPanel(null)
                setActiveThreadId(id)
              }}
              onWorkspaceSelect={(item) => selectWorkspace.mutate(item)}
              onOpenPath={openUserPath}
            />
          ) : null}

          <div className="mx-3 mt-5 flex items-center gap-1 border-t border-[var(--app-divider)] px-1 pb-2 pt-4">
            <button
              type="button"
              className="mr-auto inline-flex h-7 max-w-full items-center gap-1 rounded-[var(--app-radius-sm)] px-1.5 text-left text-[10.5px] font-semibold uppercase tracking-[0.14em] text-[var(--app-subtle)] transition-colors hover:bg-[var(--app-hover)] hover:text-[var(--app-text)]"
              onClick={toggleProjectSection}
              title={hasExpandedProjects ? "全部收起" : canRestorePreviousProjectGroups ? "恢复之前展开的分组" : "全部展开"}
            >
              <span className="truncate">项目</span>
              <ChevronRightIcon
                className={cn(
                  "h-3 w-3 shrink-0 transition-transform",
                  hasExpandedProjects && "rotate-90",
                )}
              />
            </button>
            <div ref={projectOrganizeRegionRef} className="relative">
              <button
                className={cn(
                  "flex h-7 w-7 items-center justify-center rounded-[var(--app-radius-sm)] text-[var(--app-muted)] transition-colors hover:bg-[var(--app-hover)] hover:text-[var(--app-text)]",
                  projectOrganizeOpen && "bg-[var(--app-selected)] text-[var(--app-text)]",
                )}
                title="整理项目"
                onClick={() => setProjectOrganizeOpen((value) => !value)}
              >
                <SlidersHorizontalIcon className="h-4 w-4" />
              </button>
              {projectOrganizeOpen ? (
                <ProjectOrganizeMenu
                  sortMode={projectSortMode}
                  allExpanded={allProjectsExpanded}
                  hasExpanded={hasExpandedProjects}
                  canRestore={canRestorePreviousProjectGroups}
                  onSortModeChange={setProjectSortMode}
                  onExpandAll={expandAllProjects}
                  onCollapseAll={collapseAllProjects}
                  onRestorePrevious={restorePreviousProjectGroups}
                  onRefresh={() => void queryClient.invalidateQueries({ queryKey: ["sessions"] })}
                  onClose={() => setProjectOrganizeOpen(false)}
                />
              ) : null}
            </div>
            <button
              className="flex h-7 w-7 items-center justify-center rounded-[var(--app-radius-sm)] text-[var(--app-muted)] transition-colors hover:bg-[var(--app-hover)] hover:text-[var(--app-text)]"
              title="添加项目"
              onClick={() => pickWorkspace.mutate()}
              disabled={pickWorkspace.isPending}
            >
              {pickWorkspace.isPending ? (
                <Loader2Icon className="h-4 w-4 animate-spin" />
              ) : (
                <FolderOpenIcon className="h-4 w-4" />
              )}
            </button>
          </div>

          <ScrollArea className="min-h-0 flex-1">
            <div className="space-y-3 px-3 pb-4">
              {sidebarProjects.length ? (
                sidebarProjects.map((item, index) => {
                  const projectSessions = sidebarSessionQueries[index]
                  const isActiveProject = workspace?.path === item.path
                  const isExpanded = expandedProjectIds.has(item.id)
                  const projectThreads: SidebarThread[] = filterVisibleSidebarSessions(projectSessions.data).map((session) => {
                    const state = resolvedSessionUiState[session.id] ?? {}
                    return {
                      id: session.id,
                      title: formatSessionTitle(session.title),
                      meta: formatCompactTime(session.updatedAt ?? session.createdAt),
                      changed: session.changedFiles ?? 0,
                      directory: session.directory ?? item.path,
                      pinned: state.pinned,
                      archived: Boolean(session.archivedAt),
                      unread: state.unread,
                      running:
                        runningSessionIds.has(session.id) ||
                        Boolean(isActiveProject && activeThread?.id === session.id && activeRunning),
                    }
                  })

                  return (
                    <ProjectGroup
                      key={item.id}
                      name={item.name ?? getPathName(item.path)}
                      path={item.path}
                      selected={!utilityPanel && isActiveProject && !activeThread}
                      active={!utilityPanel && isActiveProject}
                      expanded={isExpanded}
                      activeThreadId={utilityPanel ? undefined : activeThread?.id}
                      loading={projectSessions.isFetching || (isActiveProject && submitPrompt.isPending)}
                      removeBusy={removeWorkspace.isPending && removeWorkspace.variables?.id === item.id}
                      threads={projectThreads}
                      onToggleExpanded={() => toggleProjectExpanded(item.id)}
                      onSelect={() => {
                        if (!isExpanded) toggleProjectExpanded(item.id)
                        selectWorkspace.mutate(item)
                      }}
                      onThreadSelect={(id) => selectSidebarThread(item, id)}
                      onThreadRename={(thread) => void renameSidebarThread(item, thread)}
                      onThreadArchive={(thread) => archiveSidebarThread(item, thread)}
                      onThreadStateChange={(thread, patch) => {
                        if (thread.id) patchSessionUiState(thread.id, patch)
                      }}
                      onThreadForkLocal={(thread) => forkThread.mutate({ workspace: item, thread })}
                      onThreadDelete={(thread) => deleteSidebarThread(item, thread)}
                      onCreateThread={() => startNewThread(item)}
                      createBusy={createThread.isPending && createThread.variables?.id === item.id}
                      createDisabled={createThread.isPending}
                      onRemove={() => removeWorkspace.mutate(item)}
                      deleteBusy={deleteThread.isPending && deleteThread.variables?.workspace.id === item.id}
                      forkBusy={forkThread.isPending && forkThread.variables?.workspace.id === item.id}
                      archiveBusy={archiveThread.isPending && archiveThread.variables?.project.id === item.id}
                    />
                  )
                })
              ) : (
                <div className="app-dotgrid rounded-[var(--app-radius-md)] border border-dashed border-[var(--app-border)] px-3 py-10 text-center text-[12.5px] font-medium leading-relaxed text-[var(--app-muted)]">
                  <div className="mb-2 inline-flex h-9 w-9 items-center justify-center rounded-full bg-[var(--app-panel-2)] text-[var(--app-subtle)]">
                    <FolderOpenIcon className="h-4 w-4" />
                  </div>
                  <div>暂无项目</div>
                  <div className="mt-0.5 text-[var(--app-subtle)]">点击右上角文件夹添加</div>
                </div>
              )}
            </div>
          </ScrollArea>

          <div className="border-t border-[var(--app-divider)] px-2 py-2">
            <button
              className="flex h-9 w-full items-center gap-2.5 rounded-[var(--app-radius-md)] px-2.5 text-left text-[13px] font-medium text-[var(--app-muted)] transition-[background-color,color] duration-150 hover:bg-[var(--app-hover)] hover:text-[var(--app-text)]"
              title="设置"
              onClick={() => switchView("settings")}
            >
              <SettingsIcon className="h-4 w-4 shrink-0" />
              <span className="min-w-0 flex-1">设置</span>
              <span className="rounded-[5px] border border-[var(--app-border)] bg-[var(--app-input)] px-1.5 py-0.5 font-mono text-[10px] text-[var(--app-subtle)]">⌘,</span>
            </button>
          </div>
        </aside>
        ) : null}

        <main className="min-w-0 flex-1 bg-[var(--app-bg)]">
          {utilityPanel === "skills" ? (
            <SkillsWorkspace
              server={server}
              serverUrl={connectedBaseUrl}
              directory={workspace?.path}
            />
          ) : (
            <ThreadWorkspace
              thread={activeThread}
              server={server}
              workspace={workspace}
              activities={activeActivities}
              messages={threadMessages.data ?? []}
              diffs={threadDiff.data ?? []}
              permissions={activePermissions}
              questions={activeQuestions}
              agents={selectableAgents}
              models={selectableModels}
              commands={commands.data ?? []}
              workspaces={sidebarProjects}
              selectedAgent={selectedAgentInfo}
              selectedModel={selectedModelInfo}
              modelProviderName={selectedModelInfo?.providerName ?? currentModelProviderName}
              favoriteModelKeys={resolvedGuiSettings.favoriteModels}
              hiddenModelKeys={resolvedGuiSettings.hiddenModels}
              streamingPartText={streamingPartText}
              gitStatus={resolvedGuiSettings.gitAutoDetect ? currentGitStatus.data ?? null : null}
              gitLoading={resolvedGuiSettings.gitAutoDetect && currentGitStatus.isLoading}
              gitAutoDetect={resolvedGuiSettings.gitAutoDetect}
              isBusy={
                submitPrompt.isPending ||
                createThread.isPending ||
                abortThread.isPending ||
                forkMessage.isPending ||
                changePermissionMode.isPending
              }
              isRunning={abortableRunning}
              messagesLoading={threadMessages.isFetching}
              diffsLoading={threadDiff.isFetching}
              optionsLoading={options.isFetching}
              workspaceSelecting={pickWorkspaceForNewThread.isPending || selectWorkspaceForNewThread.isPending}
              permissionLabel={permissionStatusLabel}
              permissionMode={activePermissionMode}
              permissionOptions={permissionOptions}
              error={workbenchError}
              onSend={(text, attachments) => submitPrompt.mutateAsync({ text, attachments })}
              onAbort={() => abortThread.mutateAsync()}
              onPickWorkspace={() => pickWorkspaceForNewThread.mutate()}
              onWorkspaceSelect={(item) => selectWorkspaceForNewThread.mutate(item)}
              onOpenWorkspace={() => {
                if (workspace?.path) void openPath(workspace.path, { target: "system" })
              }}
              onDeleteThread={() => {
                if (!workspace || !activeRealThread) return Promise.resolve()
                return deleteThread.mutateAsync({
                  workspace,
                  sessionId: activeRealThread.id,
                  title: activeRealThread.title,
                })
              }}
              onDeleteMessage={(message) => {
                if (!activeRealThread) return Promise.resolve()
                return deleteMessage.mutateAsync({ sessionId: activeRealThread.id, messageId: message.id })
              }}
              onForkMessage={(message, text, boundaryMessageId) => {
                if (!activeRealThread) return Promise.resolve()
                return forkMessage.mutateAsync({ sessionId: activeRealThread.id, message, text, boundaryMessageId })
              }}
              onAgentChange={setSelectedAgent}
              onModelChange={(model) => setSelectedModel({ providerId: model.providerId, modelId: model.id })}
              onModelFavoriteToggle={toggleModelFavorite}
              onModelVisibilityToggle={toggleModelHidden}
              onPermissionModeChange={(mode) => changePermissionMode.mutate(mode as PermissionMode)}
              onPermissionReply={(permission, reply, message) =>
                replyPermission.mutateAsync({ permission, reply, message })
              }
              onQuestionReply={(question, answers) => replyQuestion.mutateAsync({ question, answers })}
              onQuestionReject={(question) => rejectQuestion.mutateAsync({ question })}
            />
          )}
        </main>
      </div>
      )}
      {utilityPanel === "search" ? (
        <UtilityPanelView
          panel={utilityPanel}
          baseUrl={connectedBaseUrl}
          directory={workspace?.path}
          threads={threads}
          workspaces={recentProjects}
          activeThreadId={activeThread?.id}
          onThreadSelect={(id) => {
            setUtilityPanel(null)
            setActiveThreadId(id)
          }}
          onWorkspaceSelect={(item) => {
            setUtilityPanel(null)
            selectWorkspace.mutate(item)
          }}
          onOpenPath={(path) => {
            setUtilityPanel(null)
            openUserPath(path)
          }}
          onClose={() => setUtilityPanel(null)}
        />
      ) : null}
      {updatePrompt ? (
        <GuiUpdatePrompt
          update={updatePrompt}
          busy={installGuiUpdate.isPending}
          error={installGuiUpdate.error}
          onInstall={installPromptUpdate}
          onLater={deferPromptUpdate}
          onOpenRelease={openGuiUpdateRelease}
        />
      ) : null}
      {renameThreadDraft ? (
        <RenameThreadDialog
          value={renameThreadDraft.value}
          error={renameThread.error}
          busy={renameThread.isPending}
          onChange={(value) =>
            setRenameThreadDraft((current) => (current ? { ...current, value } : current))
          }
          onClose={() => {
            if (!renameThread.isPending) setRenameThreadDraft(null)
          }}
          onSubmit={() => {
            const title = renameThreadDraft.value.trim()
            if (!title || title === renameThreadDraft.thread.title) {
              setRenameThreadDraft(null)
              return
            }
            renameThread.mutate({
              project: renameThreadDraft.project,
              thread: renameThreadDraft.thread,
              title,
            })
          }}
        />
      ) : null}
    </div>
  )
}

function GuiUpdatePrompt({
  update,
  busy,
  error,
  onInstall,
  onLater,
  onOpenRelease,
}: {
  update: GuiUpdateCheckResult
  busy?: boolean
  error?: unknown
  onInstall: () => void
  onLater: () => void
  onOpenRelease: () => void
}) {
  return (
    <section
      role="dialog"
      aria-modal="false"
      aria-label="发现新版本"
      className="fixed bottom-5 right-5 z-[120] w-[min(420px,calc(100vw-32px))] rounded-[var(--app-radius-lg)] border border-[var(--app-border)] bg-[var(--app-panel)] p-4 shadow-[var(--app-elevation-3)]"
      data-no-window-drag
    >
      <div className="flex items-start gap-3">
        <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[var(--app-accent-soft)] text-[var(--app-accent)]">
          <DownloadIcon className="h-[18px] w-[18px]" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold text-[var(--app-text)]">发现新版本 v{update.version}</div>
          <div className="mt-1 text-xs leading-5 text-[var(--app-muted)]">
            当前版本 v{update.currentVersion}。安装完成后将重启 OpenCode GUI。
          </div>
        </div>
        <button
          type="button"
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-[var(--app-muted)] hover:bg-[var(--app-hover)] hover:text-[var(--app-text)]"
          title="稍后"
          disabled={busy}
          onClick={onLater}
        >
          <XIcon className="h-4 w-4" />
        </button>
      </div>
      {update.body ? (
        <div className="mt-3 max-h-[72px] overflow-hidden rounded-lg bg-[var(--app-panel-2)] px-3 py-2 text-xs leading-5 text-[var(--app-muted)]">
          {update.body}
        </div>
      ) : null}
      {error ? (
        <div className="mt-3 rounded-lg border border-[var(--app-danger)]/30 bg-[var(--app-danger-soft)] px-3 py-2 text-xs font-medium text-[var(--app-danger)]">
          {getErrorMessage(error)}
        </div>
      ) : null}
      <div className="mt-4 flex flex-wrap justify-end gap-2">
        <button
          type="button"
          className="inline-flex h-9 items-center gap-2 rounded-lg px-3 text-sm font-medium text-[var(--app-muted)] hover:bg-[var(--app-hover)] hover:text-[var(--app-text)] disabled:opacity-50"
          disabled={busy}
          onClick={onOpenRelease}
        >
          <ExternalLinkIcon className="h-4 w-4" />
          Release
        </button>
        <button
          type="button"
          className="h-9 rounded-lg px-3 text-sm font-medium text-[var(--app-muted)] hover:bg-[var(--app-hover)] hover:text-[var(--app-text)] disabled:opacity-50"
          disabled={busy}
          onClick={onLater}
        >
          稍后
        </button>
        <button
          type="button"
          className="inline-flex h-9 items-center gap-2 rounded-lg bg-[var(--app-text)] px-3 text-sm font-semibold text-[var(--app-bg)] hover:opacity-90 disabled:opacity-50"
          disabled={busy}
          onClick={onInstall}
        >
          {busy ? <Loader2Icon className="h-4 w-4 animate-spin" /> : <DownloadIcon className="h-4 w-4" />}
          安装并重启
        </button>
      </div>
    </section>
  )
}

function RenameThreadDialog({
  value,
  error,
  busy,
  onChange,
  onClose,
  onSubmit,
}: {
  value: string
  error?: unknown
  busy?: boolean
  onChange: (value: string) => void
  onClose: () => void
  onSubmit: () => void
}) {
  return (
    <div className="fixed inset-0 z-[120] grid place-items-center bg-black/45 px-4 backdrop-blur-sm" data-no-window-drag>
      <form
        className="w-full max-w-[420px] rounded-[var(--app-radius-lg)] border border-[var(--app-border)] bg-[var(--app-panel)] p-4 shadow-[var(--app-elevation-3)]"
        onSubmit={(event) => {
          event.preventDefault()
          onSubmit()
        }}
      >
        <div className="flex items-start gap-3">
          <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-[var(--app-border)] text-[var(--app-muted)]">
            <Edit3Icon className="h-4 w-4" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-sm font-semibold text-[var(--app-text)]">重命名对话</div>
            <div className="mt-1 text-xs leading-5 text-[var(--app-muted)]">给这个会话起一个更容易识别的名称。</div>
          </div>
        </div>
        <input
          className="mt-4 h-10 w-full rounded-lg border border-[var(--app-border)] bg-[var(--app-input)] px-3 text-sm font-medium text-[var(--app-text)] outline-none transition-colors placeholder:text-[var(--app-subtle)] focus:border-[var(--app-text)]"
          autoFocus
          value={value}
          disabled={busy}
          placeholder="输入对话名称"
          onChange={(event) => onChange(event.target.value)}
        />
        {error ? (
          <div className="mt-3 rounded-lg border border-[var(--app-danger)]/30 bg-[var(--app-danger-soft)] px-3 py-2 text-xs font-medium text-[var(--app-danger)]">
            {getErrorMessage(error)}
          </div>
        ) : null}
        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            className="h-9 rounded-lg px-3 text-sm font-medium text-[var(--app-muted)] hover:bg-[var(--app-hover)] hover:text-[var(--app-text)] disabled:opacity-50"
            onClick={onClose}
            disabled={busy}
          >
            取消
          </button>
          <button
            type="submit"
            className="flex h-9 items-center gap-2 rounded-lg bg-[var(--app-text)] px-3 text-sm font-semibold text-[var(--app-bg)] hover:opacity-90 disabled:opacity-50"
            disabled={busy || !value.trim()}
          >
            {busy ? <Loader2Icon className="h-4 w-4 animate-spin" /> : null}
            保存
          </button>
        </div>
      </form>
    </div>
  )
}

function AppMenuPanel({
  menu,
  serverHealthy,
  sidebarCollapsed,
  onClose,
  onCreateThread,
  onPickWorkspace,
  onOpenWorkspace,
  onSearch,
  onWorkbench,
  onSettings,
  onToggleSidebar,
  onRefreshServer,
  onMinimize,
  onMaximize,
  onCloseWindow,
  onOpenHelp,
}: {
  menu: AppMenu
  serverHealthy: boolean
  sidebarCollapsed: boolean
  onClose: () => void
  onCreateThread: () => void
  onPickWorkspace: () => void
  onOpenWorkspace?: () => void
  onSearch: () => void
  onWorkbench: () => void
  onSettings: () => void
  onToggleSidebar: () => void
  onRefreshServer: () => void
  onMinimize: () => void
  onMaximize: () => void
  onCloseWindow: () => void
  onOpenHelp: () => void
}) {
  function run(action: () => void) {
    action()
    onClose()
  }

  return (
    <div
      className="absolute left-[102px] top-[42px] z-50 w-[244px] overflow-hidden rounded-[var(--app-radius-md)] border border-[var(--app-border)] bg-[var(--app-panel)] p-1.5 shadow-[var(--app-elevation-3)]"
      data-no-window-drag
    >
      {menu === "file" ? (
        <>
          <MenuAction label="新对话" shortcut="Ctrl+N" onClick={() => run(onCreateThread)} />
          <MenuAction label="选择项目" onClick={() => run(onPickWorkspace)} />
          <MenuAction label="打开当前项目" disabled={!onOpenWorkspace} onClick={() => onOpenWorkspace && run(onOpenWorkspace)} />
          <MenuDivider />
          <MenuAction label="设置" onClick={() => run(onSettings)} />
        </>
      ) : null}

      {menu === "edit" ? (
        <>
          <MenuAction label="搜索聊天" shortcut="Ctrl+K" onClick={() => run(onSearch)} />
          <MenuAction label="刷新 OpenCode" onClick={() => run(onRefreshServer)} />
        </>
      ) : null}

      {menu === "view" ? (
        <>
          <MenuAction label={sidebarCollapsed ? "显示侧边栏" : "隐藏侧边栏"} onClick={() => run(onToggleSidebar)} />
          <MenuAction label="打开工作台" onClick={() => run(onWorkbench)} />
          <MenuAction label="打开设置" onClick={() => run(onSettings)} />
        </>
      ) : null}

      {menu === "window" ? (
        <>
          <MenuAction label="最小化" onClick={() => run(onMinimize)} />
          <MenuAction label="最大化/还原" onClick={() => run(onMaximize)} />
          <MenuDivider />
          <MenuAction label="关闭窗口" danger onClick={() => run(onCloseWindow)} />
        </>
      ) : null}

      {menu === "help" ? (
        <>
          <div className="flex items-center gap-2 px-3 py-2 text-[11px] font-medium uppercase tracking-[0.08em] text-[var(--app-subtle)]">
            <span
              className={cn(
                "inline-block h-1.5 w-1.5 rounded-full",
                serverHealthy ? "bg-[var(--app-success)] shadow-[0_0_6px_color-mix(in_srgb,var(--app-success)_60%,transparent)]" : "bg-[var(--app-subtle)]",
              )}
            />
            OpenCode {serverHealthy ? "已连接" : "未连接"}
          </div>
          <MenuAction label="打开 OpenCode 文档" onClick={() => run(onOpenHelp)} />
          <MenuAction label="刷新服务状态" onClick={() => run(onRefreshServer)} />
        </>
      ) : null}
    </div>
  )
}

function MenuAction({
  label,
  shortcut,
  danger,
  disabled,
  onClick,
}: {
  label: string
  shortcut?: string
  danger?: boolean
  disabled?: boolean
  onClick: () => void
}) {
  return (
    <button
      className={cn(
        "flex h-8 w-full items-center gap-3 rounded-[var(--app-radius-sm)] px-3 text-left text-[13px] font-medium text-[var(--app-text)] transition-[background-color,color] duration-150 hover:bg-[var(--app-hover)] disabled:opacity-40 disabled:hover:bg-transparent",
        danger && "text-[var(--app-danger)] hover:bg-[var(--app-danger-soft)]",
      )}
      disabled={disabled}
      onClick={onClick}
    >
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {shortcut ? (
        <span className="shrink-0 rounded-[5px] border border-[var(--app-border)] bg-[var(--app-input)] px-1.5 py-0.5 font-mono text-[10px] text-[var(--app-subtle)]">
          {shortcut}
        </span>
      ) : null}
    </button>
  )
}

function MenuDivider() {
  return <div className="my-1 h-px bg-[var(--app-divider)]" />
}

type UtilityBackendSearchState = {
  files: string[]
  text: TextSearchMatch[]
  symbols: OpenCodeSymbol[]
  loading: boolean
  error: string | null
}

const SEARCH_QUERY_MIN_LENGTH = 2

function modeIncludes(searchMode: UtilitySearchMode, target: Exclude<UtilitySearchMode, "all">) {
  return searchMode === "all" || searchMode === target
}

function isAbsoluteUserPath(path: string) {
  return /^(?:[A-Za-z]:[\\/]|\/|\\)/.test(path)
}

function resolveWorkspacePath(path: string, directory?: string | null) {
  const trimmedPath = path.trim()
  const trimmedDirectory = directory?.trim()
  if (!trimmedPath || !trimmedDirectory || isAbsoluteUserPath(trimmedPath)) return trimmedPath
  return `${trimmedDirectory.replace(/[\\/]+$/, "")}/${trimmedPath.replace(/^[\\/]+/, "")}`
}

function displaySearchPath(path: string, directory?: string | null) {
  const normalizedPath = path.replace(/\\/g, "/")
  const normalizedDirectory = directory?.replace(/\\/g, "/").replace(/\/+$/, "")
  if (normalizedDirectory && normalizedPath.toLowerCase().startsWith(`${normalizedDirectory.toLowerCase()}/`)) {
    return normalizedPath.slice(normalizedDirectory.length + 1)
  }
  return normalizedPath
}

function symbolUriPath(symbol: OpenCodeSymbol) {
  const uri = symbol.uri?.trim()
  if (!uri) return null
  if (!uri.startsWith("file://")) return uri
  try {
    const parsed = new URL(uri)
    const decoded = decodeURIComponent(parsed.pathname)
    return /^\/[A-Za-z]:\//.test(decoded) ? decoded.slice(1) : decoded
  } catch {
    return uri.replace(/^file:\/\//, "")
  }
}

function compactSearchLine(line: string) {
  return line.replace(/\s+/g, " ").trim() || "空行"
}

function searchErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error || "搜索失败")
}

async function settleSearch<T>(promise: Promise<T>, fallback: T): Promise<{ data: T; error: unknown | null }> {
  try {
    return { data: await promise, error: null }
  } catch (error) {
    return { data: fallback, error }
  }
}

function SearchGroupHeader({ label, count }: { label: string; count: number }) {
  return (
    <div className="flex h-6 items-center gap-2 px-2 text-[11px] font-semibold uppercase tracking-wider text-[var(--app-subtle)]">
      <span className="min-w-0 flex-1 truncate">{label}</span>
      <span className="shrink-0 tabular-nums">{count}</span>
    </div>
  )
}

function SearchStatusRow({ loading, text }: { loading?: boolean; text: string }) {
  return (
    <div className="flex min-h-9 items-center gap-2 rounded-md px-2 text-[12px] font-medium text-[var(--app-muted)]">
      {loading ? <Loader2Icon className="h-3.5 w-3.5 shrink-0 animate-spin" /> : null}
      <span className="min-w-0 truncate">{text}</span>
    </div>
  )
}

function UtilityPanelView({
  panel,
  baseUrl,
  directory,
  threads,
  workspaces,
  activeThreadId,
  onThreadSelect,
  onWorkspaceSelect,
  onOpenPath,
  onClose,
}: {
  panel: UtilityPanel
  baseUrl?: string
  directory?: string | null
  threads: ThreadSummary[]
  workspaces: WorkspaceRecord[]
  activeThreadId?: string
  onThreadSelect: (id: string) => void
  onWorkspaceSelect: (workspace: WorkspaceRecord) => void
  onOpenPath: (path: string) => void
  onClose?: () => void
}) {
  const [query, setQuery] = useState("")
  const [searchMode, setSearchMode] = useState<UtilitySearchMode>("all")
  const [debouncedQuery, setDebouncedQuery] = useState("")
  const [backendSearch, setBackendSearch] = useState<UtilityBackendSearchState>({
    files: [],
    text: [],
    symbols: [],
    loading: false,
    error: null,
  })
  const searchRequestId = useRef(0)
  const searchInputRef = useRef<HTMLInputElement>(null)
  const normalizedQuery = query.trim()
  const lowerQuery = normalizedQuery.toLowerCase()
  const filteredThreads = threads.filter((thread) => thread.title.toLowerCase().includes(lowerQuery)).slice(0, 8)
  const filteredWorkspaces = workspaces
    .filter((workspace) => `${workspace.name ?? ""} ${workspace.path}`.toLowerCase().includes(lowerQuery))
    .slice(0, 5)

  useEffect(() => {
    if (panel !== "search") return
    const timer = window.setTimeout(() => searchInputRef.current?.focus(), 0)
    return () => window.clearTimeout(timer)
  }, [panel])

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedQuery(normalizedQuery), 220)
    return () => window.clearTimeout(timer)
  }, [normalizedQuery])

  useEffect(() => {
    if (panel !== "search") return

    const pattern = debouncedQuery.trim()
    const workspaceDirectory = directory?.trim()
    const includeFiles = modeIncludes(searchMode, "files")
    const includeText = modeIncludes(searchMode, "content")
    const includeSymbols = modeIncludes(searchMode, "symbols")

    if (!workspaceDirectory || pattern.length < SEARCH_QUERY_MIN_LENGTH || (!includeFiles && !includeText && !includeSymbols)) {
      searchRequestId.current += 1
      setBackendSearch({ files: [], text: [], symbols: [], loading: false, error: null })
      return
    }

    const requestId = searchRequestId.current + 1
    searchRequestId.current = requestId
    setBackendSearch((current) => ({ ...current, loading: true, error: null }))

    void (async () => {
      const [filesResult, textResult, symbolResult] = await Promise.all([
        includeFiles
          ? settleSearch(fileSearch({ baseUrl, directory: workspaceDirectory, query: pattern, limit: 24 }), [] as string[])
          : Promise.resolve({ data: [] as string[], error: null }),
        includeText
          ? settleSearch(textSearch({ baseUrl, directory: workspaceDirectory, pattern, limit: 24 }), [] as TextSearchMatch[])
          : Promise.resolve({ data: [] as TextSearchMatch[], error: null }),
        includeSymbols
          ? settleSearch(symbolSearch({ baseUrl, directory: workspaceDirectory, query: pattern, limit: 24 }), [] as OpenCodeSymbol[])
          : Promise.resolve({ data: [] as OpenCodeSymbol[], error: null }),
      ])

      if (searchRequestId.current !== requestId) return
      const errors = [filesResult.error, textResult.error, symbolResult.error].filter(Boolean)
      setBackendSearch({
        files: filesResult.data,
        text: textResult.data,
        symbols: symbolResult.data,
        loading: false,
        error: errors.length ? searchErrorMessage(errors[0]) : null,
      })
    })()
  }, [baseUrl, debouncedQuery, directory, panel, searchMode])

  if (panel === "search") {
    const showLocal = searchMode === "all"
    const showFiles = modeIncludes(searchMode, "files")
    const showText = modeIncludes(searchMode, "content")
    const showSymbols = modeIncludes(searchMode, "symbols")
    const hasLocalResults = showLocal && (filteredThreads.length > 0 || filteredWorkspaces.length > 0)
    const hasBackendResults =
      (showFiles && backendSearch.files.length > 0) ||
      (showText && backendSearch.text.length > 0) ||
      (showSymbols && backendSearch.symbols.length > 0)
    const workspaceDirectory = directory?.trim()
    const canSearchBackend = Boolean(workspaceDirectory && normalizedQuery.length >= SEARCH_QUERY_MIN_LENGTH)
    const showWorkspaceHint = !workspaceDirectory && (searchMode !== "all" || normalizedQuery.length >= SEARCH_QUERY_MIN_LENGTH)
    const showEmpty =
      !backendSearch.loading &&
      !backendSearch.error &&
      normalizedQuery.length >= SEARCH_QUERY_MIN_LENGTH &&
      !hasLocalResults &&
      !hasBackendResults &&
      !showWorkspaceHint

    return (
      <div
        className="fixed inset-0 z-[110] flex items-start justify-center bg-black/35 px-4 py-[9vh]"
        data-no-window-drag
        onMouseDown={(event) => {
          if (event.target === event.currentTarget) onClose?.()
        }}
        onKeyDown={(event) => {
          if (event.key === "Escape") onClose?.()
        }}
      >
        <section
          role="dialog"
          aria-modal="true"
          aria-label="搜索"
          className="flex max-h-[82vh] w-full max-w-[720px] flex-col overflow-hidden rounded-[var(--app-radius-lg)] border border-[var(--app-border)] bg-[var(--app-panel)] shadow-[var(--app-elevation-3)]"
        >
          <div className="flex items-center gap-2 border-b border-[var(--app-divider)] p-3">
            <div className="flex h-10 min-w-0 flex-1 items-center gap-2 rounded-md border border-[var(--app-border)] bg-[var(--app-input)] px-3">
              <SearchIcon className="h-4 w-4 shrink-0 text-[var(--app-muted)]" />
              <input
                ref={searchInputRef}
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                className="min-w-0 flex-1 bg-transparent text-sm font-medium text-[var(--app-text)] outline-none placeholder:text-[var(--app-muted)]"
                placeholder="搜索会话、项目、文件、内容"
              />
              {backendSearch.loading ? <Loader2Icon className="h-3.5 w-3.5 shrink-0 animate-spin text-[var(--app-muted)]" /> : null}
              {query ? (
                <button
                  type="button"
                  className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-[var(--app-muted)] hover:bg-[var(--app-hover)] hover:text-[var(--app-text)]"
                  title="清空搜索"
                  onClick={() => setQuery("")}
                >
                  <XIcon className="h-3.5 w-3.5" />
                </button>
              ) : null}
            </div>
            <button
              type="button"
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md text-[var(--app-muted)] hover:bg-[var(--app-hover)] hover:text-[var(--app-text)]"
              title="关闭搜索"
              onClick={onClose}
            >
              <XIcon className="h-4 w-4" />
            </button>
          </div>
          <div className="grid grid-cols-4 gap-1 border-b border-[var(--app-divider)] bg-[var(--app-panel-2)] p-2">
            {UTILITY_SEARCH_MODES.map((mode) => {
              const Icon = mode.icon
              const selected = searchMode === mode.id
              return (
                <button
                  key={mode.id}
                  type="button"
                  className={cn(
                    "flex h-8 min-w-0 items-center justify-center gap-1.5 rounded px-2 text-[12px] font-semibold transition-colors",
                    selected
                      ? "bg-[var(--app-panel)] text-[var(--app-text)] shadow-sm"
                      : "text-[var(--app-muted)] hover:text-[var(--app-text)]",
                  )}
                  title={mode.label}
                  onClick={() => setSearchMode(mode.id)}
                >
                  <Icon className="h-3.5 w-3.5 shrink-0" />
                  <span className="truncate">{mode.label}</span>
                </button>
              )
            })}
          </div>
          <div className="min-h-[220px] flex-1 space-y-3 overflow-y-auto px-3 py-3">
          {showLocal && filteredThreads.length > 0 ? (
            <div className="space-y-1">
              <SearchGroupHeader label="会话" count={filteredThreads.length} />
              {filteredThreads.map((thread) => (
                <button
                  key={thread.id}
                  type="button"
                  className={cn(
                    "flex h-9 w-full items-center gap-2 rounded-md px-2 text-left text-sm font-medium hover:bg-[var(--app-hover)]",
                    activeThreadId === thread.id ? "text-[var(--app-text)]" : "text-[var(--app-muted)] hover:text-[var(--app-text)]",
                  )}
                  onClick={() => {
                    onClose?.()
                    onThreadSelect(thread.id)
                  }}
                >
                  <MailIcon className="h-3.5 w-3.5 shrink-0 text-[var(--app-subtle)]" />
                  <span className="min-w-0 flex-1 truncate">{thread.title}</span>
                  <span className="shrink-0 truncate text-xs text-[var(--app-subtle)]">{thread.project}</span>
                </button>
              ))}
            </div>
          ) : null}

          {showLocal && filteredWorkspaces.length > 0 ? (
            <div className="space-y-1">
              <SearchGroupHeader label="项目" count={filteredWorkspaces.length} />
              {filteredWorkspaces.map((workspace) => (
                <button
                  key={workspace.id}
                  type="button"
                  className="flex h-9 w-full items-center gap-2 rounded-md px-2 text-left text-sm font-medium text-[var(--app-muted)] hover:bg-[var(--app-hover)] hover:text-[var(--app-text)]"
                  onClick={() => {
                    onClose?.()
                    onWorkspaceSelect(workspace)
                  }}
                >
                  <FolderIcon className="h-4 w-4 shrink-0 text-[var(--app-muted)]" />
                  <span className="min-w-0 flex-1 truncate">{workspace.name ?? getPathName(workspace.path)}</span>
                </button>
              ))}
            </div>
          ) : null}

          {showFiles && backendSearch.files.length > 0 ? (
            <div className="space-y-1">
              <SearchGroupHeader label="文件" count={backendSearch.files.length} />
              {backendSearch.files.map((path) => (
                <button
                  key={`file:${path}`}
                  type="button"
                  className="flex h-9 w-full items-center gap-2 rounded-md px-2 text-left text-sm font-medium text-[var(--app-muted)] hover:bg-[var(--app-hover)] hover:text-[var(--app-text)]"
                  onClick={() => {
                    onClose?.()
                    onOpenPath(resolveWorkspacePath(path, workspaceDirectory))
                  }}
                >
                  <FolderIcon className="h-4 w-4 shrink-0 text-[var(--app-subtle)]" />
                  <span className="min-w-0 flex-1 truncate">{displaySearchPath(path, workspaceDirectory)}</span>
                </button>
              ))}
            </div>
          ) : null}

          {showText && backendSearch.text.length > 0 ? (
            <div className="space-y-1">
              <SearchGroupHeader label="内容" count={backendSearch.text.length} />
              {backendSearch.text.map((match) => (
                <button
                  key={`text:${match.path}:${match.lineNumber}:${match.absoluteOffset}`}
                  type="button"
                  className="flex w-full min-w-0 flex-col gap-0.5 rounded-md px-2 py-2 text-left hover:bg-[var(--app-hover)]"
                  onClick={() => {
                    onClose?.()
                    onOpenPath(resolveWorkspacePath(match.path, workspaceDirectory))
                  }}
                >
                  <span className="flex w-full min-w-0 items-center gap-2 text-[13px] font-medium text-[var(--app-text)]">
                    <FileTextIcon className="h-3.5 w-3.5 shrink-0 text-[var(--app-subtle)]" />
                    <span className="min-w-0 flex-1 truncate">
                      {displaySearchPath(match.path, workspaceDirectory)}
                      {match.lineNumber ? `:${match.lineNumber}` : ""}
                    </span>
                  </span>
                  <span className="w-full truncate pl-5 text-[12px] font-medium text-[var(--app-muted)]">
                    {compactSearchLine(match.line)}
                  </span>
                </button>
              ))}
            </div>
          ) : null}

          {showSymbols && backendSearch.symbols.length > 0 ? (
            <div className="space-y-1">
              <SearchGroupHeader label="符号" count={backendSearch.symbols.length} />
              {backendSearch.symbols.map((symbol, index) => {
                const path = symbolUriPath(symbol)
                const displayPath = path ? displaySearchPath(path, workspaceDirectory) : ""
                return (
                  <button
                    key={`symbol:${symbol.name}:${path ?? index}:${symbol.line ?? ""}`}
                    type="button"
                    className="flex w-full min-w-0 flex-col gap-0.5 rounded-md px-2 py-2 text-left hover:bg-[var(--app-hover)] disabled:cursor-default disabled:opacity-70"
                    disabled={!path}
                    onClick={() => {
                      if (path) {
                        onClose?.()
                        onOpenPath(resolveWorkspacePath(path, workspaceDirectory))
                      }
                    }}
                  >
                    <span className="flex w-full min-w-0 items-center gap-2 text-[13px] font-medium text-[var(--app-text)]">
                      <HashIcon className="h-3.5 w-3.5 shrink-0 text-[var(--app-subtle)]" />
                      <span className="min-w-0 flex-1 truncate">{symbol.name}</span>
                    </span>
                    {displayPath ? (
                      <span className="w-full truncate pl-5 text-[12px] font-medium text-[var(--app-muted)]">
                        {displayPath}
                        {symbol.line ? `:${symbol.line}` : ""}
                      </span>
                    ) : null}
                  </button>
                )
              })}
            </div>
          ) : null}

          {backendSearch.loading ? <SearchStatusRow loading text="搜索中" /> : null}
          {backendSearch.error ? <SearchStatusRow text={backendSearch.error} /> : null}
          {showWorkspaceHint ? <SearchStatusRow text="先选择项目" /> : null}
          {workspaceDirectory && !canSearchBackend && searchMode !== "all" ? <SearchStatusRow text="输入至少 2 个字符" /> : null}
          {showEmpty ? <SearchStatusRow text="没有匹配结果" /> : null}
          </div>
        </section>
      </div>
    )
  }

  const panelCopy: Record<UtilityPanel, { title: string; rows: Array<{ title: string; detail: string }> }> = {
    search: { title: "搜索", rows: [] },
    skills: {
      title: "技能",
      rows: [
        { title: "代码开发", detail: "读取项目上下文并修改代码。" },
        { title: "设计文档", detail: "整理需求、架构和接口说明。" },
        { title: "测试补齐", detail: "为关键逻辑补充验证。" },
      ],
    },
    plugins: {
      title: "插件",
      rows: [
        { title: "Browser Use", detail: "用于本地页面查看和浏览器验证。" },
        { title: "本地工具", detail: "后续会接入 OpenCode 插件配置。" },
      ],
    },
    automation: {
      title: "自动化",
      rows: [
        { title: "后台任务", detail: "规划定时检查、构建和通知入口。" },
        { title: "任务唤醒", detail: "后续用于继续长任务。" },
      ],
    },
  }
  const copy = panelCopy[panel]

  return (
    <div className="border-y border-[var(--app-divider)] px-3 py-3">
      <div className="px-2 text-sm font-medium text-[var(--app-muted)]">{copy.title}</div>
      <div className="mt-2 space-y-1">
        {copy.rows.map((row) => (
          <div
            key={row.title}
            className="w-full rounded-md px-2 py-2 text-left"
          >
            <div className="text-sm font-medium text-[var(--app-text)]">{row.title}</div>
            <div className="mt-1 text-xs font-medium leading-5 text-[var(--app-muted)]">{row.detail}</div>
          </div>
        ))}
      </div>
    </div>
  )
}

type ProjectGroupProps = {
  name: string
  path?: string | null
  selected?: boolean
  active?: boolean
  expanded?: boolean
  activeThreadId?: string
  loading?: boolean
  removeBusy?: boolean
  deleteBusy?: boolean
  forkBusy?: boolean
  archiveBusy?: boolean
  createBusy?: boolean
  createDisabled?: boolean
  threads: SidebarThread[]
  onSelect?: () => void
  onToggleExpanded?: () => void
  onThreadSelect?: (id: string) => void
  onThreadRename?: (thread: SidebarThread) => void
  onThreadStateChange?: (thread: SidebarThread, patch: SessionUiFlags) => void
  onThreadArchive?: (thread: SidebarThread) => void
  onThreadForkLocal?: (thread: SidebarThread) => void
  onThreadDelete?: (thread: SidebarThread) => void
  onCreateThread?: () => void
  onRemove?: () => void
}

function ProjectContextMenuButton({
  icon: Icon,
  label,
  danger,
  disabled,
  loading,
  title,
  onClick,
}: {
  icon: IconComponent
  label: string
  danger?: boolean
  disabled?: boolean
  loading?: boolean
  title?: string
  onClick?: () => void
}) {
  return (
    <button
      type="button"
      className={cn(
        "flex h-8 w-full items-center gap-2 rounded-md px-2 text-left text-[13px] font-medium transition-colors disabled:opacity-50",
        danger
          ? "text-[var(--app-danger)] hover:bg-[var(--app-danger-soft)]"
          : "text-[var(--app-text)] hover:bg-[var(--app-hover)]",
      )}
      disabled={disabled}
      title={title}
      onClick={onClick}
    >
      {loading ? <Loader2Icon className="h-4 w-4 shrink-0 animate-spin" /> : <Icon className="h-4 w-4 shrink-0" />}
      <span className="min-w-0 flex-1 truncate">{label}</span>
    </button>
  )
}

function ProjectOrganizeMenu({
  sortMode,
  allExpanded,
  hasExpanded,
  canRestore,
  onSortModeChange,
  onExpandAll,
  onCollapseAll,
  onRestorePrevious,
  onRefresh,
  onClose,
}: {
  sortMode: ProjectSortMode
  allExpanded: boolean
  hasExpanded: boolean
  canRestore: boolean
  onSortModeChange: (mode: ProjectSortMode) => void
  onExpandAll: () => void
  onCollapseAll: () => void
  onRestorePrevious: () => void
  onRefresh: () => void
  onClose: () => void
}) {
  function run(action: () => void) {
    action()
    onClose()
  }

  return (
    <div
      className="absolute right-0 top-8 z-[70] w-[224px] max-w-[calc(100vw-24px)] overflow-hidden rounded-[var(--app-radius-md)] border border-[var(--app-border)] bg-[var(--app-panel)] p-1.5 shadow-[var(--app-elevation-3)]"
      data-no-window-drag
    >
      <div className="px-2 py-1 text-[11px] font-semibold text-[var(--app-subtle)]">整理</div>
      <ProjectOrganizeMenuItem
        icon={Clock3Icon}
        label="最近项目"
        checked={sortMode === "recent"}
        onClick={() => run(() => onSortModeChange("recent"))}
      />
      <ProjectOrganizeMenuItem
        icon={FolderIcon}
        label="按项目名"
        checked={sortMode === "name"}
        onClick={() => run(() => onSortModeChange("name"))}
      />
      <div className="my-1 h-px bg-[var(--app-divider)]" />
      <ProjectOrganizeMenuItem
        icon={FolderOpenIcon}
        label="全部展开"
        disabled={allExpanded}
        onClick={() => run(onExpandAll)}
      />
      <ProjectOrganizeMenuItem
        icon={FolderIcon}
        label="全部收起"
        disabled={!hasExpanded}
        onClick={() => run(onCollapseAll)}
      />
      <ProjectOrganizeMenuItem
        icon={Clock3Icon}
        label="恢复之前展开的分组"
        disabled={!canRestore}
        onClick={() => run(onRestorePrevious)}
      />
      <div className="my-1 h-px bg-[var(--app-divider)]" />
      <ProjectOrganizeMenuItem
        icon={SlidersHorizontalIcon}
        label="刷新项目会话"
        onClick={() => run(onRefresh)}
      />
    </div>
  )
}

function ProjectOrganizeMenuItem({
  icon: Icon,
  label,
  checked,
  disabled,
  onClick,
}: {
  icon: IconComponent
  label: string
  checked?: boolean
  disabled?: boolean
  onClick?: () => void
}) {
  return (
    <button
      type="button"
      className="flex h-7 w-full items-center gap-2 rounded px-2 text-left text-[12px] font-medium text-[var(--app-text)] transition-colors hover:bg-[var(--app-hover)] disabled:opacity-45 disabled:hover:bg-transparent"
      disabled={disabled}
      onClick={onClick}
    >
      <Icon className="h-3.5 w-3.5 shrink-0 text-[var(--app-muted)]" />
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {checked ? <CheckIcon className="h-3.5 w-3.5 shrink-0 text-[var(--app-text)]" /> : null}
    </button>
  )
}

function ProjectGroup({
  name,
  path,
  selected,
  active,
  expanded,
  activeThreadId,
  loading,
  removeBusy,
  deleteBusy,
  forkBusy,
  archiveBusy,
  createBusy,
  createDisabled,
  threads,
  onSelect,
  onToggleExpanded,
  onThreadSelect,
  onThreadRename,
  onThreadStateChange,
  onThreadArchive,
  onThreadForkLocal,
  onThreadDelete,
  onCreateThread,
  onRemove,
}: ProjectGroupProps) {
  const visibleThreads = useMemo(
    () =>
      [...threads]
        .sort((left, right) => {
          if (left.pinned !== right.pinned) return left.pinned ? -1 : 1
          if (left.archived !== right.archived) return left.archived ? 1 : -1
          return 0
        })
        .slice(0, 12),
    [threads],
  )
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null)

  useEffect(() => {
    if (!contextMenu) return
    const close = () => setContextMenu(null)
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") close()
    }
    window.addEventListener("click", close)
    window.addEventListener("resize", close)
    window.addEventListener("scroll", close, true)
    window.addEventListener("keydown", closeOnEscape)
    return () => {
      window.removeEventListener("click", close)
      window.removeEventListener("resize", close)
      window.removeEventListener("scroll", close, true)
      window.removeEventListener("keydown", closeOnEscape)
    }
  }, [contextMenu])

  function openContextMenu(event: ReactMouseEvent<HTMLDivElement>) {
    event.preventDefault()
    setContextMenu({ x: event.clientX, y: event.clientY })
  }

  function runContextAction(action?: () => void) {
    setContextMenu(null)
    action?.()
  }

  const menuLeft =
    contextMenu && typeof window !== "undefined"
      ? Math.min(contextMenu.x, window.innerWidth - 204)
      : contextMenu?.x
  const menuTop =
    contextMenu && typeof window !== "undefined"
      ? Math.min(contextMenu.y, window.innerHeight - 136)
      : contextMenu?.y

  return (
    <section className="group/project">
      <div
        className={cn(
          "flex h-8 items-center gap-1 rounded-[var(--app-radius-sm)] px-1 text-[13px] font-medium text-[var(--app-text)] transition-colors",
        )}
        onContextMenu={openContextMenu}
      >
        <button
          type="button"
          className="flex h-6 w-5 shrink-0 items-center justify-center rounded-[var(--app-radius-sm)] text-[var(--app-subtle)] transition-colors hover:text-[var(--app-text)]"
          onClick={onToggleExpanded}
          title={expanded ? "折叠项目" : "展开项目"}
        >
          <ChevronRightIcon className={cn("h-3 w-3 transition-transform duration-150", expanded && "rotate-90")} />
        </button>
        <button
          type="button"
          className={cn(
            "inline-flex max-w-[calc(100%-72px)] min-w-0 items-center gap-2 rounded-[var(--app-radius-sm)] px-1 py-1 text-left transition-colors hover:bg-[var(--app-hover)]",
            selected && "bg-[var(--app-selected)]",
          )}
          onClick={onSelect}
          title={path ?? name}
        >
          <FolderIcon className={cn("h-4 w-4 shrink-0", active ? "text-[var(--app-accent)]" : "text-[var(--app-muted)]")} />
          <span className="truncate">{name}</span>
        </button>
        <div className="min-w-0 flex-1" />
        {loading ? <Loader2Icon className="h-3.5 w-3.5 animate-spin text-[var(--app-accent)]" /> : null}
        {onCreateThread ? (
          <div
            className={cn(
              "flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity duration-150 group-hover/project:opacity-100 group-focus-within/project:opacity-100",
              createBusy && "opacity-100",
            )}
          >
            <button
              type="button"
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[var(--app-radius-sm)] text-[var(--app-muted)] transition-colors hover:bg-[var(--app-hover)] hover:text-[var(--app-text)] disabled:opacity-50"
              title="在此项目新建会话"
              onClick={onCreateThread}
              disabled={createBusy || createDisabled}
            >
              {createBusy ? <Loader2Icon className="h-3.5 w-3.5 animate-spin" /> : <Edit3Icon className="h-4 w-4" />}
            </button>
          </div>
        ) : null}
      </div>
      {contextMenu ? (
        <div
          className="fixed z-[80] w-48 overflow-hidden rounded-[var(--app-radius-md)] border border-[var(--app-border)] bg-[var(--app-panel)] p-1.5 text-sm shadow-[var(--app-elevation-3)]"
          style={{ left: menuLeft, top: menuTop }}
          data-no-window-drag
          onClick={(event) => event.stopPropagation()}
          onContextMenu={(event) => event.preventDefault()}
        >
          {onCreateThread ? (
            <ProjectContextMenuButton
              icon={Edit3Icon}
              label="新建对话"
              disabled={createBusy || createDisabled}
              loading={createBusy}
              onClick={() => runContextAction(onCreateThread)}
            />
          ) : null}
          <ProjectContextMenuButton
            icon={ChevronRightIcon}
            label={expanded ? "折叠项目" : "展开项目"}
            onClick={() => runContextAction(onToggleExpanded)}
          />
          {onRemove ? (
            <>
              <div className="my-1 h-px bg-[var(--app-divider)]" />
              <ProjectContextMenuButton
                icon={XIcon}
                label="从列表移除"
                danger
                disabled={removeBusy}
                loading={removeBusy}
                title="仅从项目列表移除，不删除本地文件"
                onClick={() => runContextAction(onRemove)}
              />
            </>
          ) : null}
        </div>
      ) : null}
      {visibleThreads.length ? (
        expanded ? (
        <div className="mt-0.5 space-y-0.5 pl-7 pr-1">
          {visibleThreads.map((thread) => {
            const threadId = thread.id
            const selected = active && threadId === activeThreadId

            return (
              <SessionRow
                key={thread.id ?? thread.title}
                thread={thread}
                projectPath={path}
                selected={selected}
                deleteBusy={deleteBusy}
                forkBusy={forkBusy}
                archiveBusy={archiveBusy}
                onSelect={threadId ? () => onThreadSelect?.(threadId) : undefined}
                onRename={onThreadRename}
                onStateChange={onThreadStateChange}
                onArchive={onThreadArchive}
                onForkLocal={onThreadForkLocal}
                onDelete={onThreadDelete}
              />
            )
          })}
        </div>
        ) : null
      ) : expanded ? (
        <div className="mt-1 pl-7 pr-1 text-[11px] font-medium leading-6 text-[var(--app-subtle)]">
          {loading ? "加载中..." : "暂无历史任务"}
        </div>
      ) : null}
    </section>
  )
}
