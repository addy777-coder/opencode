import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ClipboardEvent,
  type ComponentType,
  type DragEvent,
  type KeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
  type SVGProps,
} from "react"
import {
  AlertCircle,
  Archive,
  ArrowUp,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Circle,
  Clipboard,
  Copy,
  EyeOff,
  FileDiff,
  FileText,
  FolderOpen,
  GitBranch,
  Globe2,
  Image,
  ListChecks,
  ListPlus,
  Loader2,
  MoreHorizontal,
  PanelRight,
  Paperclip,
  Pencil,
  Pin,
  Plus,
  RefreshCw,
  Search,
  Send,
  ShieldCheck,
  Square,
  Star,
  TerminalSquare,
  Trash2,
  WrapText,
  Wrench,
  X,
  XCircle,
} from "lucide-react"
import { ScrollArea } from "@/components/ui/scroll-area"
import { parsePromptTrigger, type PromptTrigger } from "@/features/prompt/triggers"
import { TerminalWorkspace } from "@/features/terminal/terminal-workspace"
import { shouldShowStandaloneThreadDiffSummary } from "@/features/thread/thread-diff-summary"
import { preparePromptSubmission, type PromptSubmissionAttachment } from "@/features/thread/thread-submission"
import { buildThreadTimelineItems, type ThreadTimelineItem } from "@/features/thread/thread-timeline"
import {
  fallbackProgressStepsFromActivities,
  generatedResultsFromDiffs,
  sourceSummariesFromActivities,
  type ProgressGeneratedResult,
  type ProgressSourceSummary,
  type ProgressSummaryStatus,
  type ProgressSummaryStep,
} from "@/features/thread/thread-progress-summary"
import { MessageMarkdown, type LocalFileLinkPosition } from "@/features/thread/markdown"
import { fileSearch, openPath, openUrl, readFilePreview, workspaceFileDiffs } from "@/lib/tauri"
import { useOutsideClick } from "@/lib/use-outside-click"
import { QuestionPrompt } from "@/features/thread/question-prompt"
import type {
  LocalFilePreview,
  OpenCodeAgent,
  OpenCodeCommand,
  OpenCodeMessage,
  OpenCodeModel,
  OpenPathTarget,
  PermissionInfo,
  QuestionInfo,
  GitStatus,
  ServerStatus,
  SessionDiffFile,
  ThreadActivityItem,
  WorkspaceRecord,
} from "@/lib/tauri"
import { cn } from "@/lib/utils"

type IconComponent = ComponentType<SVGProps<SVGSVGElement>>

const AlertCircleIcon = AlertCircle as IconComponent
const ArchiveIcon = Archive as IconComponent
const ArrowUpIcon = ArrowUp as IconComponent
const CheckCircle2Icon = CheckCircle2 as IconComponent
const ChevronDownIcon = ChevronDown as IconComponent
const ChevronRightIcon = ChevronRight as IconComponent
const CircleIcon = Circle as IconComponent
const ClipboardIcon = Clipboard as IconComponent
const CopyIcon = Copy as IconComponent
const EyeOffIcon = EyeOff as IconComponent
const FileDiffIcon = FileDiff as IconComponent
const FileTextIcon = FileText as IconComponent
const FolderOpenIcon = FolderOpen as IconComponent
const GitBranchIcon = GitBranch as IconComponent
const GlobeIcon = Globe2 as IconComponent
const ImageIcon = Image as IconComponent
const ListChecksIcon = ListChecks as IconComponent
const ListPlusIcon = ListPlus as IconComponent
const Loader2Icon = Loader2 as IconComponent
const MoreHorizontalIcon = MoreHorizontal as IconComponent
const PanelRightIcon = PanelRight as IconComponent
const PaperclipIcon = Paperclip as IconComponent
const PencilIcon = Pencil as IconComponent
const PinIcon = Pin as IconComponent
const PlusIcon = Plus as IconComponent
const RefreshCwIcon = RefreshCw as IconComponent
const SearchIcon = Search as IconComponent
const SendIcon = Send as IconComponent
const ShieldCheckIcon = ShieldCheck as IconComponent
const SquareIcon = Square as IconComponent
const StarIcon = Star as IconComponent
const TerminalSquareIcon = TerminalSquare as IconComponent
const Trash2Icon = Trash2 as IconComponent
const WrapTextIcon = WrapText as IconComponent
const WrenchIcon = Wrench as IconComponent
const XIcon = X as IconComponent
const XCircleIcon = XCircle as IconComponent

export type ThreadSummary = {
  id: string
  title: string
  project: string
  directory?: string | null
  status: "idle" | "running" | "waiting" | "failed" | "completed" | string
  changed: number
  local?: boolean
}

export type PromptAttachment = PromptSubmissionAttachment

type Props = {
  thread?: ThreadSummary
  server?: ServerStatus
  workspace?: WorkspaceRecord | null
  activities?: ThreadActivityItem[]
  messages?: OpenCodeMessage[]
  diffs?: SessionDiffFile[]
  permissions?: PermissionInfo[]
  questions?: QuestionInfo[]
  agents?: OpenCodeAgent[]
  models?: OpenCodeModel[]
  commands?: OpenCodeCommand[]
  workspaces?: WorkspaceRecord[]
  selectedAgent?: OpenCodeAgent | null
  selectedModel?: OpenCodeModel | null
  modelProviderName?: string | null
  favoriteModelKeys?: string[]
  hiddenModelKeys?: string[]
  streamingPartText?: Record<string, string>
  gitStatus?: GitStatus | null
  gitLoading?: boolean
  gitAutoDetect?: boolean
  isBusy?: boolean
  isRunning?: boolean
  messagesLoading?: boolean
  diffsLoading?: boolean
  optionsLoading?: boolean
  workspaceSelecting?: boolean
  permissionLabel?: string
  permissionMode?: string
  permissionOptions?: PermissionComposerOption[]
  error?: unknown
  composerDraftKey?: string | null
  composerDraft?: string
  onComposerDraftChange?: (value: string) => void
  onSend: (text: string, attachments: PromptAttachment[]) => Promise<unknown>
  onAbort: () => Promise<unknown>
  onPickWorkspace?: () => void
  onWorkspaceSelect?: (workspace: WorkspaceRecord) => void
  onOpenWorkspace?: () => void
  onDeleteThread?: () => Promise<unknown>
  onDeleteMessage?: (message: OpenCodeMessage) => Promise<unknown>
  onForkMessage?: (message: OpenCodeMessage, text?: string, boundaryMessageId?: string | null) => Promise<unknown>
  onAgentChange: (agent: string) => void
  onModelChange: (model: OpenCodeModel) => void
  onModelFavoriteToggle?: (model: OpenCodeModel) => void
  onModelVisibilityToggle?: (model: OpenCodeModel) => void
  onPermissionModeChange: (mode: string) => void
  onPermissionReply: (
    permission: PermissionInfo,
    reply: "once" | "always" | "reject",
    message?: string,
  ) => Promise<unknown>
  onQuestionReply?: (question: QuestionInfo, answers: string[][]) => Promise<unknown>
  onQuestionReject?: (question: QuestionInfo) => Promise<unknown>
}

type PermissionComposerOption = {
  id: string
  label: string
  description: string
  tone?: "normal" | "warning" | "danger"
}

type TriggerInfo = PromptTrigger

type SuggestionItem = {
  key: string
  primary: string
  secondary?: string
  group?: string
}

type PendingGuide = {
  id: string
  text: string
  attachments: PromptAttachment[]
  createdAt: number
  status: "staged" | "sending" | "submitted" | "failed"
  error?: string
}

type MessagePart = OpenCodeMessage["parts"][number]

type AssistantFlowItem =
  | { type: "text"; text: string }
  | { type: "parts"; parts: MessagePart[] }

type RunBlockGroup = {
  parts: MessagePart[]
  running: boolean
  message: OpenCodeMessage
}

type ProgressItem = ThreadActivityItem & {
  commandLike?: boolean
}

type TodoStep = {
  id: string
  content: string
  status: string
  priority?: string
}

type AssistantFileChangeNotice = {
  file: string
  line?: number | null
  before?: string | null
  after?: string | null
  trailingText?: string | null
}

type LocalFileMenuState = {
  path: string
  x: number
  y: number
}

type SidePanelState =
  | { type: "empty" }
  | { type: "file"; path: string }
  | { type: "browser"; url: string }
  | { type: "diff"; diff: SessionDiffFile }
  | { type: "review"; diffs: SessionDiffFile[]; selectedFile?: string | null }
  | { type: "live-terminal" }
  | { type: "terminal"; title: string; content: string; subtitle?: string }

type TokenUsage = {
  total?: number | null
  input?: number | null
  output?: number | null
  reasoning?: number | null
  cacheRead?: number | null
  cacheWrite?: number | null
  inputExcludesCache?: boolean
}

type ContextUsageInfo = {
  used: number | null
  limit: number | null
  percent: number | null
  usableLimit: number | null
  usablePercent: number | null
}

const statusText: Record<string, string> = {
  success: "已处理",
  running: "正在运行",
  waiting: "等待中",
  failed: "失败",
  warning: "注意",
  pending: "待处理",
}

const MAX_ATTACHMENT_BYTES = 20 * 1024 * 1024
const MAX_ATTACHMENTS = 12
const DEFAULT_COMPACTION_BUFFER = 20_000
const DEFAULT_TEXT_COLLAPSE_LIMIT = 4_000
const CODE_TEXT_COLLAPSE_LIMIT = 8_000
const ATTACHMENT_ACCEPT =
  "image/*,.txt,.md,.markdown,.json,.jsonl,.yaml,.yml,.toml,.csv,.xml,.html,.css,.js,.jsx,.ts,.tsx,.py,.rs,.go,.java,.kt,.c,.cpp,.h,.hpp,.cs,.php,.rb,.sh,.ps1,.sql,.log,.pdf"

function parseTrigger(text: string, caret: number): TriggerInfo | null {
  let index = caret - 1
  while (index >= 0) {
    const char = text[index]
    if (char === "@" || char === "/") {
      const prev = index > 0 ? text[index - 1] : "\n"
      if (index === 0 || prev === " " || prev === "\n" || prev === "\t") {
        return {
          kind: char,
          start: index,
          query: text.slice(index + 1, caret),
        }
      }
      return null
    }
    if (char === " " || char === "\n" || char === "\t") return null
    index--
  }
  return null
}

function getPathName(path?: string | null) {
  if (!path) return "未选择项目"
  return path.split(/[\\/]/).filter(Boolean).at(-1) ?? path
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : error ? String(error) : null
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null
}

function stringValue(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null
}

function finiteNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) return parsed
  }
  return null
}

function positiveNumber(value: unknown): number | null {
  const number = finiteNumber(value)
  return number && number > 0 ? number : null
}

function numberField(record: Record<string, unknown> | null, keys: string[]) {
  if (!record) return null
  for (const key of keys) {
    const value = finiteNumber(record[key])
    if (value !== null) return value
  }
  return null
}

function tokenUsageFromOpenCodeTokens(value: unknown): TokenUsage | null {
  const record = asRecord(value)
  if (!record) return null
  const cache = asRecord(record.cache)
  const usage: TokenUsage = {
    total: numberField(record, ["total", "totalTokens", "total_tokens"]),
    input: numberField(record, ["input", "inputTokens", "input_tokens"]),
    output: numberField(record, ["output", "outputTokens", "output_tokens"]),
    reasoning: numberField(record, ["reasoning", "reasoningTokens", "reasoning_tokens"]),
    cacheRead:
      numberField(cache, ["read", "cacheRead", "cacheReadTokens", "cache_read_tokens"]) ??
      numberField(record, ["cacheRead", "cacheReadTokens", "cacheReadInputTokens", "cachedInputTokens"]),
    cacheWrite:
      numberField(cache, ["write", "cacheWrite", "cacheWriteTokens", "cache_write_tokens"]) ??
      numberField(record, ["cacheWrite", "cacheWriteTokens", "cacheWriteInputTokens"]),
    inputExcludesCache: Boolean(cache),
  }
  return hasTokenUsage(usage) ? usage : null
}

function tokenUsageFromProviderUsage(value: unknown): TokenUsage | null {
  const record = asRecord(value)
  if (!record) return null
  const inputDetails =
    asRecord(record.inputTokenDetails) ??
    asRecord(record.input_token_details) ??
    asRecord(record.prompt_tokens_details) ??
    asRecord(record.promptTokensDetails)
  const outputDetails =
    asRecord(record.outputTokenDetails) ??
    asRecord(record.output_token_details) ??
    asRecord(record.completion_tokens_details) ??
    asRecord(record.completionTokensDetails)
  const usage: TokenUsage = {
    total: numberField(record, ["total", "totalTokens", "total_tokens"]),
    input: numberField(record, ["input", "inputTokens", "input_tokens", "promptTokens", "prompt_tokens"]),
    output: numberField(record, ["output", "outputTokens", "output_tokens", "completionTokens", "completion_tokens"]),
    reasoning:
      numberField(record, ["reasoning", "reasoningTokens", "reasoning_tokens"]) ??
      numberField(outputDetails, ["reasoningTokens", "reasoning_tokens"]),
    cacheRead:
      numberField(inputDetails, ["cacheReadTokens", "cache_read_tokens", "cachedTokens", "cached_tokens"]) ??
      numberField(record, ["cacheRead", "cacheReadTokens", "cachedInputTokens", "cached_tokens"]),
    cacheWrite:
      numberField(inputDetails, ["cacheWriteTokens", "cache_write_tokens"]) ??
      numberField(record, ["cacheWrite", "cacheWriteTokens", "cacheCreationInputTokens"]),
    inputExcludesCache: false,
  }
  return hasTokenUsage(usage) ? usage : null
}

function hasTokenUsage(usage: TokenUsage) {
  return [usage.total, usage.input, usage.output, usage.reasoning, usage.cacheRead, usage.cacheWrite].some(
    (value) => value !== null && value !== undefined,
  )
}

function contextTokenCount(usage: TokenUsage | null) {
  if (!usage) return null
  const total = positiveNumber(usage.total)
  if (total) return total
  const input = finiteNumber(usage.input) ?? 0
  const output = finiteNumber(usage.output) ?? 0
  const cache = usage.inputExcludesCache ? (finiteNumber(usage.cacheRead) ?? 0) + (finiteNumber(usage.cacheWrite) ?? 0) : 0
  const count = input + output + cache
  return count > 0 ? count : null
}

function collectTokenUsages(value: unknown, seen = new WeakSet<object>(), depth = 0): TokenUsage[] {
  if (!value || depth > 8) return []
  if (typeof value !== "object") return []
  if (seen.has(value)) return []
  seen.add(value)

  if (Array.isArray(value)) {
    return value.flatMap((item) => collectTokenUsages(item, seen, depth + 1))
  }

  const record = value as Record<string, unknown>
  const usages = [
    tokenUsageFromOpenCodeTokens(record.tokens),
    tokenUsageFromProviderUsage(record.usage),
    tokenUsageFromOpenCodeTokens(record),
    tokenUsageFromProviderUsage(record),
  ].filter((item): item is TokenUsage => Boolean(item))

  for (const child of Object.values(record)) {
    if (child && typeof child === "object") usages.push(...collectTokenUsages(child, seen, depth + 1))
  }

  return usages
}

function extractTokenUsage(message: OpenCodeMessage): TokenUsage | null {
  const candidates = collectTokenUsages(message.raw)
  if (!candidates.length) return null
  return candidates.reduce((best, current) => {
    const bestCount = contextTokenCount(best) ?? -1
    const currentCount = contextTokenCount(current) ?? -1
    return currentCount > bestCount ? current : best
  })
}

function modelContextLimit(model?: OpenCodeModel | null) {
  if (!model) return null
  const raw = asRecord(model.raw)
  const limit = asRecord(raw?.limit)
  return positiveNumber(model.context) ?? positiveNumber(limit?.context) ?? positiveNumber(model.input)
}

function modelInputLimit(model?: OpenCodeModel | null) {
  if (!model) return null
  const raw = asRecord(model.raw)
  const limit = asRecord(raw?.limit)
  return positiveNumber(model.input) ?? positiveNumber(limit?.input)
}

function modelOutputLimit(model?: OpenCodeModel | null) {
  if (!model) return null
  const raw = asRecord(model.raw)
  const limit = asRecord(raw?.limit)
  return positiveNumber(model.output) ?? positiveNumber(limit?.output)
}

function modelCompactionUsableLimit(model?: OpenCodeModel | null) {
  const context = modelContextLimit(model)
  if (!context) return null
  const input = modelInputLimit(model)
  const output = modelOutputLimit(model)
  const reserved = Math.min(DEFAULT_COMPACTION_BUFFER, output ?? DEFAULT_COMPACTION_BUFFER)

  if (input) return Math.max(0, input - reserved)
  if (output) return Math.max(0, context - output)
  return context
}

function messageModelIds(message: OpenCodeMessage) {
  const raw = asRecord(message.raw)
  const info = asRecord(raw?.info) ?? raw
  const model = asRecord(info?.model)
  return {
    modelId:
      stringValue(message.model) ??
      stringValue(info?.modelID) ??
      stringValue(model?.modelID) ??
      stringValue(model?.id),
    providerId: stringValue(info?.providerID) ?? stringValue(model?.providerID),
  }
}

function matchingModelForMessage(models: OpenCodeModel[], message: OpenCodeMessage | null) {
  if (!message) return null
  const ids = messageModelIds(message)
  if (!ids.modelId) return null
  return (
    models.find(
      (model) =>
        model.id === ids.modelId &&
        (!ids.providerId || model.providerId === ids.providerId),
    ) ??
    models.find((model) => model.id === ids.modelId) ??
    null
  )
}

function buildContextUsage(
  messages: OpenCodeMessage[],
  selectedModel: OpenCodeModel | null | undefined,
  models: OpenCodeModel[],
): ContextUsageInfo {
  let usageMessage: OpenCodeMessage | null = null
  let usage: TokenUsage | null = null
  let used: number | null = null

  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index]
    if (!message || message.role !== "assistant") continue
    const candidate = extractTokenUsage(message)
    const count = contextTokenCount(candidate)
    if (!candidate) continue
    if (!usage || (count ?? 0) > (used ?? 0)) {
      usageMessage = message
      usage = candidate
      used = count
    }
    if (count && count > 0) break
  }

  const limit =
    modelContextLimit(selectedModel) ??
    modelContextLimit(matchingModelForMessage(models, usageMessage))
  const usageModel = selectedModel ?? matchingModelForMessage(models, usageMessage)
  const usableLimit = modelCompactionUsableLimit(usageModel)
  const percent =
    used !== null && limit
      ? Math.max(0, Math.min(100, Math.round((used / limit) * 100)))
      : null
  const usablePercent =
    used !== null && usableLimit
      ? Math.max(0, Math.min(100, Math.round((used / usableLimit) * 100)))
      : null

  return { used, limit, percent, usableLimit, usablePercent }
}

/** Wall-clock time of day, e.g. "17:11". Returns null when input is missing. */
function formatClockTime(value?: number | null) {
  if (!value) return null
  const timestamp = value < 10_000_000_000 ? value * 1000 : value
  const date = new Date(timestamp)
  return `${date.getHours().toString().padStart(2, "0")}:${date.getMinutes().toString().padStart(2, "0")}`
}

function timestampMs(value?: number | null) {
  if (!value) return 0
  return value < 10_000_000_000 ? value * 1000 : value
}

function formatElapsed(activity: ThreadActivityItem, index: number) {
  if (!activity.createdAt) return index === 0 ? "刚刚" : "已处理"
  const diff = Math.max(0, Date.now() - activity.createdAt)
  const seconds = Math.max(1, Math.round(diff / 1000))
  if (seconds < 60) return `${seconds}s`
  const minutes = Math.round(seconds / 60)
  return `${minutes}m`
}

/**
 * Render a duration like 950 → "1s", 80_000 → "1m 20s", 3_600_000 → "1h".
 * Returns null for non-positive values so callers can skip rendering.
 */
function formatDuration(ms: number | null | undefined): string | null {
  if (!ms || ms <= 0) return null
  const totalSeconds = Math.max(1, Math.round(ms / 1000))
  if (totalSeconds < 60) return `${totalSeconds}s`
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  if (minutes < 60) return seconds > 0 ? `${minutes}m ${seconds}s` : `${minutes}m`
  const hours = Math.floor(minutes / 60)
  const mins = minutes % 60
  return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`
}

function activityIcon(activity: ThreadActivityItem): IconComponent {
  if (activity.kind === "command") return TerminalSquareIcon
  if (activity.kind === "tool") return WrenchIcon
  if (activity.kind === "file_edit") return FileDiffIcon
  if (activity.kind === "approval") return ShieldCheckIcon
  if (activity.status === "running") return Loader2Icon
  if (activity.status === "failed") return XCircleIcon
  return CheckCircle2Icon
}

function permissionDetail(permission: PermissionInfo) {
  const patterns = permission.patterns.filter(Boolean).join(", ")
  if (!patterns) return permission.permission
  return `${permission.permission}: ${patterns}`
}

function metadataSummary(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, item]) => item !== null && item !== undefined)
    .slice(0, 3)
  if (!entries.length) return null
  return entries.map(([key, item]) => `${key}: ${String(item)}`).join("  ")
}

function trimText(text: string, limit = 4_000) {
  if (text.length <= limit) return text
  return `${text.slice(0, limit)}...`
}

function shouldCollapseText(text: string, limit = DEFAULT_TEXT_COLLAPSE_LIMIT) {
  return text.length > limit
}

function collapsedPreview(text: string, expanded: boolean, limit = DEFAULT_TEXT_COLLAPSE_LIMIT) {
  if (expanded || !shouldCollapseText(text, limit)) return text
  return `${text.slice(0, limit)}...`
}

function compactText(text: string, limit = 140) {
  const value = text.replace(/\s+/g, " ").trim()
  if (value.length <= limit) return value
  return `${value.slice(0, limit)}...`
}

function stripMarkdownFence(value: string) {
  return value.replace(/^```[^\n]*\n?/, "").replace(/\n?```$/, "").trim()
}

function extractCodeFences(text: string) {
  const fences: Array<{ start: number; end: number; content: string }> = []
  const pattern = /```[^\n]*\n([\s\S]*?)```/g
  let match: RegExpExecArray | null
  while ((match = pattern.exec(text))) {
    fences.push({
      start: match.index,
      end: match.index + match[0].length,
      content: stripMarkdownFence(match[0]),
    })
  }
  return fences
}

function cleanChangedFileToken(value: string) {
  return value
    .trim()
    .replace(/^["'`]+|["'`]+$/g, "")
    .replace(/[，。；;:：]+$/g, "")
}

function parseAssistantFileChangeNotice(text: string): AssistantFileChangeNotice | null {
  const fileMatch =
    text.match(/(?:已处理|修改文件|更新文件|修改了|更新了)\s*[:：]?\s*([^\s，。；：:]+?\.[\w-]+)(?::(\d+))?/i) ??
    text.match(/([^\s，。；：:]+?\.[\w-]+):(\d+)\s*(?:已|仍|被|修改|更新)/i)
  const file = fileMatch ? cleanChangedFileToken(fileMatch[1]) : null
  if (!file) return null
  if (!/(?:修改为|改为|现为|原文|现在|已处理|修改文件|更新文件)/.test(text)) return null

  const fences = extractCodeFences(text)
  const originalIndex = text.search(/(?:原文|原始|之前|修改前)[:：]/)
  const currentIndex = text.search(/(?:修改为|改为|现为|现在|修改后)[:：]/)
  const before =
    originalIndex >= 0
      ? fences.find((fence) => fence.start > originalIndex && (currentIndex < 0 || fence.start < currentIndex))?.content ?? null
      : null
  const after =
    currentIndex >= 0
      ? fences.find((fence) => fence.start > currentIndex)?.content ?? fences[0]?.content ?? null
      : fences.length > 1
        ? fences[1]?.content ?? null
        : fences[0]?.content ?? null
  const lastFence = fences.at(-1)
  const trailingText = (lastFence ? text.slice(lastFence.end) : text.slice(fileMatch?.index ?? 0))
    .replace(/^(?:\s*[。.\n\r])+/g, "")
    .trim()

  return {
    file,
    line: fileMatch?.[2] ? Number(fileMatch[2]) : null,
    before,
    after,
    trailingText: trailingText && trailingText !== text.trim() ? trailingText : null,
  }
}

function guideSummary(guide: PendingGuide) {
  if (guide.text.trim()) return compactText(guide.text)
  if (guide.attachments.length) return `已添加 ${guide.attachments.length} 个附件`
  return "空引导"
}

function guideCopyText(guide: PendingGuide) {
  const text = guide.text.trim()
  const files = guide.attachments.map((attachment) => attachment.name).join(", ")
  return [text || guideSummary(guide), files ? `附件：${files}` : ""].filter(Boolean).join("\n")
}

function normalizeMessageText(text: string) {
  return text.replace(/\s+/g, " ").trim()
}

function messageLabel(role: string) {
  if (role === "user") return "用户"
  if (role === "assistant") return "助手"
  return role
}

function isRunnablePart(part: MessagePart) {
  if (part.kind === "compaction" || part.kind === "step-start" || part.kind === "step-finish") return false
  if (part.kind === "text" || part.kind === "reasoning") return false
  if (part.kind === "unknown" && !part.title && !part.tool && !part.file && !part.text) return false
  return true
}

type MessageImageAttachment = {
  key: string
  url: string
  mime: string
  name: string
}

// Pull image attachments out of a user message's parts so we can render them
// as inline thumbnails. The server echoes back uploaded files as parts with
// kind "file" + raw.mime/raw.url, but the user bubble only renders text by
// default; without this, every uploaded image disappears once the optimistic
// message is replaced by the server payload.
function messageImageAttachments(message: OpenCodeMessage): MessageImageAttachment[] {
  const out: MessageImageAttachment[] = []
  message.parts.forEach((part, index) => {
    if (part.kind !== "file") return
    const raw = asRecord(part.raw)
    const mime = stringValue(raw?.mime) ?? ""
    const url = stringValue(raw?.url) ?? stringValue(part.file) ?? ""
    if (!mime.startsWith("image/") || !url) return
    const name = stringValue(raw?.filename) ?? stringValue(part.file) ?? "image"
    out.push({
      key: part.id ?? `${message.id}-image-${index}`,
      url,
      mime,
      name,
    })
  })
  return out
}

function messagePartsFromAttachments(messageId: string, attachments: PromptAttachment[]): MessagePart[] {
  return attachments.map((attachment, index) => ({
    id: `${messageId}-file-${index}`,
    kind: "file",
    file: attachment.name,
    title: attachment.name,
    raw: {
      type: "file",
      mime: attachment.mime,
      url: attachment.url,
      filename: attachment.name,
    },
  }))
}

function hasRenderableMessageContent(message: OpenCodeMessage) {
  if (message.text.trim()) return true
  return message.parts.some((part) => {
    if (part.kind === "text") return Boolean(part.text?.trim())
    return isRunnablePart(part)
  })
}

function isCompactionMessage(message: OpenCodeMessage) {
  return message.role === "user" && message.parts.some((part) => part.kind === "compaction")
}

function isCompactionSummaryMessage(message: OpenCodeMessage) {
  if (message.role !== "assistant") return false
  const raw = asRecord(message.raw)
  const info = asRecord(raw?.info) ?? raw
  return (
    message.agent === "compaction" ||
    stringValue(info?.agent) === "compaction" ||
    stringValue(info?.mode) === "compaction" ||
    info?.summary === true
  )
}

function compactionMessageLabel(message: OpenCodeMessage) {
  const part = message.parts.find((item) => item.kind === "compaction")
  const raw = asRecord(part?.raw)
  if (raw?.overflow === true) return "上下文过长，已自动压缩"
  if (raw?.auto === false) return "上下文已压缩"
  return "上下文已自动压缩"
}

function isCompactionContinuePart(part: MessagePart) {
  const raw = asRecord(part.raw)
  const metadata = asRecord(raw?.metadata)
  return raw?.synthetic === true && metadata?.compaction_continue === true
}

function isSyntheticCompactionContinueMessage(message: OpenCodeMessage) {
  if (message.role !== "user") return false
  return message.parts.some(isCompactionContinuePart)
}

function isInternalCompactionMessage(message: OpenCodeMessage) {
  return isSyntheticCompactionContinueMessage(message) || isCompactionSummaryMessage(message)
}

function compactionIdentityKey(message: OpenCodeMessage) {
  const part = message.parts.find((item) => item.kind === "compaction")
  const raw = asRecord(part?.raw)
  return stringValue(raw?.id) ?? stringValue(part?.id) ?? message.id
}

function dedupeDuplicateCompactionDividers(messages: OpenCodeMessage[]) {
  const result: OpenCodeMessage[] = []
  const seen = new Set<string>()

  for (const message of messages) {
    if (isCompactionMessage(message)) {
      const key = compactionIdentityKey(message)
      if (!seen.has(key)) {
        seen.add(key)
        result.push(message)
      }
      continue
    }

    if (isInternalCompactionMessage(message)) continue
    result.push(message)
  }

  return result
}

function streamingPartKey(sessionId: string, messageId: string, partId: string) {
  return `${sessionId}/${messageId}/${partId}`
}

function mergeStreamingPartText(message: OpenCodeMessage, streamingPartText: Record<string, string>) {
  const raw = asRecord(message.raw)
  const info = asRecord(raw?.info)
  const sessionId =
    typeof raw?.sessionID === "string"
      ? raw.sessionID
      : typeof info?.sessionID === "string"
        ? info.sessionID
        : null
  if (!sessionId) return message
  let changed = false
  const parts = message.parts.map((part) => {
    if ((part.kind !== "text" && part.kind !== "reasoning") || !part.id) return part
    const streamed = streamingPartText[streamingPartKey(sessionId, message.id, part.id)]
    if (!streamed) return part
    const current = part.text ?? ""
    const nextText = streamed.length > current.length ? streamed : current
    if (nextText === current) return part
    changed = true
    return { ...part, text: nextText }
  })
  if (!changed) return message
  const text = parts
    .filter((part) => part.kind === "text")
    .map((part) => part.text?.trim())
    .filter(Boolean)
    .join("\n\n")
  return { ...message, text, parts }
}

function messageSessionId(message: OpenCodeMessage) {
  if (message.sessionId) return message.sessionId
  const raw = asRecord(message.raw)
  const info = asRecord(raw?.info)
  const direct = raw?.sessionID ?? raw?.sessionId ?? info?.sessionID ?? info?.sessionId
  return typeof direct === "string" ? direct : null
}

function isCommandLikePart(part: MessagePart) {
  return part.kind === "tool" || part.kind === "command" || part.kind === "shell" || Boolean(part.tool)
}

function todoStepFromValue(value: unknown, index: number): TodoStep | null {
  const record = asRecord(value)
  if (!record) return null
  const content = stringValue(record.content) ?? stringValue(record.title) ?? stringValue(record.text)
  if (!content) return null
  return {
    id: stringValue(record.id) ?? `todo-${index}-${content}`,
    content,
    status: stringValue(record.status) ?? "pending",
    priority: stringValue(record.priority) ?? undefined,
  }
}

function todoStepsFromPart(part: MessagePart) {
  if (part.tool !== "todowrite") return []
  const raw = asRecord(part.raw)
  const state = asRecord(raw?.state)
  const input = asRecord(state?.input) ?? asRecord(raw?.input)
  const metadata = asRecord(state?.metadata) ?? asRecord(raw?.metadata)
  const todos =
    (Array.isArray(input?.todos) && input.todos) ||
    (Array.isArray(metadata?.todos) && metadata.todos) ||
    (Array.isArray(raw?.todos) && raw.todos) ||
    []
  return todos.map(todoStepFromValue).filter((todo): todo is TodoStep => Boolean(todo))
}

function todoStepsFromMessages(messages: OpenCodeMessage[]) {
  for (const message of [...messages].reverse()) {
    if (message.role !== "assistant") continue
    for (const part of [...message.parts].reverse()) {
      const todos = todoStepsFromPart(part)
      if (todos.length) return todos
    }
  }
  return []
}

function hasChineseText(value: string) {
  return /[\u3400-\u9fff]/.test(value)
}

function localizedTodoContent(value: string) {
  const text = value.trim()
  if (!text || hasChineseText(text)) return text
  const normalized = text.toLowerCase()

  if (normalized.includes("mcp") && normalized.includes("backend")) return "校验 MCP 后端改动和命令注册"
  if (normalized.includes("register") && normalized.includes("mcp") && normalized.includes("command")) return "注册 MCP 命令并暴露 Tauri IPC"
  if (normalized.includes("implement") && normalized.includes("mcp") && normalized.includes("settings")) return "实现 MCP 服务设置界面"
  if (normalized.includes("wire") && normalized.includes("ipc")) return "接入 IPC 调用"
  if (normalized.includes("verify") || normalized.includes("test") || normalized.includes("validation")) return "验证实现并运行检查"
  if (normalized.includes("inspect") || normalized.includes("review")) return "检查当前实现"
  if (normalized.includes("update") || normalized.includes("modify")) return "更新相关实现"
  if (normalized.includes("fix")) return "修复当前问题"
  if (normalized.includes("run")) return "运行验证命令"
  return "处理当前任务步骤"
}

function progressItemFromPart(message: OpenCodeMessage, part: MessagePart, index: number): ProgressItem {
  const title = part.title ?? part.tool ?? part.file ?? part.kind
  const raw = asRecord(part.raw)
  const status =
    part.status === "completed"
      ? "success"
      : part.status ?? (message.completedAt || message.status ? "success" : "running")
  return {
    id: `part:${message.id}:${part.id ?? index}:${title}`,
    kind: part.kind,
    status,
    title,
    detail: part.file ?? part.tool ?? undefined,
    sourceEventType: `message.part.${part.kind}`,
    sessionId: null,
    directory: null,
    createdAt:
      timestampMs(message.createdAt) ||
      timestampMs(finiteNumber(raw?.createdAt) ?? finiteNumber(raw?.time)) ||
      Date.now(),
    raw: part.raw,
    commandLike: isCommandLikePart(part),
  }
}

function progressItemsFromMessages(messages: OpenCodeMessage[]) {
  const items: ProgressItem[] = []
  for (const message of messages) {
    if (message.role !== "assistant") continue
    message.parts.filter(isRunnablePart).forEach((part, index) => {
      items.push(progressItemFromPart(message, part, index))
    })
  }
  return items
}

function mergeProgressItems(activities: ThreadActivityItem[], messageItems: ProgressItem[]) {
  const items = new Map<string, ProgressItem>()
  for (const item of messageItems) {
    items.set(item.id, item)
  }
  for (const activity of activities) {
    items.set(`activity:${activity.id}`, {
      ...activity,
      commandLike: activity.kind === "command" || activity.kind === "tool" || activity.kind === "shell",
    })
  }
  return [...items.values()].sort((left, right) => left.createdAt - right.createdAt)
}

function assistantFlowItems(message: OpenCodeMessage): AssistantFlowItem[] {
  const items: AssistantFlowItem[] = []
  let runParts: MessagePart[] = []

  const flushRunParts = () => {
    if (!runParts.length) return
    items.push({ type: "parts", parts: runParts })
    runParts = []
  }

  for (const part of message.parts) {
    if (part.kind === "text") {
      flushRunParts()
      const text = part.text?.trim()
      if (text) items.push({ type: "text", text })
      continue
    }
    if (isRunnablePart(part)) {
      runParts.push(part)
    }
  }

  flushRunParts()
  if (!items.length && message.text.trim()) {
    items.push({ type: "text", text: message.text.trim() })
  }
  return items
}

function lastPartFlowIndex(items: AssistantFlowItem[]) {
  for (let index = items.length - 1; index >= 0; index -= 1) {
    if (items[index]?.type === "parts") return index
  }
  return -1
}

function lastTextFlowIndex(items: AssistantFlowItem[]) {
  for (let index = items.length - 1; index >= 0; index -= 1) {
    if (items[index]?.type === "text") return index
  }
  return -1
}

function formatNumber(value?: number | null) {
  if (!value) return null
  if (value >= 1_000_000) return `${Math.round(value / 1_000_000)}M`
  if (value >= 1_000) return `${Math.round(value / 1_000)}K`
  return `${value}`
}

function formatTokenAmount(value?: number | null) {
  return formatNumber(value)?.replace("K", "k").replace("M", "m") ?? null
}

function gitStatusTitle(status?: GitStatus | null) {
  if (!status?.branch) return "未检测到 Git 仓库"
  const details = [
    status.detached ? "detached HEAD" : `分支 ${status.branch}`,
    status.dirty ? "有未提交改动" : "工作区干净",
    status.ahead ? `领先 ${status.ahead}` : "",
    status.behind ? `落后 ${status.behind}` : "",
    status.rootPath ? `仓库 ${status.rootPath}` : "",
  ].filter(Boolean)
  return details.join(" · ")
}

function formatBytes(value: number) {
  if (value >= 1024 * 1024) return `${(value / (1024 * 1024)).toFixed(value >= 10 * 1024 * 1024 ? 0 : 1)} MB`
  if (value >= 1024) return `${Math.round(value / 1024)} KB`
  return `${value} B`
}

function fileExtension(path?: string | null) {
  const name = path?.split(/[\\/]/).filter(Boolean).at(-1) ?? ""
  return name.includes(".") ? name.split(".").pop()?.toLowerCase() ?? "" : ""
}

function isMarkdownPath(path?: string | null) {
  const ext = fileExtension(path)
  return ext === "md" || ext === "markdown"
}

function diffStatusLabel(status: string) {
  if (status === "added") return "新增"
  if (status === "deleted") return "删除"
  if (status === "modified") return "修改"
  return status
}

function normalizeBrowserUrl(value: string) {
  const trimmed = value.trim()
  if (!trimmed) return null
  if (/^https?:\/\//i.test(trimmed)) return trimmed
  if (/^(localhost|127\.0\.0\.1|0\.0\.0\.0)(:\d+)?([/?#].*)?$/i.test(trimmed)) return `http://${trimmed}`
  return null
}

function inferMime(file: File) {
  if (file.type) return file.type
  const ext = file.name.split(".").pop()?.toLowerCase()
  if (!ext) return "application/octet-stream"
  if (["png", "jpg", "jpeg", "gif", "webp", "bmp", "svg"].includes(ext)) {
    return ext === "jpg" ? "image/jpeg" : `image/${ext === "svg" ? "svg+xml" : ext}`
  }
  if (ext === "pdf") return "application/pdf"
  if (
    [
      "txt",
      "md",
      "markdown",
      "json",
      "jsonl",
      "yaml",
      "yml",
      "toml",
      "csv",
      "xml",
      "html",
      "css",
      "js",
      "jsx",
      "ts",
      "tsx",
      "py",
      "rs",
      "go",
      "java",
      "kt",
      "c",
      "cpp",
      "h",
      "hpp",
      "cs",
      "php",
      "rb",
      "sh",
      "ps1",
      "sql",
      "log",
    ].includes(ext)
  ) {
    return "text/plain"
  }
  return "application/octet-stream"
}

function attachmentFromFile(file: File): Promise<PromptAttachment> {
  if (file.size > MAX_ATTACHMENT_BYTES) {
    return Promise.reject(new Error(`${file.name || "附件"} 超过 ${formatBytes(MAX_ATTACHMENT_BYTES)}。`))
  }

  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error(`无法读取 ${file.name || "附件"}。`))
    reader.onload = () => {
      const value = typeof reader.result === "string" ? reader.result : ""
      if (!value) {
        reject(new Error(`无法读取 ${file.name || "附件"}。`))
        return
      }
      const mime = inferMime(file)
      const comma = value.indexOf(",")
      const url = comma >= 0 ? `data:${mime};base64,${value.slice(comma + 1)}` : value
      resolve({
        id: `${file.name || "attachment"}-${file.size}-${file.lastModified}-${Math.random().toString(36).slice(2)}`,
        name: file.name || `clipboard-${Date.now()}`,
        mime,
        url,
        size: file.size,
      })
    }
    reader.readAsDataURL(file)
  })
}

export function ThreadWorkspace({
  thread,
  server,
  workspace,
  activities = [],
  messages = [],
  diffs = [],
  permissions = [],
  questions = [],
  agents = [],
  models = [],
  commands = [],
  workspaces = [],
  selectedAgent,
  selectedModel,
  modelProviderName,
  favoriteModelKeys = [],
  hiddenModelKeys = [],
  streamingPartText = {},
  gitStatus,
  gitLoading = false,
  gitAutoDetect = false,
  isBusy = false,
  isRunning = false,
  messagesLoading = false,
  optionsLoading = false,
  workspaceSelecting = false,
  permissionLabel = "工作区权限",
  permissionMode,
  permissionOptions = [],
  error,
  composerDraftKey,
  composerDraft,
  onComposerDraftChange,
  onSend,
  onAbort,
  onPickWorkspace,
  onWorkspaceSelect,
  onOpenWorkspace,
  onDeleteThread,
  onDeleteMessage,
  onForkMessage,
  onAgentChange,
  onModelChange,
  onModelFavoriteToggle,
  onModelVisibilityToggle,
  onPermissionModeChange,
  onPermissionReply,
  onQuestionReply,
  onQuestionReject,
}: Props) {
  const [draft, setDraft] = useState(composerDraft ?? "")
  const [attachments, setAttachments] = useState<PromptAttachment[]>([])
  const [attachmentError, setAttachmentError] = useState<string | null>(null)
  const [replyingId, setReplyingId] = useState<string | null>(null)
  const [openMenu, setOpenMenu] = useState<"add" | "model" | "permission" | null>(null)
  const [headerMenuOpen, setHeaderMenuOpen] = useState(false)
  const [sidePanelOpen, setSidePanelOpen] = useState(false)
  const [sidePanel, setSidePanel] = useState<SidePanelState>({ type: "empty" })
  const [previewFile, setPreviewFile] = useState<LocalFilePreview | null>(null)
  const [previewFileLoading, setPreviewFileLoading] = useState(false)
  const [previewFileError, setPreviewFileError] = useState<string | null>(null)
  const [localFileMenu, setLocalFileMenu] = useState<LocalFileMenuState | null>(null)
  const [dragOver, setDragOver] = useState(false)
  const [previewAttachment, setPreviewAttachment] = useState<PromptAttachment | null>(null)
  const [trigger, setTrigger] = useState<TriggerInfo | null>(null)
  const [suggestions, setSuggestions] = useState<SuggestionItem[]>([])
  const [activeSuggestion, setActiveSuggestion] = useState(0)
  const [optimisticMessages, setOptimisticMessages] = useState<OpenCodeMessage[]>([])
  const [pendingGuides, setPendingGuides] = useState<PendingGuide[]>([])
  const [guideMenuOpen, setGuideMenuOpen] = useState<string | null>(null)
  const [workspaceMenuOpen, setWorkspaceMenuOpen] = useState(false)
  const [interruptedSessionId, setInterruptedSessionId] = useState<string | null>(null)
  const [localThinkingSince, setLocalThinkingSince] = useState<number | null>(null)
  const [progressPinned, setProgressPinned] = useState(false)
  const [activeTimelineId, setActiveTimelineId] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement | null>(null)
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const composerMenuRef = useRef<HTMLDivElement | null>(null)
  const addMenuTriggerRef = useRef<HTMLButtonElement | null>(null)
  const permissionMenuTriggerRef = useRef<HTMLButtonElement | null>(null)
  const modelMenuTriggerRef = useRef<HTMLButtonElement | null>(null)
  const messageNodeRefs = useRef(new Map<string, HTMLDivElement>())
  const stickyBottomRef = useRef(true)
  const fileSearchRequest = useRef(0)
  const effectiveWorkspaceDirectory = thread?.directory ?? workspace?.path ?? null
  // Outside-click dismissal for the popovers anchored to the chat surface.
  const composerRef = useRef<HTMLDivElement>(null)
  const headerMenuAnchorRef = useRef<HTMLDivElement>(null)
  const guideMenuAnchorRef = useRef<HTMLDivElement>(null)
  const workspaceMenuAnchorRef = useRef<HTMLDivElement>(null)
  const restoringDraftRef = useRef(false)
  useOutsideClick(
    [composerMenuRef, addMenuTriggerRef, permissionMenuTriggerRef, modelMenuTriggerRef],
    () => setOpenMenu(null),
    Boolean(openMenu),
  )
  useOutsideClick(headerMenuAnchorRef, () => setHeaderMenuOpen(false), headerMenuOpen)
  useOutsideClick(guideMenuAnchorRef, () => setGuideMenuOpen(null), Boolean(guideMenuOpen))
  useOutsideClick(workspaceMenuAnchorRef, () => setWorkspaceMenuOpen(false), workspaceMenuOpen)
  const normalizedDiffs = useMemo(
    () => normalizeDiffsForWorkspace(diffs, effectiveWorkspaceDirectory),
    [diffs, effectiveWorkspaceDirectory],
  )

  const abortCurrentTurn = useCallback(async () => {
    const interruptedId = thread && !thread.local ? thread.id : null
    if (interruptedId) setInterruptedSessionId(interruptedId)
    try {
      await onAbort()
    } catch (error) {
      if (interruptedId) {
        setInterruptedSessionId((current) => (current === interruptedId ? null : current))
      }
      throw error
    }
  }, [onAbort, thread])

  const openSidePanel = useCallback((nextPanel: SidePanelState) => {
    setSidePanel(nextPanel)
    setSidePanelOpen(true)
  }, [])

  const openLocalFileInPanel = useCallback((path: string) => {
    openSidePanel({ type: "file", path: resolveWorkspaceFilePath(path, effectiveWorkspaceDirectory) })
    setLocalFileMenu(null)
  }, [effectiveWorkspaceDirectory, openSidePanel])

  const openUrlInPanel = useCallback((url: string) => {
    const normalized = normalizeBrowserUrl(url)
    if (!normalized) return
    openSidePanel({ type: "browser", url: normalized })
  }, [openSidePanel])

  const openDiffInPanel = useCallback((diff: SessionDiffFile) => {
    openSidePanel({ type: "diff", diff })
  }, [openSidePanel])

  const openReviewInPanel = useCallback((diffs: SessionDiffFile[], selectedDiff?: SessionDiffFile | null) => {
    if (!diffs.length) return
    openSidePanel({
      type: "review",
      diffs,
      selectedFile: selectedDiff?.file ?? diffs[0]?.file ?? null,
    })
  }, [openSidePanel])

  const openTerminalInPanel = useCallback((title: string, content: string, subtitle?: string) => {
    openSidePanel({ type: "terminal", title, content, subtitle })
  }, [openSidePanel])

  const openLiveTerminalPanel = useCallback(() => {
    openSidePanel({ type: "live-terminal" })
  }, [openSidePanel])

  const openLocalFileContextMenu = useCallback((path: string, position: LocalFileLinkPosition) => {
    setLocalFileMenu({
      path: resolveWorkspaceFilePath(path, effectiveWorkspaceDirectory),
      x: position.x,
      y: position.y,
    })
  }, [effectiveWorkspaceDirectory])

  const openLocalFileWith = useCallback((path: string, target: OpenPathTarget) => {
    setLocalFileMenu(null)
    void openPath(resolveWorkspaceFilePath(path, effectiveWorkspaceDirectory), { target }).catch((error) => {
      setAttachmentError(getErrorMessage(error) ?? "打开文件失败。")
    })
  }, [effectiveWorkspaceDirectory])

  useEffect(() => {
    if (!localFileMenu) return
    const close = () => setLocalFileMenu(null)
    const closeOnEscape = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") close()
    }
    window.addEventListener("click", close)
    window.addEventListener("resize", close)
    window.addEventListener("keydown", closeOnEscape)
    return () => {
      window.removeEventListener("click", close)
      window.removeEventListener("resize", close)
      window.removeEventListener("keydown", closeOnEscape)
    }
  }, [localFileMenu])

  useEffect(() => {
    if (sidePanel.type !== "file") {
      setPreviewFile(null)
      setPreviewFileError(null)
      setPreviewFileLoading(false)
      return
    }
    const previewFilePath = resolveWorkspaceFilePath(sidePanel.path, effectiveWorkspaceDirectory)

    let cancelled = false
    setPreviewFileLoading(true)
    setPreviewFileError(null)
    readFilePreview(previewFilePath)
      .then((preview) => {
        if (cancelled) return
        setPreviewFile(preview)
      })
      .catch((error) => {
        if (cancelled) return
        setPreviewFile(null)
        setPreviewFileError(getErrorMessage(error) ?? "无法读取文件。")
      })
      .finally(() => {
        if (!cancelled) setPreviewFileLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [effectiveWorkspaceDirectory, sidePanel])

  const scopedActivities = useMemo(() => {
    if (!thread || thread.local) return []
    return activities.filter((activity) => activity.sessionId === thread.id)
  }, [activities, thread?.id, thread?.local])
  const scopedMessages = useMemo(() => {
    if (!thread || thread.local) return []
    return messages.filter((message) => messageSessionId(message) === thread.id)
  }, [messages, thread?.id, thread?.local])
  const workspaceLabel = workspace?.name ?? getPathName(workspace?.path)
  const workspaceOptions = useMemo(() => {
    const seen = new Set<string>()
    const add = (item?: WorkspaceRecord | null) => {
      if (!item?.path || seen.has(item.path)) return []
      seen.add(item.path)
      return [item]
    }
    return [...workspaces.flatMap(add), ...add(workspace)]
  }, [workspace, workspaces])
  const hasLiveActivity = scopedActivities.length > 0
  const errorMessage = getErrorMessage(error)
  const visibleError = errorMessage ?? attachmentError
  const orderedMessages = useMemo(() => {
    const confirmed = scopedMessages
      .filter((message) => !isInternalCompactionMessage(message))
      .map((message) => mergeStreamingPartText(message, streamingPartText))
      .sort((left, right) => (left.createdAt ?? 0) - (right.createdAt ?? 0))
    const pending = optimisticMessages.filter(
      (optimistic) =>
        !confirmed.some(
          (message) =>
            message.role === "user" &&
            message.text.trim() === optimistic.text.trim(),
        ),
    )
    return [...confirmed, ...pending].sort((left, right) => (left.createdAt ?? 0) - (right.createdAt ?? 0))
  }, [scopedMessages, optimisticMessages, streamingPartText])
  const showStandaloneDiffSummary = useMemo(
    () => shouldShowStandaloneThreadDiffSummary(orderedMessages, normalizedDiffs),
    [orderedMessages, normalizedDiffs],
  )
  const workspaceDiffFallbacks = useMemo(
    () => (showStandaloneDiffSummary ? normalizedDiffs : []),
    [showStandaloneDiffSummary, normalizedDiffs],
  )
  const latestUserTurnStartIndex = useMemo(() => latestUserTurnStart(orderedMessages), [orderedMessages])
  const assistantDiffSummaryMessageId = useMemo(
    () => latestAssistantDiffSummaryMessageId(orderedMessages, workspaceDiffFallbacks),
    [orderedMessages, workspaceDiffFallbacks],
  )
  const standaloneDiffs = showStandaloneDiffSummary && !assistantDiffSummaryMessageId ? normalizedDiffs : []
  const selectedPermission = permissionOptions.find((item) => item.id === permissionMode)
  const running = Boolean(isRunning && thread && !thread.local)
  const submitting = isBusy && !running
  const composerBusy = running || submitting
  const emptyState = Boolean(thread?.local && !orderedMessages.length && !hasLiveActivity)
  const showContextUsage = !emptyState && Boolean(thread && (orderedMessages.length || hasLiveActivity || !thread.local))
  const progressRunning = running || submitting || Boolean(localThinkingSince)
  const latestPendingGuide = pendingGuides.at(-1) ?? null
  const hiddenPendingGuideCount = Math.max(0, pendingGuides.length - 1)
  const runningAssistantId = useMemo(() => {
    if (!running) return null
    let latestUserIndex = -1
    for (let index = orderedMessages.length - 1; index >= 0; index -= 1) {
      if (orderedMessages[index]?.role === "user") {
        latestUserIndex = index
        break
      }
    }
    const candidates = latestUserIndex >= 0 ? orderedMessages.slice(latestUserIndex + 1) : orderedMessages
    return [...candidates]
      .reverse()
      .find((message) => message.role === "assistant" && !message.completedAt && !message.status)?.id ?? null
  }, [orderedMessages, running])
  const displayMessages = useMemo(
    () => {
      const renderable = orderedMessages.filter(
        (message) =>
          isCompactionMessage(message) ||
          message.id === runningAssistantId ||
          hasRenderableMessageContent(message),
      )
      return dedupeDuplicateCompactionDividers(renderable)
    },
    [orderedMessages, runningAssistantId],
  )
  const timelineItems = useMemo(() => buildThreadTimelineItems(displayMessages), [displayMessages])
  const setMessageNodeRef = useCallback((messageId: string, node: HTMLDivElement | null) => {
    if (node) messageNodeRefs.current.set(messageId, node)
    else messageNodeRefs.current.delete(messageId)
  }, [])
  const scrollToTimelineItem = useCallback((messageId: string) => {
    const node = messageNodeRefs.current.get(messageId)
    if (!node) return
    stickyBottomRef.current = false
    setActiveTimelineId(messageId)
    node.scrollIntoView({ block: "start", behavior: "smooth" })
  }, [])
  const updateActiveTimelineItem = useCallback(() => {
    if (!timelineItems.length) {
      setActiveTimelineId(null)
      return
    }
    const scroll = scrollRef.current
    if (!scroll) {
      setActiveTimelineId((current) => current ?? timelineItems[0]?.id ?? null)
      return
    }
    const anchor = scroll.scrollTop + 140
    let active = timelineItems[0]?.id ?? null
    for (const item of timelineItems) {
      const node = messageNodeRefs.current.get(item.id)
      if (!node) continue
      if (node.offsetTop <= anchor) active = item.id
      else break
    }
    setActiveTimelineId(active)
  }, [timelineItems])
  const compactionDividerTotal = useMemo(
    () => displayMessages.filter(isCompactionMessage).length,
    [displayMessages],
  )
  const messageProgressItems = useMemo(() => progressItemsFromMessages(displayMessages), [displayMessages])
  const todoSteps = useMemo(() => todoStepsFromMessages(displayMessages), [displayMessages])
  const progressItems = useMemo(
    () => mergeProgressItems(scopedActivities, messageProgressItems),
    [scopedActivities, messageProgressItems],
  )
  const progressInterrupted = Boolean(thread?.id && interruptedSessionId === thread.id && !progressRunning)
  const showFloatingProgress = Boolean(thread && !thread.local && (progressRunning || progressItems.length))
  const adjacentRunBlocks = useMemo(() => {
    type RunRef = {
      message: OpenCodeMessage
      flowIndex: number
      parts: MessagePart[]
    }

    const mergedByMessageId: Record<string, Record<number, RunBlockGroup>> = {}
    const hiddenByMessageId: Record<string, Record<number, true>> = {}
    let currentGroup: RunRef[] = []

    const flushGroup = () => {
      if (currentGroup.length <= 1) {
        currentGroup = []
        return
      }

      const anchor = currentGroup[0]
      const runningRef = currentGroup.find((item) => item.message.id === runningAssistantId)
      mergedByMessageId[anchor.message.id] ??= {}
      mergedByMessageId[anchor.message.id][anchor.flowIndex] = {
        parts: currentGroup.flatMap((item) => item.parts),
        running: Boolean(runningRef),
        message: runningRef?.message ?? anchor.message,
      }

      for (const item of currentGroup.slice(1)) {
        hiddenByMessageId[item.message.id] ??= {}
        hiddenByMessageId[item.message.id][item.flowIndex] = true
      }

      currentGroup = []
    }

    for (const message of displayMessages) {
      if (isCompactionMessage(message) || message.role !== "assistant") {
        flushGroup()
        continue
      }

      const flow = assistantFlowItems(message)
      for (let index = 0; index < flow.length; index += 1) {
        const item = flow[index]
        if (item.type === "parts") {
          currentGroup.push({ message, flowIndex: index, parts: item.parts })
        } else {
          flushGroup()
        }
      }
    }
    flushGroup()

    return { mergedByMessageId, hiddenByMessageId }
  }, [displayMessages, runningAssistantId])
  const assistantActionAnchors = useMemo(() => {
    const anchors: Record<string, true> = {}
    let latestTextMessageId: string | null = null

    const flushAnchor = () => {
      if (latestTextMessageId) anchors[latestTextMessageId] = true
      latestTextMessageId = null
    }

    for (const message of displayMessages) {
      if (isCompactionMessage(message) || message.role === "user") {
        flushAnchor()
        continue
      }
      if (message.role !== "assistant") continue
      if (assistantFlowItems(message).some((item) => item.type === "text")) {
        latestTextMessageId = message.id
      }
    }
    flushAnchor()

    return anchors
  }, [displayMessages])
  const hasVisibleAssistantSinceLocalThinking = useMemo(() => {
    if (!localThinkingSince) return false
    const threshold = localThinkingSince - 5_000
    return displayMessages.some((message) => {
      if (message.role !== "assistant") return false
      if (timestampMs(message.createdAt) < threshold) return false
      const hiddenRunBlocks = adjacentRunBlocks.hiddenByMessageId[message.id]
      return assistantFlowItems(message).some(
        (item, flowIndex) => item.type === "text" || !hiddenRunBlocks?.[flowIndex],
      )
    })
  }, [adjacentRunBlocks.hiddenByMessageId, displayMessages, localThinkingSince])
  const showLocalThinking = Boolean(
    localThinkingSince && !runningAssistantId && !hasVisibleAssistantSinceLocalThinking,
  )
  const planAgent = agents.find((agent) => agent.name === "plan")
  const buildAgent = agents.find((agent) => agent.name === "build")
  const planModeEnabled = selectedAgent?.name === "plan"
  const planModeAvailable = Boolean(planAgent && buildAgent)
  const contextUsage = useMemo(
    () => buildContextUsage(orderedMessages, selectedModel, models),
    [models, orderedMessages, selectedModel],
  )

  useEffect(() => {
    if (!emptyState) setWorkspaceMenuOpen(false)
  }, [emptyState])

  useEffect(() => {
    restoringDraftRef.current = true
    setDraft(composerDraft ?? "")
    setTrigger(null)
    setSuggestions([])
    setActiveSuggestion(0)
  }, [composerDraftKey])

  useEffect(() => {
    if (restoringDraftRef.current) {
      if (draft !== (composerDraft ?? "")) return
      restoringDraftRef.current = false
    }
    onComposerDraftChange?.(draft)
  }, [composerDraft, composerDraftKey, draft, onComposerDraftChange])

  useEffect(() => {
    const textarea = textareaRef.current
    if (!textarea) return
    textarea.style.height = "auto"
    textarea.style.height = `${Math.min(textarea.scrollHeight, 240)}px`
  }, [draft])

  useEffect(() => {
    if (!running && !submitting) setLocalThinkingSince(null)
  }, [running, submitting])

  // We clear optimistic state when the user *navigates* to a different
  // thread, but NOT when their first send promotes the local placeholder
  // ("local-ready") into a freshly-created real session — that transition
  // is part of the same submit, and clearing here would erase the user's
  // bubble before they ever see it land.
  const previousThreadRef = useRef<{ id?: string; local?: boolean }>({})
  useEffect(() => {
    const previous = previousThreadRef.current
    const current = { id: thread?.id, local: thread?.local }
    previousThreadRef.current = current

    setAttachments([])
    setAttachmentError(null)
    setPreviewAttachment(null)

    const wasLocalPromotion =
      previous.local === true && current.local === false && Boolean(current.id)
    if (wasLocalPromotion) return

    setOptimisticMessages([])
    setPendingGuides([])
    setGuideMenuOpen(null)
    setLocalThinkingSince(null)
    setProgressPinned(false)
  }, [thread?.id, thread?.local])

  useEffect(() => {
    const scroll = scrollRef.current
    if (!scroll) return
    const onScroll = () => {
      const distance = scroll.scrollHeight - scroll.scrollTop - scroll.clientHeight
      stickyBottomRef.current = distance < 80
      updateActiveTimelineItem()
    }
    scroll.addEventListener("scroll", onScroll, { passive: true })
    return () => scroll.removeEventListener("scroll", onScroll)
  }, [updateActiveTimelineItem])

  useEffect(() => {
    updateActiveTimelineItem()
  }, [updateActiveTimelineItem])

  // When the active thread changes, snap to bottom regardless of prior state.
  useEffect(() => {
    stickyBottomRef.current = true
    const scroll = scrollRef.current
    if (!scroll) return
    scroll.scrollTop = scroll.scrollHeight
  }, [thread?.id])

  useEffect(() => {
    const scroll = scrollRef.current
    if (!scroll) return
    if (!stickyBottomRef.current) return
    scroll.scrollTop = scroll.scrollHeight
  }, [orderedMessages, scopedActivities, messagesLoading])

  useEffect(() => {
    if (!optimisticMessages.length) return
    setOptimisticMessages((current) =>
      current.filter(
        (optimistic) =>
          !scopedMessages.some(
            (message) =>
              message.role === "user" &&
              message.text.trim() === optimistic.text.trim(),
          ),
      ),
    )
  }, [scopedMessages, optimisticMessages.length])

  useEffect(() => {
    if (!pendingGuides.length) return
    const confirmedTexts = new Set(
      scopedMessages
        .filter((message) => message.role === "user")
        .map((message) => normalizeMessageText(message.text)),
    )
    setPendingGuides((current) => {
      const next = current.filter((guide) => {
        if (guide.status === "failed") return true
        const text = normalizeMessageText(guide.text)
        if (text && confirmedTexts.has(text)) return false
        return true
      })
      return next.length === current.length ? current : next
    })
  }, [scopedMessages, pendingGuides.length])

  useEffect(() => {
    if (!localThinkingSince) return
    const threshold = localThinkingSince - 5_000
    const hasAssistant = scopedMessages.some(
      (message) =>
        message.role === "assistant" &&
        timestampMs(message.createdAt) >= threshold &&
        hasRenderableMessageContent(message),
    )
    const hasActivity = scopedActivities.some((activity) => timestampMs(activity.createdAt) >= threshold)
    if (hasAssistant || hasActivity) setLocalThinkingSince(null)
  }, [scopedActivities, localThinkingSince, scopedMessages])

  const refreshSuggestions = useCallback(
    async (info: TriggerInfo) => {
      if (info.kind === "/") {
        const fallbackCommands: OpenCodeCommand[] = [
          { name: "init", description: "初始化项目上下文", source: "command", raw: {} },
          { name: "review", description: "审查当前改动", source: "command", raw: {} },
        ]
        const source = commands.length ? commands : fallbackCommands
        const query = info.query.trim().toLowerCase()
        const items = source
          .filter((command) => !query || command.name.toLowerCase().includes(query))
          .slice(0, 60)
          .map((command) => ({
            key: command.name,
            primary: `/${command.name}`,
            secondary: command.description ?? command.source ?? undefined,
            group: command.source ? command.source : undefined,
          }))
        setSuggestions(items)
        setActiveSuggestion(0)
        return
      }

      if (!effectiveWorkspaceDirectory) {
        setSuggestions([])
        setActiveSuggestion(0)
        return
      }

      const request = ++fileSearchRequest.current
      try {
        const files = await fileSearch({
          baseUrl: server?.baseUrl ?? undefined,
          directory: effectiveWorkspaceDirectory,
          query: info.query.trim(),
          limit: 60,
        })
        if (request !== fileSearchRequest.current) return
        setSuggestions(
          files.map((file) => ({
            key: file,
            primary: file,
            secondary: file.endsWith("/") || file.endsWith("\\") ? "目录" : undefined,
          })),
        )
        setActiveSuggestion(0)
      } catch {
        if (request === fileSearchRequest.current) {
          setSuggestions([])
          setActiveSuggestion(0)
        }
      }
    },
    [commands, effectiveWorkspaceDirectory, server?.baseUrl],
  )

  const updateTrigger = useCallback(
    (next: string, caret: number) => {
      const info = parsePromptTrigger(next, caret)
      setTrigger(info)
      if (info) void refreshSuggestions(info)
      else setSuggestions((current) => (current.length ? [] : current))
    },
    [refreshSuggestions],
  )

  const applySuggestion = useCallback(
    (index: number) => {
      if (!trigger) return
      const item = suggestions[index]
      if (!item) return
      const insert = trigger.kind === "/" ? item.primary : `@${item.primary}`
      const before = draft.slice(0, trigger.start)
      const caret = textareaRef.current?.selectionStart ?? trigger.start + trigger.query.length + 1
      const after = draft.slice(caret)
      const next = `${before}${insert} ${after}`
      setDraft(next)
      setTrigger(null)
      setSuggestions([])
      requestAnimationFrame(() => {
        const textarea = textareaRef.current
        if (!textarea) return
        const pos = before.length + insert.length + 1
        textarea.setSelectionRange(pos, pos)
        textarea.focus()
      })
    },
    [draft, suggestions, trigger],
  )

  async function submitDraft() {
    const text = draft.trim()
    if ((!text && !attachments.length) || submitting) return
    let submission: ReturnType<typeof preparePromptSubmission>
    try {
      submission = preparePromptSubmission({
        text,
        attachments,
        maxAttachments: MAX_ATTACHMENTS,
        maxAttachmentBytes: MAX_ATTACHMENT_BYTES,
      })
    } catch (error) {
      setAttachmentError(getErrorMessage(error) ?? "输入内容无法转为附件。")
      return
    }
    const originalAttachments = attachments
    const sentText = submission.text
    const sentAttachments = submission.attachments
    setDraft("")
    setAttachments([])
    setAttachmentError(null)
    setTrigger(null)
    setSuggestions([])
    // Sending a new message is an explicit "I want to follow this" signal,
    // so re-pin to bottom regardless of where the user had scrolled.
    stickyBottomRef.current = true

    if (running) {
      // While a turn is in flight, stage follow-up text locally first.
      // The user explicitly chooses when to submit it to OpenCode.
      const guideId = `guide-${Date.now()}-${Math.random().toString(36).slice(2)}`
      const guide: PendingGuide = {
        id: guideId,
        text: sentText,
        attachments: sentAttachments,
        createdAt: Date.now(),
        status: "staged",
      }
      setPendingGuides((current) => [...current, guide])
      return
    }

    // Optimistic user message — render immediately in the chat stream so the
    // user sees their input land. The dedup effect below will clear this once
    // the real message arrives back from the server.
    setInterruptedSessionId(null)
    const optimisticId = `optimistic-${Date.now()}-${Math.random().toString(36).slice(2)}`
    const optimistic: OpenCodeMessage = {
      id: optimisticId,
      role: "user",
      text: sentText,
      createdAt: Date.now(),
      completedAt: Date.now(),
      parts: messagePartsFromAttachments(optimisticId, sentAttachments),
      raw: { optimistic: true, attachments: sentAttachments.map((attachment) => attachment.name) },
    }
    setOptimisticMessages((current) => [...current, optimistic])
    setLocalThinkingSince(Date.now())

    try {
      await onSend(sentText, sentAttachments)
    } catch (error) {
      setOptimisticMessages((current) => current.filter((message) => message.id !== optimisticId))
      setLocalThinkingSince(null)
      setDraft((current) => current || text)
      setAttachments((current) => (current.length ? current : originalAttachments))
      setAttachmentError(getErrorMessage(error) ?? "发送失败。")
    }
  }

  async function addFiles(files: FileList | File[]) {
    const list = Array.from(files).filter((file) => file.size > 0)
    if (!list.length) return
    try {
      const remaining = Math.max(0, MAX_ATTACHMENTS - attachments.length)
      if (!remaining) {
        setAttachmentError(`最多可添加 ${MAX_ATTACHMENTS} 个附件。`)
        return
      }
      const next = await Promise.all(list.slice(0, remaining).map(attachmentFromFile))
      setAttachments((current) => [...current, ...next].slice(0, MAX_ATTACHMENTS))
      setAttachmentError(list.length > remaining ? `最多可添加 ${MAX_ATTACHMENTS} 个附件。` : null)
      setOpenMenu(null)
    } catch (error) {
      setAttachmentError(getErrorMessage(error) ?? "附件读取失败。")
    }
  }

  function removeAttachment(id: string) {
    setAttachments((current) => current.filter((item) => item.id !== id))
    setAttachmentError(null)
  }

  function removePendingGuide(id: string) {
    setPendingGuides((current) => current.filter((item) => item.id !== id))
    setGuideMenuOpen((current) => (current === id ? null : current))
  }

  function restorePendingGuide(guide: PendingGuide) {
    setDraft((current) => (current.trim() ? `${current.trim()}\n${guide.text}` : guide.text))
    setAttachments((current) => [...current, ...guide.attachments].slice(0, MAX_ATTACHMENTS))
    removePendingGuide(guide.id)
    requestAnimationFrame(() => textareaRef.current?.focus())
  }

  // Submit a staged guide only when the user explicitly asks for it.
  async function submitGuide(guide: PendingGuide, options?: { stopFirst?: boolean }) {
    if (guide.status === "sending") return
    setGuideMenuOpen(null)
    let submission: ReturnType<typeof preparePromptSubmission>
    try {
      submission = preparePromptSubmission({
        text: guide.text,
        attachments: guide.attachments,
        maxAttachments: MAX_ATTACHMENTS,
        maxAttachmentBytes: MAX_ATTACHMENT_BYTES,
      })
    } catch (error) {
      const message = getErrorMessage(error) ?? "输入内容无法转为附件。"
      setPendingGuides((current) =>
        current.map((item) =>
          item.id === guide.id ? { ...item, status: "failed", error: message } : item,
        ),
      )
      setAttachmentError(message)
      return
    }
    const guideText = submission.text
    const guideAttachments = submission.attachments
    setPendingGuides((current) =>
      current.map((item) =>
        item.id === guide.id ? { ...item, status: "sending", error: undefined } : item,
      ),
    )
    stickyBottomRef.current = true

    const optimisticId = `optimistic-resend-${Date.now()}-${Math.random().toString(36).slice(2)}`
    const optimistic: OpenCodeMessage = {
      id: optimisticId,
      role: "user",
      text: guideText,
      createdAt: Date.now(),
      completedAt: Date.now(),
      parts: messagePartsFromAttachments(optimisticId, guideAttachments),
      raw: { optimistic: true, attachments: guideAttachments.map((attachment) => attachment.name) },
    }
    setOptimisticMessages((current) => [...current, optimistic])

    try {
      if (options?.stopFirst) {
        await abortCurrentTurn()
        setInterruptedSessionId(null)
      }
      await onSend(guideText, guideAttachments)
      setLocalThinkingSince(Date.now())
      setPendingGuides((current) =>
        current.map((item) =>
          item.id === guide.id
            ? { ...item, text: guideText, attachments: guideAttachments, status: "submitted" }
            : item,
        ),
      )
    } catch (error) {
      const message = getErrorMessage(error) ?? "重发失败。"
      setOptimisticMessages((current) => current.filter((m) => m.id !== optimisticId))
      setPendingGuides((current) =>
        current.map((item) =>
          item.id === guide.id ? { ...item, status: "failed", error: message } : item,
        ),
      )
      setAttachmentError(message)
    }
  }

  function togglePlanMode() {
    if (!planModeAvailable) return
    if (planModeEnabled) {
      if (buildAgent) onAgentChange(buildAgent.name)
      return
    }
    if (planAgent) onAgentChange(planAgent.name)
  }

  function handlePaste(event: ClipboardEvent<HTMLTextAreaElement>) {
    const itemFiles = Array.from(event.clipboardData.items ?? [])
      .filter((item) => item.kind === "file")
      .map((item) => item.getAsFile())
      .filter((file): file is File => Boolean(file))
    const files = (itemFiles.length ? itemFiles : Array.from(event.clipboardData.files ?? [])).filter(
      (file) => file.size > 0,
    )
    if (!files.length) return
    event.preventDefault()
    void addFiles(files)
  }

  function handleComposerKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (trigger && suggestions.length > 0) {
      if (event.key === "ArrowDown") {
        event.preventDefault()
        setActiveSuggestion((index) => (index + 1) % suggestions.length)
        return
      }
      if (event.key === "ArrowUp") {
        event.preventDefault()
        setActiveSuggestion((index) => (index - 1 + suggestions.length) % suggestions.length)
        return
      }
      if (event.key === "Tab" || (event.key === "Enter" && !event.shiftKey)) {
        event.preventDefault()
        applySuggestion(activeSuggestion)
        return
      }
      if (event.key === "Escape") {
        event.preventDefault()
        setTrigger(null)
        setSuggestions([])
        return
      }
    }

    if (event.shiftKey && event.key === "Tab" && planModeAvailable) {
      event.preventDefault()
      togglePlanMode()
      return
    }
    if (event.key === "Escape" && running) {
      event.preventDefault()
      void abortCurrentTurn()
      return
    }
    if (event.key !== "Enter") return
    if (event.nativeEvent.isComposing) return
    if (event.shiftKey) return
    event.preventDefault()
    void submitDraft()
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault()
    setDragOver(false)
    const files = event.dataTransfer?.files
    if (files?.length) void addFiles(files)
  }

  async function reply(permission: PermissionInfo, value: "once" | "always" | "reject") {
    setReplyingId(permission.id)
    try {
      await onPermissionReply(permission, value)
    } finally {
      setReplyingId(null)
    }
  }

  return (
    <div className="flex h-full min-w-0 bg-[var(--app-bg)] text-[var(--app-text)]">
      {permissions.length ? (
        <PermissionApprovalModal
          permission={permissions[0]}
          count={permissions.length}
          pending={replyingId === permissions[0]?.id}
          onReply={(value) => permissions[0] && void reply(permissions[0], value)}
        />
      ) : null}
      {!permissions.length && questions.length && onQuestionReply && onQuestionReject ? (
        <QuestionPrompt
          info={questions[0]}
          count={questions.length}
          onReply={onQuestionReply}
          onReject={onQuestionReject}
        />
      ) : null}
      <section className="flex min-w-0 flex-1 flex-col">
        {!emptyState ? (
          <header className="flex h-14 shrink-0 items-center justify-between border-b border-[var(--app-divider)] px-5">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h1 className="truncate text-[18px] font-medium tracking-normal text-[var(--app-text)]">
                  {thread?.title ?? "OpenCode 工作台"}
                </h1>
                {workspace?.path ? (
                  <>
                    <span className="text-xs text-[var(--app-muted)]">·</span>
                    <span className="max-w-[22ch] truncate text-xs font-medium text-[var(--app-muted)]" title={workspace.path}>
                      {workspaceLabel}
                    </span>
                    {gitAutoDetect ? (
                      <GitBranchChip
                        status={gitStatus}
                        loading={gitLoading}
                        workspaceSelected={Boolean(workspace.path)}
                        compact
                      />
                    ) : null}
                  </>
                ) : null}
                <div ref={headerMenuAnchorRef} className="relative">
                  <button
                    className="flex h-7 w-7 items-center justify-center rounded-md text-[var(--app-muted)] hover:bg-[var(--app-hover)] hover:text-[var(--app-text)]"
                    title="更多"
                    onClick={() => setHeaderMenuOpen((value) => !value)}
                  >
                    <MoreHorizontalIcon className="h-4 w-4" />
                  </button>
                  {headerMenuOpen ? (
                    <HeaderMenu
                      thread={thread}
                      workspace={workspace}
                      onOpenWorkspace={onOpenWorkspace}
                      onDeleteThread={onDeleteThread}
                      onClose={() => setHeaderMenuOpen(false)}
                    />
                  ) : null}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {running ? (
                <button
                  type="button"
                  className="flex h-9 items-center gap-2 rounded-full bg-[var(--app-text)] px-4 text-sm font-semibold text-[var(--app-bg)] shadow-sm hover:opacity-90 disabled:opacity-50"
                  title="停止当前回合 (Esc)"
                  onClick={() => void abortCurrentTurn()}
                  disabled={submitting}
                >
                  <SquareIcon className="h-3.5 w-3.5" />
                  <span>停止</span>
                </button>
              ) : null}
              <button
                className={cn(
                  "flex h-9 w-9 items-center justify-center rounded-lg text-[var(--app-muted)] hover:bg-[var(--app-hover)] hover:text-[var(--app-text)]",
                  sidePanelOpen && sidePanel.type === "live-terminal" && "bg-[var(--app-selected)] text-[var(--app-text)]",
                )}
                title="打开内嵌终端"
                onClick={openLiveTerminalPanel}
              >
                <TerminalSquareIcon className="h-4 w-4" />
              </button>
              <button
                className={cn(
                  "flex h-9 w-9 items-center justify-center rounded-lg text-[var(--app-muted)] hover:bg-[var(--app-hover)] hover:text-[var(--app-text)]",
                  sidePanelOpen && "bg-[var(--app-selected)] text-[var(--app-text)]",
                )}
                title={sidePanelOpen ? "收起右侧工作区" : "展开右侧工作区"}
                onClick={() => setSidePanelOpen((value) => !value)}
              >
                <PanelRightIcon className="h-4 w-4" />
              </button>
            </div>
          </header>
        ) : null}

        <div className="relative min-h-0 flex-1">
          <ConversationTimeline items={timelineItems} activeId={activeTimelineId} onSelect={scrollToTimelineItem} />
          <ScrollArea ref={scrollRef} className="h-full">
            <div className="mx-auto flex min-h-full w-full max-w-[920px] flex-col px-6 pb-80 pt-6">
              {emptyState ? null : displayMessages.length ? (
                <div className="flex flex-col">
                  {displayMessages.map((message, index) => {
                    // A turn begins at each user message (other than the very
                    // first one). Boundary = bigger gap + hairline so a turn
                    // visually reads as a single block.
                    const isCompaction = isCompactionMessage(message)
                    const isTurnStart = index > 0 && message.role === "user" && !isCompaction
                    const sourceIndex = orderedMessages.findIndex((item) => item.id === message.id)
                    const nextMessageId = sourceIndex >= 0 ? orderedMessages[sourceIndex + 1]?.id ?? null : null
                    const turnFallbackDiffs =
                      sourceIndex >= 0 && sourceIndex >= latestUserTurnStartIndex ? workspaceDiffFallbacks : []
                    const messageDiffs = sourceIndex >= 0
                      ? turnDiffsForMessage(message, orderedMessages, sourceIndex, turnFallbackDiffs, effectiveWorkspaceDirectory)
                      : turnFallbackDiffs
                    const renderReviewCard =
                      !turnFallbackDiffs.length ||
                      !assistantDiffSummaryMessageId ||
                      message.id === assistantDiffSummaryMessageId
                    const mergedRunBlocks = adjacentRunBlocks.mergedByMessageId[message.id]
                    const hiddenRunBlocks = adjacentRunBlocks.hiddenByMessageId[message.id]
                    const flow = message.role === "assistant" ? assistantFlowItems(message) : []
                    const assistantHasVisibleFlow =
                      message.role !== "assistant" ||
                      flow.some((item, flowIndex) => item.type === "text" || !hiddenRunBlocks?.[flowIndex])
                    if (isCompaction) {
                      const occurrence = displayMessages.slice(0, index + 1).filter(isCompactionMessage).length
                      const label =
                        compactionDividerTotal > 1
                          ? `${compactionMessageLabel(message)}（第 ${occurrence} 次）`
                          : compactionMessageLabel(message)
                      return <CompactionDivider key={message.id} label={label} />
                    }
                    if (!assistantHasVisibleFlow && message.id !== runningAssistantId) return null
                    return (
                      <div
                        key={message.id}
                        ref={(node) => setMessageNodeRef(message.id, node)}
                        className={cn(
                          isTurnStart
                            ? "mt-10 border-t border-[var(--app-divider)] pt-10"
                            : index > 0
                              ? "mt-5"
                              : undefined,
                        )}
                      >
                        <ThreadMessageBlock
                          message={message}
                          conversationRunning={running}
                          messageRunning={message.id === runningAssistantId}
                          hasLiveActivity={scopedActivities.length > 0}
                          actionsDisabled={running || submitting}
                          nextMessageId={nextMessageId}
                          mergedRunBlocks={mergedRunBlocks}
                          hiddenRunBlocks={hiddenRunBlocks}
                          diffs={messageDiffs}
                          renderReviewCard={renderReviewCard}
                          serverBaseUrl={server?.baseUrl ?? null}
                          workspaceDirectory={effectiveWorkspaceDirectory}
                          onLocalFileOpen={openLocalFileInPanel}
                          onLocalFileContextMenu={openLocalFileContextMenu}
                          onUrlOpen={openUrlInPanel}
                          onTerminalOpen={openTerminalInPanel}
                          onDiffOpen={openDiffInPanel}
                          onReviewOpen={openReviewInPanel}
                          showActions={message.role === "assistant" ? Boolean(assistantActionAnchors[message.id]) : true}
                          onDeleteMessage={onDeleteMessage}
                          onForkMessage={onForkMessage}
                        />
                      </div>
                    )
                  })}
                  {showLocalThinking ? (
                    <div className="mt-5">
                      <ThinkingPlaceholder />
                    </div>
                  ) : null}
                  {/* Show the activity feed only as a fallback. Once the
                      assistant message exists, its PartRunGroup already shows
                      the same operations more clearly — no need to duplicate. */}
                  {scopedActivities.length && !runningAssistantId ? (
                    <div className="mt-5">
                      <ActivityRunGroup activities={scopedActivities.slice(0, 8)} running={running} onTerminalOpen={openTerminalInPanel} />
                    </div>
                  ) : null}
                  {standaloneDiffs.length ? (
                    <div className="mt-5">
                      <DiffSummaryCard diffs={standaloneDiffs} onOpenDiff={openDiffInPanel} onOpenReview={openReviewInPanel} />
                    </div>
                  ) : null}
                </div>
              ) : !hasLiveActivity ? (
                null
              ) : (
                <ActivityRunGroup activities={scopedActivities.slice(0, 12)} running={running} onTerminalOpen={openTerminalInPanel} />
              )}
            </div>
          </ScrollArea>

          {showFloatingProgress ? (
            <FloatingProgressWindow
              items={progressItems}
              todos={todoSteps}
              diffs={normalizedDiffs}
              running={progressRunning}
              interrupted={progressInterrupted}
              pinned={progressPinned}
              suspended={sidePanelOpen}
              onPinnedChange={setProgressPinned}
            />
          ) : null}

          <div
            className={cn(
              "pointer-events-none absolute inset-x-0 flex justify-center px-10",
              emptyState
                ? "top-[48%] -translate-y-1/2"
                : "bottom-0 bg-gradient-to-t from-[var(--app-bg)] via-[var(--app-bg)] to-transparent pb-3 pt-32 sm:pb-4",
            )}
          >
            <div className="pointer-events-auto w-full max-w-[920px]">
              {emptyState ? (
                <div className="mb-8 text-center">
                  <div className="mb-2 text-[11px] font-medium uppercase tracking-[0.22em] text-[var(--app-subtle)]">
                    OpenCode
                  </div>
                  <h2 className="bg-[linear-gradient(180deg,var(--app-text)_0%,color-mix(in_srgb,var(--app-text)_70%,transparent)_100%)] bg-clip-text text-[40px] font-semibold leading-[1.05] tracking-[-0.022em] text-transparent">
                    我们该做什么？
                  </h2>
                  <div className="mt-6 flex flex-wrap justify-center gap-2">
                    <GuideChip label="@ 引用文件" />
                    <GuideChip label="/ 使用命令" />
                    <GuideChip label="Esc 中断当前回合" />
                  </div>
                </div>
              ) : null}
              <div
                ref={composerRef}
                className={cn(
                  "relative rounded-[22px] border border-[var(--app-border)] bg-[var(--app-composer)] px-5 py-3.5 transition-[border-color,background-color,box-shadow] duration-200 ease-out sm:px-6 sm:py-4",
                  "shadow-[var(--app-elevation-2)]",
                  "focus-within:border-[color-mix(in_srgb,var(--app-accent)_45%,var(--app-border))]",
                  "focus-within:shadow-[var(--app-elevation-2),0_0_0_4px_var(--app-ring)]",
                  dragOver &&
                    "border-[var(--app-accent)] bg-[color-mix(in_srgb,var(--app-accent)_8%,var(--app-composer))] shadow-[var(--app-elevation-3),0_0_0_4px_var(--app-accent-soft)]",
                )}
                onDrop={handleDrop}
                onDragOver={(event) => {
                  event.preventDefault()
                  setDragOver(true)
                }}
                onDragLeave={() => setDragOver(false)}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  accept={ATTACHMENT_ACCEPT}
                  className="hidden"
                  onChange={(event) => {
                    const files = event.currentTarget.files
                    if (files) void addFiles(files)
                    event.currentTarget.value = ""
                  }}
                />
                <SuggestionPanel
                  open={Boolean(trigger)}
                  items={suggestions}
                  activeIdx={activeSuggestion}
                  emptyHint={trigger?.kind === "/" ? "无匹配命令" : "无匹配文件"}
                  onPick={applySuggestion}
                  onHover={setActiveSuggestion}
                />
                {openMenu === "add" ? (
                  <div ref={composerMenuRef}>
                    <ComposerAddMenu
                      planModeEnabled={planModeEnabled}
                      planModeAvailable={planModeAvailable}
                      onAddFiles={() => fileInputRef.current?.click()}
                      onTogglePlanMode={togglePlanMode}
                    />
                  </div>
                ) : openMenu ? (
                  <div ref={composerMenuRef}>
                    <ComposerMenu
                      kind={openMenu}
                      models={models}
                      selectedModel={selectedModel}
                      modelProviderName={modelProviderName}
                      favoriteModelKeys={favoriteModelKeys}
                      hiddenModelKeys={hiddenModelKeys}
                      selectedPermissionMode={permissionMode}
                      permissionOptions={permissionOptions}
                      onModelChange={(model) => {
                        onModelChange(model)
                        setOpenMenu(null)
                      }}
                      onModelFavoriteToggle={onModelFavoriteToggle}
                      onModelVisibilityToggle={onModelVisibilityToggle}
                      onPermissionModeChange={(mode) => {
                        onPermissionModeChange(mode)
                        setOpenMenu(null)
                      }}
                    />
                  </div>
                ) : null}
                {latestPendingGuide ? (
                  <div ref={guideMenuAnchorRef}>
                    <PendingGuideBar
                      guide={latestPendingGuide}
                      hiddenCount={hiddenPendingGuideCount}
                      menuOpen={guideMenuOpen === latestPendingGuide.id}
                      onToggleMenu={() =>
                        setGuideMenuOpen((current) =>
                          current === latestPendingGuide.id ? null : latestPendingGuide.id,
                        )
                      }
                      onRemove={() => removePendingGuide(latestPendingGuide.id)}
                      onCopy={() => {
                        void navigator.clipboard?.writeText(guideCopyText(latestPendingGuide))
                        setGuideMenuOpen(null)
                      }}
                      onRestore={() => restorePendingGuide(latestPendingGuide)}
                      onClear={() => {
                        setPendingGuides([])
                        setGuideMenuOpen(null)
                      }}
                      canStop={running}
                      onSubmit={() => void submitGuide(latestPendingGuide)}
                      onStopAndSubmit={() => void submitGuide(latestPendingGuide, { stopFirst: true })}
                    />
                  </div>
                ) : null}
                {attachments.length ? (
                  <div className="mb-3 flex max-h-[112px] flex-wrap gap-2 overflow-auto">
                    {attachments.map((attachment) => (
                      <AttachmentChip
                        key={attachment.id}
                        attachment={attachment}
                        onPreview={attachment.mime.startsWith("image/") ? () => setPreviewAttachment(attachment) : undefined}
                        onRemove={() => removeAttachment(attachment.id)}
                      />
                    ))}
                  </div>
                ) : null}
                <textarea
                  ref={textareaRef}
                  value={draft}
                  onChange={(event) => {
                    const value = event.target.value
                    setDraft(value)
                    updateTrigger(value, event.target.selectionStart ?? value.length)
                  }}
                  onKeyUp={(event) => {
                    if (!["ArrowLeft", "ArrowRight", "Home", "End", "PageUp", "PageDown"].includes(event.key)) return
                    updateTrigger(event.currentTarget.value, event.currentTarget.selectionStart ?? 0)
                  }}
                  onClick={(event) => updateTrigger(event.currentTarget.value, event.currentTarget.selectionStart ?? 0)}
                  onBlur={() => window.setTimeout(() => setTrigger(null), 100)}
                  onPaste={handlePaste}
                  onKeyDown={handleComposerKeyDown}
                  rows={1}
                  className="block max-h-60 min-h-[36px] w-full resize-none bg-transparent px-1 py-1.5 text-[length:var(--app-prose-font-size)] leading-[1.45] text-[var(--app-text)] outline-none placeholder:text-[var(--app-muted)]"
                  placeholder={running ? "添加引导，回车暂存" : emptyState ? "向 OpenCode 询问任何事。输入 @ 提及文件，输入 / 使用命令" : "输入要交给 OpenCode 的任务"}
                />
                <div className="mt-3 flex flex-col gap-3 border-t border-[var(--app-divider)] pt-2.5 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex min-w-0 flex-wrap items-center gap-2">
                  <button
                    ref={addMenuTriggerRef}
                    type="button"
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[var(--app-muted)] hover:bg-[var(--app-hover)] hover:text-[var(--app-text)] disabled:opacity-50"
                    title="添加附件和插件"
                    disabled={submitting}
                    onClick={() => setOpenMenu((value) => (value === "add" ? null : "add"))}
                  >
                    <PlusIcon className="h-5 w-5" />
                  </button>
                  {planModeEnabled ? (
                    <button
                      type="button"
                    className="flex h-7 shrink-0 items-center gap-1.5 rounded-full bg-[var(--app-selected)] px-2.5 text-xs font-medium text-[var(--app-muted)] hover:bg-[var(--app-hover-strong)] hover:text-[var(--app-text)]"
                      title={"创建计划\nShift + Tab 切换"}
                      onClick={togglePlanMode}
                    >
                      <ListChecksIcon className="h-4 w-4" />
                      <span>计划</span>
                    </button>
                  ) : null}
                  <button
                    ref={permissionMenuTriggerRef}
                    className={cn(
                      "flex h-8 max-w-[220px] items-center gap-1.5 rounded-full px-2.5 text-xs font-medium hover:opacity-85",
                      selectedPermission?.tone === "danger"
                        ? "text-[var(--app-danger)]"
                        : selectedPermission?.tone === "warning"
                          ? "text-[var(--app-warning)]"
                          : "text-[var(--app-muted)] hover:text-[var(--app-text)]",
                    )}
                    title="选择权限模式"
                    onClick={() => setOpenMenu((value) => (value === "permission" ? null : "permission"))}
                  >
                    <CircleIcon className="h-4 w-4" />
                    <span className="truncate">{permissionLabel}</span>
                    <ChevronDownIcon className="h-4 w-4" />
                  </button>
                  </div>
                  <div className="flex min-w-0 flex-wrap items-center justify-end gap-2">
                  {visibleError ? (
                    <span className="max-w-[260px] truncate text-[13px] text-[var(--app-danger)]">{visibleError}</span>
                  ) : null}
                  {showContextUsage ? <ContextUsageBadge usage={contextUsage} /> : null}
                  <button
                    ref={modelMenuTriggerRef}
                    className="flex h-8 max-w-[280px] items-center gap-1 rounded-full px-2.5 text-xs font-medium text-[var(--app-muted)] hover:bg-[var(--app-hover)] hover:text-[var(--app-text)]"
                    title={selectedModel ? `${selectedModel.providerName}/${selectedModel.name}` : "选择模型"}
                    onClick={() => setOpenMenu((value) => (value === "model" ? null : "model"))}
                  >
                    <span className="truncate">
                      {selectedModel ? selectedModel.name : optionsLoading ? "加载模型" : "未配置模型"}
                    </span>
                    <ChevronDownIcon className="h-4 w-4" />
                  </button>
                  {running ? (
                    <button
                      className="flex h-8 items-center gap-1.5 rounded-lg bg-[var(--app-hover-strong)] px-2.5 text-xs font-semibold text-[var(--app-text)] hover:bg-[var(--app-selected)] disabled:opacity-50"
                      title="停止当前回合 (Esc)"
                      onClick={() => void abortCurrentTurn()}
                      disabled={submitting}
                    >
                      <SquareIcon className="h-3.5 w-3.5" />
                      <span>停止</span>
                    </button>
                  ) : null}
                  {!running ? (
                    <button
                      className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[var(--app-text)] text-[var(--app-bg)] shadow-sm hover:opacity-90 disabled:opacity-50"
                      title={submitting ? "正在发送给 OpenCode" : "发送"}
                      onClick={() => void submitDraft()}
                      disabled={submitting || (!draft.trim() && !attachments.length)}
                    >
                      {submitting ? (
                        <Loader2Icon className="h-4 w-4 animate-spin" />
                      ) : (
                        <ArrowUpIcon className="h-4 w-4" />
                      )}
                    </button>
                  ) : null}
                  </div>
                </div>
              </div>
              {emptyState ? (
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <div ref={workspaceMenuAnchorRef} className="relative flex min-w-0 items-center">
                    <button
                      type="button"
                      className="flex h-9 max-w-[300px] items-center gap-2 rounded-md border border-transparent px-2 text-sm font-medium text-[var(--app-muted)] hover:border-[var(--app-border)] hover:bg-[var(--app-hover)] hover:text-[var(--app-text)] disabled:opacity-50"
                      title={workspace?.path ?? "选择项目"}
                      disabled={workspaceSelecting}
                      onClick={() => setWorkspaceMenuOpen((value) => !value)}
                    >
                      {workspaceSelecting ? (
                        <Loader2Icon className="h-4 w-4 shrink-0 animate-spin" />
                      ) : (
                        <FolderOpenIcon className="h-4 w-4 shrink-0" />
                      )}
                      <span className="min-w-0 truncate">{workspaceLabel}</span>
                      <ChevronDownIcon className="h-4 w-4 shrink-0" />
                    </button>
                    {workspaceMenuOpen ? (
                      <ComposerWorkspaceMenu
                        workspace={workspace}
                        workspaces={workspaceOptions}
                        onPickWorkspace={onPickWorkspace}
                        onWorkspaceSelect={onWorkspaceSelect}
                        onClose={() => setWorkspaceMenuOpen(false)}
                      />
                    ) : null}
                  </div>
                  {gitAutoDetect ? (
                    <GitBranchChip
                      status={gitStatus}
                      loading={gitLoading}
                      workspaceSelected={Boolean(workspace?.path)}
                    />
                  ) : null}
                </div>
              ) : gitAutoDetect ? (
                <GitBranchStatus
                  status={gitStatus}
                  loading={gitLoading}
                  workspaceSelected={Boolean(workspace?.path)}
                />
              ) : null}
              {previewAttachment ? (
                <ImagePreview attachment={previewAttachment} onClose={() => setPreviewAttachment(null)} />
              ) : null}
            </div>
          </div>
        </div>
      </section>

      {sidePanelOpen ? (
        <SideWorkspacePanel
          panel={sidePanel}
          preview={previewFile}
          loading={previewFileLoading}
          error={previewFileError}
          workspaceDirectory={effectiveWorkspaceDirectory}
          serverBaseUrl={server?.baseUrl ?? null}
          onClose={() => setSidePanelOpen(false)}
          onOpenMenu={(path, position) => setLocalFileMenu({ path, x: position.x, y: position.y })}
          onOpenPath={openLocalFileInPanel}
          onOpenUrl={openUrlInPanel}
          onNavigate={(url) => setSidePanel({ type: "browser", url })}
          onOpenExternalUrl={(url) => void openUrl(url).catch((error) => setAttachmentError(getErrorMessage(error) ?? "打开链接失败。"))}
          onLocalFileContextMenu={openLocalFileContextMenu}
        />
      ) : null}
      {localFileMenu ? (
        <LocalFileContextMenu
          menu={localFileMenu}
          onPreview={openLocalFileInPanel}
          onOpenWith={openLocalFileWith}
          onClose={() => setLocalFileMenu(null)}
        />
      ) : null}
    </div>
  )
}

function SideWorkspacePanel({
  panel,
  preview,
  loading,
  error,
  workspaceDirectory,
  serverBaseUrl,
  onClose,
  onOpenMenu,
  onOpenPath,
  onOpenUrl,
  onNavigate,
  onOpenExternalUrl,
  onLocalFileContextMenu,
}: {
  panel: SidePanelState
  preview: LocalFilePreview | null
  loading: boolean
  error: string | null
  workspaceDirectory?: string | null
  serverBaseUrl?: string | null
  onClose: () => void
  onOpenMenu: (path: string, position: LocalFileLinkPosition) => void
  onOpenPath: (path: string) => void
  onOpenUrl: (url: string) => void
  onNavigate: (url: string) => void
  onOpenExternalUrl: (url: string) => void
  onLocalFileContextMenu: (path: string, position: LocalFileLinkPosition) => void
}) {
  const filePath = panel.type === "file" ? panel.path : null
  const displayPath = preview?.path ?? filePath
  const title = sidePanelTitle(panel, preview)
  const subtitle = sidePanelSubtitle(panel, preview, workspaceDirectory)
  const Icon = sidePanelIcon(panel)
  const reviewPanel = panel.type === "diff" || panel.type === "review"
  const terminalPanel = panel.type === "live-terminal"

  function openMenu(event: ReactMouseEvent<HTMLElement>) {
    if (!displayPath) return
    event.preventDefault()
    event.stopPropagation()
    if (event.type === "click") {
      const rect = event.currentTarget.getBoundingClientRect()
      onOpenMenu(displayPath, { x: rect.left, y: rect.bottom + 6 })
      return
    }
    onOpenMenu(displayPath, { x: event.clientX, y: event.clientY })
  }

  return (
    <aside
      className={cn(
        "hidden min-h-0 shrink-0 border-l border-[var(--app-divider)] bg-[var(--app-inspector)] xl:flex xl:flex-col",
        reviewPanel ? "w-[760px] 2xl:w-[900px]" : terminalPanel ? "w-[620px] 2xl:w-[760px]" : "w-[440px]",
      )}
      onContextMenu={panel.type === "file" ? openMenu : undefined}
    >
      <div className="flex h-14 shrink-0 items-center gap-3 border-b border-[var(--app-divider)] px-4">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-[color-mix(in_srgb,var(--app-text)_5%,transparent)] text-[var(--app-muted)]">
          <Icon className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-[13px] font-semibold leading-tight tracking-tight text-[var(--app-text)]">
            {title}
          </div>
          <div className="mt-1 truncate text-[11px] leading-tight text-[var(--app-muted)]" title={subtitle}>
            {subtitle}
          </div>
        </div>
        {panel.type === "browser" ? (
          <button
            type="button"
            className="flex h-8 w-8 items-center justify-center rounded-md text-[var(--app-muted)] hover:bg-[var(--app-hover)] hover:text-[var(--app-text)]"
            title="在系统浏览器打开"
            onClick={() => onOpenExternalUrl(panel.url)}
          >
            <GlobeIcon className="h-4 w-4" />
          </button>
        ) : null}
        {displayPath ? (
          <button
            type="button"
            className="flex h-8 w-8 items-center justify-center rounded-md text-[var(--app-muted)] hover:bg-[var(--app-hover)] hover:text-[var(--app-text)]"
            title="文件操作"
            onClick={openMenu}
          >
            <MoreHorizontalIcon className="h-4 w-4" />
          </button>
        ) : null}
        <button
          type="button"
          className="flex h-8 w-8 items-center justify-center rounded-md text-[var(--app-muted)] hover:bg-[var(--app-hover)] hover:text-[var(--app-text)]"
          title="关闭文件预览"
          onClick={onClose}
        >
          <XIcon className="h-4 w-4" />
        </button>
      </div>
      {reviewPanel || terminalPanel ? (
        <div className="min-h-0 flex-1 overflow-hidden">
          <SideWorkspaceBody
            panel={panel}
            preview={preview}
            loading={loading}
            error={error}
            workspaceDirectory={workspaceDirectory}
            serverBaseUrl={serverBaseUrl}
            onOpenPath={onOpenPath}
            onOpenUrl={onOpenUrl}
            onNavigate={onNavigate}
            onLocalFileContextMenu={onLocalFileContextMenu}
          />
        </div>
      ) : (
      <ScrollArea className="min-h-0 flex-1">
        <SideWorkspaceBody
          panel={panel}
          preview={preview}
          loading={loading}
          error={error}
          workspaceDirectory={workspaceDirectory}
          serverBaseUrl={serverBaseUrl}
          onOpenPath={onOpenPath}
          onOpenUrl={onOpenUrl}
          onNavigate={onNavigate}
          onLocalFileContextMenu={onLocalFileContextMenu}
        />
      </ScrollArea>
      )}
    </aside>
  )
}

function sidePanelTitle(panel: SidePanelState, preview: LocalFilePreview | null) {
  if (panel.type === "file") return preview?.name ?? getPathName(panel.path)
  if (panel.type === "browser") return "浏览器"
  if (panel.type === "diff") return "审查"
  if (panel.type === "review") return "代码审查"
  if (panel.type === "live-terminal") return "终端"
  if (panel.type === "terminal") return panel.title
  return "右侧工作区"
}

function sidePanelSubtitle(panel: SidePanelState, preview: LocalFilePreview | null, workspaceDirectory?: string | null) {
  if (panel.type === "file") return preview?.path ?? panel.path
  if (panel.type === "browser") return panel.url
  if (panel.type === "diff") {
    return `${panel.diff.file} · +${panel.diff.additions} -${panel.diff.deletions}`
  }
  if (panel.type === "review") {
    const additions = panel.diffs.reduce((sum, diff) => sum + diff.additions, 0)
    const deletions = panel.diffs.reduce((sum, diff) => sum + diff.deletions, 0)
    return `${panel.diffs.length} 个文件 · +${additions} -${deletions}`
  }
  if (panel.type === "live-terminal") return workspaceDirectory ?? "PTY terminal"
  if (panel.type === "terminal") return panel.subtitle ?? "命令输出"
  return "点击文件、链接、diff 或命令输出后在这里打开"
}

function sidePanelIcon(panel: SidePanelState): IconComponent {
  if (panel.type === "browser") return GlobeIcon
  if (panel.type === "diff" || panel.type === "review") return FileDiffIcon
  if (panel.type === "terminal" || panel.type === "live-terminal") return TerminalSquareIcon
  return FileTextIcon
}

function SideWorkspaceBody({
  panel,
  preview,
  loading,
  error,
  workspaceDirectory,
  serverBaseUrl,
  onOpenPath,
  onOpenUrl,
  onNavigate,
  onLocalFileContextMenu,
}: {
  panel: SidePanelState
  preview: LocalFilePreview | null
  loading: boolean
  error: string | null
  workspaceDirectory?: string | null
  serverBaseUrl?: string | null
  onOpenPath: (path: string) => void
  onOpenUrl: (url: string) => void
  onNavigate: (url: string) => void
  onLocalFileContextMenu: (path: string, position: LocalFileLinkPosition) => void
}) {
  if (panel.type === "file") {
    return (
      <FilePreviewBody
        path={panel.path}
        preview={preview}
        loading={loading}
        error={error}
        workspaceDirectory={workspaceDirectory}
        onOpenPath={onOpenPath}
        onOpenUrl={onOpenUrl}
        onLocalFileContextMenu={onLocalFileContextMenu}
      />
    )
  }
  if (panel.type === "browser") {
    return <BrowserPreviewBody url={panel.url} onNavigate={onNavigate} />
  }
  if (panel.type === "diff") {
    return <CodeReviewPreviewBody diffs={[panel.diff]} selectedFile={panel.diff.file} workspaceDirectory={workspaceDirectory} />
  }
  if (panel.type === "review") {
    return <CodeReviewPreviewBody diffs={panel.diffs} selectedFile={panel.selectedFile} workspaceDirectory={workspaceDirectory} />
  }
  if (panel.type === "live-terminal") {
    return <TerminalWorkspace baseUrl={serverBaseUrl} directory={workspaceDirectory} />
  }
  if (panel.type === "terminal") {
    return <TerminalPreviewBody title={panel.title} content={panel.content} />
  }
  return (
    <div className="px-4 py-4">
      <div className="rounded-lg border border-dashed border-[var(--app-divider)] px-4 py-8 text-center text-sm font-medium leading-6 text-[var(--app-subtle)]">
        暂无打开内容
      </div>
    </div>
  )
}

function FilePreviewBody({
  path,
  preview,
  loading,
  error,
  workspaceDirectory,
  onOpenPath,
  onOpenUrl,
  onLocalFileContextMenu,
}: {
  path: string
  preview: LocalFilePreview | null
  loading: boolean
  error: string | null
  workspaceDirectory?: string | null
  onOpenPath: (path: string) => void
  onOpenUrl: (url: string) => void
  onLocalFileContextMenu: (path: string, position: LocalFileLinkPosition) => void
}) {
  const displayPath = preview?.path ?? path
  const name = preview?.name ?? getPathName(displayPath)
  const content = preview?.content ?? ""
  const markdown = isMarkdownPath(displayPath)

  return (
    <div className="px-4 py-4">
      {loading ? (
        <div className="flex items-center gap-2 text-sm font-medium text-[var(--app-muted)]">
          <Loader2Icon className="h-4 w-4 animate-spin" />
          正在读取文件
        </div>
      ) : error ? (
        <div className="rounded-lg border border-[color-mix(in_srgb,var(--app-danger)_45%,transparent)] bg-[var(--app-danger-soft)] px-3 py-2 text-sm leading-6 text-[var(--app-danger)]">
          {error}
        </div>
      ) : preview?.binary ? (
        <div className="space-y-3 rounded-lg border border-[var(--app-divider)] bg-[var(--app-panel)] p-4 text-sm leading-6 text-[var(--app-muted)]">
          <div className="font-medium text-[var(--app-text)]">{name}</div>
          <div>{formatBytes(preview.size)} · 无法在这里预览</div>
        </div>
      ) : (
        <div className="space-y-3">
          {preview?.truncated ? (
            <div className="rounded-md border border-[var(--app-divider)] bg-[var(--app-hover)] px-3 py-2 text-xs font-medium text-[var(--app-muted)]">
              文件较大，仅显示前 {formatBytes(content.length)}。
            </div>
          ) : null}
          {markdown ? (
            <MessageMarkdown
              text={content}
              className="w-full"
              workspaceDirectory={workspaceDirectory}
              onLocalFileOpen={onOpenPath}
              onLocalFileContextMenu={onLocalFileContextMenu}
              onUrlOpen={onOpenUrl}
            />
          ) : (
            <pre className="overflow-auto whitespace-pre-wrap break-words rounded-lg border border-[var(--app-divider)] bg-[var(--app-code-bg)] p-3 text-xs leading-5 text-[var(--app-text)] [font-family:var(--app-code-font)]">
              {content || "文件为空。"}
            </pre>
          )}
        </div>
      )}
    </div>
  )
}

function BrowserPreviewBody({ url, onNavigate }: { url: string; onNavigate: (url: string) => void }) {
  const [draftUrl, setDraftUrl] = useState(url)

  useEffect(() => {
    setDraftUrl(url)
  }, [url])

  function submit() {
    const next = normalizeBrowserUrl(draftUrl)
    if (next) onNavigate(next)
  }

  return (
    <div className="flex min-h-[calc(100vh-56px)] flex-col">
      <div className="flex shrink-0 items-center gap-2 border-b border-[var(--app-divider)] p-3">
        <input
          value={draftUrl}
          onChange={(event) => setDraftUrl(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") submit()
          }}
          className="h-8 min-w-0 flex-1 rounded-md border border-[var(--app-border)] bg-[var(--app-input)] px-2 text-xs text-[var(--app-text)] outline-none focus:border-[var(--app-text)]"
        />
        <button
          type="button"
          className="h-8 rounded-md px-3 text-xs font-medium text-[var(--app-muted)] hover:bg-[var(--app-hover)] hover:text-[var(--app-text)]"
          onClick={submit}
        >
          打开
        </button>
      </div>
      <iframe
        key={url}
        src={url}
        title={url}
        className="min-h-0 flex-1 bg-white"
        sandbox="allow-downloads allow-forms allow-modals allow-popups allow-same-origin allow-scripts"
      />
    </div>
  )
}

type ParsedDiffLine = {
  id: string
  kind: "add" | "remove" | "context" | "hunk" | "meta"
  text: string
  oldLine?: number | null
  newLine?: number | null
}

type SplitDiffCell = {
  line?: number | null
  text: string
  kind: "add" | "remove" | "context" | "empty"
}

type SplitDiffRow =
  | { id: string; kind: "hunk"; text: string }
  | { id: string; kind: "line"; oldCell: SplitDiffCell; newCell: SplitDiffCell }

function isAbsoluteLocalPath(value: string) {
  return /^[a-zA-Z]:[\\/]/.test(value) || /^\\\\/.test(value) || value.startsWith("/")
}

function resolveWorkspaceFilePath(file: string, workspaceDirectory?: string | null) {
  if (isAbsoluteLocalPath(file)) return file
  if (!workspaceDirectory) return file
  const separator = workspaceDirectory.includes("\\") ? "\\" : "/"
  const root = workspaceDirectory.replace(/[\\/]+$/, "")
  const relative = file.replace(/^\.?[\\/]+/, "").replace(/[\\/]+/g, separator)
  return `${root}${separator}${relative}`
}

function parseUnifiedDiff(patch: string): ParsedDiffLine[] {
  let oldLine = 0
  let newLine = 0
  let sawHunk = false

  return patch.split(/\r?\n/).map((line, index) => {
    const id = `${index}-${line}`
    if (line.startsWith("@@")) {
      const match = line.match(/^@@\s+-(\d+)(?:,\d+)?\s+\+(\d+)(?:,\d+)?\s+@@(.*)$/)
      if (match) {
        oldLine = Number(match[1])
        newLine = Number(match[2])
        sawHunk = true
      }
      return { id, kind: "hunk", text: match?.[3]?.trim() || line }
    }
    if (
      line.startsWith("+++") ||
      line.startsWith("---") ||
      line.startsWith("diff ") ||
      line.startsWith("index ") ||
      line.startsWith("Index: ") ||
      /^=+$/.test(line)
    ) {
      return { id, kind: "meta", text: line }
    }
    if (line.startsWith("+")) {
      const item = { id, kind: "add" as const, text: line.slice(1), oldLine: null, newLine: sawHunk ? newLine : null }
      if (sawHunk) newLine += 1
      return item
    }
    if (line.startsWith("-")) {
      const item = { id, kind: "remove" as const, text: line.slice(1), oldLine: sawHunk ? oldLine : null, newLine: null }
      if (sawHunk) oldLine += 1
      return item
    }
    const item = {
      id,
      kind: "context" as const,
      text: line.startsWith(" ") ? line.slice(1) : line,
      oldLine: sawHunk ? oldLine : null,
      newLine: sawHunk ? newLine : null,
    }
    if (sawHunk) {
      oldLine += 1
      newLine += 1
    }
    return item
  })
}

function DiffLineTable({ lines, compact = false }: { lines: ParsedDiffLine[]; compact?: boolean }) {
  return (
    <div className="min-w-max">
      {lines.map((line) => (
        <div
          key={line.id}
          className={cn(
            "grid items-stretch border-l-4",
            compact ? "min-h-5 grid-cols-[38px_20px_minmax(320px,1fr)] text-[11px]" : "min-h-6 grid-cols-[46px_22px_minmax(360px,1fr)]",
            line.kind === "add" && "border-[var(--app-success)] bg-[color-mix(in_srgb,var(--app-success)_18%,transparent)] text-[var(--app-text)]",
            line.kind === "remove" && "border-[var(--app-danger)] bg-[color-mix(in_srgb,var(--app-danger)_18%,transparent)] text-[var(--app-text)]",
            line.kind === "hunk" && "border-transparent bg-[var(--app-hover)] text-[var(--app-subtle)]",
            line.kind === "context" && "border-transparent text-[var(--app-muted)]",
          )}
        >
          <span
            className={cn(
              "select-none border-r border-[var(--app-divider)] px-2 py-0.5 text-right tabular-nums text-[var(--app-subtle)]",
              line.kind === "add" && "text-[color-mix(in_srgb,var(--app-success)_72%,var(--app-text))]",
              line.kind === "remove" && "text-[color-mix(in_srgb,var(--app-danger)_78%,var(--app-text))]",
            )}
          >
            {line.kind === "hunk" ? "" : diffDisplayLineNumber(line)}
          </span>
          <span className="select-none px-2 py-0.5 text-center text-[var(--app-subtle)]">{diffLineMarker(line)}</span>
          <span
            className={cn(
              "whitespace-pre px-2 py-0.5",
              line.kind === "hunk" && "text-[var(--app-muted)]",
            )}
          >
            {line.kind === "hunk" ? (line.text || "变更片段") : (line.text || " ")}
          </span>
        </div>
      ))}
    </div>
  )
}

function diffDisplayLineNumber(line: ParsedDiffLine) {
  if (line.kind === "remove") return line.oldLine ?? ""
  if (line.kind === "add") return line.newLine ?? ""
  return line.newLine ?? line.oldLine ?? ""
}

function diffLineMarker(line: ParsedDiffLine) {
  if (line.kind === "add") return "+"
  if (line.kind === "remove") return "-"
  return ""
}

function splitDiffRows(lines: ParsedDiffLine[]) {
  const rows: SplitDiffRow[] = []
  let index = 0

  while (index < lines.length) {
    const line = lines[index]
    if (!line || line.kind === "meta") {
      index += 1
      continue
    }

    if (line.kind === "hunk") {
      rows.push({ id: `hunk-${line.id}`, kind: "hunk", text: line.text || "变更片段" })
      index += 1
      continue
    }

    if (line.kind === "context") {
      rows.push({
        id: `context-${line.id}`,
        kind: "line",
        oldCell: { line: line.oldLine, text: line.text, kind: "context" },
        newCell: { line: line.newLine, text: line.text, kind: "context" },
      })
      index += 1
      continue
    }

    if (line.kind === "remove") {
      const removed: ParsedDiffLine[] = []
      const added: ParsedDiffLine[] = []
      while (lines[index]?.kind === "remove") {
        removed.push(lines[index]!)
        index += 1
      }
      while (lines[index]?.kind === "add") {
        added.push(lines[index]!)
        index += 1
      }
      const count = Math.max(removed.length, added.length)
      for (let pairIndex = 0; pairIndex < count; pairIndex += 1) {
        const oldLine = removed[pairIndex]
        const newLine = added[pairIndex]
        rows.push({
          id: `pair-${oldLine?.id ?? "empty"}-${newLine?.id ?? "empty"}-${pairIndex}`,
          kind: "line",
          oldCell: oldLine
            ? { line: oldLine.oldLine, text: oldLine.text, kind: "remove" }
            : { line: null, text: "", kind: "empty" },
          newCell: newLine
            ? { line: newLine.newLine, text: newLine.text, kind: "add" }
            : { line: null, text: "", kind: "empty" },
        })
      }
      continue
    }

    if (line.kind === "add") {
      rows.push({
        id: `add-${line.id}`,
        kind: "line",
        oldCell: { line: null, text: "", kind: "empty" },
        newCell: { line: line.newLine, text: line.text, kind: "add" },
      })
    }
    index += 1
  }

  return rows
}

function SplitDiffTable({ rows }: { rows: SplitDiffRow[] }) {
  return (
    <div className="min-w-[760px] overflow-hidden rounded-lg border border-[var(--app-divider)] bg-[var(--app-code-bg)] text-xs leading-5 [font-family:var(--app-code-font)]">
      <div className="grid grid-cols-[52px_minmax(320px,1fr)_52px_minmax(320px,1fr)] border-b border-[var(--app-divider)] bg-[var(--app-panel)] text-[11px] font-semibold text-[var(--app-subtle)]">
        <div className="border-r border-[var(--app-divider)] px-2 py-2 text-right">旧</div>
        <div className="border-r border-[var(--app-divider)] px-3 py-2">修改前</div>
        <div className="border-r border-[var(--app-divider)] px-2 py-2 text-right">新</div>
        <div className="px-3 py-2">修改后</div>
      </div>
      {rows.map((row) => {
        if (row.kind === "hunk") {
          return (
            <div
              key={row.id}
              className="border-b border-[var(--app-divider)] bg-[var(--app-hover)] px-3 py-1 text-[11px] font-semibold text-[var(--app-muted)]"
            >
              {row.text}
            </div>
          )
        }
        return (
          <div key={row.id} className="grid min-h-6 grid-cols-[52px_minmax(320px,1fr)_52px_minmax(320px,1fr)]">
            <SplitDiffLineNumber cell={row.oldCell} side="old" />
            <SplitDiffCodeCell cell={row.oldCell} side="old" />
            <SplitDiffLineNumber cell={row.newCell} side="new" />
            <SplitDiffCodeCell cell={row.newCell} side="new" />
          </div>
        )
      })}
    </div>
  )
}

function SplitDiffLineNumber({ cell, side }: { cell: SplitDiffCell; side: "old" | "new" }) {
  return (
    <div
      className={cn(
        "select-none border-r border-[var(--app-divider)] px-2 py-0.5 text-right tabular-nums text-[var(--app-subtle)]",
        cell.kind === "remove" && side === "old" && "bg-[color-mix(in_srgb,var(--app-danger)_16%,transparent)] text-[color-mix(in_srgb,var(--app-danger)_78%,var(--app-text))]",
        cell.kind === "add" && side === "new" && "bg-[color-mix(in_srgb,var(--app-success)_16%,transparent)] text-[color-mix(in_srgb,var(--app-success)_72%,var(--app-text))]",
        cell.kind === "empty" && "bg-[var(--app-panel)]",
      )}
    >
      {cell.line ?? ""}
    </div>
  )
}

function SplitDiffCodeCell({ cell, side }: { cell: SplitDiffCell; side: "old" | "new" }) {
  return (
    <div
      className={cn(
        "whitespace-pre border-r border-[var(--app-divider)] px-3 py-0.5 text-[var(--app-muted)]",
        side === "new" && "border-r-0",
        cell.kind === "remove" && "bg-[color-mix(in_srgb,var(--app-danger)_18%,transparent)] text-[var(--app-text)]",
        cell.kind === "add" && "bg-[color-mix(in_srgb,var(--app-success)_18%,transparent)] text-[var(--app-text)]",
        cell.kind === "empty" && "bg-[var(--app-panel)] text-transparent",
      )}
    >
      {cell.text || " "}
    </div>
  )
}

type ReviewDiffRow =
  | { id: string; kind: "fold"; count: number }
  | { id: string; kind: "line"; line: ParsedDiffLine; counterpart?: ParsedDiffLine | null }

function normalizeCodeWhitespace(text: string) {
  return text.replace(/\s+/g, "")
}

function isWhitespaceOnlyChange(lines: ParsedDiffLine[], index: number) {
  const line = lines[index]
  if (!line || (line.kind !== "add" && line.kind !== "remove")) return false
  const partner =
    line.kind === "remove" && lines[index + 1]?.kind === "add"
      ? lines[index + 1]
      : line.kind === "add" && lines[index - 1]?.kind === "remove"
        ? lines[index - 1]
        : null
  if (!partner) return false
  return normalizeCodeWhitespace(line.text) === normalizeCodeWhitespace(partner.text)
}

function counterpartForLine(lines: ParsedDiffLine[], index: number) {
  const line = lines[index]
  if (!line) return null
  if (line.kind === "remove" && lines[index + 1]?.kind === "add") return lines[index + 1]
  if (line.kind === "add" && lines[index - 1]?.kind === "remove") return lines[index - 1]
  return null
}

function reviewRowsFromDiff(lines: ParsedDiffLine[], options: { collapseContext: boolean; hideWhitespace: boolean }) {
  const source = lines.filter((line, index) => {
    if (line.kind === "meta" || line.kind === "hunk") return false
    if (options.hideWhitespace && isWhitespaceOnlyChange(lines, index)) return false
    return true
  })
  if (!options.collapseContext) {
    return source.map((line, index) => ({
      id: `line-${line.id}`,
      kind: "line" as const,
      line,
      counterpart: counterpartForLine(source, index),
    }))
  }

  const rows: ReviewDiffRow[] = []
  let index = 0
  while (index < source.length) {
    const line = source[index]
    if (!line) break
    if (line.kind !== "context") {
      rows.push({ id: `line-${line.id}`, kind: "line", line, counterpart: counterpartForLine(source, index) })
      index += 1
      continue
    }

    const start = index
    while (source[index]?.kind === "context") index += 1
    const run = source.slice(start, index)
    const previousChanged = start > 0 && source[start - 1]?.kind !== "context"
    const nextChanged = index < source.length && source[index]?.kind !== "context"
    const keepBefore = previousChanged ? 3 : 0
    const keepAfter = nextChanged ? 3 : 0
    const keepTotal = keepBefore + keepAfter

    if (run.length <= Math.max(6, keepTotal + 1)) {
      for (const item of run) rows.push({ id: `line-${item.id}`, kind: "line", line: item })
      continue
    }

    for (const item of run.slice(0, keepBefore)) rows.push({ id: `line-${item.id}`, kind: "line", line: item })
    const folded = run.length - keepTotal
    if (folded > 0) rows.push({ id: `fold-${run[0]?.id}-${run.at(-1)?.id}`, kind: "fold", count: folded })
    for (const item of keepAfter ? run.slice(-keepAfter) : []) rows.push({ id: `line-${item.id}`, kind: "line", line: item })
  }

  return rows
}

function ReviewDiffTable({
  rows,
  wrap,
  wordDiff,
}: {
  rows: ReviewDiffRow[]
  wrap: boolean
  wordDiff: boolean
}) {
  return (
    <div className="overflow-hidden rounded-lg border border-[var(--app-divider)] bg-[var(--app-code-bg)] text-xs leading-6 [font-family:var(--app-code-font)]">
      {rows.map((row) => {
        if (row.kind === "fold") {
          return (
            <div
              key={row.id}
              className="grid min-h-6 grid-cols-[54px_22px_minmax(0,1fr)] border-y border-dashed border-[var(--app-divider)] bg-[color-mix(in_srgb,var(--app-text)_2%,transparent)] first:border-t-0 last:border-b-0"
            >
              <div className="select-none border-r border-dashed border-[var(--app-divider)] px-2 py-0.5 text-center text-[11px] leading-6 tracking-widest text-[var(--app-subtle)]">
                ⋯
              </div>
              <div className="select-none px-2 py-0.5 text-center text-[11px] leading-6 text-[var(--app-subtle)]">
                ⋯
              </div>
              <div className="flex items-center gap-1.5 px-2 py-0.5 text-[11px] font-medium leading-6 tracking-wide text-[var(--app-subtle)]">
                <ChevronDownIcon className="h-3 w-3 opacity-60" />
                <span className="tabular-nums">{row.count} 行未修改</span>
              </div>
            </div>
          )
        }
        return (
          <ReviewDiffLine
            key={row.id}
            line={row.line}
            counterpart={row.counterpart}
            wrap={wrap}
            wordDiff={wordDiff}
          />
        )
      })}
    </div>
  )
}

function ReviewDiffLine({
  line,
  counterpart,
  wrap,
  wordDiff,
}: {
  line: ParsedDiffLine
  counterpart?: ParsedDiffLine | null
  wrap: boolean
  wordDiff: boolean
}) {
  const marker = diffLineMarker(line)
  return (
    <div
      className={cn(
        "grid min-h-6 grid-cols-[54px_22px_minmax(0,1fr)] border-l-4",
        line.kind === "add" && "border-[var(--app-success)] bg-[color-mix(in_srgb,var(--app-success)_19%,transparent)] text-[var(--app-text)]",
        line.kind === "remove" && "border-[var(--app-danger)] bg-[color-mix(in_srgb,var(--app-danger)_20%,transparent)] text-[var(--app-text)]",
        line.kind === "context" && "border-transparent text-[var(--app-muted)]",
      )}
    >
      <div
        className={cn(
          "select-none border-r border-[var(--app-divider)] px-2 py-0.5 text-right tabular-nums text-[var(--app-subtle)]",
          line.kind === "add" && "text-[color-mix(in_srgb,var(--app-success)_72%,var(--app-text))]",
          line.kind === "remove" && "text-[color-mix(in_srgb,var(--app-danger)_78%,var(--app-text))]",
        )}
      >
        {diffDisplayLineNumber(line)}
      </div>
      <div className="select-none px-2 py-0.5 text-center text-[var(--app-subtle)]">{marker}</div>
      <div className={cn("px-2 py-0.5", wrap ? "whitespace-pre-wrap break-words" : "overflow-visible whitespace-pre")}>
        {wordDiff && counterpart && (line.kind === "add" || line.kind === "remove")
          ? renderWordDiff(line.text, counterpart.text, line.kind)
          : line.text || " "}
      </div>
    </div>
  )
}

function renderWordDiff(text: string, compareText: string, kind: "add" | "remove") {
  let start = 0
  const maxStart = Math.min(text.length, compareText.length)
  while (start < maxStart && text[start] === compareText[start]) start += 1

  let end = 0
  const maxEnd = Math.min(text.length - start, compareText.length - start)
  while (end < maxEnd && text[text.length - 1 - end] === compareText[compareText.length - 1 - end]) end += 1

  const before = text.slice(0, start)
  const middle = text.slice(start, text.length - end)
  const after = end ? text.slice(text.length - end) : ""
  if (!middle) return text || " "

  return (
    <>
      {before}
      <span
        className={cn(
          "rounded px-0.5",
          kind === "add"
            ? "bg-[color-mix(in_srgb,var(--app-success)_32%,transparent)]"
            : "bg-[color-mix(in_srgb,var(--app-danger)_34%,transparent)]",
        )}
      >
        {middle}
      </span>
      {after}
    </>
  )
}

function ReviewMenuItem({
  icon: Icon,
  label,
  disabled,
  active,
  onClick,
}: {
  icon: IconComponent
  label: string
  disabled?: boolean
  active?: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      className={cn(
        "flex h-9 w-full items-center gap-2 rounded-md px-3 text-left text-sm font-medium text-[var(--app-muted)] hover:bg-[var(--app-hover)] hover:text-[var(--app-text)] disabled:pointer-events-none disabled:opacity-45",
        active && "text-[var(--app-text)]",
      )}
      disabled={disabled}
      onClick={onClick}
    >
      <Icon className="h-4 w-4 shrink-0" />
      <span className="min-w-0 flex-1">{label}</span>
      {active ? <CheckCircle2Icon className="h-3.5 w-3.5 shrink-0 text-[var(--app-success)]" /> : null}
    </button>
  )
}

function CodeReviewPreviewBody({
  diffs,
  selectedFile,
  workspaceDirectory,
}: {
  diffs: SessionDiffFile[]
  selectedFile?: string | null
  workspaceDirectory?: string | null
}) {
  const [activeFile, setActiveFile] = useState(() => selectedFile ?? diffs[0]?.file ?? "")
  const [view, setView] = useState<"changes" | "file">("changes")
  const [filePreview, setFilePreview] = useState<LocalFilePreview | null>(null)
  const [fileLoading, setFileLoading] = useState(false)
  const [fileError, setFileError] = useState<string | null>(null)
  const [menuOpen, setMenuOpen] = useState(false)
  const [wrap, setWrap] = useState(false)
  const [collapseContext, setCollapseContext] = useState(true)
  const [loadFullFile, setLoadFullFile] = useState(true)
  const [richPreview, setRichPreview] = useState(false)
  const [wordDiff, setWordDiff] = useState(false)
  const [hideWhitespace, setHideWhitespace] = useState(false)
  const [reloadKey, setReloadKey] = useState(0)
  const menuRef = useRef<HTMLDivElement>(null)
  useOutsideClick(menuRef, () => setMenuOpen(false), menuOpen)
  const diff = useMemo(
    () => diffs.find((item) => item.file === activeFile) ?? diffs.find((item) => item.file === selectedFile) ?? diffs[0],
    [activeFile, diffs, selectedFile],
  )

  useEffect(() => {
    if (selectedFile && diffs.some((item) => item.file === selectedFile)) {
      setActiveFile(selectedFile)
      return
    }
    setActiveFile((current) => {
      if (diffs.some((item) => item.file === current)) return current
      return diffs[0]?.file ?? ""
    })
  }, [diffs, selectedFile])

  const filePath = useMemo(() => diff ? resolveWorkspaceFilePath(diff.file, workspaceDirectory) : "", [diff?.file, workspaceDirectory])
  const lines = useMemo(() => parseUnifiedDiff(diff?.patch || ""), [diff?.patch])
  const visibleDiffLines = useMemo(() => lines.filter((line) => line.kind !== "meta"), [lines])
  const reviewRows = useMemo(
    () => reviewRowsFromDiff(visibleDiffLines, { collapseContext, hideWhitespace }),
    [collapseContext, hideWhitespace, visibleDiffLines],
  )
  const markdownFile = isMarkdownPath(filePath)
  const totalAdditions = useMemo(() => diffs.reduce((sum, item) => sum + item.additions, 0), [diffs])
  const totalDeletions = useMemo(() => diffs.reduce((sum, item) => sum + item.deletions, 0), [diffs])

  useEffect(() => {
    if (!diff || !filePath) {
      setFilePreview(null)
      setFileError(null)
      setFileLoading(false)
      return
    }
    if (!loadFullFile && view !== "file") {
      setFilePreview(null)
      setFileError(null)
      setFileLoading(false)
      return
    }
    let cancelled = false
    setFileLoading(true)
    setFileError(null)
    readFilePreview(filePath)
      .then((preview) => {
        if (cancelled) return
        setFilePreview(preview)
      })
      .catch((error) => {
        if (cancelled) return
        setFilePreview(null)
        setFileError(getErrorMessage(error) ?? "无法读取完整文件。")
      })
      .finally(() => {
        if (!cancelled) setFileLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [diff, filePath, loadFullFile, reloadKey, view])

  if (!diff) {
    return (
      <div className="px-4 py-4">
        <div className="rounded-lg border border-dashed border-[var(--app-divider)] px-4 py-8 text-center text-sm font-medium text-[var(--app-subtle)]">
          暂无可审查的代码差异。
        </div>
      </div>
    )
  }

  function refreshFile() {
    setLoadFullFile(true)
    setReloadKey((value) => value + 1)
    setMenuOpen(false)
  }

  function copyGitApplyCommand() {
    const command = `git apply <<'PATCH'\n${diff.patch || ""}\nPATCH`
    void navigator.clipboard?.writeText(command)
    setMenuOpen(false)
  }

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-[var(--app-bg)]">
      <div className="shrink-0 border-b border-[var(--app-divider)] px-4 py-2.5">
        <div className="flex items-center justify-between gap-3">
          <button
            type="button"
            className="-mx-1.5 flex min-w-0 items-center gap-1.5 rounded-md px-1.5 py-1 text-left text-[13px] font-medium text-[var(--app-muted)] hover:bg-[var(--app-hover)] hover:text-[var(--app-text)]"
            onClick={() => setView("changes")}
          >
            <GitBranchIcon className="h-3.5 w-3.5 shrink-0 opacity-70" />
            <span className="truncate">上一轮对话</span>
            <ChevronDownIcon className="h-3.5 w-3.5 shrink-0 opacity-60" />
          </button>
          <div className="flex shrink-0 items-center gap-1">
            <div className="mr-1 flex items-center gap-2 rounded-full border border-[var(--app-divider)] bg-[color-mix(in_srgb,var(--app-text)_3%,transparent)] px-2.5 py-0.5 text-[11px] font-semibold tabular-nums leading-5">
              <span className="text-[var(--app-success)]">+{totalAdditions}</span>
              <span className="h-2.5 w-px bg-[var(--app-divider)]" />
              <span className="text-[var(--app-danger)]">−{totalDeletions}</span>
            </div>
            <div ref={menuRef} className="relative">
              <button
                type="button"
                className={cn(
                  "flex h-7 w-7 items-center justify-center rounded-md text-[var(--app-muted)] hover:bg-[var(--app-hover)] hover:text-[var(--app-text)]",
                  menuOpen && "bg-[var(--app-selected)] text-[var(--app-text)]",
                )}
                title="审查选项"
                onClick={() => setMenuOpen((value) => !value)}
              >
                <MoreHorizontalIcon className="h-4 w-4" />
              </button>
              {menuOpen ? (
                <div className="absolute right-0 top-[calc(100%+8px)] z-[80] w-72 rounded-xl border border-[var(--app-border)] bg-[var(--app-panel)] p-2 shadow-2xl shadow-black/45">
                  <ReviewMenuItem icon={RefreshCwIcon} label="刷新" onClick={refreshFile} />
                  <ReviewMenuItem icon={WrapTextIcon} label="启用自动换行" active={wrap} onClick={() => setWrap((value) => !value)} />
                  <ReviewMenuItem icon={ChevronDownIcon} label={collapseContext ? "展开全部差异" : "折叠全部差异"} active={collapseContext} onClick={() => setCollapseContext((value) => !value)} />
                  <div className="my-1 h-px bg-[var(--app-divider)]" />
                  <ReviewMenuItem icon={FileTextIcon} label="不加载完整文件" active={!loadFullFile} onClick={() => setLoadFullFile((value) => !value)} />
                  <ReviewMenuItem icon={ImageIcon} label="启用富文本预览" active={richPreview} onClick={() => setRichPreview((value) => !value)} />
                  <ReviewMenuItem icon={FileDiffIcon} label="启用文字差异" active={wordDiff} onClick={() => setWordDiff((value) => !value)} />
                  <ReviewMenuItem icon={EyeOffIcon} label="隐藏空白字符" active={hideWhitespace} onClick={() => setHideWhitespace((value) => !value)} />
                  <ReviewMenuItem icon={ClipboardIcon} label="复制 git apply 命令" disabled={!diff.patch} onClick={copyGitApplyCommand} />
                </div>
              ) : null}
            </div>
            <span className="mx-0.5 h-4 w-px bg-[var(--app-divider)]" />
            <button
              type="button"
              className={cn(
                "flex h-7 w-7 items-center justify-center rounded-md text-[var(--app-muted)] hover:bg-[var(--app-hover)] hover:text-[var(--app-text)]",
                wordDiff && "bg-[var(--app-selected)] text-[var(--app-text)]",
              )}
              title="文字差异"
              onClick={() => setWordDiff((value) => !value)}
            >
              <FileDiffIcon className="h-4 w-4" />
            </button>
            <button
              type="button"
              className={cn(
                "flex h-7 w-7 items-center justify-center rounded-md text-[var(--app-muted)] hover:bg-[var(--app-hover)] hover:text-[var(--app-text)]",
                view === "file" && "bg-[var(--app-selected)] text-[var(--app-text)]",
              )}
              title="完整文件"
              onClick={() => setView((value) => (value === "file" ? "changes" : "file"))}
            >
              <FileTextIcon className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>
      <div className="min-h-0 flex flex-1 overflow-hidden">
        {diffs.length > 1 ? (
          <ReviewFileRail
            diffs={diffs}
            activeFile={diff.file}
            onSelect={(file) => {
              setActiveFile(file)
              setView("changes")
            }}
          />
        ) : null}
        <div className="min-h-0 min-w-0 flex-1 overflow-auto px-4 py-4">
        {view === "changes" ? (
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-2 rounded-md border border-[var(--app-divider)] bg-[color-mix(in_srgb,var(--app-text)_2.5%,transparent)] px-2.5 py-1.5">
              <div className="flex min-w-0 items-center gap-1.5 [font-family:var(--app-code-font)]" title={filePath}>
                <FolderOpenIcon className="h-3.5 w-3.5 shrink-0 text-[var(--app-subtle)]" />
                {(() => {
                  const parts = diff.file.split(/[\\/]/).filter(Boolean)
                  const name = parts.pop() ?? diff.file
                  const dir = parts.join("/")
                  return (
                    <>
                      {dir ? (
                        <span className="min-w-0 truncate text-[11px] text-[var(--app-subtle)]">
                          {dir}
                          <span className="px-0.5 opacity-50">/</span>
                        </span>
                      ) : null}
                      <span className="shrink-0 truncate text-[12.5px] font-semibold text-[var(--app-text)]">
                        {name}
                      </span>
                    </>
                  )
                })()}
              </div>
              <button
                type="button"
                className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-[var(--app-muted)] hover:bg-[var(--app-hover)] hover:text-[var(--app-text)]"
                title={collapseContext ? "展开全部差异" : "折叠全部差异"}
                onClick={() => setCollapseContext((value) => !value)}
              >
                <ChevronDownIcon className={cn("h-4 w-4 transition-transform", collapseContext && "-rotate-90")} />
              </button>
            </div>
            {loadFullFile && fileError ? (
              <div className="flex items-center gap-2 text-sm font-medium text-[var(--app-muted)]">
                <span>完整文件内容加载失败</span>
                <button
                  type="button"
                  className="h-7 rounded-full border border-[var(--app-divider)] px-3 text-xs font-semibold text-[var(--app-text)] hover:bg-[var(--app-hover)]"
                  onClick={refreshFile}
                >
                  重试
                </button>
              </div>
            ) : null}
            {reviewRows.length ? (
              <ReviewDiffTable rows={reviewRows} wrap={wrap} wordDiff={wordDiff} />
            ) : (
              <div className="rounded-lg border border-dashed border-[var(--app-divider)] px-4 py-8 text-center text-sm font-medium text-[var(--app-subtle)]">
                {hideWhitespace ? "隐藏空白变更后暂无可显示对比。" : "该文件暂无可显示对比。"}
              </div>
            )}
          </div>
        ) : fileLoading ? (
          <div className="flex items-center gap-2 text-sm font-medium text-[var(--app-muted)]">
            <Loader2Icon className="h-4 w-4 animate-spin" />
            正在读取完整文件
          </div>
        ) : fileError ? (
          <div className="rounded-lg border border-[color-mix(in_srgb,var(--app-danger)_45%,transparent)] bg-[var(--app-danger-soft)] px-3 py-2 text-sm leading-6 text-[var(--app-danger)]">
            {fileError}
          </div>
        ) : filePreview?.binary ? (
          <div className="rounded-lg border border-[var(--app-divider)] bg-[var(--app-panel)] p-4 text-sm leading-6 text-[var(--app-muted)]">
            这是二进制文件，无法在这里预览。
          </div>
        ) : richPreview && markdownFile ? (
          <MessageMarkdown
            text={filePreview?.content || "文件为空。"}
            className="w-full"
            workspaceDirectory={workspaceDirectory}
          />
        ) : (
          <pre className="overflow-auto whitespace-pre-wrap break-words rounded-lg border border-[var(--app-divider)] bg-[var(--app-code-bg)] p-3 text-xs leading-5 text-[var(--app-text)] [font-family:var(--app-code-font)]">
            {filePreview?.content || "文件为空。"}
          </pre>
        )}
        </div>
      </div>
    </div>
  )
}

function ReviewFileRail({
  diffs,
  activeFile,
  onSelect,
}: {
  diffs: SessionDiffFile[]
  activeFile: string
  onSelect: (file: string) => void
}) {
  return (
    <aside className="hidden min-h-0 w-64 shrink-0 flex-col border-r border-[var(--app-divider)] bg-[color-mix(in_srgb,var(--app-inspector)_82%,var(--app-bg))] lg:flex">
      <div className="shrink-0 border-b border-[var(--app-divider)] px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-[var(--app-subtle)]">
        变更文件
      </div>
      <div className="min-h-0 flex-1 overflow-auto p-2">
        {diffs.map((diff) => {
          const active = diff.file === activeFile
          return (
            <button
              key={diff.file}
              type="button"
              className={cn(
                "mb-1 w-full rounded-md border px-2.5 py-2 text-left transition-colors",
                active
                  ? "border-[var(--app-border)] bg-[var(--app-selected)] text-[var(--app-text)]"
                  : "border-transparent text-[var(--app-muted)] hover:bg-[var(--app-hover)] hover:text-[var(--app-text)]",
              )}
              onClick={() => onSelect(diff.file)}
            >
              <div className="flex min-w-0 items-center gap-2">
                <FileDiffIcon className="h-3.5 w-3.5 shrink-0 text-[var(--app-subtle)]" />
                <span className="min-w-0 flex-1 truncate text-xs font-semibold">{getPathName(diff.file)}</span>
              </div>
              <div className="mt-1 truncate text-[11px] text-[var(--app-subtle)]" title={diff.file}>
                {diff.file}
              </div>
              <div className="mt-1.5 flex items-center gap-2 text-[11px] font-semibold">
                <span className="text-[var(--app-subtle)]">{diffStatusLabel(diff.status)}</span>
                <span className="text-[var(--app-success)]">+{diff.additions}</span>
                <span className="text-[var(--app-danger)]">-{diff.deletions}</span>
              </div>
            </button>
          )
        })}
      </div>
    </aside>
  )
}

function TerminalPreviewBody({ title, content }: { title: string; content: string }) {
  return (
    <div className="px-4 py-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="min-w-0 truncate text-xs font-medium text-[var(--app-subtle)]">{title}</div>
        <button
          type="button"
          className="h-7 rounded-md px-2 text-xs font-medium text-[var(--app-muted)] hover:bg-[var(--app-hover)] hover:text-[var(--app-text)]"
          onClick={() => void navigator.clipboard?.writeText(content)}
        >
          复制
        </button>
      </div>
      <pre className="max-h-[calc(100vh-128px)] overflow-auto whitespace-pre-wrap break-words rounded-lg border border-[var(--app-divider)] bg-[var(--app-code-bg)] p-3 text-xs leading-5 text-[var(--app-text)] [font-family:var(--app-code-font)]">
        {content || "暂无输出。"}
      </pre>
    </div>
  )
}

function LocalFileContextMenu({
  menu,
  onPreview,
  onOpenWith,
  onClose,
}: {
  menu: LocalFileMenuState
  onPreview: (path: string) => void
  onOpenWith: (path: string, target: OpenPathTarget) => void
  onClose: () => void
}) {
  const left = Math.max(8, Math.min(menu.x, window.innerWidth - 280))
  const top = Math.max(8, Math.min(menu.y, window.innerHeight - 260))

  function copyPath() {
    void navigator.clipboard?.writeText(menu.path)
    onClose()
  }

  return (
    <div
      className="fixed z-[90] w-56 overflow-visible rounded-lg border border-[var(--app-border)] bg-[var(--app-panel)] p-1.5 text-sm font-medium text-[var(--app-text)] shadow-2xl shadow-black/40"
      style={{ left, top }}
      onClick={(event) => event.stopPropagation()}
      onContextMenu={(event) => event.preventDefault()}
    >
      <LocalFileMenuButton label="在右侧打开" onClick={() => onPreview(menu.path)} />
      <LocalFileMenuButton label="在 Terminal 中打开" onClick={() => onOpenWith(menu.path, "terminal")} />
      <div className="relative group/filemenu">
        <button
          type="button"
          className="flex h-9 w-full items-center justify-between rounded-md px-3 text-left hover:bg-[var(--app-hover)]"
        >
          <span>打开方式</span>
          <ChevronRightIcon className="h-4 w-4 text-[var(--app-muted)]" />
        </button>
        <div className="invisible absolute left-[calc(100%+6px)] top-0 w-44 rounded-lg border border-[var(--app-border)] bg-[var(--app-panel)] p-1.5 opacity-0 shadow-2xl shadow-black/40 group-hover/filemenu:visible group-hover/filemenu:opacity-100">
          <LocalFileMenuButton label="VS Code" onClick={() => onOpenWith(menu.path, "editor")} />
          <LocalFileMenuButton label="Cursor" onClick={() => onOpenWith(menu.path, "cursor")} />
          <LocalFileMenuButton label="Default app" onClick={() => onOpenWith(menu.path, "system")} />
          <LocalFileMenuButton label="File Explorer" onClick={() => onOpenWith(menu.path, "explorer")} />
          <LocalFileMenuButton label="Terminal" onClick={() => onOpenWith(menu.path, "terminal")} />
        </div>
      </div>
      <div className="my-1 h-px bg-[var(--app-divider)]" />
      <LocalFileMenuButton label="复制路径" onClick={copyPath} />
      <LocalFileMenuButton label="在资源管理器中打开" onClick={() => onOpenWith(menu.path, "explorer")} />
    </div>
  )
}

function LocalFileMenuButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      className="flex h-9 w-full items-center rounded-md px-3 text-left hover:bg-[var(--app-hover)]"
      onClick={onClick}
    >
      {label}
    </button>
  )
}

function DiffSummaryCard({
  diffs,
  onOpenDiff,
  onOpenReview,
  defaultExpanded = false,
}: {
  diffs: SessionDiffFile[]
  onOpenDiff?: (diff: SessionDiffFile) => void
  onOpenReview?: (diffs: SessionDiffFile[], selectedDiff?: SessionDiffFile | null) => void
  defaultExpanded?: boolean
}) {
  const [expandedFiles, setExpandedFiles] = useState<Set<string>>(
    () => new Set(defaultExpanded ? diffs.map((diff) => diff.file) : []),
  )
  const totalAdditions = diffs.reduce((total, diff) => total + diff.additions, 0)
  const totalDeletions = diffs.reduce((total, diff) => total + diff.deletions, 0)

  useEffect(() => {
    setExpandedFiles((current) => {
      const existing = new Set(diffs.map((diff) => diff.file))
      const next = new Set([...current].filter((file) => existing.has(file)))
      return next.size === current.size ? current : next
    })
  }, [diffs])

  function toggleFile(file: string) {
    setExpandedFiles((current) => {
      const next = new Set(current)
      if (next.has(file)) next.delete(file)
      else next.add(file)
      return next
    })
  }

  return (
    <div className="overflow-hidden rounded-lg border border-[var(--app-divider)] bg-[var(--app-panel)] shadow-sm">
      <div className="flex items-center justify-between gap-3 border-b border-[var(--app-divider)] bg-[color-mix(in_srgb,var(--app-inspector)_88%,var(--app-panel))] px-4 py-3">
        <div className="min-w-0">
          <div className="flex min-w-0 items-center gap-2">
            <FileDiffIcon className="h-4 w-4 shrink-0 text-[var(--app-muted)]" />
            <div className="truncate text-sm font-semibold text-[var(--app-text)]">代码审查</div>
            <span className="rounded-full border border-[var(--app-divider)] px-2 py-0.5 text-[11px] font-semibold text-[var(--app-muted)]">
              {diffs.length} 个文件
            </span>
          </div>
          <div className="mt-1 flex shrink-0 items-center gap-1.5 text-xs font-medium">
            <span className="text-[var(--app-success)]">+{totalAdditions}</span>
            <span className="text-[var(--app-danger)]">-{totalDeletions}</span>
          </div>
        </div>
        <button
          type="button"
          className="flex h-8 shrink-0 items-center gap-1.5 rounded-md px-2.5 text-xs font-semibold text-[var(--app-muted)] hover:bg-[var(--app-hover)] hover:text-[var(--app-text)] disabled:opacity-45"
          disabled={(!onOpenReview && !onOpenDiff) || !diffs[0]}
          onClick={() => {
            if (!diffs[0]) return
            if (onOpenReview) onOpenReview(diffs, diffs[0])
            else onOpenDiff?.(diffs[0])
          }}
        >
          <span>打开审查</span>
          <PanelRightIcon className="h-3.5 w-3.5" />
        </button>
      </div>
      <div className="max-h-[70vh] divide-y divide-[var(--app-divider)] overflow-auto">
        {diffs.map((diff) => (
          <DiffSummaryFileRow
            key={diff.file}
            diff={diff}
            expanded={expandedFiles.has(diff.file)}
            onToggle={() => toggleFile(diff.file)}
            onOpenDiff={onOpenReview ? (selected) => onOpenReview(diffs, selected) : onOpenDiff}
          />
        ))}
      </div>
    </div>
  )
}

function DiffSummaryFileRow({
  diff,
  expanded,
  onToggle,
  onOpenDiff,
}: {
  diff: SessionDiffFile
  expanded: boolean
  onToggle: () => void
  onOpenDiff?: (diff: SessionDiffFile) => void
}) {
  return (
    <div>
      <div className="grid w-full grid-cols-[minmax(0,1fr)_auto] gap-3 px-4 py-3 hover:bg-[var(--app-hover)]">
        <button type="button" className="flex min-w-0 items-center gap-3 text-left" onClick={onToggle}>
          <ChevronDownIcon className={cn("h-3.5 w-3.5 shrink-0 text-[var(--app-subtle)] transition-transform", !expanded && "-rotate-90")} />
          <FileDiffIcon className="h-4 w-4 shrink-0 text-[var(--app-muted)]" />
          <span className="min-w-0 truncate text-sm font-medium text-[var(--app-text)]">{diff.file}</span>
        </button>
        <div className="flex shrink-0 items-center gap-2 text-xs">
          <span className="text-[var(--app-subtle)]">{diffStatusLabel(diff.status)}</span>
          <span className="text-[var(--app-success)]">+{diff.additions}</span>
          <span className="text-[var(--app-danger)]">-{diff.deletions}</span>
          <button
            type="button"
            className="ml-1 rounded px-1.5 py-0.5 text-[11px] font-semibold text-[var(--app-muted)] hover:bg-[var(--app-hover-strong)] hover:text-[var(--app-text)] disabled:opacity-45"
            disabled={!onOpenDiff}
            onClick={() => onOpenDiff?.(diff)}
          >
            查看
          </button>
        </div>
      </div>
      {expanded ? (
        <div className="border-t border-[var(--app-divider)] bg-[var(--app-code-bg)] px-3 py-3">
          <InlineDiffPreview diff={diff} onOpenDiff={onOpenDiff} />
        </div>
      ) : null}
    </div>
  )
}

function InlineDiffPreview({ diff, onOpenDiff }: { diff: SessionDiffFile; onOpenDiff?: (diff: SessionDiffFile) => void }) {
  const lines = useMemo(() => parseUnifiedDiff(diff.patch || ""), [diff.patch])
  const visibleDiffLines = lines.filter((line) => line.kind !== "meta")

  if (!visibleDiffLines.length) {
    return (
      <div className="flex items-center justify-between gap-3 rounded-md border border-dashed border-[var(--app-divider)] bg-[var(--app-panel)] px-3 py-3 text-xs font-medium text-[var(--app-subtle)]">
        <span>该文件暂无可显示 patch。</span>
        <button
          type="button"
          className="rounded px-2 py-1 text-[var(--app-muted)] hover:bg-[var(--app-hover)] hover:text-[var(--app-text)] disabled:opacity-45"
          disabled={!onOpenDiff}
          onClick={() => onOpenDiff?.(diff)}
        >
          在右侧查看
        </button>
      </div>
    )
  }

  return (
    <div className="overflow-hidden rounded-md border border-[var(--app-divider)] bg-[var(--app-code-bg)] text-xs leading-5 [font-family:var(--app-code-font)]">
      <div className="max-h-[360px] overflow-auto">
        <DiffLineTable lines={visibleDiffLines} compact />
      </div>
      <div className="flex items-center justify-end border-t border-[var(--app-divider)] bg-[var(--app-panel)] px-2 py-1.5">
        <button
          type="button"
          className="rounded px-2 py-1 text-[11px] font-semibold text-[var(--app-muted)] hover:bg-[var(--app-hover)] hover:text-[var(--app-text)] disabled:opacity-45"
          disabled={!onOpenDiff}
          onClick={() => onOpenDiff?.(diff)}
        >
          在右侧审核完整文件
        </button>
      </div>
    </div>
  )
}

function ConversationTimeline({
  items,
  activeId,
  onSelect,
}: {
  items: ThreadTimelineItem[]
  activeId?: string | null
  onSelect: (id: string) => void
}) {
  const [preview, setPreview] = useState<{ item: ThreadTimelineItem; x: number; y: number } | null>(null)
  if (!items.length) return null

  function itemTop(index: number) {
    return items.length <= 1 ? 4 : 4 + (index / (items.length - 1)) * 92
  }

  const activeIndex = Math.max(0, items.findIndex((item, index) => item.id === activeId || (!activeId && index === 0)))
  const activeTop = itemTop(activeIndex)

  function showPreview(item: ThreadTimelineItem, element: HTMLElement) {
    const rect = element.getBoundingClientRect()
    const maxTop = Math.max(72, window.innerHeight - 156)
    setPreview({
      item,
      x: rect.right + 10,
      y: Math.min(Math.max(64, rect.top - 16), maxTop),
    })
  }

  return (
    <div className="pointer-events-none absolute bottom-44 left-3 top-8 z-20 hidden w-10 xl:block">
      <div className="relative h-full w-full">
        <div className="absolute bottom-1 left-1/2 top-1 w-5 -translate-x-1/2 rounded-full border border-[color-mix(in_srgb,var(--app-text)_10%,transparent)] bg-[color-mix(in_srgb,var(--app-panel)_72%,transparent)] shadow-[0_10px_30px_rgba(0,0,0,0.12)] backdrop-blur-sm" />
        <div className="absolute bottom-5 left-1/2 top-5 w-px -translate-x-1/2 bg-[color-mix(in_srgb,var(--app-text)_24%,transparent)]" />
        <div
          className="absolute left-1/2 h-10 w-[3px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[var(--app-accent)] shadow-[0_0_0_4px_color-mix(in_srgb,var(--app-accent)_12%,transparent),0_8px_22px_color-mix(in_srgb,var(--app-accent)_28%,transparent)] transition-[top,height] duration-200 ease-out"
          style={{ top: `${activeTop}%` }}
        />
        {items.map((item, index) => {
          const active = item.id === activeId || (!activeId && index === 0)
          const top = itemTop(index)
          return (
            <button
              key={item.id}
              type="button"
              className="group/timeline pointer-events-auto absolute left-1/2 flex h-8 w-8 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full outline-none"
              style={{ top: `${top}%` }}
              title={`${item.label}: ${item.preview}`}
              aria-label={`${item.label}: ${item.preview}`}
              onClick={() => onSelect(item.id)}
              onFocus={(event) => showPreview(item, event.currentTarget)}
              onBlur={() => setPreview(null)}
              onMouseEnter={(event) => showPreview(item, event.currentTarget)}
              onMouseLeave={() => setPreview(null)}
            >
              <span
                className={cn(
                  "relative flex h-5 w-5 items-center justify-center rounded-full border bg-[var(--app-bg)] transition-[border-color,box-shadow,transform,background-color] duration-150 group-hover/timeline:scale-110 group-focus-visible/timeline:scale-110",
                  active
                    ? "border-[var(--app-accent)] bg-[color-mix(in_srgb,var(--app-accent)_14%,var(--app-bg))] shadow-[0_0_0_5px_color-mix(in_srgb,var(--app-accent)_16%,transparent),0_8px_24px_color-mix(in_srgb,var(--app-accent)_24%,transparent)]"
                    : "border-[color-mix(in_srgb,var(--app-text)_24%,var(--app-bg))] shadow-[0_1px_0_color-mix(in_srgb,var(--app-text)_10%,transparent)_inset] group-hover/timeline:border-[color-mix(in_srgb,var(--app-accent)_78%,var(--app-muted))] group-hover/timeline:bg-[color-mix(in_srgb,var(--app-accent)_8%,var(--app-bg))] group-focus-visible/timeline:border-[color-mix(in_srgb,var(--app-accent)_78%,var(--app-muted))]",
                )}
              >
                <span
                  className={cn(
                    "block rounded-full transition-[height,width,background-color] duration-150",
                    active ? "h-2.5 w-2.5 bg-[var(--app-accent)]" : "h-1.5 w-1.5 bg-[color-mix(in_srgb,var(--app-text)_38%,transparent)] group-hover/timeline:bg-[var(--app-accent)]",
                  )}
                />
              </span>
            </button>
          )
        })}
      </div>
      {preview ? (
        <div
          className="pointer-events-none fixed z-50 w-80 rounded-[var(--app-radius-lg)] border border-[color-mix(in_srgb,var(--app-text)_12%,transparent)] bg-[color-mix(in_srgb,var(--app-panel)_92%,transparent)] px-3.5 py-3 text-left shadow-[var(--app-elevation-2)] backdrop-blur-xl"
          style={{ left: preview.x, top: preview.y }}
        >
          <div className="absolute left-[-5px] top-7 h-2.5 w-2.5 rotate-45 border-b border-l border-[color-mix(in_srgb,var(--app-text)_12%,transparent)] bg-[color-mix(in_srgb,var(--app-panel)_92%,transparent)]" />
          <div className="flex items-center justify-between gap-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--app-subtle)]">
            <span>{preview.item.label}</span>
            {preview.item.createdAt ? (
              <span className="tabular-nums">{formatClockTime(preview.item.createdAt)}</span>
            ) : null}
          </div>
          <div className="mt-2 max-h-24 overflow-hidden text-[13px] font-medium leading-5 text-[var(--app-text)]">
            {preview.item.preview}
          </div>
        </div>
      ) : null}
    </div>
  )
}

function AttachmentChip({
  attachment,
  onPreview,
  onRemove,
}: {
  attachment: PromptAttachment
  onPreview?: () => void
  onRemove: () => void
}) {
  const image = attachment.mime.startsWith("image/")

  return (
    <div className="flex h-10 max-w-[240px] items-center gap-2 rounded-md border border-[var(--app-border)] bg-[var(--app-panel-2)] px-2 text-xs font-medium text-[var(--app-text)]">
      <button
        type="button"
        className="flex min-w-0 flex-1 items-center gap-2 text-left disabled:pointer-events-none"
        disabled={!onPreview}
        onClick={onPreview}
      >
        {image ? (
          <img src={attachment.url} alt="" className="h-7 w-7 shrink-0 rounded object-cover" />
        ) : (
          <FileTextIcon className="h-4 w-4 shrink-0 text-[var(--app-muted)]" />
        )}
      <div className="min-w-0 flex-1">
        <div className="truncate">{attachment.name}</div>
        <div className="text-[11px] text-[var(--app-subtle)]">{formatBytes(attachment.size)}</div>
      </div>
      </button>
      <button
        type="button"
        className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-[var(--app-muted)] hover:bg-[var(--app-hover)] hover:text-[var(--app-text)]"
        title="移除附件"
        onClick={onRemove}
      >
        <XIcon className="h-3.5 w-3.5" />
      </button>
    </div>
  )
}

function PendingGuideBar({
  guide,
  hiddenCount,
  menuOpen,
  onToggleMenu,
  onRemove,
  onCopy,
  onRestore,
  onClear,
  canStop,
  onSubmit,
  onStopAndSubmit,
}: {
  guide: PendingGuide
  hiddenCount: number
  menuOpen: boolean
  onToggleMenu: () => void
  onRemove: () => void
  onCopy: () => void
  onRestore: () => void
  onClear: () => void
  canStop: boolean
  onSubmit: () => void
  onStopAndSubmit: () => void
}) {
  const failed = guide.status === "failed"
  const sending = guide.status === "sending"
  const submitted = guide.status === "submitted"
  const staged = guide.status === "staged"
  const status = failed ? "提交失败" : sending ? "正在提交" : submitted ? "已提交" : "待提交"
  const submitLabel = failed ? "重试" : sending ? "提交中" : submitted ? "重发" : "提交"
  const submitTitle = failed
    ? "重新发送这条内容"
    : sending
      ? "正在发送中"
      : submitted
        ? "再发一次（追加为新的提示）"
        : "提交这条引导"
  const showStopAndSubmit = canStop && !sending && !submitted

  return (
    <div
      className={cn(
        "mb-4 flex min-h-11 items-center justify-between gap-3 rounded-2xl border px-3 py-2 text-xs font-medium",
        failed
          ? "border-[var(--app-danger)] bg-[var(--app-danger-soft)] text-[var(--app-danger)]"
          : "border-[var(--app-border)] bg-[var(--app-hover)] text-[var(--app-muted)]",
      )}
      title={failed ? guide.error : undefined}
    >
      <div className="flex min-w-0 flex-1 items-center gap-2">
        {sending ? (
          <Loader2Icon className="h-3.5 w-3.5 shrink-0 animate-spin" />
        ) : submitted ? (
          <CheckCircle2Icon className="h-3.5 w-3.5 shrink-0" />
        ) : (
          <ListPlusIcon className="h-3.5 w-3.5 shrink-0" />
        )}
        <span className={cn("min-w-0 truncate text-[13px]", failed ? "text-[var(--app-danger)]" : "text-[var(--app-text)]")}>
          {guideSummary(guide)}
        </span>
        {guide.attachments.length ? (
          <span className="shrink-0 rounded-full bg-[var(--app-selected)] px-1.5 py-0.5 text-[10px] text-[var(--app-muted)]">
            {guide.attachments.length} 附件
          </span>
        ) : null}
        {hiddenCount ? (
          <span className="shrink-0 rounded-full bg-[var(--app-selected)] px-1.5 py-0.5 text-[10px] text-[var(--app-muted)]">
            +{hiddenCount}
          </span>
        ) : null}
        <span className={cn("hidden shrink-0 text-[11px] sm:inline", failed ? "text-[var(--app-danger)]" : "text-[var(--app-subtle)]")}>
          {status}
        </span>
      </div>
      <div className="flex shrink-0 items-center gap-1">
        <button
          type="button"
          className={cn(
            "flex h-7 items-center gap-1 rounded-full px-2.5 text-[11px] font-medium transition-colors disabled:opacity-50",
            failed
              ? "bg-[var(--app-danger-soft)] text-[var(--app-danger)] hover:bg-[color-mix(in_srgb,var(--app-danger)_22%,transparent)]"
              : "bg-[var(--app-panel)] text-[var(--app-text)] hover:bg-[var(--app-hover-strong)]",
          )}
          title={submitTitle}
          onClick={onSubmit}
          disabled={sending}
        >
          {sending ? (
            <Loader2Icon className="h-3.5 w-3.5 animate-spin" />
          ) : submitted ? (
            <ListPlusIcon className="h-3.5 w-3.5" />
          ) : (
            <SendIcon className="h-3.5 w-3.5" />
          )}
          <span>{submitLabel}</span>
        </button>
        {showStopAndSubmit ? (
          <button
            type="button"
            className="flex h-7 items-center gap-1 rounded-full bg-[var(--app-text)] px-2.5 text-[11px] font-semibold text-[var(--app-bg)] transition-opacity hover:opacity-90"
            title={failed ? "停止当前回合并重试这条引导" : staged ? "停止当前回合并提交这条引导" : "停止当前回合并提交"}
            onClick={onStopAndSubmit}
          >
            <SquareIcon className="h-3.5 w-3.5" />
            <span>{failed ? "停止并重试" : "停止并提交"}</span>
          </button>
        ) : null}
        <button
          type="button"
          className="flex h-7 w-7 items-center justify-center rounded-full text-[var(--app-muted)] hover:bg-[var(--app-hover-strong)] hover:text-[var(--app-text)]"
          title="移除这条引导显示"
          onClick={onRemove}
        >
          <Trash2Icon className="h-3.5 w-3.5" />
        </button>
        <div className="relative">
          <button
            type="button"
            className="flex h-7 w-7 items-center justify-center rounded-full text-[var(--app-muted)] hover:bg-[var(--app-hover-strong)] hover:text-[var(--app-text)]"
            title="更多引导操作"
            onClick={onToggleMenu}
          >
            <MoreHorizontalIcon className="h-3.5 w-3.5" />
          </button>
          {menuOpen ? (
            <div className="absolute right-0 top-8 z-30 w-40 overflow-hidden rounded-xl border border-[var(--app-border)] bg-[var(--app-panel)] p-1 shadow-xl shadow-black/30 ring-1 ring-black/5">
              <GuideMenuButton icon={CopyIcon} label="复制内容" onClick={onCopy} />
              <GuideMenuButton icon={PencilIcon} label="放回输入框" onClick={onRestore} />
              {hiddenCount ? <GuideMenuButton icon={XIcon} label="清空引导" onClick={onClear} /> : null}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  )
}

function GuideMenuButton({
  icon: Icon,
  label,
  onClick,
}: {
  icon: IconComponent
  label: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      className="flex h-8 w-full items-center gap-2 rounded-md px-2 text-left text-xs font-medium text-[var(--app-muted)] hover:bg-[var(--app-hover)] hover:text-[var(--app-text)]"
      onClick={onClick}
    >
      <Icon className="h-3.5 w-3.5 shrink-0" />
      <span>{label}</span>
    </button>
  )
}

function GuideChip({ label }: { label: string }) {
  return (
    <span className="inline-flex items-center rounded-full border border-[var(--app-border)] bg-[var(--app-panel-2)] px-3.5 py-1.5 text-[12px] font-medium text-[var(--app-muted)] shadow-[0_1px_0_color-mix(in_srgb,var(--app-text)_4%,transparent)_inset,0_1px_1px_rgba(0,0,0,0.06)] transition-colors hover:border-[color-mix(in_srgb,var(--app-text)_16%,var(--app-border))] hover:text-[var(--app-text)]">
      {label}
    </span>
  )
}

function ComposerWorkspaceMenu({
  workspace,
  workspaces,
  onPickWorkspace,
  onWorkspaceSelect,
  onClose,
}: {
  workspace?: WorkspaceRecord | null
  workspaces: WorkspaceRecord[]
  onPickWorkspace?: () => void
  onWorkspaceSelect?: (workspace: WorkspaceRecord) => void
  onClose: () => void
}) {
  return (
    <div
      className="absolute left-0 top-10 z-30 w-[360px] overflow-hidden rounded-xl border border-[var(--app-border)] bg-[var(--app-panel)] shadow-xl shadow-black/30 ring-1 ring-black/5"
      data-no-window-drag
    >
      <div className="border-b border-[var(--app-divider)] px-3 py-2 text-xs font-medium text-[var(--app-muted)]">
        选择项目
      </div>
      <div className="max-h-[260px] overflow-auto p-1.5">
        {workspaces.length ? (
          workspaces.map((item) => {
            const selected = workspace?.path === item.path
            return (
              <button
                key={item.id}
                type="button"
                className={cn(
                  "flex w-full min-w-0 items-center gap-2 rounded-md px-2.5 py-2 text-left text-sm font-medium transition-colors",
                  selected
                    ? "bg-[var(--app-selected)] text-[var(--app-text)]"
                    : "text-[var(--app-muted)] hover:bg-[var(--app-hover)] hover:text-[var(--app-text)]",
                )}
                title={item.path}
                onClick={() => {
                  onClose()
                  if (!selected) onWorkspaceSelect?.(item)
                }}
              >
                <FolderOpenIcon className="h-4 w-4 shrink-0" />
                <span className="min-w-0 flex-1 truncate">{item.name ?? getPathName(item.path)}</span>
                {selected ? <CheckCircle2Icon className="h-4 w-4 shrink-0 text-[var(--app-success)]" /> : null}
              </button>
            )
          })
        ) : (
          <div className="px-3 py-4 text-sm font-medium text-[var(--app-subtle)]">暂无项目</div>
        )}
      </div>
      {onPickWorkspace ? (
        <>
          <div className="h-px bg-[var(--app-divider)]" />
          <button
            type="button"
            className="flex h-10 w-full items-center gap-2 px-3 text-left text-sm font-medium text-[var(--app-muted)] hover:bg-[var(--app-hover)] hover:text-[var(--app-text)]"
            onClick={() => {
              onClose()
              onPickWorkspace()
            }}
          >
            <PlusIcon className="h-4 w-4 shrink-0" />
            <span>打开本地项目...</span>
          </button>
        </>
      ) : null}
    </div>
  )
}

function CompactionDivider({ label }: { label: string }) {
  return (
    <div className="my-8 flex items-center gap-3 text-[12px] font-semibold text-[var(--app-subtle)]">
      <div className="h-px flex-1 bg-[var(--app-divider)]" />
      <div className="inline-flex items-center gap-1.5 whitespace-nowrap">
        <ArchiveIcon className="h-3.5 w-3.5" />
        <span>{label}</span>
      </div>
      <div className="h-px flex-1 bg-[var(--app-divider)]" />
    </div>
  )
}

function GitBranchStatus({
  status,
  loading,
  workspaceSelected,
}: {
  status?: GitStatus | null
  loading?: boolean
  workspaceSelected?: boolean
}) {
  if (!workspaceSelected) return null
  return (
    <div className="mt-2 flex min-h-7 items-center gap-2 px-3">
      <GitBranchChip status={status} loading={loading} workspaceSelected={workspaceSelected} />
    </div>
  )
}

function GitBranchChip({
  status,
  loading,
  workspaceSelected,
  compact = false,
}: {
  status?: GitStatus | null
  loading?: boolean
  workspaceSelected?: boolean
  compact?: boolean
}) {
  if (!workspaceSelected) return null
  const hasBranch = Boolean(status?.branch)
  const label = loading && !hasBranch ? "检测分支" : status?.branch ?? "未检测到 Git"
  const title = loading && !hasBranch ? "正在检测 Git 分支" : gitStatusTitle(status)

  return (
    <div
      className={cn(
        "inline-flex min-w-0 items-center gap-1.5 rounded-md border font-medium",
        compact ? "h-6 max-w-[18rem] px-1.5 text-[11px]" : "h-9 max-w-full px-2.5 text-[12px]",
        hasBranch
          ? "border-[var(--app-border)] bg-[var(--app-panel-2)] text-[var(--app-muted)]"
          : "border-transparent text-[var(--app-subtle)]",
      )}
      title={title}
    >
      {loading && !hasBranch ? (
        <Loader2Icon className="h-3.5 w-3.5 shrink-0 animate-spin" />
      ) : (
        <GitBranchIcon className="h-3.5 w-3.5 shrink-0" />
      )}
      <span className="min-w-0 truncate">{label}</span>
      {status?.dirty ? <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--app-warning)]" title="有未提交改动" /> : null}
      {status?.ahead ? <span className="shrink-0 text-[var(--app-subtle)]">领先 {status.ahead}</span> : null}
      {status?.behind ? <span className="shrink-0 text-[var(--app-subtle)]">落后 {status.behind}</span> : null}
    </div>
  )
}

function SuggestionPanel({
  open,
  items,
  activeIdx,
  emptyHint,
  onPick,
  onHover,
}: {
  open: boolean
  items: SuggestionItem[]
  activeIdx: number
  emptyHint: string
  onPick: (index: number) => void
  onHover: (index: number) => void
}) {
  if (!open) return null
  return (
    <div className="absolute bottom-full left-0 right-0 z-30 mb-2 max-h-72 overflow-auto rounded-[var(--app-radius-lg)] border border-[var(--app-border)] bg-[var(--app-panel)] py-1.5 shadow-[var(--app-elevation-3)]">
      {items.length ? (
        items.map((item, index) => {
          const selected = index === activeIdx
          const prevGroup = index > 0 ? items[index - 1]?.group : undefined
          const showGroup = item.group && item.group !== prevGroup
          return (
            <div key={item.key}>
              {showGroup ? (
                <div className="px-3 pb-1 pt-2.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--app-subtle)]">
                  {item.group}
                </div>
              ) : null}
              <button
                type="button"
                className={cn(
                  "relative flex w-full items-center gap-2 px-3 py-1.5 text-left text-[13px] transition-[background-color,color] duration-100",
                  selected
                    ? "bg-[var(--app-selected)] text-[var(--app-text)] before:absolute before:left-0 before:top-1/2 before:h-4 before:w-[2px] before:-translate-y-1/2 before:rounded-r-full before:bg-[var(--app-accent)] before:content-['']"
                    : "text-[var(--app-muted)] hover:bg-[var(--app-hover)] hover:text-[var(--app-text)]",
                )}
                onMouseEnter={() => onHover(index)}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => onPick(index)}
              >
                <span
                  className={cn(
                    "shrink-0 font-mono text-[12px] tracking-tight",
                    selected ? "text-[var(--app-accent)]" : "text-[var(--app-text)]",
                  )}
                >
                  {item.primary}
                </span>
                {item.secondary ? (
                  <span className="min-w-0 truncate text-[11px] text-[var(--app-subtle)]">{item.secondary}</span>
                ) : null}
              </button>
            </div>
          )
        })
      ) : (
        <div className="px-3 py-2.5 text-[12.5px] font-medium text-[var(--app-muted)]">{emptyHint}</div>
      )}
    </div>
  )
}

function ImagePreview({ attachment, onClose }: { attachment: PromptAttachment; onClose: () => void }) {
  return (
    <div
      className="pointer-events-auto fixed inset-0 z-50 grid place-items-center bg-black/70 p-6"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <button
        type="button"
        className="absolute right-5 top-5 flex h-9 w-9 items-center justify-center rounded-full bg-black/40 text-white hover:bg-black/60"
        title="关闭"
        onClick={onClose}
      >
        <XIcon className="h-5 w-5" />
      </button>
      <img
        src={attachment.url}
        alt={attachment.name}
        className="max-h-full max-w-full rounded-lg border border-white/15 object-contain shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      />
    </div>
  )
}

function HeaderMenu({
  thread,
  workspace,
  onOpenWorkspace,
  onDeleteThread,
  onClose,
}: {
  thread?: ThreadSummary
  workspace?: WorkspaceRecord | null
  onOpenWorkspace?: () => void
  onDeleteThread?: () => Promise<unknown>
  onClose: () => void
}) {
  async function copySessionId() {
    if (!thread?.id || thread.local) return
    await navigator.clipboard?.writeText(thread.id)
    onClose()
  }

  return (
    <div className="absolute left-0 top-8 z-30 w-[210px] overflow-hidden rounded-xl border border-[var(--app-border)] bg-[var(--app-panel)] p-1.5 shadow-xl shadow-black/30 ring-1 ring-black/5">
      <button
        type="button"
        className="flex h-9 w-full items-center gap-2 rounded-md px-2 text-left text-sm font-medium text-[var(--app-text)] hover:bg-[var(--app-hover)] disabled:opacity-45"
        disabled={!workspace?.path || !onOpenWorkspace}
        onClick={() => {
          onOpenWorkspace?.()
          onClose()
        }}
      >
        <FolderOpenIcon className="h-4 w-4 text-[var(--app-muted)]" />
        <span>打开项目目录</span>
      </button>
      <button
        type="button"
        className="flex h-9 w-full items-center gap-2 rounded-md px-2 text-left text-sm font-medium text-[var(--app-text)] hover:bg-[var(--app-hover)] disabled:opacity-45"
        disabled={!thread?.id || thread.local}
        onClick={() => void copySessionId()}
      >
        <CopyIcon className="h-4 w-4 text-[var(--app-muted)]" />
        <span>复制会话 ID</span>
      </button>
      <div className="my-1 h-px bg-[var(--app-divider)]" />
      <button
        type="button"
        className="flex h-9 w-full items-center gap-2 rounded-md px-2 text-left text-sm font-medium text-[var(--app-danger)] hover:bg-[var(--app-danger-soft)] disabled:opacity-45"
        disabled={!thread?.id || thread.local || !onDeleteThread}
        onClick={() => {
          void onDeleteThread?.()
          onClose()
        }}
      >
        <XCircleIcon className="h-4 w-4" />
        <span>删除聊天</span>
      </button>
    </div>
  )
}

function ComposerAddMenu({
  planModeEnabled,
  planModeAvailable,
  onAddFiles,
  onTogglePlanMode,
}: {
  planModeEnabled: boolean
  planModeAvailable: boolean
  onAddFiles: () => void
  onTogglePlanMode: () => void
}) {
  return (
    <div className="absolute bottom-[54px] left-3 z-20 w-[260px] overflow-hidden rounded-xl border border-[var(--app-border)] bg-[var(--app-panel)] p-1.5 shadow-xl shadow-black/30 ring-1 ring-black/5">
      <button
        type="button"
        className="flex h-10 w-full items-center gap-3 rounded-md px-3 text-left text-sm font-medium text-[var(--app-text)] hover:bg-[var(--app-hover)]"
        onClick={onAddFiles}
      >
        <PaperclipIcon className="h-4 w-4 shrink-0 text-[var(--app-muted)]" />
        <span className="min-w-0 flex-1 truncate">添加照片和文件</span>
      </button>
      <div className="my-1 h-px bg-[var(--app-divider)]" />
      <button
        type="button"
        className="flex h-10 w-full items-center gap-3 rounded-md px-3 text-left text-sm font-medium text-[var(--app-text)] hover:bg-[var(--app-hover)] disabled:opacity-45 disabled:hover:bg-transparent"
        disabled={!planModeAvailable}
        title="Shift + Tab 切换"
        onClick={onTogglePlanMode}
      >
        <ListChecksIcon className="h-4 w-4 shrink-0 text-[var(--app-muted)]" />
        <span className="min-w-0 flex-1 truncate">计划模式</span>
        <span
          className={cn(
            "relative h-5 w-9 rounded-full transition-colors",
            planModeEnabled ? "bg-[var(--app-accent)]" : "bg-[var(--app-hover-strong)]",
          )}
        >
          <span
            className={cn(
              "absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-white transition-transform",
              planModeEnabled && "translate-x-4",
            )}
          />
        </span>
      </button>
    </div>
  )
}

function ContextUsageBadge({ usage }: { usage: ContextUsageInfo }) {
  if (usage.used === null && usage.limit === null) return null
  const rawPercentLabel = usage.percent !== null ? `${usage.percent}%` : null
  const usablePercentLabel = usage.usablePercent !== null ? `${usage.usablePercent}%` : null
  const percentLabel = usablePercentLabel ?? rawPercentLabel
  const usedLabel = formatTokenAmount(usage.used)
  const limitLabel = formatTokenAmount(usage.limit)
  const usableLabel = formatTokenAmount(usage.usableLimit)
  const summary =
    usage.used !== null && usage.limit !== null && usage.usableLimit !== null
      ? `已用 ${usedLabel}；原始窗口 ${rawPercentLabel ?? "-"}，自动压缩安全线 ${usableLabel}`
      : usage.used !== null && usage.limit !== null
        ? `已用 ${usedLabel} 标记，共 ${limitLabel}`
      : usage.used !== null
        ? `已用 ${usedLabel} 标记`
        : usage.limit !== null
          ? `共 ${limitLabel} 标记`
          : "暂无上下文统计"
  const detailTitle =
    usage.usablePercent !== null
      ? `自动压缩窗口：${usage.usablePercent}% 已用`
      : usage.percent !== null
        ? `背景信息窗口：${usage.percent}% 已用`
      : usage.used !== null
        ? "背景信息窗口：已读取用量"
        : "背景信息窗口：暂无统计"
  const exactTitle =
    usage.used !== null && usage.limit !== null && usage.usableLimit !== null
      ? [
          `已用 ${usage.used.toLocaleString()} 标记，共 ${usage.limit.toLocaleString()}`,
          `自动压缩安全线约 ${usage.usableLimit.toLocaleString()} 标记`,
          "自动压缩会提前预留输出空间和安全缓冲，不会等到 100%。",
        ].join("\n")
      : usage.used !== null && usage.limit !== null
        ? `已用 ${usage.used.toLocaleString()} 标记，共 ${usage.limit.toLocaleString()}`
      : summary

  return (
    <div className="group/context relative shrink-0">
      <button
        type="button"
        className="flex h-7 items-center gap-1.5 rounded-full px-2 text-xs font-medium text-[var(--app-muted)] hover:bg-[var(--app-hover)] hover:text-[var(--app-text)]"
        title={`${detailTitle}\n${exactTitle}`}
      >
        <ContextUsageRing percent={usage.usablePercent ?? usage.percent} />
        <span className="hidden tabular-nums sm:inline">{percentLabel ?? limitLabel ?? "上下文"}</span>
      </button>
      <div className="pointer-events-none absolute bottom-[calc(100%+10px)] right-0 z-30 w-[260px] translate-y-1 rounded-xl border border-[var(--app-border)] bg-[var(--app-panel)] p-3 text-left opacity-0 shadow-xl shadow-black/30 ring-1 ring-black/5 transition-[opacity,transform] group-hover/context:translate-y-0 group-hover/context:opacity-100 group-focus-within/context:translate-y-0 group-focus-within/context:opacity-100">
        <div className="text-[13px] font-semibold text-[var(--app-text)]">{detailTitle}</div>
        <div className="mt-1 text-xs font-medium text-[var(--app-muted)]">{summary}</div>
        {usage.usableLimit !== null && usage.limit !== null ? (
          <div className="mt-2 text-[11px] leading-4 text-[var(--app-subtle)]">
            会预留输出空间和安全缓冲，所以可能在原始窗口低于 100% 时压缩。
          </div>
        ) : null}
      </div>
    </div>
  )
}

function ContextUsageRing({ percent }: { percent: number | null }) {
  const radius = 7
  const circumference = 2 * Math.PI * radius
  const progress = percent === null ? 0 : Math.max(0, Math.min(100, percent))
  const stroke =
    percent === null
      ? "var(--app-subtle)"
      : percent >= 92
        ? "var(--app-danger)"
        : percent >= 75
          ? "var(--app-warning)"
          : "var(--app-muted)"

  return (
    <span className="relative flex h-4 w-4 items-center justify-center">
      <svg viewBox="0 0 18 18" className="h-4 w-4 -rotate-90">
        <circle
          cx="9"
          cy="9"
          r={radius}
          fill="none"
          stroke="color-mix(in_srgb,var(--app-text)_14%,transparent)"
          strokeWidth="2"
        />
        {percent !== null ? (
          <circle
            cx="9"
            cy="9"
            r={radius}
            fill="none"
            stroke={stroke}
            strokeLinecap="round"
            strokeWidth="2"
            strokeDasharray={circumference}
            strokeDashoffset={circumference - (circumference * progress) / 100}
          />
        ) : null}
      </svg>
    </span>
  )
}

function ComposerMenu({
  kind,
  models,
  selectedModel,
  modelProviderName,
  favoriteModelKeys = [],
  hiddenModelKeys = [],
  selectedPermissionMode,
  permissionOptions,
  onModelChange,
  onModelFavoriteToggle,
  onModelVisibilityToggle,
  onPermissionModeChange,
}: {
  kind: "model" | "permission"
  models: OpenCodeModel[]
  selectedModel?: OpenCodeModel | null
  modelProviderName?: string | null
  favoriteModelKeys?: string[]
  hiddenModelKeys?: string[]
  selectedPermissionMode?: string
  permissionOptions: PermissionComposerOption[]
  onModelChange: (model: OpenCodeModel) => void
  onModelFavoriteToggle?: (model: OpenCodeModel) => void
  onModelVisibilityToggle?: (model: OpenCodeModel) => void
  onPermissionModeChange: (mode: string) => void
}) {
  const [modelQuery, setModelQuery] = useState("")
  const favoriteKeys = new Set(favoriteModelKeys)
  const hiddenKeys = new Set(hiddenModelKeys)
  const providerGroups = useMemo(() => groupModelsByProvider(models), [models])
  const selectedProviderId = selectedModel?.providerId ?? providerGroups[0]?.id ?? null
  const [activeProviderId, setActiveProviderId] = useState<string | null>(selectedProviderId)
  const needle = modelQuery.trim().toLowerCase()

  useEffect(() => {
    if (kind === "model" && selectedProviderId) setActiveProviderId(selectedProviderId)
  }, [kind, selectedProviderId])

  const filteredProviderGroups = useMemo(() => {
    if (!needle) return providerGroups
    return providerGroups.filter((group) => {
      const providerMatches = `${group.name} ${group.id}`.toLowerCase().includes(needle)
      if (providerMatches) return true
      return group.models.some((model) => modelSearchText(model).includes(needle))
    })
  }, [needle, providerGroups])

  useEffect(() => {
    if (kind !== "model") return
    if (activeProviderId && filteredProviderGroups.some((group) => group.id === activeProviderId)) return
    setActiveProviderId(filteredProviderGroups[0]?.id ?? providerGroups[0]?.id ?? null)
  }, [activeProviderId, filteredProviderGroups, kind, providerGroups])

  const activeProvider =
    filteredProviderGroups.find((group) => group.id === activeProviderId) ??
    providerGroups.find((group) => group.id === activeProviderId) ??
    filteredProviderGroups[0] ??
    null
  const providerMatchesQuery = Boolean(
    activeProvider && needle && `${activeProvider.name} ${activeProvider.id}`.toLowerCase().includes(needle),
  )
  const visibleModelItems = activeProvider
    ? activeProvider.models
        .filter((model) => !needle || providerMatchesQuery || modelSearchText(model).includes(needle))
        .sort((left, right) => compareFavoriteModels(left, right, favoriteKeys))
        .slice(0, 120)
    : []

  return (
    <div
      className={cn(
        "absolute bottom-[54px] z-20 overflow-hidden rounded-xl border border-[var(--app-border)] bg-[var(--app-panel)] shadow-xl shadow-black/30 ring-1 ring-black/5",
        kind === "permission" ? "left-3 w-[330px]" : "right-3 w-[620px]",
      )}
    >
      <div className="border-b border-[var(--app-divider)] px-3 py-2 text-xs font-medium text-[var(--app-muted)]">
        {kind === "model" ? (modelProviderName ? `选择模型 · 当前 ${modelProviderName}` : "选择模型") : "选择权限模式"}
      </div>
      {kind === "model" ? (
        <div className="border-b border-[var(--app-divider)] p-2">
          <div className="flex h-8 items-center gap-2 rounded-md bg-[var(--app-input)] px-2.5 text-[var(--app-muted)] ring-1 ring-[var(--app-divider)]">
            <SearchIcon className="h-3.5 w-3.5 shrink-0" />
            <input
              value={modelQuery}
              onChange={(event) => setModelQuery(event.target.value)}
              className="h-full min-w-0 flex-1 bg-transparent text-xs font-medium text-[var(--app-text)] outline-none placeholder:text-[var(--app-muted)]"
              placeholder="搜索供应商或模型，例如：小米 / gpt / mimo"
            />
            {modelQuery.trim() ? (
              <button
                type="button"
                className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-[var(--app-muted)] hover:bg-[var(--app-hover)] hover:text-[var(--app-text)]"
                title="清除搜索"
                onClick={() => setModelQuery("")}
              >
                <XIcon className="h-3.5 w-3.5" />
              </button>
            ) : null}
          </div>
        </div>
      ) : null}
      <div className={cn("max-h-[320px] overflow-auto p-1.5", kind === "model" && "grid grid-cols-[190px_minmax(0,1fr)] gap-1.5")}>
        {kind === "permission" ? (
          permissionOptions.length ? (
            permissionOptions.map((item) => {
              const selected = selectedPermissionMode === item.id
              return (
                <button
                  key={item.id}
                  className={cn(
                    "w-full rounded-md px-3 py-2 text-left transition-colors",
                    selected
                      ? "bg-[var(--app-selected)] text-[var(--app-text)]"
                      : "text-[var(--app-muted)] hover:bg-[var(--app-hover)] hover:text-[var(--app-text)]",
                  )}
                  onClick={() => onPermissionModeChange(item.id)}
                >
                  <div className="flex min-w-0 items-center gap-2 text-sm font-medium">
                    <span
                      className={cn(
                        "h-2 w-2 shrink-0 rounded-full",
                        item.tone === "danger"
                          ? "bg-[var(--app-danger)]"
                          : item.tone === "warning"
                            ? "bg-[var(--app-warning)]"
                            : "bg-[var(--app-dot)]",
                      )}
                    />
                    <span className="min-w-0 flex-1 truncate">{item.label}</span>
                    {selected ? <CheckCircle2Icon className="h-4 w-4 text-[var(--app-accent)]" /> : null}
                  </div>
                  <div className="mt-1 line-clamp-2 text-xs leading-5 text-[var(--app-muted)]">{item.description}</div>
                </button>
              )
            })
          ) : (
            <div className="px-3 py-4 text-sm font-medium text-[var(--app-subtle)]">暂无可选权限模式</div>
          )
        ) : providerGroups.length ? (
          <>
            <div className="min-h-0 overflow-auto border-r border-[var(--app-divider)] pr-1">
              {filteredProviderGroups.length ? (
                filteredProviderGroups.map((group) => {
                  const selected = group.id === activeProvider?.id
                  const status = providerGroupStatus(group)
                  const statusLabel = providerStatusLabel(group)
                  return (
                    <button
                      key={group.id}
                      type="button"
                      className={cn(
                        "flex h-9 w-full min-w-0 items-center gap-2 rounded-md px-2 text-left text-xs font-medium transition-colors",
                        selected
                          ? "bg-[var(--app-selected)] text-[var(--app-text)]"
                          : "text-[var(--app-muted)] hover:bg-[var(--app-hover)] hover:text-[var(--app-text)]",
                      )}
                      title={`${group.name} (${group.id})`}
                      onClick={() => setActiveProviderId(group.id)}
                    >
                      <span
                        className={cn(
                          "h-1.5 w-1.5 shrink-0 rounded-full",
                          status === "active"
                            ? "bg-[var(--app-success)]"
                            : status === "needs_auth"
                              ? "bg-[var(--app-warning)]"
                              : "bg-[var(--app-subtle)]",
                        )}
                      />
                      <span className="min-w-0 flex-1 truncate">{group.name}</span>
                      {statusLabel ? (
                        <span className="shrink-0 text-[11px] font-medium text-[var(--app-subtle)]">{statusLabel}</span>
                      ) : null}
                      <span className="shrink-0 tabular-nums text-[var(--app-subtle)]">{group.models.length}</span>
                    </button>
                  )
                })
              ) : (
                <div className="px-2 py-4 text-xs font-medium text-[var(--app-subtle)]">没有匹配的供应商</div>
              )}
            </div>
            <div className="min-h-0 overflow-auto">
              {activeProvider ? (
                <div className="mb-1 flex items-center justify-between gap-2 px-2 py-1">
                  <div className="min-w-0 truncate text-xs font-semibold text-[var(--app-text)]">{activeProvider.name}</div>
                  <div className="shrink-0 text-[11px] font-medium text-[var(--app-subtle)]">{activeProvider.id}</div>
                </div>
              ) : null}
              {visibleModelItems.length ? (
                visibleModelItems.map((model) => {
                  const key = modelKey(model)
                  const selected = selectedModel?.providerId === model.providerId && selectedModel.id === model.id
                  const favorite = favoriteKeys.has(key)
                  const hidden = hiddenKeys.has(key)
                  const status = modelStatusLabel(model.status)
                  return (
                    <button
                      key={key}
                      className={cn(
                        "group/model-row w-full rounded-md px-3 py-2 text-left transition-colors",
                        selected
                          ? "bg-[var(--app-selected)] text-[var(--app-text)]"
                          : "text-[var(--app-muted)] hover:bg-[var(--app-hover)] hover:text-[var(--app-text)]",
                        hidden && "opacity-55",
                      )}
                      onClick={() => onModelChange(model)}
                    >
                      <div className="flex min-w-0 items-center gap-2 text-sm font-medium">
                        <span
                          className={cn(
                            "flex h-5 w-5 shrink-0 items-center justify-center rounded text-[var(--app-subtle)]",
                            favorite && "text-[var(--app-warning)]",
                          )}
                        >
                          <StarIcon className={cn("h-3.5 w-3.5", favorite && "fill-current")} />
                        </span>
                        <span className="min-w-0 flex-1 truncate">{model.name}</span>
                        {model.supportsReasoning ? <span className="text-xs text-[var(--app-accent)]">推理</span> : null}
                        {status ? <span className="text-xs text-[var(--app-warning)]">{status}</span> : null}
                        {onModelFavoriteToggle ? (
                          <span
                            role="button"
                            tabIndex={0}
                            className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-[var(--app-subtle)] opacity-0 transition-opacity hover:bg-[var(--app-hover-strong)] hover:text-[var(--app-text)] group-hover/model-row:opacity-100 group-focus-within/model-row:opacity-100"
                            title={favorite ? "取消收藏" : "收藏模型"}
                            onClick={(event) => {
                              event.preventDefault()
                              event.stopPropagation()
                              onModelFavoriteToggle(model)
                            }}
                            onKeyDown={(event) => {
                              if (event.key !== "Enter" && event.key !== " ") return
                              event.preventDefault()
                              event.stopPropagation()
                              onModelFavoriteToggle(model)
                            }}
                          >
                            <StarIcon className={cn("h-3.5 w-3.5", favorite && "fill-current text-[var(--app-warning)]")} />
                          </span>
                        ) : null}
                        {onModelVisibilityToggle ? (
                          <span
                            role="button"
                            tabIndex={0}
                            className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-[var(--app-subtle)] opacity-0 transition-opacity hover:bg-[var(--app-hover-strong)] hover:text-[var(--app-text)] group-hover/model-row:opacity-100 group-focus-within/model-row:opacity-100"
                            title="隐藏模型"
                            onClick={(event) => {
                              event.preventDefault()
                              event.stopPropagation()
                              onModelVisibilityToggle(model)
                            }}
                            onKeyDown={(event) => {
                              if (event.key !== "Enter" && event.key !== " ") return
                              event.preventDefault()
                              event.stopPropagation()
                              onModelVisibilityToggle(model)
                            }}
                          >
                            <EyeOffIcon className="h-3.5 w-3.5" />
                          </span>
                        ) : null}
                      </div>
                      <div className="mt-1 flex min-w-0 items-center gap-2 text-xs text-[var(--app-muted)]">
                        <span className="truncate">{model.providerName}</span>
                        {formatNumber(model.context) ? (
                          <>
                            <span className="h-1 w-1 rounded-full bg-[var(--app-dot)]" />
                            <span>{formatNumber(model.context)}</span>
                          </>
                        ) : null}
                      </div>
                    </button>
                  )
                })
              ) : (
                <div className="px-3 py-4 text-sm font-medium text-[var(--app-subtle)]">当前供应商暂无匹配模型</div>
              )}
            </div>
          </>
        ) : (
          <div className="px-3 py-4 text-sm font-medium text-[var(--app-subtle)]">
            暂无 API 供应商模型
          </div>
        )}
      </div>
    </div>
  )
}

type ModelProviderGroup = {
  id: string
  name: string
  models: OpenCodeModel[]
  guiConfigured: boolean
}

function groupModelsByProvider(models: OpenCodeModel[]): ModelProviderGroup[] {
  const groups = new Map<string, ModelProviderGroup>()
  for (const model of models) {
    const id = model.providerId
    const group = groups.get(id) ?? {
      id,
      name: model.providerName || id,
      models: [],
      guiConfigured: false,
    }
    if (!group.name && model.providerName) group.name = model.providerName
    group.models.push(model)
    if (isGuiSettingsModel(model)) group.guiConfigured = true
    groups.set(id, group)
  }

  return [...groups.values()]
    .map((group) => ({
      ...group,
      models: group.models
        .slice()
        .sort((left, right) => (left.name || left.id).localeCompare(right.name || right.id)),
    }))
    .sort((left, right) => {
      if (left.guiConfigured !== right.guiConfigured) return left.guiConfigured ? -1 : 1
      return left.name.localeCompare(right.name)
    })
}

function modelKey(model: OpenCodeModel) {
  return `${model.providerId}/${model.id}`
}

function compareFavoriteModels(left: OpenCodeModel, right: OpenCodeModel, favoriteKeys: Set<string>) {
  const leftFavorite = favoriteKeys.has(modelKey(left))
  const rightFavorite = favoriteKeys.has(modelKey(right))
  if (leftFavorite === rightFavorite) return 0
  return leftFavorite ? -1 : 1
}

function modelSearchText(model: OpenCodeModel) {
  return `${model.providerName} ${model.providerId} ${model.name} ${model.id}`.toLowerCase()
}

function isGuiSettingsModel(model: OpenCodeModel) {
  const raw = model.raw
  return Boolean(raw && typeof raw === "object" && (raw as { source?: unknown }).source === "gui-settings")
}

function providerGroupStatus(group: ModelProviderGroup) {
  if (group.models.some((model) => model.status === "active")) return "active"
  if (group.models.some((model) => model.status === "needs_auth")) return "needs_auth"
  return "disabled"
}

function modelStatusLabel(status: string) {
  if (status === "needs_auth") return "需应用"
  if (status === "disabled") return "未启用"
  return null
}

function providerStatusLabel(group: ModelProviderGroup) {
  const status = providerGroupStatus(group)
  if (status === "needs_auth") return "需应用"
  if (status === "disabled") return "未启用"
  return group.guiConfigured ? "GUI" : null
}

function ExpandToggle({
  expanded,
  hiddenChars,
  onClick,
}: {
  expanded: boolean
  hiddenChars: number
  onClick: () => void
}) {
  return (
    <button
      type="button"
      className="mt-2 inline-flex h-7 items-center rounded-md px-2 text-xs font-medium text-[var(--app-muted)] hover:bg-[var(--app-hover)] hover:text-[var(--app-text)]"
      onClick={onClick}
    >
      {expanded ? "收起" : `展开全文（剩余 ${hiddenChars.toLocaleString()} 字）`}
    </button>
  )
}

function CollapsiblePlainText({ text }: { text: string }) {
  const [expanded, setExpanded] = useState(false)
  const collapsed = shouldCollapseText(text)
  const display = collapsedPreview(text, expanded)

  return (
    <div className="flex max-w-[80%] flex-col items-end">
      <div className="min-w-fit max-w-full whitespace-pre-wrap break-words rounded-[18px] rounded-tr-md border border-[color-mix(in_srgb,var(--app-accent)_18%,var(--app-border))] bg-[color-mix(in_srgb,var(--app-accent)_5%,var(--app-panel-2))] px-4 py-2.5 text-[length:var(--app-prose-font-size)] leading-[1.65] text-[var(--app-text)] shadow-[var(--app-elevation-1)]">
        {display}
      </div>
      {collapsed ? (
        <ExpandToggle
          expanded={expanded}
          hiddenChars={Math.max(0, text.length - DEFAULT_TEXT_COLLAPSE_LIMIT)}
          onClick={() => setExpanded((value) => !value)}
        />
      ) : null}
    </div>
  )
}

function CollapsibleMarkdown({
  text,
  workspaceDirectory,
  onLocalFileOpen,
  onLocalFileContextMenu,
  onUrlOpen,
}: {
  text: string
  workspaceDirectory?: string | null
  onLocalFileOpen?: (path: string) => void
  onLocalFileContextMenu?: (path: string, position: LocalFileLinkPosition) => void
  onUrlOpen?: (url: string) => void
}) {
  const [expanded, setExpanded] = useState(false)
  const collapsed = shouldCollapseText(text)
  const display = collapsedPreview(text, expanded)

  return (
    <div className="w-full">
      <MessageMarkdown
        text={display}
        className="w-full"
        workspaceDirectory={workspaceDirectory}
        onLocalFileOpen={onLocalFileOpen}
        onLocalFileContextMenu={onLocalFileContextMenu}
        onUrlOpen={onUrlOpen}
      />
      {collapsed ? (
        <ExpandToggle
          expanded={expanded}
          hiddenChars={Math.max(0, text.length - DEFAULT_TEXT_COLLAPSE_LIMIT)}
          onClick={() => setExpanded((value) => !value)}
        />
      ) : null}
    </div>
  )
}

function CollapsibleCodeBlock({ text, limit = CODE_TEXT_COLLAPSE_LIMIT }: { text: string; limit?: number }) {
  const [expanded, setExpanded] = useState(false)
  const collapsed = shouldCollapseText(text, limit)
  const display = collapsedPreview(text, expanded, limit)

  return (
    <div>
      <CodeBlock>{display}</CodeBlock>
      {collapsed ? (
        <ExpandToggle
          expanded={expanded}
          hiddenChars={Math.max(0, text.length - limit)}
          onClick={() => setExpanded((value) => !value)}
        />
      ) : null}
    </div>
  )
}

function normalizeFileReference(value: string) {
  return value
    .replace(/^\.?[\\/]+/, "")
    .replace(/\\/g, "/")
    .replace(/:\d+$/, "")
    .toLowerCase()
}

function normalizeWorkspaceRelativeFile(file: string, workspaceDirectory?: string | null) {
  const normalized = file.replace(/\\/g, "/").replace(/^\.?\//, "")
  if (!workspaceDirectory) return normalized

  const root = workspaceDirectory.replace(/\\/g, "/").replace(/\/+$/, "")
  const rootNoDrive = root.replace(/^[A-Za-z]:\//, "")
  const normalizedLower = normalized.toLowerCase()
  const candidates = [root, rootNoDrive]
    .map((item) => item.replace(/^\.?\//, ""))
    .filter(Boolean)

  for (const candidate of candidates) {
    const lower = candidate.toLowerCase()
    if (normalizedLower === lower) return getPathName(normalized)
    if (normalizedLower.startsWith(`${lower}/`)) return normalized.slice(candidate.length + 1)
  }

  return normalized
}

function normalizeDiffsForWorkspace(diffs: SessionDiffFile[], workspaceDirectory?: string | null) {
  return mergeDiffsByFile(
    diffs.map((diff) => {
      const file = normalizeWorkspaceRelativeFile(diff.file, workspaceDirectory)
      return file === diff.file ? diff : { ...diff, file }
    }),
  )
}

function findDiffForNotice(diffs: SessionDiffFile[], file: string) {
  const target = normalizeFileReference(file)
  return diffs.find((diff) => {
    const current = normalizeFileReference(diff.file)
    return current === target || current.endsWith(`/${target}`) || target.endsWith(`/${current}`)
  })
}

function patchStats(patch: string) {
  let additions = 0
  let deletions = 0
  for (const line of patch.split(/\r?\n/)) {
    if (line.startsWith("+++") || line.startsWith("---")) continue
    if (line.startsWith("+")) additions += 1
    if (line.startsWith("-")) deletions += 1
  }
  return { additions, deletions }
}

function diffFileFromRecord(record: Record<string, unknown> | null) {
  if (!record) return null
  return (
    stringValue(record.file) ??
    stringValue(record.relativePath) ??
    stringValue(record.filePath) ??
    stringValue(record.filepath) ??
    stringValue(record.path) ??
    stringValue(record.filename)
  )
}

function normalizeDiffStatus(value: unknown): SessionDiffFile["status"] {
  const raw = stringValue(value)?.toLowerCase()
  if (raw === "add" || raw === "added" || raw === "create" || raw === "created") return "added"
  if (raw === "delete" || raw === "deleted" || raw === "remove" || raw === "removed") return "deleted"
  return "modified"
}

function diffFromValue(value: unknown): SessionDiffFile | null {
  const record = asRecord(value)
  const file = diffFileFromRecord(record)
  if (!record || !file) return null
  const patch = stringValue(record.patch) ?? stringValue(record.diff) ?? ""
  const stats = patch ? patchStats(patch) : { additions: 0, deletions: 0 }
  return {
    file,
    patch,
    additions: finiteNumber(record.additions) ?? stats.additions,
    deletions: finiteNumber(record.deletions) ?? stats.deletions,
    status: normalizeDiffStatus(record.status ?? record.type),
    raw: value,
  }
}

function diffFileFromPatchSection(section: string, fallbackFile?: string | null) {
  const indexFile = section.match(/^Index:\s+(.+)$/m)?.[1]?.trim()
  if (indexFile) return indexFile
  const nextFile = section.match(/^\+\+\+\s+(.+)$/m)?.[1]?.trim()
  if (nextFile && nextFile !== "/dev/null") return nextFile.replace(/^[ab]\//, "")
  const previousFile = section.match(/^---\s+(.+)$/m)?.[1]?.trim()
  if (previousFile && previousFile !== "/dev/null") return previousFile.replace(/^[ab]\//, "")
  return fallbackFile ?? null
}

function splitPatchSections(patch: string) {
  const lines = patch.split(/\r?\n/)
  const sections: string[] = []
  let current: string[] = []
  for (const line of lines) {
    const startsSection = line.startsWith("Index: ") || line.startsWith("diff --git ")
    if (startsSection && current.length) {
      sections.push(current.join("\n").trimEnd())
      current = []
    }
    current.push(line)
  }
  if (current.length) sections.push(current.join("\n").trimEnd())
  return sections.filter((section) => section.trim())
}

function diffsFromPatch(patch: string, metadata: Record<string, unknown>, fallbackFile?: string | null) {
  const sections = splitPatchSections(patch)
  const targets = sections.length ? sections : [patch]
  return targets
    .map((section): SessionDiffFile | null => {
      const file = diffFileFromPatchSection(section, fallbackFile)
      if (!file) return null
      const stats = patchStats(section)
      return {
        file,
        patch: section,
        additions: finiteNumber(metadata.additions) ?? stats.additions,
        deletions: finiteNumber(metadata.deletions) ?? stats.deletions,
        status: normalizeDiffStatus(metadata.status ?? metadata.type),
        raw: { metadata, source: "patch" },
      } satisfies SessionDiffFile
    })
    .filter((diff): diff is SessionDiffFile => Boolean(diff))
}

function diffsFromMetadata(metadata: Record<string, unknown> | null) {
  if (!metadata) return []
  const items: SessionDiffFile[] = []
  const filediff = diffFromValue(metadata.filediff ?? metadata.fileDiff)
  if (filediff) items.push(filediff)

  for (const key of ["files", "diffs", "filediffs", "fileDiffs"]) {
    const value = metadata[key]
    if (!Array.isArray(value)) continue
    for (const item of value) {
      const diff = diffFromValue(item)
      if (diff) items.push(diff)
    }
  }

  const patch = stringValue(metadata.patch) ?? stringValue(metadata.diff)
  if (patch && !items.some((item) => item.patch.trim())) {
    const fallbackFile = diffFileFromRecord(metadata)
    items.push(...diffsFromPatch(patch, metadata, fallbackFile))
  }
  return items
}

function messagePartMetadataRecords(part: MessagePart) {
  const raw = asRecord(part.raw)
  const state = asRecord(raw?.state)
  const candidates = [
    asRecord(raw?.metadata),
    asRecord(state?.metadata),
    asRecord(raw?.structured),
    asRecord(state?.structured),
  ]
  const nested = candidates.flatMap((record) => {
    if (!record) return []
    return [asRecord(record.structured), asRecord(record.metadata)]
  })
  return [...candidates, ...nested].filter((record): record is Record<string, unknown> => Boolean(record))
}

function mergeDiffsByFile(diffs: SessionDiffFile[]) {
  const merged = new Map<string, SessionDiffFile>()
  for (const diff of diffs) {
    const key = normalizeFileReference(diff.file)
    const previous = merged.get(key)
    if (!previous) {
      merged.set(key, diff)
      continue
    }
    if (previous.patch === diff.patch) continue
    const patches = [previous.patch, diff.patch].filter((patch) => patch.trim())
    merged.set(key, {
      ...previous,
      patch: patches.join("\n"),
      additions: previous.additions + diff.additions,
      deletions: previous.deletions + diff.deletions,
      status: previous.status === diff.status ? previous.status : "modified",
      raw: { merged: true, items: [previous.raw, diff.raw] },
    })
  }
  return [...merged.values()]
}

function diffsFromMessageSummary(message: OpenCodeMessage) {
  const raw = asRecord(message.raw)
  const info = asRecord(raw?.info) ?? raw
  const summary = asRecord(info?.summary) ?? asRecord(raw?.summary)
  const items = Array.isArray(summary?.diffs) ? summary.diffs : []
  return items.map(diffFromValue).filter((diff): diff is SessionDiffFile => Boolean(diff))
}

function diffsFromMessage(message: OpenCodeMessage) {
  const summaryDiffs = diffsFromMessageSummary(message)
  if (summaryDiffs.length) return summaryDiffs
  const metadataDiffs = message.parts.flatMap((part) =>
    messagePartMetadataRecords(part).flatMap((metadata) => diffsFromMetadata(metadata)),
  )
  return mergeDiffsByFile(metadataDiffs)
}

function turnDiffsForMessage(
  message: OpenCodeMessage,
  orderedMessages: OpenCodeMessage[],
  sourceIndex: number,
  fallbackDiffs: SessionDiffFile[],
  workspaceDirectory?: string | null,
) {
  const ownDiffs = normalizeDiffsForWorkspace(diffsFromMessage(message), workspaceDirectory)
  if (ownDiffs.length) return ownDiffs

  let turnStart = sourceIndex
  while (turnStart > 0 && orderedMessages[turnStart]?.role !== "user") turnStart -= 1
  if (orderedMessages[turnStart]?.role !== "user") turnStart = sourceIndex

  let turnEnd = orderedMessages.length
  for (let index = turnStart + 1; index < orderedMessages.length; index += 1) {
    if (orderedMessages[index]?.role === "user") {
      turnEnd = index
      break
    }
  }

  const turnDiffs = mergeDiffsByFile(
    orderedMessages
      .slice(turnStart, turnEnd)
      .flatMap((item) => diffsFromMessage(item)),
  )
  const normalizedTurnDiffs = normalizeDiffsForWorkspace(turnDiffs, workspaceDirectory)
  if (normalizedTurnDiffs.length) return normalizedTurnDiffs

  if (fallbackDiffs.length) {
    return normalizeDiffsForWorkspace(fallbackDiffs, workspaceDirectory)
  }
  return []
}

function textMentionsDiff(text: string, diff: SessionDiffFile) {
  const normalizedText = normalizeFileReference(text)
  const normalizedFile = normalizeFileReference(diff.file)
  const basename = normalizedFile.split("/").pop() ?? normalizedFile
  return normalizedText.includes(normalizedFile) || (basename.length > 2 && normalizedText.includes(basename))
}

function looksLikeCodeReviewSummary(text: string) {
  return (
    /(?:文件|代码|组件|页面|后端|前端|实现|修改|更新|新增|删除|已改|已处理|已更改|改动|变更|审查|review|UI\s*支持|API|IPC|Tauri|React|Rust|MCP)/i.test(text) &&
    /(?:\.[cm]?[jt]sx?|\.[cm]?ts|\.rs|\.tsx|\.jsx|\.json|\.toml|\.md|\.css|\.scss|\.html|\.py|\.go|\.java|\.kt|\.sql|[\\/][\w.-]+[\\/])/i.test(text)
  )
}

function diffSummaryDiffsForText(text: string, diffs: SessionDiffFile[]) {
  if (!diffs.length) return []
  const mentions = diffs.filter((diff) => textMentionsDiff(text, diff))
  if (mentions.length) return mentions
  if (looksLikeCodeReviewSummary(text)) {
    return diffs
  }
  return []
}

function textCanRenderDiffSummary(text: string, diffs: SessionDiffFile[]) {
  if (parseAssistantFileChangeNotice(text)) return false
  if (diffSummaryDiffsForText(text, diffs).length) return true
  return looksLikeCodeReviewSummary(text) && fileReferencesFromText(text).length > 0
}

function assistantDiffSummaryFlowIndex(flow: AssistantFlowItem[], diffs: SessionDiffFile[]) {
  for (let index = flow.length - 1; index >= 0; index -= 1) {
    const item = flow[index]
    if (item?.type === "text" && textCanRenderDiffSummary(item.text, diffs)) return index
  }
  return -1
}

function latestUserTurnStart(messages: OpenCodeMessage[]) {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    if (messages[index]?.role === "user") {
      return index
    }
  }
  return 0
}

function latestAssistantDiffSummaryMessageId(messages: OpenCodeMessage[], diffs: SessionDiffFile[]) {
  if (!diffs.length) return null
  const turnStart = latestUserTurnStart(messages)
  for (let index = messages.length - 1; index >= turnStart; index -= 1) {
    const message = messages[index]
    if (!message || message.role !== "assistant") continue
    if (assistantDiffSummaryFlowIndex(assistantFlowItems(message), diffs) >= 0) return message.id
  }
  return null
}

function stripDiffReferenceLines(text: string, diffs: SessionDiffFile[]) {
  const lines = text.split(/\r?\n/)
  const remove = new Set<number>()
  lines.forEach((line, index) => {
    if (diffs.some((diff) => textMentionsDiff(line, diff))) remove.add(index)
  })
  for (const index of [...remove]) {
    const previous = lines[index - 1]?.trim() ?? ""
    if (/^[-*•]?\s*(?:新增|修改|更新|后端|前端|UI|设置|组件|文件|页面).*[：:]$/.test(previous)) {
      remove.add(index - 1)
    }
  }
  return lines
    .filter((line, index) => {
      if (remove.has(index)) return false
      const trimmed = line.trim()
      if (/^#{1,6}\s*(?:改动|变更|修改|更新|新增|代码审查|文件列表|代码改动|代码变更)/.test(trimmed)) return false
      if (/^[-*•]\s*(?:新增|修改|更新|后端|前端|UI|设置|组件|文件|页面).*[：:]$/.test(trimmed)) return false
      if (/^[-*•]\s*`?[\w$.-]+`?\s*$/.test(trimmed) && diffs.length) return false
      return true
    })
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
}

const FILE_REFERENCE_PATTERN =
  /`?((?:[A-Za-z]:[\\/])?(?:[\w$@().\-\u4e00-\u9fa5]+[\\/])+[\w$@().\-\u4e00-\u9fa5]+\.(?:[cm]?[jt]sx?|rs|json|toml|md|css|scss|html|py|go|java|kt|sql|yaml|yml))(?::\d+)?`?/gi

function fileReferencesFromText(text: string) {
  const files: string[] = []
  const seen = new Set<string>()
  for (const match of text.matchAll(FILE_REFERENCE_PATTERN)) {
    const file = match[1]?.replace(/\\/g, "/")
    if (!file) continue
    const key = normalizeFileReference(file)
    if (seen.has(key)) continue
    seen.add(key)
    files.push(file)
  }
  return files
}

function stripFileReferenceLines(text: string, files: string[]) {
  if (!files.length) return text
  return text
    .split(/\r?\n/)
    .filter((line) => {
      const trimmed = line.trim()
      if (files.some((file) => normalizeFileReference(line).includes(normalizeFileReference(file)))) return false
      if (/^#{1,6}\s*(?:改动|变更|修改|更新|新增|代码审查|文件列表|代码改动|代码变更)/.test(trimmed)) return false
      if (/^[-*•]?\s*(?:改动|变更|修改|更新|新增|代码审查|文件列表|代码改动|代码变更).*[：:]$/.test(trimmed)) return false
      return true
    })
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
}

function DiffUnavailableReviewCard({
  files,
  serverBaseUrl,
  workspaceDirectory,
  onOpenDiff,
  onOpenReview,
}: {
  files: string[]
  serverBaseUrl?: string | null
  workspaceDirectory?: string | null
  onOpenDiff?: (diff: SessionDiffFile) => void
  onOpenReview?: (diffs: SessionDiffFile[], selectedDiff?: SessionDiffFile | null) => void
}) {
  const [loading, setLoading] = useState(false)
  const [attempted, setAttempted] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [recoveredDiffs, setRecoveredDiffs] = useState<SessionDiffFile[]>([])
  const fileKey = files.join("\n")

  useEffect(() => {
    if (!serverBaseUrl || !workspaceDirectory || !files.length) {
      setAttempted(false)
      setRecoveredDiffs([])
      setError(null)
      return
    }
    let cancelled = false
    setLoading(true)
    setAttempted(false)
    setError(null)
    workspaceFileDiffs({ baseUrl: serverBaseUrl, directory: workspaceDirectory, files })
      .then((diffs) => {
        if (cancelled) return
        setRecoveredDiffs(diffs)
      })
      .catch((reason) => {
        if (cancelled) return
        setRecoveredDiffs([])
        setError(getErrorMessage(reason) ?? "恢复工作区差异失败。")
      })
      .finally(() => {
        if (cancelled) return
        setLoading(false)
        setAttempted(true)
      })
    return () => {
      cancelled = true
    }
  }, [fileKey, serverBaseUrl, workspaceDirectory])

  if (recoveredDiffs.length) {
    return (
      <DiffSummaryCard
        diffs={recoveredDiffs}
        onOpenDiff={onOpenDiff}
        onOpenReview={onOpenReview}
      />
    )
  }

  const hint = loading
    ? "正在从当前工作区恢复可审查差异..."
    : error
      ? error
      : !workspaceDirectory
        ? "当前消息没有项目目录，无法恢复差异。"
        : !serverBaseUrl
          ? "OpenCode server 未连接，无法恢复差异。"
        : attempted
          ? "这条历史消息没有保存 patch，当前项目也没有可恢复的 Git diff。"
          : "这条历史消息没有保存 patch，正在准备恢复差异。"

  return (
    <div className="overflow-hidden rounded-lg border border-dashed border-[var(--app-divider)] bg-[var(--app-panel)]">
      <div className="flex items-center justify-between gap-3 border-b border-[var(--app-divider)] px-4 py-3">
        <div className="min-w-0">
          <div className="flex min-w-0 items-center gap-2">
            <FileDiffIcon className="h-4 w-4 shrink-0 text-[var(--app-muted)]" />
            <div className="truncate text-sm font-semibold text-[var(--app-text)]">
              {loading ? "正在恢复代码审查" : "无法生成代码审查"}
            </div>
            <span className="rounded-full border border-[var(--app-divider)] px-2 py-0.5 text-[11px] font-semibold text-[var(--app-muted)]">
              {loading ? "恢复中" : "缺少 patch"}
            </span>
          </div>
          <div className="mt-1 text-xs font-medium text-[var(--app-subtle)]">
            {hint}
          </div>
        </div>
      </div>
      <div className="divide-y divide-[var(--app-divider)]">
        {files.map((file) => (
          <div
            key={file}
            className="grid w-full grid-cols-[minmax(0,1fr)_auto] gap-3 px-4 py-3 text-left"
          >
            <span className="flex min-w-0 items-center gap-3">
              <FileTextIcon className="h-4 w-4 shrink-0 text-[var(--app-muted)]" />
              <span className="min-w-0 truncate text-sm font-medium text-[var(--app-text)]">{file}</span>
            </span>
            <span className="text-xs font-semibold text-[var(--app-subtle)]">无可审查 patch</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function countTextLines(value?: string | null) {
  if (!value?.trim()) return 0
  return value.split(/\r?\n/).length
}

function syntheticDiffFromNotice(notice: AssistantFileChangeNotice): SessionDiffFile {
  const beforeLines = notice.before?.split(/\r?\n/) ?? []
  const afterLines = notice.after?.split(/\r?\n/) ?? []
  const hunk = [
    `@@ ${notice.line ? `第 ${notice.line} 行` : "文件更改"} @@`,
    ...beforeLines.map((line) => `-${line}`),
    ...afterLines.map((line) => `+${line}`),
  ].join("\n")

  return {
    file: notice.file,
    patch: hunk,
    additions: countTextLines(notice.after),
    deletions: countTextLines(notice.before),
    status: "modified",
    raw: { synthetic: true, source: "assistant-text" },
  }
}

function AssistantFileChangeCard({
  notice,
  diff,
  onOpenDiff,
}: {
  notice: AssistantFileChangeNotice
  diff: SessionDiffFile
  onOpenDiff?: (diff: SessionDiffFile) => void
}) {
  const additions = diff.additions || countTextLines(notice.after)
  const deletions = diff.deletions || countTextLines(notice.before)

  return (
    <div className="overflow-hidden rounded-lg border border-[var(--app-divider)] bg-[var(--app-panel)]">
      <div className="flex items-center justify-between gap-3 border-b border-[var(--app-divider)] px-4 py-3">
        <div className="min-w-0">
          <div className="text-sm font-semibold text-[var(--app-text)]">1 个文件已更改</div>
          <div className="mt-1 flex items-center gap-2 text-xs font-medium">
            <span className="text-[var(--app-success)]">+{additions}</span>
            <span className="text-[var(--app-danger)]">-{deletions}</span>
          </div>
        </div>
        <button
          type="button"
          className="flex h-8 shrink-0 items-center gap-1.5 rounded-md px-2.5 text-xs font-semibold text-[var(--app-muted)] hover:bg-[var(--app-hover)] hover:text-[var(--app-text)] disabled:opacity-45"
          disabled={!onOpenDiff}
          onClick={() => onOpenDiff?.(diff)}
        >
          <span>审核</span>
          <PanelRightIcon className="h-3.5 w-3.5" />
        </button>
      </div>
      <button
        type="button"
        className="grid w-full grid-cols-[minmax(0,1fr)_auto] gap-3 px-4 py-3 text-left hover:bg-[var(--app-hover)] disabled:pointer-events-none"
        disabled={!onOpenDiff}
        onClick={() => onOpenDiff?.(diff)}
      >
        <div className="flex min-w-0 items-center gap-3">
          <FileDiffIcon className="h-4 w-4 shrink-0 text-[var(--app-muted)]" />
          <span className="min-w-0 truncate text-sm font-medium text-[var(--app-text)]">
            {notice.file}{notice.line ? `:${notice.line}` : ""}
          </span>
        </div>
        <div className="flex shrink-0 items-center gap-2 text-xs">
          <span className="text-[var(--app-subtle)]">{diffStatusLabel(diff.status)}</span>
          <span className="text-[var(--app-success)]">+{additions}</span>
          <span className="text-[var(--app-danger)]">-{deletions}</span>
          <ChevronDownIcon className="h-3.5 w-3.5 -rotate-90 text-[var(--app-subtle)]" />
        </div>
      </button>
    </div>
  )
}

function AssistantTextContent({
  text,
  diffs,
  renderReviewCard = true,
  serverBaseUrl,
  workspaceDirectory,
  onLocalFileOpen,
  onLocalFileContextMenu,
  onUrlOpen,
  onDiffOpen,
  onReviewOpen,
}: {
  text: string
  diffs: SessionDiffFile[]
  renderReviewCard?: boolean
  serverBaseUrl?: string | null
  workspaceDirectory?: string | null
  onLocalFileOpen?: (path: string) => void
  onLocalFileContextMenu?: (path: string, position: LocalFileLinkPosition) => void
  onUrlOpen?: (url: string) => void
  onDiffOpen?: (diff: SessionDiffFile) => void
  onReviewOpen?: (diffs: SessionDiffFile[], selectedDiff?: SessionDiffFile | null) => void
}) {
  const notice = parseAssistantFileChangeNotice(text)
  const summaryDiffs = renderReviewCard && !notice ? diffSummaryDiffsForText(text, diffs) : []
  if (summaryDiffs.length) {
    const remainingText = stripDiffReferenceLines(text, summaryDiffs)
    return (
      <div className="w-full space-y-3">
        <DiffSummaryCard
          diffs={summaryDiffs}
          onOpenDiff={onDiffOpen}
          onOpenReview={onReviewOpen}
        />
        {remainingText ? (
          <CollapsibleMarkdown
            text={remainingText}
            workspaceDirectory={workspaceDirectory}
            onLocalFileOpen={onLocalFileOpen}
            onLocalFileContextMenu={onLocalFileContextMenu}
            onUrlOpen={onUrlOpen}
          />
        ) : null}
      </div>
    )
  }

  const referencedFiles = renderReviewCard && !notice && looksLikeCodeReviewSummary(text) ? fileReferencesFromText(text) : []
  if (referencedFiles.length) {
    const remainingText = stripFileReferenceLines(text, referencedFiles)
    return (
      <div className="w-full space-y-3">
        <DiffUnavailableReviewCard
          files={referencedFiles}
          serverBaseUrl={serverBaseUrl}
          workspaceDirectory={workspaceDirectory}
          onOpenDiff={onDiffOpen}
          onOpenReview={onReviewOpen}
        />
        {remainingText ? (
          <CollapsibleMarkdown
            text={remainingText}
            workspaceDirectory={workspaceDirectory}
            onLocalFileOpen={onLocalFileOpen}
            onLocalFileContextMenu={onLocalFileContextMenu}
            onUrlOpen={onUrlOpen}
          />
        ) : null}
      </div>
    )
  }

  if (!notice) {
    return (
      <CollapsibleMarkdown
        text={text}
        workspaceDirectory={workspaceDirectory}
        onLocalFileOpen={onLocalFileOpen}
        onLocalFileContextMenu={onLocalFileContextMenu}
        onUrlOpen={onUrlOpen}
      />
    )
  }

  const diff = findDiffForNotice(diffs, notice.file) ?? syntheticDiffFromNotice(notice)
  return (
    <div className="w-full space-y-3">
      <AssistantFileChangeCard notice={notice} diff={diff} onOpenDiff={onDiffOpen} />
      {notice.trailingText ? (
        <MessageMarkdown
          text={notice.trailingText}
          className="w-full"
          workspaceDirectory={workspaceDirectory}
          onLocalFileOpen={onLocalFileOpen}
          onLocalFileContextMenu={onLocalFileContextMenu}
          onUrlOpen={onUrlOpen}
        />
      ) : null}
    </div>
  )
}

function ThreadMessageBlock({
  message,
  conversationRunning,
  messageRunning,
  hasLiveActivity,
  actionsDisabled,
  nextMessageId,
  mergedRunBlocks,
  hiddenRunBlocks,
  diffs = [],
  renderReviewCard = true,
  showActions,
  serverBaseUrl,
  workspaceDirectory,
  onLocalFileOpen,
  onLocalFileContextMenu,
  onUrlOpen,
  onTerminalOpen,
  onDiffOpen,
  onReviewOpen,
  onDeleteMessage,
  onForkMessage,
}: {
  message: OpenCodeMessage
  conversationRunning: boolean
  messageRunning: boolean
  hasLiveActivity: boolean
  actionsDisabled: boolean
  nextMessageId?: string | null
  mergedRunBlocks?: Record<number, RunBlockGroup>
  hiddenRunBlocks?: Record<number, true>
  diffs?: SessionDiffFile[]
  renderReviewCard?: boolean
  showActions?: boolean
  serverBaseUrl?: string | null
  workspaceDirectory?: string | null
  onLocalFileOpen?: (path: string) => void
  onLocalFileContextMenu?: (path: string, position: LocalFileLinkPosition) => void
  onUrlOpen?: (url: string) => void
  onTerminalOpen?: (title: string, content: string, subtitle?: string) => void
  onDiffOpen?: (diff: SessionDiffFile) => void
  onReviewOpen?: (diffs: SessionDiffFile[], selectedDiff?: SessionDiffFile | null) => void
  onDeleteMessage?: (message: OpenCodeMessage) => Promise<unknown>
  onForkMessage?: (message: OpenCodeMessage, text?: string, boundaryMessageId?: string | null) => Promise<unknown>
}) {
  const visibleParts = message.parts.filter(isRunnablePart)
  const userImages = message.role === "user" ? messageImageAttachments(message) : []
  const visibleNonImageParts =
    message.role === "user"
      ? visibleParts.filter((part) => {
          if (part.kind !== "file") return true
          const raw = asRecord(part.raw)
          return !stringValue(raw?.mime)?.startsWith("image/")
        })
      : visibleParts
  const [imagePreview, setImagePreview] = useState<MessageImageAttachment | null>(null)
  const flow = message.role === "assistant" ? assistantFlowItems(message) : []
  const hasVisibleFlow = flow.some((item, index) => item.type === "text" || !hiddenRunBlocks?.[index])
  const activeFlowPartIndex = lastPartFlowIndex(flow)
  const actionFlowIndex = lastTextFlowIndex(flow)
  const diffSummaryFlowIndex = renderReviewCard ? assistantDiffSummaryFlowIndex(flow, diffs) : -1
  const visibleFlowText = flow
    .filter((item): item is Extract<AssistantFlowItem, { type: "text" }> => item.type === "text")
    .map((item) => item.text)
    .join("\n\n")
    .trim()
  const text = message.text.trim()
  const pendingAssistant = messageRunning && message.role === "assistant" && !message.completedAt && !message.status
  const isUser = message.role === "user"
  const actionText = isUser ? text : visibleFlowText
  const optimistic = asRecord(message.raw)?.optimistic === true
  const canFork = Boolean(onForkMessage && !optimistic && actionText)
  const canDelete = Boolean(onDeleteMessage && !optimistic && actionText)
  const [editing, setEditing] = useState(false)
  const [editText, setEditText] = useState(text)
  const [pendingAction, setPendingAction] = useState<"fork" | "delete" | null>(null)
  const showPendingAssistant =
    pendingAssistant && !hasVisibleFlow && !visibleParts.length && (messageRunning || !conversationRunning || !hasLiveActivity)

  useEffect(() => {
    if (!editing) setEditText(text)
  }, [editing, text])

  async function sendForkEdit() {
    const next = editText.trim()
    if (!next || !onForkMessage) {
      setEditing(false)
      return
    }
    setPendingAction("fork")
    try {
      await onForkMessage(message, next)
      setEditing(false)
    } finally {
      setPendingAction(null)
    }
  }

  async function forkCurrentMessage() {
    if (!onForkMessage) return
    setPendingAction("fork")
    try {
      await onForkMessage(message, undefined, nextMessageId ?? null)
    } finally {
      setPendingAction(null)
    }
  }

  async function deleteCurrentMessage() {
    if (!onDeleteMessage || !window.confirm("确定删除这条聊天记录吗？")) return
    setPendingAction("delete")
    try {
      await onDeleteMessage(message)
    } finally {
      setPendingAction(null)
    }
  }

  function renderActions(className?: string) {
    if (conversationRunning) return null
    if (!actionText) return null
    const stamp = formatClockTime(message.completedAt ?? message.createdAt)
    return (
      <div className={cn("mt-1 flex items-center gap-1", className)}>
        {actionText ? (
          <MessageActionButton title="复制" onClick={() => void navigator.clipboard?.writeText(actionText)}>
            <CopyIcon className="h-4 w-4" />
          </MessageActionButton>
        ) : null}
        {canFork ? (
          <MessageActionButton
            title={isUser ? "分叉并修改" : "从这里分叉"}
            disabled={actionsDisabled || Boolean(pendingAction)}
            onClick={() => {
              if (isUser) setEditing(true)
              else void forkCurrentMessage()
            }}
          >
            {pendingAction === "fork" ? <Loader2Icon className="h-4 w-4 animate-spin" /> : <GitBranchIcon className="h-4 w-4" />}
          </MessageActionButton>
        ) : null}
        {canDelete ? (
          <MessageActionButton title="删除聊天记录" danger disabled={actionsDisabled || Boolean(pendingAction)} onClick={() => void deleteCurrentMessage()}>
            {pendingAction === "delete" ? <Loader2Icon className="h-4 w-4 animate-spin" /> : <Trash2Icon className="h-4 w-4" />}
          </MessageActionButton>
        ) : null}
        {stamp ? (
          <span className="ml-1 text-[11px] tabular-nums text-[var(--app-subtle)] opacity-0 transition-opacity group-hover/msg:opacity-100 group-focus-within/msg:opacity-100">
            {stamp}
          </span>
        ) : null}
      </div>
    )
  }

  return (
    <section className={cn("group/msg flex w-full flex-col gap-2", isUser ? "items-end" : "items-start")}>
      {editing ? (
        <div className={cn("w-full max-w-[80%]", isUser ? "self-end" : "self-start")}>
          <textarea
            value={editText}
            onChange={(event) => setEditText(event.target.value)}
            className="min-h-[96px] w-full resize-y rounded-[var(--app-radius-md)] border border-[var(--app-border)] bg-[var(--app-input)] px-3 py-2.5 text-sm leading-6 text-[var(--app-text)] outline-none transition-[border-color,box-shadow] duration-150 focus:border-[color-mix(in_srgb,var(--app-accent)_45%,var(--app-border))] focus:shadow-[0_0_0_4px_var(--app-ring)]"
            autoFocus
          />
          <div className="mt-2 flex justify-end gap-2">
            <button
              type="button"
              className="h-8 rounded-[var(--app-radius-sm)] px-3 text-xs font-medium text-[var(--app-muted)] transition-colors hover:bg-[var(--app-hover)] hover:text-[var(--app-text)]"
              onClick={() => setEditing(false)}
              disabled={Boolean(pendingAction)}
            >
              取消
            </button>
            <button
              type="button"
              className="h-8 rounded-[var(--app-radius-sm)] bg-[var(--app-accent)] px-3.5 text-xs font-semibold text-[var(--app-accent-contrast)] shadow-[0_1px_0_rgba(255,255,255,0.18)_inset,0_8px_22px_color-mix(in_srgb,var(--app-accent)_28%,transparent)] transition-[background-color,opacity] hover:bg-[var(--app-accent-hover)] disabled:opacity-50"
              onClick={() => void sendForkEdit()}
              disabled={Boolean(pendingAction) || !editText.trim()}
            >
              {pendingAction === "fork" ? <Loader2Icon className="mr-1 inline h-3.5 w-3.5 animate-spin" /> : null}
              发送
            </button>
          </div>
        </div>
      ) : isUser && (text || userImages.length) ? (
        <div className={cn("flex w-full max-w-full flex-col gap-1.5", isUser ? "items-end" : "items-start self-stretch")}>
          {userImages.length ? (
            <UserImageGrid images={userImages} onPreview={setImagePreview} />
          ) : null}
          {text ? <CollapsiblePlainText text={text} /> : null}
          {renderActions()}
        </div>
      ) : !isUser && hasVisibleFlow ? (
        <div className="flex w-full max-w-full flex-col gap-3 self-stretch">
          {flow.map((item, index) => {
            if (item.type === "text") {
              return (
                <div key={`text-${index}`}>
                  <AssistantTextContent
                    text={item.text}
                    diffs={diffs}
                    renderReviewCard={index === diffSummaryFlowIndex}
                    serverBaseUrl={serverBaseUrl}
                    workspaceDirectory={workspaceDirectory}
                    onLocalFileOpen={onLocalFileOpen}
                    onLocalFileContextMenu={onLocalFileContextMenu}
                    onUrlOpen={onUrlOpen}
                    onDiffOpen={onDiffOpen}
                    onReviewOpen={onReviewOpen}
                  />
                  {showActions && index === actionFlowIndex ? renderActions() : null}
                </div>
              )
            }
            if (hiddenRunBlocks?.[index]) return null
            const merged = mergedRunBlocks?.[index]
            return (
              <PartRunGroup
                key={`parts-${index}`}
                parts={merged?.parts ?? item.parts}
                running={merged ? merged.running : pendingAssistant && index === activeFlowPartIndex}
                message={merged?.message ?? message}
                onTerminalOpen={onTerminalOpen}
              />
            )
          })}
        </div>
      ) : showPendingAssistant ? (
        <ThinkingPlaceholder />
      ) : visibleNonImageParts.length && isUser ? (
        <PartRunGroup parts={visibleNonImageParts} running={false} message={message} onTerminalOpen={onTerminalOpen} />
      ) : null}
      {imagePreview ? (
        <ImagePreview
          attachment={{
            id: imagePreview.key,
            name: imagePreview.name,
            size: 0,
            mime: imagePreview.mime,
            url: imagePreview.url,
          }}
          onClose={() => setImagePreview(null)}
        />
      ) : null}
    </section>
  )
}

function UserImageGrid({
  images,
  onPreview,
}: {
  images: MessageImageAttachment[]
  onPreview: (image: MessageImageAttachment) => void
}) {
  return (
    <div className="flex max-w-[80%] flex-wrap justify-end gap-2">
      {images.map((image) => (
        <button
          key={image.key}
          type="button"
          className="group/img relative overflow-hidden rounded-[var(--app-radius-md)] border border-[var(--app-border)] bg-[var(--app-panel-2)] shadow-[var(--app-elevation-1)] transition-[transform,border-color] duration-150 hover:-translate-y-px hover:border-[color-mix(in_srgb,var(--app-accent)_45%,var(--app-border))]"
          onClick={() => onPreview(image)}
          title={image.name}
        >
          <img
            src={image.url}
            alt={image.name}
            className="block max-h-[220px] max-w-[260px] object-cover"
            loading="lazy"
            draggable={false}
          />
          <span className="pointer-events-none absolute inset-x-0 bottom-0 flex translate-y-full items-center gap-1 bg-gradient-to-t from-black/65 to-transparent px-2 py-1.5 text-[11px] font-medium text-white transition-transform duration-150 group-hover/img:translate-y-0">
            <span className="truncate">{image.name}</span>
          </span>
        </button>
      ))}
    </div>
  )
}

function MessageActionButton({
  title,
  danger,
  disabled,
  onClick,
  children,
}: {
  title: string
  danger?: boolean
  disabled?: boolean
  onClick: () => void
  children: ReactNode
}) {
  return (
    <button
      type="button"
      className={cn(
        "flex h-7 w-7 items-center justify-center rounded-md text-[var(--app-subtle)] transition-[background-color,color,transform] duration-150 ease-out hover:scale-[1.06] hover:bg-[var(--app-hover)] hover:text-[var(--app-text)] active:scale-95 disabled:scale-100 disabled:opacity-45 disabled:hover:bg-transparent",
        danger && "hover:bg-[var(--app-danger-soft)] hover:text-[var(--app-danger)]",
      )}
      title={title}
      disabled={disabled}
      onClick={onClick}
    >
      {children}
    </button>
  )
}

function ThinkingPlaceholder() {
  return (
    <div className="inline-flex items-center gap-2 rounded-full border border-[var(--app-border)] bg-[var(--app-panel-2)] py-1.5 pl-2.5 pr-3.5 text-[12.5px] font-medium text-[var(--app-muted)] shadow-[var(--app-elevation-1)]">
      <span className="relative flex h-2 w-2">
        <span className="absolute inset-0 animate-ping rounded-full bg-[var(--app-accent)] opacity-60" />
        <span className="relative inline-block h-2 w-2 rounded-full bg-[var(--app-accent)]" />
      </span>
      <span className="app-caret-pulse">思考中…</span>
    </div>
  )
}

function PartRunGroup({
  parts,
  running,
  message,
  onTerminalOpen,
}: {
  parts: OpenCodeMessage["parts"]
  running: boolean
  message?: OpenCodeMessage
  onTerminalOpen?: (title: string, content: string, subtitle?: string) => void
}) {
  const [open, setOpen] = useState(running)
  // Re-render once a second while running so the elapsed counter ticks up.
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    setOpen(running)
  }, [running])

  useEffect(() => {
    if (!running) return
    const id = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(id)
  }, [running])

  const elapsed = (() => {
    const start = message?.createdAt ?? null
    if (!start) return null
    const end = running ? now : message?.completedAt ?? now
    return formatDuration(end - start)
  })()

  const commandCount = parts.filter(isCommandLikePart).length
  const visibleCount = commandCount || parts.length
  const unit = commandCount && commandCount === parts.length ? "条命令" : "步"
  const stepLabel = parts.length ? ` · ${visibleCount} ${unit}` : ""
  const elapsedLabel = elapsed ? ` ${elapsed}` : ""
  const label = running
    ? `处理中...${elapsedLabel}${stepLabel}`
    : commandCount
      ? `已运行 ${commandCount} 条命令`
      : `已处理${stepLabel}`

  if (!parts.length && !running) return null

  return (
    <div className="w-full self-stretch">
      <button
        type="button"
        className="inline-flex items-center gap-1.5 rounded-[var(--app-radius-sm)] px-1 py-1.5 text-[12px] font-medium text-[var(--app-muted)] transition-colors hover:text-[var(--app-text)]"
        onClick={() => parts.length && setOpen((value) => !value)}
      >
        {running ? (
          <span className="relative flex h-2 w-2">
            <span className="absolute inset-0 animate-ping rounded-full bg-[var(--app-accent)] opacity-60" />
            <span className="relative inline-block h-2 w-2 rounded-full bg-[var(--app-accent)]" />
          </span>
        ) : (
          <ChevronDownIcon className={cn("h-3 w-3 transition-transform duration-150", open && "rotate-180")} />
        )}
        <span className={cn("tabular-nums", running && "text-[var(--app-text)]")}>{label}</span>
      </button>
      {parts.length ? (
        <div className={cn("grid transition-[grid-template-rows] duration-200 ease-out", open ? "grid-rows-[1fr]" : "grid-rows-[0fr]")}>
          <div className="overflow-hidden">
            <div className="ml-1 space-y-2 border-l-2 border-[var(--app-divider)] py-1.5 pl-3.5">
              {parts.slice(0, 12).map((part) => (
                <PartRow
                  key={part.id ?? `${part.kind}-${part.tool ?? part.file ?? part.title}`}
                  part={part}
                  groupRunning={running}
                  onTerminalOpen={onTerminalOpen}
                />
              ))}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}

function PartRow({
  part,
  groupRunning,
  onTerminalOpen,
}: {
  part: OpenCodeMessage["parts"][number]
  groupRunning: boolean
  onTerminalOpen?: (title: string, content: string, subtitle?: string) => void
}) {
  const Icon =
    part.kind === "tool"
      ? WrenchIcon
      : part.kind === "file" || part.kind === "patch"
        ? FileDiffIcon
        : part.kind === "subtask"
          ? ListChecksIcon
          : CircleIcon
  const title = part.title ?? part.tool ?? part.file ?? part.kind
  const meta = part.status === "running" && !groupRunning ? "completed" : part.status ?? undefined
  const panelContent = part.text ?? (part.raw ? JSON.stringify(part.raw, null, 2) : "")
  return (
    <ExpandableRow
      icon={Icon}
      label={title}
      meta={meta}
      onOpenPanel={panelContent ? () => onTerminalOpen?.(title, panelContent, meta) : undefined}
    >
      {part.text ? (
        <CollapsibleCodeBlock text={part.text} />
      ) : part.raw ? (
        <CollapsibleCodeBlock text={JSON.stringify(part.raw, null, 2)} />
      ) : null}
    </ExpandableRow>
  )
}

function FloatingProgressWindow({
  items,
  todos,
  diffs,
  running,
  interrupted,
  pinned,
  suspended,
  onPinnedChange,
}: {
  items: ProgressItem[]
  todos: TodoStep[]
  diffs: SessionDiffFile[]
  running: boolean
  interrupted: boolean
  pinned: boolean
  suspended: boolean
  onPinnedChange: (pinned: boolean) => void
}) {
  const [now, setNow] = useState(() => Date.now())
  const [cursorZone, setCursorZone] = useState<"outside" | "strip" | "panel">("outside")
  const [panelLatched, setPanelLatched] = useState(false)
  const [floatingHovered, setFloatingHovered] = useState(false)
  const [failedOnly, setFailedOnly] = useState(false)

  useEffect(() => {
    if (!running) return
    const id = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(id)
  }, [running])

  useEffect(() => {
    if (!items.some((activity) => activity.status === "failed")) setFailedOnly(false)
  }, [items])

  useEffect(() => {
    if (suspended) {
      setCursorZone("outside")
      setPanelLatched(false)
      setFloatingHovered(false)
      return
    }

    if (pinned) {
      setCursorZone("outside")
      setPanelLatched(false)
      return
    }

    const updateCursorZone = (event: PointerEvent) => {
      const width = window.innerWidth || document.documentElement.clientWidth
      if (!width) return

      const distanceFromRight = width - event.clientX
      const nextZone = distanceFromRight <= 18 ? "panel" : distanceFromRight <= 36 ? "strip" : "outside"
      setCursorZone((current) => (current === nextZone ? current : nextZone))
      setPanelLatched((current) => {
        if (distanceFromRight <= 18) return true
        if (distanceFromRight > 36 && !floatingHovered) return false
        return current
      })
    }

    const resetCursorZone = () => {
      setCursorZone("outside")
      setPanelLatched(false)
    }

    window.addEventListener("pointermove", updateCursorZone)
    window.addEventListener("blur", resetCursorZone)
    return () => {
      window.removeEventListener("pointermove", updateCursorZone)
      window.removeEventListener("blur", resetCursorZone)
    }
  }, [floatingHovered, pinned, suspended])

  const completedTodoCount = todos.filter((todo) => todo.status === "completed").length
  const fallbackProgressSteps = useMemo(
    () => fallbackProgressStepsFromActivities(items, running, interrupted),
    [items, running, interrupted],
  )
  const generatedResults = useMemo(() => generatedResultsFromDiffs(diffs), [diffs])
  const sourceRows = useMemo(() => sourceSummariesFromActivities(items), [items])
  const earliestStart = items.reduce<number | null>((earliest, activity) => {
    const ts = activity.createdAt
    if (!ts) return earliest
    return earliest === null || ts < earliest ? ts : earliest
  }, null)
  const elapsed = running ? formatDuration(now - (earliestStart ?? now)) : null
  const failedItems = items.filter((activity) => activity.status === "failed")
  const failedCount = failedItems.length
  const waitingCount = items.filter((activity) => activity.status === "waiting" || activity.status === "pending").length
  const progressCount = todos.length || fallbackProgressSteps.length
  const title = running ? "正在处理" : interrupted ? "已中断" : failedCount ? "处理完成，有异常" : "处理完成"
  const detail = [
    elapsed,
    progressCount ? `${todos.length ? `${completedTodoCount}/${todos.length}` : progressCount} 项进度` : "",
    generatedResults.totalCount ? `${generatedResults.totalCount} 个结果` : "",
    sourceRows.length ? `${sourceRows.length} 个来源` : "",
    failedCount ? `${failedCount} 个异常` : "",
    waitingCount ? `${waitingCount} 个等待` : "",
    !progressCount && !generatedResults.totalCount && !sourceRows.length && running ? "正在整理进度" : "",
  ].filter(Boolean).join(" · ")
  const showStrip = !pinned && (cursorZone !== "outside" || panelLatched || floatingHovered)
  const showPanel = pinned || cursorZone === "panel" || panelLatched || floatingHovered

  if (suspended) return null

  return (
    <div className="pointer-events-none absolute right-0 top-5 z-30 hidden h-[300px] w-[392px] sm:block">
      <div className="absolute right-0 top-0 h-full w-full pointer-events-none">
        <div
          className={cn(
            "pointer-events-auto absolute right-0 top-1/2 h-40 w-3 -translate-y-1/2 transition-opacity duration-150",
            showStrip ? "opacity-100" : "pointer-events-none opacity-0",
            pinned && "hidden",
          )}
          title="查看处理进度"
          onMouseEnter={() => setFloatingHovered(true)}
          onMouseLeave={() => setFloatingHovered(false)}
        >
          <span
            className={cn(
              "absolute right-1.5 top-1/2 h-12 w-1.5 -translate-y-1/2 rounded-full border border-[color-mix(in_srgb,var(--app-border)_68%,transparent)] bg-[color-mix(in_srgb,var(--app-text)_24%,transparent)] shadow-[0_8px_24px_rgba(0,0,0,0.18)] transition-[height,width,background-color,opacity] duration-150",
              (cursorZone === "panel" || floatingHovered) && "h-16 w-2 bg-[color-mix(in_srgb,var(--app-text)_38%,transparent)]",
            )}
          />
        </div>
        <section
          className={cn(
            "pointer-events-auto absolute right-5 top-0 flex h-full w-[340px] flex-col rounded-xl border border-[var(--app-border)] bg-[var(--app-panel)] p-3 shadow-2xl shadow-black/30 ring-1 ring-black/5 transition-[opacity,transform] duration-150",
            showPanel ? "translate-x-0 opacity-100" : "pointer-events-none translate-x-3 opacity-0",
          )}
          onMouseEnter={() => setFloatingHovered(true)}
          onMouseLeave={() => setFloatingHovered(false)}
        >
          <div className="flex items-start gap-3">
            <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[var(--app-hover)] text-[var(--app-text)]">
              {running ? <Loader2Icon className="h-4 w-4 animate-spin" /> : <CheckCircle2Icon className="h-4 w-4" />}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex min-w-0 items-center gap-2">
                <div className="truncate text-sm font-semibold text-[var(--app-text)]">{title}</div>
                {failedCount ? (
                  <span
                    role="button"
                    tabIndex={0}
                    className="shrink-0 cursor-pointer select-none rounded-full bg-[var(--app-danger-soft)] px-1.5 py-0.5 text-[10px] font-medium text-[var(--app-danger)]"
                    title={failedOnly ? "显示全部进度记录" : "仅查看异常记录"}
                    aria-pressed={failedOnly}
                    onClick={() => setFailedOnly((value) => !value)}
                    onKeyDown={(event) => {
                      if (event.key !== "Enter" && event.key !== " ") return
                      event.preventDefault()
                      setFailedOnly((value) => !value)
                    }}
                  >
                    {failedCount}
                  </span>
                ) : null}
              </div>
              <div className="mt-1 truncate text-xs font-medium text-[var(--app-muted)]">
                {detail || "暂无进度"}
              </div>
            </div>
            <button
              type="button"
              className={cn(
                "flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-[var(--app-muted)] hover:bg-[var(--app-hover)] hover:text-[var(--app-text)]",
                pinned && "bg-[var(--app-selected)] text-[var(--app-text)]",
              )}
              title={pinned ? "取消固定进度窗口" : "固定进度窗口"}
              onClick={() => onPinnedChange(!pinned)}
            >
              <PinIcon className={cn("h-3.5 w-3.5", pinned && "fill-current")} />
            </button>
          </div>

          <div className="mt-3 flex min-h-0 flex-1 flex-col overflow-hidden border-t border-[var(--app-divider)] pt-3">
            {failedOnly ? (
              <div className="mb-2 flex shrink-0 items-center justify-between gap-2 rounded-md bg-[var(--app-danger-soft)] px-2 py-1.5 text-xs font-medium text-[var(--app-danger)]">
                <span>仅查看 {failedCount} 条异常记录</span>
                <button
                  type="button"
                  className="rounded px-1.5 py-0.5 hover:bg-[color-mix(in_srgb,var(--app-danger)_18%,transparent)]"
                  onClick={() => setFailedOnly(false)}
                >
                  显示全部
                </button>
              </div>
            ) : null}

            <div className="min-h-0 flex-1 space-y-3 overflow-y-auto pr-1">
              {failedOnly ? (
                failedItems.length ? (
                  failedItems.slice().reverse().map((activity, index) => (
                    <FloatingProgressRow key={activity.id} activity={activity} index={index} running={running} />
                  ))
                ) : (
                  <FloatingSummaryPlaceholder text="暂无异常记录" />
                )
              ) : (
                <>
                  <FloatingSummarySection title="进度" meta={todos.length ? `${completedTodoCount}/${todos.length}` : undefined}>
                    {todos.length ? (
                      todos.map((todo) => (
                        <FloatingTodoStepRow key={todo.id} todo={todo} running={running} interrupted={interrupted} />
                      ))
                    ) : fallbackProgressSteps.length ? (
                      fallbackProgressSteps.map((step) => (
                        <FloatingSummaryStepRow key={step.id} step={step} />
                      ))
                    ) : (
                      <FloatingSummaryPlaceholder text={running ? "等待进度更新" : "暂无进度总结"} spinning={running} />
                    )}
                  </FloatingSummarySection>

                  {generatedResults.rows.length ? (
                    <FloatingSummarySection title="生成结果">
                      {generatedResults.rows.map((result) => (
                        <FloatingGeneratedResultRow key={result.id} result={result} />
                      ))}
                      {generatedResults.hiddenCount ? (
                        <div className="px-1 text-[11px] font-medium text-[var(--app-subtle)]">
                          再显示 {generatedResults.hiddenCount} 个
                        </div>
                      ) : null}
                    </FloatingSummarySection>
                  ) : null}

                  {sourceRows.length ? (
                    <FloatingSummarySection title="来源">
                      {sourceRows.map((source) => (
                        <FloatingSourceRow key={source.id} source={source} />
                      ))}
                    </FloatingSummarySection>
                  ) : null}
                </>
              )}
            </div>
          </div>
        </section>
      </div>
    </div>
  )
}

const todoStatusText: Record<string, string> = {
  pending: "待处理",
  in_progress: "进行中",
  completed: "已完成",
  cancelled: "已取消",
  canceled: "已取消",
  interrupted: "已中断",
  settled: "已结束",
}

function displayTodoStatus(todo: TodoStep, running: boolean, interrupted: boolean) {
  if (todo.status === "in_progress" && !running) return interrupted ? "interrupted" : "settled"
  return todo.status
}

function todoStepIcon(status: string): IconComponent {
  if (status === "completed") return CheckCircle2Icon
  if (status === "settled") return CheckCircle2Icon
  if (status === "in_progress") return Loader2Icon
  if (status === "cancelled" || status === "canceled" || status === "interrupted") return XCircleIcon
  return CircleIcon
}

function FloatingTodoStepRow({ todo, running, interrupted }: { todo: TodoStep; running: boolean; interrupted: boolean }) {
  const status = displayTodoStatus(todo, running, interrupted)
  const Icon = todoStepIcon(status)
  const active = status === "in_progress"
  const done = status === "completed"
  const settled = status === "settled"
  const content = localizedTodoContent(todo.content)
  return (
    <div className="flex min-w-0 items-start gap-2 rounded-md px-1 py-1 text-xs font-medium text-[var(--app-muted)]">
      <Icon
        className={cn(
          "mt-0.5 h-3.5 w-3.5 shrink-0",
          active && "animate-spin text-[var(--app-text)]",
          done && "text-[var(--app-text)]",
          settled && "text-[var(--app-subtle)]",
          status === "interrupted" && "text-[var(--app-subtle)]",
        )}
      />
      <div className="min-w-0 flex-1">
        <div
          className={cn("truncate text-[var(--app-text)]", done && "text-[var(--app-subtle)] line-through decoration-[var(--app-subtle)]")}
          title={content !== todo.content ? todo.content : undefined}
        >
          {content}
        </div>
        <div className="mt-0.5 flex min-w-0 items-center gap-2 text-[11px] text-[var(--app-subtle)]">
          <span className="shrink-0">{todoStatusText[status] ?? status}</span>
          {todo.priority ? <span className="truncate">优先级：{todo.priority}</span> : null}
        </div>
      </div>
    </div>
  )
}

const summaryStatusText: Record<ProgressSummaryStatus, string> = {
  completed: "已完成",
  running: "进行中",
  pending: "等待中",
  failed: "异常",
  interrupted: "已中断",
  warning: "需注意",
}

function summaryStatusIcon(status: ProgressSummaryStatus): IconComponent {
  if (status === "running") return Loader2Icon
  if (status === "failed" || status === "interrupted") return XCircleIcon
  if (status === "pending") return CircleIcon
  return CheckCircle2Icon
}

function FloatingSummarySection({
  title,
  meta,
  children,
}: {
  title: string
  meta?: string
  children: ReactNode
}) {
  return (
    <section className="space-y-1.5">
      <div className="flex items-center justify-between gap-3 px-1 text-[11px] font-semibold text-[var(--app-subtle)]">
        <span>{title}</span>
        {meta ? <span className="shrink-0 tabular-nums">{meta}</span> : null}
      </div>
      <div className="space-y-1.5">{children}</div>
    </section>
  )
}

function FloatingSummaryStepRow({ step }: { step: ProgressSummaryStep }) {
  const Icon = summaryStatusIcon(step.status)
  return (
    <div className="flex min-w-0 items-start gap-2 rounded-md px-1 py-1 text-xs font-medium text-[var(--app-muted)]">
      <Icon
        className={cn(
          "mt-0.5 h-3.5 w-3.5 shrink-0",
          step.status === "running" && "animate-spin text-[var(--app-text)]",
          step.status === "completed" && "text-[var(--app-text)]",
          step.status === "failed" && "text-[var(--app-danger)]",
          step.status === "interrupted" && "text-[var(--app-subtle)]",
        )}
      />
      <div className="min-w-0 flex-1">
        <div className="truncate text-[var(--app-text)]">{step.label}</div>
        <div className="mt-0.5 flex min-w-0 items-center gap-2 text-[11px] text-[var(--app-subtle)]">
          <span className="shrink-0">{summaryStatusText[step.status]}</span>
          {step.detail ? <span className="truncate">{step.detail}</span> : null}
        </div>
      </div>
    </div>
  )
}

function FloatingGeneratedResultRow({ result }: { result: ProgressGeneratedResult }) {
  return (
    <div className="flex min-w-0 items-start gap-2 rounded-md px-1 py-1 text-xs font-medium text-[var(--app-muted)]">
      <FileTextIcon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--app-text)]" />
      <div className="min-w-0 flex-1">
        <div className="truncate text-[var(--app-text)]" title={result.file}>{result.label}</div>
        <div className="mt-0.5 flex min-w-0 items-center gap-2 text-[11px] text-[var(--app-subtle)]">
          <span className="shrink-0">{diffStatusLabel(result.status)}</span>
          {result.additions ? <span className="shrink-0 text-[var(--app-success)]">+{result.additions}</span> : null}
          {result.deletions ? <span className="shrink-0 text-[var(--app-danger)]">-{result.deletions}</span> : null}
          {result.detail ? <span className="truncate">{result.detail}</span> : null}
        </div>
      </div>
    </div>
  )
}

function FloatingSourceRow({ source }: { source: ProgressSourceSummary }) {
  const Icon = source.id === "workspace" ? FolderOpenIcon : GlobeIcon
  return (
    <div className="flex min-w-0 items-start gap-2 rounded-md px-1 py-1 text-xs font-medium text-[var(--app-muted)]">
      <Icon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--app-text)]" />
      <div className="min-w-0 flex-1">
        <div className="truncate text-[var(--app-text)]">{source.label}</div>
        {source.detail ? <div className="mt-0.5 truncate text-[11px] text-[var(--app-subtle)]">{source.detail}</div> : null}
      </div>
    </div>
  )
}

function FloatingSummaryPlaceholder({ text, spinning }: { text: string; spinning?: boolean }) {
  return (
    <div className="flex items-center gap-2 px-1 py-1 text-xs font-medium text-[var(--app-muted)]">
      <Loader2Icon className={cn("h-3.5 w-3.5", spinning && "animate-spin")} />
      <span>{text}</span>
    </div>
  )
}

function FloatingProgressRow({
  activity,
  index,
  running,
}: {
  activity: ThreadActivityItem
  index: number
  running: boolean
}) {
  const displayStatus = activity.status === "running" && !running ? "success" : activity.status
  const Icon = activityIcon(activity)
  return (
    <div className="flex min-w-0 items-start gap-2.5 text-xs font-medium text-[var(--app-muted)]">
      <Icon className={cn("mt-0.5 h-3.5 w-3.5 shrink-0", displayStatus === "running" && "animate-spin")} />
      <div className="min-w-0 flex-1">
        <div className="truncate text-[var(--app-text)]">{activity.title}</div>
        <div className="mt-0.5 flex min-w-0 items-center gap-2 text-[11px] text-[var(--app-subtle)]">
          <span className="shrink-0">{statusText[displayStatus] ?? "已处理"}</span>
          <span className="shrink-0 tabular-nums">{formatElapsed(activity, index)}</span>
          {activity.detail ? <span className="truncate">{activity.detail}</span> : null}
        </div>
      </div>
    </div>
  )
}

function ActivityRunGroup({
  activities,
  running,
  onTerminalOpen,
}: {
  activities: ThreadActivityItem[]
  running: boolean
  onTerminalOpen?: (title: string, content: string, subtitle?: string) => void
}) {
  const [open, setOpen] = useState(running)
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    setOpen(running)
  }, [running])
  useEffect(() => {
    if (!running) return
    const id = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(id)
  }, [running])
  if (!running) return null
  if (!activities.length) return null

  const earliestStart = activities.reduce<number | null>((earliest, activity) => {
    const ts = activity.createdAt
    if (!ts) return earliest
    return earliest === null || ts < earliest ? ts : earliest
  }, null)
  const elapsed = earliestStart ? formatDuration(now - earliestStart) : null

  const stepLabel = activities.length ? ` · ${activities.length} 步` : ""
  const elapsedLabel = elapsed ? ` ${elapsed}` : ""
  const label = running ? `处理中...${elapsedLabel}${stepLabel}` : `已处理${elapsedLabel}${stepLabel}`

  return (
    <section className="self-stretch">
      <button
        type="button"
        className="inline-flex items-center gap-1.5 rounded-[var(--app-radius-sm)] px-1 py-1.5 text-[12px] font-medium text-[var(--app-muted)] transition-colors hover:text-[var(--app-text)]"
        onClick={() => activities.length && setOpen((value) => !value)}
      >
        {running ? (
          <span className="relative flex h-2 w-2">
            <span className="absolute inset-0 animate-ping rounded-full bg-[var(--app-accent)] opacity-60" />
            <span className="relative inline-block h-2 w-2 rounded-full bg-[var(--app-accent)]" />
          </span>
        ) : (
          <ChevronDownIcon className={cn("h-3 w-3 transition-transform duration-150", open && "rotate-180")} />
        )}
        <span className={cn("tabular-nums", running && "text-[var(--app-text)]")}>{label}</span>
      </button>
      <div className={cn("grid transition-[grid-template-rows] duration-200 ease-out", open ? "grid-rows-[1fr]" : "grid-rows-[0fr]")}>
        <div className="overflow-hidden">
          <div className="ml-1 space-y-2 border-l-2 border-[var(--app-divider)] py-1.5 pl-3.5">
            {activities.map((activity, index) => (
              <ActivityRow
                key={activity.id}
                activity={activity}
                index={index}
                groupRunning={running}
                onTerminalOpen={onTerminalOpen}
              />
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}

function ExpandableRow({
  icon: Icon,
  label,
  meta,
  onOpenPanel,
  children,
}: {
  icon: IconComponent
  label: string
  meta?: string
  onOpenPanel?: () => void
  children?: ReactNode
}) {
  const [open, setOpen] = useState(false)
  const hasBody = Boolean(children)
  return (
    <div className="group/row text-xs">
      <div className="flex max-w-full items-center gap-1">
        <button
          type="button"
          className="inline-flex min-w-0 flex-1 items-center gap-1.5 rounded-[var(--app-radius-sm)] px-1 py-0.5 text-[var(--app-muted)] transition-colors hover:text-[var(--app-text)] disabled:cursor-default"
          disabled={!hasBody}
          onClick={() => hasBody && setOpen((value) => !value)}
        >
          {hasBody ? (
            <ChevronRightIcon className={cn("h-3 w-3 shrink-0 transition-transform duration-150", open && "rotate-90")} />
          ) : (
            <span className="h-3 w-3 shrink-0" />
          )}
          <Icon className="h-3.5 w-3.5 shrink-0 text-[var(--app-subtle)] transition-colors group-hover/row:text-[var(--app-accent)]" />
          <span className="min-w-0 break-all text-left">{label}</span>
          {meta ? (
            <span className="shrink-0 rounded-[4px] bg-[var(--app-hover)] px-1.5 py-px text-[10px] uppercase tracking-[0.04em] text-[var(--app-subtle)]">
              {meta}
            </span>
          ) : null}
        </button>
        {onOpenPanel ? (
          <button
            type="button"
            className="flex h-6 w-6 shrink-0 items-center justify-center rounded-[var(--app-radius-sm)] text-[var(--app-subtle)] opacity-0 transition-[opacity,background-color,color] duration-150 hover:bg-[var(--app-hover)] hover:text-[var(--app-text)] group-hover/row:opacity-100 group-focus-within/row:opacity-100"
            title="在右侧打开"
            onClick={onOpenPanel}
          >
            <PanelRightIcon className="h-3.5 w-3.5" />
          </button>
        ) : null}
      </div>
      {hasBody ? (
        <div className={cn("grid transition-[grid-template-rows] duration-200 ease-out", open ? "grid-rows-[1fr] pt-1.5" : "grid-rows-[0fr]")}>
          <div className="overflow-hidden">
            <div className="ml-5">{children}</div>
          </div>
        </div>
      ) : null}
    </div>
  )
}

function CodeBlock({ children }: { children: ReactNode }) {
  return (
    <pre className="max-h-80 overflow-auto whitespace-pre-wrap break-words rounded-[var(--app-radius-md)] border border-[var(--app-divider)] bg-[var(--app-code-bg)] p-3 text-[12px] leading-[1.65] text-[var(--app-text)] shadow-[var(--app-elevation-1)] [font-family:var(--app-code-font)] [font-feature-settings:'cv11'_1,'ss01'_1]">
      {children}
    </pre>
  )
}

function ActivityRow({
  activity,
  index,
  groupRunning,
  onTerminalOpen,
}: {
  activity: ThreadActivityItem
  index: number
  groupRunning: boolean
  onTerminalOpen?: (title: string, content: string, subtitle?: string) => void
}) {
  const displayStatus = activity.status === "running" && !groupRunning ? "success" : activity.status
  const Icon = activityIcon(activity)
  const output = activity.detail ?? JSON.stringify(activity.raw, null, 2)
  return (
    <div className="flex min-w-0 items-start gap-3 text-sm font-medium text-[var(--app-muted)]">
      <Icon className={cn("mt-0.5 h-4 w-4 shrink-0", displayStatus === "running" && "animate-spin")} />
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-center gap-1">
          <div className="min-w-0 flex-1 truncate text-[var(--app-text)]">{activity.title}</div>
          {output ? (
            <button
              type="button"
              className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-[var(--app-subtle)] hover:bg-[var(--app-hover)] hover:text-[var(--app-text)]"
              title="在右侧打开"
              onClick={() => onTerminalOpen?.(activity.title, output, activity.sourceEventType)}
            >
              <PanelRightIcon className="h-3.5 w-3.5" />
            </button>
          ) : null}
        </div>
        <div className="mt-1 flex items-center gap-2 text-xs text-[var(--app-subtle)]">
          <span>{statusText[displayStatus] ?? "已处理"}</span>
          <span>{formatElapsed(activity, index)}</span>
        </div>
      </div>
    </div>
  )
}

function PermissionButton({
  children,
  danger,
  disabled,
  onClick,
}: {
  children: ReactNode
  danger?: boolean
  disabled?: boolean
  onClick: () => void
}) {
  return (
    <button
      className={cn(
        "h-8 rounded-md text-xs font-medium transition-colors disabled:opacity-50",
        danger
          ? "bg-[var(--app-danger-soft)] text-[var(--app-text)] hover:bg-[var(--app-hover-strong)]"
          : "bg-[var(--app-hover)] text-[var(--app-text)] hover:bg-[var(--app-hover-strong)]",
      )}
      disabled={disabled}
      onClick={onClick}
    >
      {children}
    </button>
  )
}

function PermissionApprovalModal({
  permission,
  count,
  pending,
  onReply,
}: {
  permission?: PermissionInfo
  count: number
  pending: boolean
  onReply: (reply: "once" | "always" | "reject") => void
}) {
  if (!permission) return null
  const detail = permissionDetail(permission)
  const metadata = metadataSummary(permission.metadata)
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 px-4">
      <div className="w-full max-w-[460px] rounded-xl border border-[var(--app-border)] bg-[var(--app-panel)] p-4 shadow-2xl shadow-black/40">
        <div className="flex items-start gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[color-mix(in_srgb,var(--app-warning)_16%,transparent)] text-[var(--app-warning)]">
            <ShieldCheckIcon className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-sm font-semibold text-[var(--app-text)]">需要权限</div>
            <div className="mt-1 break-words text-sm leading-6 text-[var(--app-muted)]">{detail}</div>
            {metadata ? <div className="mt-2 break-words text-xs leading-5 text-[var(--app-subtle)]">{metadata}</div> : null}
            {count > 1 ? (
              <div className="mt-2 text-xs font-medium text-[var(--app-warning)]">还有 {count - 1} 个同类请求等待处理</div>
            ) : null}
          </div>
        </div>
        <div className="mt-4 grid grid-cols-3 gap-2">
          <PermissionButton disabled={pending} onClick={() => onReply("once")}>
            允许一次
          </PermissionButton>
          <PermissionButton disabled={pending} onClick={() => onReply("always")}>
            始终允许
          </PermissionButton>
          <PermissionButton disabled={pending} danger onClick={() => onReply("reject")}>
            拒绝
          </PermissionButton>
        </div>
      </div>
    </div>
  )
}
