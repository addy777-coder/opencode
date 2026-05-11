import type {
  OpenCodeMessage,
  OpenCodeMessagePart,
  OpenCodeSession,
  OpenCodeSessionStatus,
  PermissionInfo,
  QuestionInfo,
  SessionDiffFile,
} from "@/lib/tauri"

export type OpenCodeUnwrappedEvent = {
  type: string
  data: Record<string, unknown>
  payload: Record<string, unknown>
}

export type OpenCodePartDelta = {
  sessionId: string
  messageId: string
  partId: string
  delta: string
}

export type OpenCodePartUpdate = {
  sessionId?: string | null
  messageId: string
  partId: string
  part?: OpenCodeMessagePart
  text?: string
}

export function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null
}

export function stripOpenCodeEventVersion(value: string) {
  const index = value.lastIndexOf(".")
  if (index < 0) return value
  const suffix = value.slice(index + 1)
  return /^\d+$/.test(suffix) ? value.slice(0, index) : value
}

export function unwrapOpenCodeEvent(payload: unknown): OpenCodeUnwrappedEvent | null {
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

export function getOpenCodeEventType(payload: unknown) {
  return unwrapOpenCodeEvent(payload)?.type ?? null
}

export function getOpenCodeEventSessionId(payload: unknown) {
  const event = unwrapOpenCodeEvent(payload)
  if (!event) return null
  return sessionIdFromEvent(event)
}

export function getOpenCodeSessionStatusType(payload: unknown) {
  const status = statusFromOpenCodeEvent(payload)
  return status?.type ?? null
}

export function getOpenCodePartDelta(payload: unknown): OpenCodePartDelta | null {
  const event = unwrapOpenCodeEvent(payload)
  if (event?.type !== "message.part.delta") return null
  const sessionId = stringField(event.data, "sessionID") ?? stringField(event.data, "sessionId")
  const messageId = stringField(event.data, "messageID") ?? stringField(event.data, "messageId")
  const partId = stringField(event.data, "partID") ?? stringField(event.data, "partId")
  const field = stringField(event.data, "field")
  const delta = stringField(event.data, "delta")
  if (!sessionId || !messageId || !partId || field !== "text" || !delta) return null
  return { sessionId, messageId, partId, delta }
}

export function getOpenCodePartUpdated(payload: unknown): OpenCodePartUpdate | null {
  const event = unwrapOpenCodeEvent(payload)
  if (event?.type !== "message.part.updated") return null
  return partUpdateFromEvent(event)
}

export function sessionFromOpenCodeEvent(payload: unknown, fallbackDirectory?: string | null): OpenCodeSession | null {
  const event = unwrapOpenCodeEvent(payload)
  if (!event) return null
  const source = sourceRecord(event.data, "info") ?? sourceRecord(event.data, "session") ?? event.data
  const id = stringField(source, "id") ?? stringField(event.data, "sessionID") ?? stringField(event.data, "sessionId")
  if (!id) return null
  const title = stringField(source, "title")?.trim() || "未命名线程"
  const directory = stringField(source, "directory") ?? fallbackDirectory ?? null
  const summary = asRecord(source.summary)
  return {
    id,
    title,
    directory,
    path: stringField(source, "path"),
    parentId: stringField(source, "parentID") ?? stringField(source, "parentId"),
    projectName:
      sourceRecord(source, "project")
        ? stringField(sourceRecord(source, "project")!, "name") ?? stringField(sourceRecord(source, "project")!, "id")
        : null,
    updatedAt: timeField(source, "updated") ?? numberField(source, "updatedAt"),
    createdAt: timeField(source, "created") ?? numberField(source, "createdAt"),
    archivedAt: timeField(source, "archived") ?? numberField(source, "archivedAt"),
    changedFiles: numberField(summary, "files"),
  }
}

export function statusFromOpenCodeEvent(payload: unknown): OpenCodeSessionStatus | null {
  const event = unwrapOpenCodeEvent(payload)
  if (!event) return null
  if (event.type === "session.idle") return { type: "idle" }
  if (event.type === "session.error" || event.type === "session.next.step.failed") {
    return { type: "idle", message: stringField(sourceRecord(event.data, "error"), "message") }
  }
  if (event.type !== "session.status") return null
  const status = sourceRecord(event.data, "status")
  const type = stringField(status, "type")
  if (!type) return null
  return {
    type,
    attempt: numberField(status, "attempt"),
    message: stringField(status, "message"),
    next: numberField(status, "next"),
  }
}

export function messageFromOpenCodeEvent(payload: unknown): OpenCodeMessage | null {
  const event = unwrapOpenCodeEvent(payload)
  if (!event || event.type !== "message.updated") return null
  const source = sourceRecord(event.data, "info") ? event.data : sourceRecord(event.data, "message") ?? event.data
  return messageFromValue(source, sessionIdFromEvent(event))
}

export function partUpdateFromOpenCodeEvent(payload: unknown): OpenCodePartUpdate | null {
  const event = unwrapOpenCodeEvent(payload)
  if (event?.type !== "message.part.updated") return null
  return partUpdateFromEvent(event)
}

export function partRemovalFromOpenCodeEvent(payload: unknown) {
  const event = unwrapOpenCodeEvent(payload)
  if (event?.type !== "message.part.removed") return null
  const messageId = stringField(event.data, "messageID") ?? stringField(event.data, "messageId")
  const partId = stringField(event.data, "partID") ?? stringField(event.data, "partId")
  if (!messageId || !partId) return null
  return {
    sessionId: sessionIdFromEvent(event),
    messageId,
    partId,
  }
}

export function removedMessageFromOpenCodeEvent(payload: unknown) {
  const event = unwrapOpenCodeEvent(payload)
  if (event?.type !== "message.removed") return null
  const messageId = stringField(event.data, "messageID") ?? stringField(event.data, "messageId")
  if (!messageId) return null
  return {
    sessionId: sessionIdFromEvent(event),
    messageId,
  }
}

export function diffsFromOpenCodeEvent(payload: unknown): SessionDiffFile[] | null {
  const event = unwrapOpenCodeEvent(payload)
  if (event?.type !== "session.diff") return null
  const diff = Array.isArray(event.data.diff) ? event.data.diff : null
  if (!diff) return null
  return diff.map(diffFromValue).filter((item): item is SessionDiffFile => Boolean(item))
}

export function permissionFromOpenCodeEvent(payload: unknown): PermissionInfo | null {
  const event = unwrapOpenCodeEvent(payload)
  if (!event || event.type !== "permission.asked") return null
  const source = sourceRecord(event.data, "permission") ?? sourceRecord(event.data, "info") ?? event.data
  const id = stringField(source, "id") ?? stringField(event.data, "requestID") ?? stringField(event.data, "requestId")
  if (!id) return null
  return {
    id,
    sessionId: stringField(source, "sessionID") ?? stringField(source, "sessionId") ?? sessionIdFromEvent(event),
    permission: stringField(source, "permission") ?? "unknown",
    patterns: stringArray(source, "patterns"),
    always: stringArray(source, "always"),
    metadata: source.metadata ?? null,
    tool: source.tool,
    raw: source,
  }
}

export function permissionReplyFromOpenCodeEvent(payload: unknown) {
  const event = unwrapOpenCodeEvent(payload)
  if (event?.type !== "permission.replied") return null
  const requestId = stringField(event.data, "requestID") ?? stringField(event.data, "requestId") ?? stringField(event.data, "id")
  if (!requestId) return null
  return { sessionId: sessionIdFromEvent(event), requestId }
}

export function questionFromOpenCodeEvent(payload: unknown): QuestionInfo | null {
  const event = unwrapOpenCodeEvent(payload)
  if (!event || event.type !== "question.asked") return null
  const source = sourceRecord(event.data, "question") ?? sourceRecord(event.data, "info") ?? event.data
  const id = stringField(source, "id") ?? stringField(event.data, "requestID") ?? stringField(event.data, "requestId")
  const sessionId = stringField(source, "sessionID") ?? stringField(source, "sessionId") ?? sessionIdFromEvent(event)
  if (!id || !sessionId) return null
  const questions = Array.isArray(source.questions)
    ? source.questions.map(questionPromptFromValue).filter((item): item is QuestionInfo["questions"][number] => Boolean(item))
    : []
  const tool = sourceRecord(source, "tool")
  return {
    id,
    sessionId,
    questions,
    tool:
      tool && stringField(tool, "messageID") && stringField(tool, "callID")
        ? { messageId: stringField(tool, "messageID")!, callId: stringField(tool, "callID")! }
        : null,
    raw: source,
  }
}

export function questionReplyFromOpenCodeEvent(payload: unknown) {
  const event = unwrapOpenCodeEvent(payload)
  if (!event || (event.type !== "question.replied" && event.type !== "question.rejected")) return null
  const requestId = stringField(event.data, "requestID") ?? stringField(event.data, "requestId") ?? stringField(event.data, "id")
  if (!requestId) return null
  return { sessionId: sessionIdFromEvent(event), requestId }
}

export function sessionIdFromEvent(event: OpenCodeUnwrappedEvent) {
  const direct =
    stringField(event.data, "sessionID") ??
    stringField(event.data, "sessionId") ??
    stringField(sourceRecord(event.data, "info"), "sessionID") ??
    stringField(sourceRecord(event.data, "info"), "sessionId") ??
    stringField(sourceRecord(event.data, "info"), "id") ??
    stringField(sourceRecord(event.data, "session"), "id")
  if (direct) return direct
  const properties = asRecord(event.payload.properties)
  return (
    stringField(properties, "sessionID") ??
    stringField(properties, "sessionId") ??
    stringField(sourceRecord(properties, "info"), "sessionID") ??
    stringField(sourceRecord(properties, "info"), "sessionId") ??
    stringField(sourceRecord(properties, "info"), "id")
  )
}

function partUpdateFromEvent(event: OpenCodeUnwrappedEvent): OpenCodePartUpdate | null {
  const source = sourceRecord(event.data, "part") ?? event.data
  const messageId = stringField(source, "messageID") ?? stringField(source, "messageId")
  const partId = stringField(source, "id") ?? stringField(event.data, "partID") ?? stringField(event.data, "partId")
  if (!messageId || !partId) return null
  const part = messagePartFromValue(source)
  return {
    sessionId:
      stringField(event.data, "sessionID") ??
      stringField(event.data, "sessionId") ??
      stringField(source, "sessionID") ??
      stringField(source, "sessionId"),
    messageId,
    partId,
    part,
    text: part.text ?? "",
  }
}

function messageFromValue(value: Record<string, unknown>, fallbackSessionId?: string | null): OpenCodeMessage | null {
  const info = sourceRecord(value, "info") ?? value
  const id = stringField(info, "id")
  if (!id) return null
  const sessionId = stringField(info, "sessionID") ?? stringField(info, "sessionId") ?? stringField(value, "sessionID") ?? fallbackSessionId
  const parts = Array.isArray(value.parts) ? value.parts.map(messagePartFromValue) : []
  const text =
    parts
      .filter((part) => part.kind === "text")
      .map((part) => part.text?.trim())
      .filter(Boolean)
      .join("\n\n") || stringField(info, "text") || ""
  const model = sourceRecord(info, "model")
  return {
    id,
    sessionId,
    role: stringField(info, "role") ?? "assistant",
    text,
    agent: stringField(info, "agent") ?? stringField(info, "mode"),
    model: stringField(info, "modelID") ?? stringField(model, "modelID") ?? stringField(model, "id") ?? stringField(model, "providerID"),
    status: stringField(info, "finish") ?? (sourceRecord(info, "error") ? "error" : null),
    createdAt: timeField(info, "created") ?? numberField(info, "createdAt"),
    completedAt: timeField(info, "completed") ?? numberField(info, "completedAt"),
    parts,
    raw: value,
  }
}

function messagePartFromValue(value: unknown): OpenCodeMessagePart {
  const record = asRecord(value) ?? {}
  const kind = stringField(record, "type") ?? stringField(record, "kind") ?? "unknown"
  const state = sourceRecord(record, "state")
  const text =
    kind === "text" || kind === "reasoning"
      ? stringField(record, "text")
      : kind === "tool"
        ? stringField(state, "output") ?? stringField(state, "error")
        : kind === "subtask"
          ? stringField(record, "prompt")
          : kind === "file"
            ? stringField(record, "filename") ?? stringField(record, "url")
            : kind === "patch" && Array.isArray(record.files)
              ? record.files.filter((item): item is string => typeof item === "string").join("\n")
              : undefined
  return {
    id: stringField(record, "id"),
    kind,
    text,
    title: stringField(state, "title") ?? stringField(record, "title"),
    status: stringField(state, "status") ?? stringField(record, "status"),
    tool: stringField(record, "tool"),
    file: stringField(record, "filename") ?? stringField(record, "file") ?? stringField(record, "url"),
    raw: record,
  }
}

function diffFromValue(value: unknown): SessionDiffFile | null {
  const record = asRecord(value)
  const file = stringField(record, "file")
  if (!record || !file) return null
  return {
    file,
    patch: stringField(record, "patch") ?? "",
    additions: numberField(record, "additions") ?? 0,
    deletions: numberField(record, "deletions") ?? 0,
    status: stringField(record, "status") ?? "modified",
    raw: record,
  }
}

function questionPromptFromValue(value: unknown): QuestionInfo["questions"][number] | null {
  const record = asRecord(value)
  const question = stringField(record, "question")
  if (!record || !question) return null
  const options = Array.isArray(record.options)
    ? record.options.map((item) => {
        const option = asRecord(item)
        return {
          label: stringField(option, "label") ?? "",
          description: stringField(option, "description") ?? "",
        }
      })
    : []
  return {
    question,
    header: stringField(record, "header") ?? "",
    options,
    multiple: booleanField(record, "multiple"),
    custom: booleanField(record, "custom"),
  }
}

function sourceRecord(value: unknown, key: string) {
  return asRecord(asRecord(value)?.[key])
}

function stringField(value: unknown, key: string) {
  const record = asRecord(value)
  const field = record?.[key]
  return typeof field === "string" ? field : undefined
}

function numberField(value: unknown, key: string) {
  const record = asRecord(value)
  const field = record?.[key]
  return typeof field === "number" && Number.isFinite(field) ? field : undefined
}

function booleanField(value: unknown, key: string) {
  const record = asRecord(value)
  const field = record?.[key]
  return typeof field === "boolean" ? field : undefined
}

function stringArray(value: unknown, key: string) {
  const record = asRecord(value)
  const field = record?.[key]
  return Array.isArray(field) ? field.filter((item): item is string => typeof item === "string") : []
}

function timeField(value: unknown, key: string) {
  return numberField(sourceRecord(value, "time"), key)
}
