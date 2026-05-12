import type { SessionDiffFile, ThreadActivityItem } from "@/lib/tauri"

export type ProgressSummaryStatus = "completed" | "running" | "pending" | "failed" | "interrupted" | "warning"

export type ProgressSummaryStep = {
  id: string
  label: string
  detail?: string
  status: ProgressSummaryStatus
}

export type ProgressGeneratedResult = {
  id: string
  file: string
  label: string
  detail?: string
  additions: number
  deletions: number
  status: string
}

export type ProgressSourceSummary = {
  id: "web-search" | "web-fetch" | "workspace"
  label: string
  detail?: string
  count: number
}

type SummaryActivity = ThreadActivityItem & {
  commandLike?: boolean
}

type ActivityCategory = "workspace" | "file-change" | "validation" | "command" | "task"

const categoryOrder: ActivityCategory[] = ["workspace", "file-change", "validation", "command", "task"]

export function fallbackProgressStepsFromActivities(
  items: SummaryActivity[],
  running: boolean,
  interrupted: boolean,
): ProgressSummaryStep[] {
  const groups = new Map<ActivityCategory, SummaryActivity[]>()
  for (const item of items) {
    const category = fallbackActivityCategory(item)
    if (!category) continue
    groups.set(category, [...(groups.get(category) ?? []), item])
  }
  return categoryOrder.flatMap((category) => {
    const group = groups.get(category)
    if (!group?.length) return []
    return [{
      id: `fallback:${category}`,
      label: fallbackCategoryLabel(category),
      detail: group.length > 1 ? `${group.length} 项` : undefined,
      status: summaryStatus(group, running, interrupted),
    }]
  })
}

export function generatedResultsFromDiffs(diffs: SessionDiffFile[], limit = 6) {
  const byFile = new Map<string, SessionDiffFile>()
  for (const diff of diffs) {
    const previous = byFile.get(diff.file)
    byFile.set(diff.file, previous ? mergeDiff(previous, diff) : diff)
  }
  const rows = [...byFile.values()].map((diff): ProgressGeneratedResult => ({
    id: `generated:${diff.file}`,
    file: diff.file,
    label: basename(diff.file),
    detail: basename(diff.file) === diff.file ? undefined : diff.file,
    additions: diff.additions,
    deletions: diff.deletions,
    status: diff.status,
  }))
  return {
    rows: rows.slice(0, limit),
    hiddenCount: Math.max(0, rows.length - limit),
    totalCount: rows.length,
  }
}

export function sourceSummariesFromActivities(items: SummaryActivity[]): ProgressSourceSummary[] {
  const counts = new Map<ProgressSourceSummary["id"], number>()
  for (const item of items) {
    for (const source of activitySourceKinds(item)) {
      counts.set(source, (counts.get(source) ?? 0) + 1)
    }
  }
  return (["web-search", "web-fetch", "workspace"] as const).flatMap((id) => {
    const count = counts.get(id) ?? 0
    if (!count) return []
    return [{
      id,
      label: sourceLabel(id),
      detail: count > 1 ? `${count} 次` : undefined,
      count,
    }]
  })
}

function fallbackActivityCategory(item: SummaryActivity): ActivityCategory | null {
  const text = activitySearchText(item)
  if (isWebActivity(text)) return null
  if (isValidationActivity(text)) return "validation"
  if (isWorkspaceActivity(item, text)) return "workspace"
  if (isFileChangeActivity(item, text)) return "file-change"
  if (item.commandLike || item.kind === "command" || item.kind === "shell") return "command"
  if (item.kind === "approval" || text.includes("permission")) return null
  return "task"
}

function fallbackCategoryLabel(category: ActivityCategory) {
  if (category === "workspace") return "读取工作区上下文"
  if (category === "file-change") return "处理文件变更"
  if (category === "validation") return "验证结果"
  if (category === "command") return "运行命令"
  return "处理任务步骤"
}

function summaryStatus(items: SummaryActivity[], running: boolean, interrupted: boolean): ProgressSummaryStatus {
  if (items.some((item) => item.status === "failed" || item.status === "error")) return "failed"
  const unsettled = items.some((item) => item.status === "running" || item.status === "pending" || item.status === "waiting")
  if (interrupted && unsettled) return "interrupted"
  if (running && items.some((item) => item.status === "running")) return "running"
  if (unsettled) return "pending"
  if (items.some((item) => item.status === "warning")) return "warning"
  return "completed"
}

function activitySourceKinds(item: SummaryActivity): ProgressSourceSummary["id"][] {
  const text = activitySearchText(item)
  const sources: ProgressSourceSummary["id"][] = []
  if (text.includes("websearch") || text.includes("web_search") || text.includes("exa web search")) sources.push("web-search")
  if (text.includes("webfetch") || text.includes("web_fetch") || text.includes("fetch from the web")) sources.push("web-fetch")
  if (isWorkspaceActivity(item, text) || isFileChangeActivity(item, text)) sources.push("workspace")
  return [...new Set(sources)]
}

function sourceLabel(id: ProgressSourceSummary["id"]) {
  if (id === "web-search") return "网页搜索"
  if (id === "web-fetch") return "网页内容"
  return "工作区上下文"
}

function activitySearchText(item: SummaryActivity) {
  const raw = objectValue(item.raw)
  const state = objectValue(field(raw, "state"))
  const input = objectValue(field(state, "input")) ?? objectValue(field(raw, "input"))
  const metadata = objectValue(field(state, "metadata")) ?? objectValue(field(raw, "metadata"))
  return [
    item.kind,
    item.title,
    item.detail,
    item.sourceEventType,
    item.commandLike ? "command" : "",
    textField(raw, "type"),
    textField(raw, "tool"),
    textField(raw, "title"),
    textField(state, "title"),
    textField(input, "command"),
    textField(input, "query"),
    textField(input, "url"),
    textField(input, "file"),
    textField(input, "path"),
    textField(metadata, "tool"),
    textField(metadata, "source"),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase()
}

function isWebActivity(text: string) {
  return text.includes("websearch") || text.includes("web_search") || text.includes("webfetch") || text.includes("web_fetch")
}

function isValidationActivity(text: string) {
  return /\b(test|typecheck|lint|build|check|verify)\b/.test(text) || /验证|检查|构建|测试/.test(text)
}

function isWorkspaceActivity(item: SummaryActivity, text: string) {
  if (item.kind === "file" || item.kind === "search") return true
  return /\b(read|grep|glob|list|ls|find|search|workspace|file_search)\b/.test(text)
}

function isFileChangeActivity(item: SummaryActivity, text: string) {
  if (item.kind === "file_edit" || item.kind === "patch" || item.kind === "diff") return true
  return /\b(edit|write|patch|diff|modify|modified|created|deleted)\b/.test(text) || /修改|新增|删除|文件变更/.test(text)
}

function mergeDiff(left: SessionDiffFile, right: SessionDiffFile): SessionDiffFile {
  return {
    ...right,
    additions: left.additions + right.additions,
    deletions: left.deletions + right.deletions,
    status: left.status === right.status ? right.status : "modified",
  }
}

function basename(path: string) {
  return path.split(/[\\/]/).filter(Boolean).at(-1) ?? path
}

function objectValue(value: unknown): object | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value : null
}

function field(record: object | null, key: string) {
  return record ? Reflect.get(record, key) : null
}

function textField(record: object | null, key: string) {
  const value = field(record, key)
  return typeof value === "string" && value.trim() ? value.trim() : null
}
