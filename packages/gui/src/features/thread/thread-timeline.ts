export type TimelineMessagePartLike = {
  kind?: string | null
  text?: string | null
  file?: string | null
  title?: string | null
}

export type TimelineMessageLike = {
  id: string
  role: string
  text?: string | null
  parts?: TimelineMessagePartLike[]
  createdAt?: number | null
  completedAt?: number | null
  status?: string | null
}

export type ThreadTimelineItem = {
  id: string
  role: "user" | "assistant"
  label: string
  preview: string
  createdAt?: number | null
  status?: string | null
}

const DEFAULT_TIMELINE_MIN_ITEMS = 8
const DEFAULT_TIMELINE_PREVIEW_LIMIT = 120

function normalizeWhitespace(text: string) {
  return text.replace(/\s+/g, " ").trim()
}

export function timelineMessagePreview(message: TimelineMessageLike, limit = DEFAULT_TIMELINE_PREVIEW_LIMIT) {
  const text = normalizeWhitespace(message.text ?? "")
  const partText = (message.parts ?? [])
    .map((part) => {
      if (part.text?.trim()) return part.text
      if (part.kind === "file") return part.title || part.file
      return null
    })
    .filter((value): value is string => Boolean(value?.trim()))
    .map(normalizeWhitespace)
    .join(" ")
  const preview = text || partText || (message.role === "user" ? "用户消息" : "助手消息")
  if (preview.length <= limit) return preview
  return `${preview.slice(0, Math.max(0, limit - 1)).trimEnd()}…`
}

export function buildThreadTimelineItems(
  messages: TimelineMessageLike[],
  options: { minItems?: number; previewLimit?: number } = {},
) {
  const minItems = options.minItems ?? DEFAULT_TIMELINE_MIN_ITEMS
  const previewLimit = options.previewLimit ?? DEFAULT_TIMELINE_PREVIEW_LIMIT
  const items = messages
    .filter((message): message is TimelineMessageLike & { role: "user" } => message.role === "user")
    .map((message): ThreadTimelineItem => ({
      id: message.id,
      role: message.role,
      label: "用户",
      preview: timelineMessagePreview(message, previewLimit),
      createdAt: message.createdAt,
      status: message.status,
    }))

  return items.length >= minItems ? items : []
}
