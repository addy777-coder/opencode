import { Effect, Layer, Context, Schema } from "effect"
import { Bus } from "@/bus"
import { Snapshot } from "@/snapshot"
import { Storage } from "@/storage/storage"
import { zod } from "@/util/effect-zod"
import { withStatics } from "@/util/schema"
import * as Session from "./session"
import { MessageV2 } from "./message-v2"
import { SessionID, MessageID } from "./schema"

function unquoteGitPath(input: string) {
  if (!input.startsWith('"')) return input
  if (!input.endsWith('"')) return input
  const body = input.slice(1, -1)
  const bytes: number[] = []

  for (let i = 0; i < body.length; i++) {
    const char = body[i]!
    if (char !== "\\") {
      bytes.push(char.charCodeAt(0))
      continue
    }

    const next = body[i + 1]
    if (!next) {
      bytes.push("\\".charCodeAt(0))
      continue
    }

    if (next >= "0" && next <= "7") {
      const chunk = body.slice(i + 1, i + 4)
      const match = chunk.match(/^[0-7]{1,3}/)
      if (!match) {
        bytes.push(next.charCodeAt(0))
        i++
        continue
      }
      bytes.push(parseInt(match[0], 8))
      i += match[0].length
      continue
    }

    const escaped =
      next === "n"
        ? "\n"
        : next === "r"
          ? "\r"
          : next === "t"
            ? "\t"
            : next === "b"
              ? "\b"
              : next === "f"
                ? "\f"
                : next === "v"
                  ? "\v"
                  : next === "\\" || next === '"'
                    ? next
                    : undefined

    bytes.push((escaped ?? next).charCodeAt(0))
    i++
  }

  return Buffer.from(bytes).toString()
}

function isRecord(value: unknown): value is Record<string, any> {
  return !!value && typeof value === "object" && !Array.isArray(value)
}

function stringValue(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined
}

function numberValue(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) return parsed
  }
  return undefined
}

function patchStats(patch: string) {
  let additions = 0
  let deletions = 0
  for (const line of patch.split(/\r?\n/)) {
    if (line.startsWith("+++") || line.startsWith("---")) continue
    if (line.startsWith("+")) additions++
    if (line.startsWith("-")) deletions++
  }
  return { additions, deletions }
}

function diffFileFromRecord(record: Record<string, any>) {
  return (
    stringValue(record.file) ??
    stringValue(record.relativePath) ??
    stringValue(record.filePath) ??
    stringValue(record.filepath) ??
    stringValue(record.path) ??
    stringValue(record.filename)
  )
}

function normalizeDiffStatus(value: unknown): Snapshot.FileDiff["status"] {
  const raw = stringValue(value)?.toLowerCase()
  if (raw === "add" || raw === "added" || raw === "create" || raw === "created") return "added"
  if (raw === "delete" || raw === "deleted" || raw === "remove" || raw === "removed") return "deleted"
  return "modified"
}

function diffFromValue(value: unknown): Snapshot.FileDiff | undefined {
  if (!isRecord(value)) return
  const file = diffFileFromRecord(value)
  if (!file) return
  const patch = stringValue(value.patch) ?? stringValue(value.diff) ?? ""
  const stats = patchStats(patch)
  return {
    file,
    patch,
    additions: numberValue(value.additions) ?? stats.additions,
    deletions: numberValue(value.deletions) ?? stats.deletions,
    status: normalizeDiffStatus(value.status ?? value.type),
  }
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

function fileFromPatchSection(section: string, fallbackFile?: string) {
  const indexFile = section.match(/^Index:\s+(.+)$/m)?.[1]?.trim()
  if (indexFile) return indexFile
  const nextFile = section.match(/^\+\+\+\s+(.+)$/m)?.[1]?.trim()
  if (nextFile && nextFile !== "/dev/null") return nextFile.replace(/^[ab]\//, "")
  const previousFile = section.match(/^---\s+(.+)$/m)?.[1]?.trim()
  if (previousFile && previousFile !== "/dev/null") return previousFile.replace(/^[ab]\//, "")
  return fallbackFile
}

function diffsFromPatch(patch: string, metadata: Record<string, any>, fallbackFile?: string) {
  const sections = splitPatchSections(patch)
  const targets = sections.length ? sections : [patch]
  return targets.flatMap((section): Snapshot.FileDiff[] => {
    const file = fileFromPatchSection(section, fallbackFile)
    if (!file) return []
    const stats = patchStats(section)
    return [
      {
        file,
        patch: section,
        additions: numberValue(metadata.additions) ?? stats.additions,
        deletions: numberValue(metadata.deletions) ?? stats.deletions,
        status: normalizeDiffStatus(metadata.status ?? metadata.type),
      },
    ]
  })
}

function diffsFromMetadata(metadata: unknown) {
  if (!isRecord(metadata)) return []
  const result: Snapshot.FileDiff[] = []
  const filediff = diffFromValue(metadata.filediff ?? metadata.fileDiff)
  if (filediff) result.push(filediff)
  for (const key of ["files", "diffs", "filediffs", "fileDiffs"]) {
    const value = metadata[key]
    if (!Array.isArray(value)) continue
    for (const item of value) {
      const diff = diffFromValue(item)
      if (diff) result.push(diff)
    }
  }
  const patch = stringValue(metadata.patch) ?? stringValue(metadata.diff)
  if (patch && !result.some((item) => item.patch.trim())) {
    result.push(...diffsFromPatch(patch, metadata, diffFileFromRecord(metadata)))
  }
  return result
}

function mergeDiffsByFile(diffs: Snapshot.FileDiff[]) {
  const merged = new Map<string, Snapshot.FileDiff>()
  for (const diff of diffs) {
    const key = diff.file.replace(/\\/g, "/").toLowerCase()
    const previous = merged.get(key)
    if (!previous) {
      merged.set(key, diff)
      continue
    }
    if (previous.patch === diff.patch) continue
    merged.set(key, {
      ...previous,
      patch: [previous.patch, diff.patch].filter((patch) => patch.trim()).join("\n"),
      additions: previous.additions + diff.additions,
      deletions: previous.deletions + diff.deletions,
      status: previous.status === diff.status ? previous.status : "modified",
    })
  }
  return [...merged.values()]
}

function diffsFromToolMetadata(messages: MessageV2.WithParts[]) {
  const diffs: Snapshot.FileDiff[] = []
  for (const message of messages) {
    for (const part of message.parts) {
      if (part.type !== "tool") continue
      diffs.push(...diffsFromMetadata(part.metadata))
      if ("metadata" in part.state) diffs.push(...diffsFromMetadata(part.state.metadata))
    }
  }
  return mergeDiffsByFile(diffs)
}

function normalizeDiffs(diffs: Snapshot.FileDiff[]) {
  return diffs.map((item) => {
    const file = unquoteGitPath(item.file)
    return file === item.file ? item : { ...item, file }
  })
}

export interface Interface {
  readonly summarize: (input: { sessionID: SessionID; messageID: MessageID }) => Effect.Effect<void>
  readonly diff: (input: { sessionID: SessionID; messageID?: MessageID }) => Effect.Effect<Snapshot.FileDiff[]>
  readonly computeDiff: (input: { messages: MessageV2.WithParts[] }) => Effect.Effect<Snapshot.FileDiff[]>
}

export class Service extends Context.Service<Service, Interface>()("@opencode/SessionSummary") {}

export const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const sessions = yield* Session.Service
    const snapshot = yield* Snapshot.Service
    const storage = yield* Storage.Service
    const bus = yield* Bus.Service

    const computeDiff = Effect.fn("SessionSummary.computeDiff")(function* (input: { messages: MessageV2.WithParts[] }) {
      let from: string | undefined
      let to: string | undefined
      for (const item of input.messages) {
        if (!from) {
          for (const part of item.parts) {
            if (part.type === "step-start" && part.snapshot) {
              from = part.snapshot
              break
            }
          }
        }
        for (const part of item.parts) {
          if (part.type === "step-finish" && part.snapshot) to = part.snapshot
        }
      }
      if (from && to) {
        const diffs = yield* snapshot.diffFull(from, to)
        if (diffs.length) return diffs
      }
      return diffsFromToolMetadata(input.messages)
    })

    const summarize = Effect.fn("SessionSummary.summarize")(function* (input: {
      sessionID: SessionID
      messageID: MessageID
    }) {
      const all = yield* sessions.messages({ sessionID: input.sessionID })
      if (!all.length) return

      const diffs = yield* computeDiff({ messages: all })
      yield* sessions.setSummary({
        sessionID: input.sessionID,
        summary: {
          additions: diffs.reduce((sum, x) => sum + x.additions, 0),
          deletions: diffs.reduce((sum, x) => sum + x.deletions, 0),
          files: diffs.length,
        },
      })
      yield* storage.write(["session_diff", input.sessionID], diffs).pipe(Effect.ignore)
      yield* bus.publish(Session.Event.Diff, { sessionID: input.sessionID, diff: diffs })

      const messages = all.filter(
        (m) => m.info.id === input.messageID || (m.info.role === "assistant" && m.info.parentID === input.messageID),
      )
      const target = messages.find((m) => m.info.id === input.messageID)
      if (!target || target.info.role !== "user") return
      const msgDiffs = yield* computeDiff({ messages })
      target.info.summary = { ...target.info.summary, diffs: msgDiffs }
      yield* sessions.updateMessage(target.info)
    })

    const diff = Effect.fn("SessionSummary.diff")(function* (input: { sessionID: SessionID; messageID?: MessageID }) {
      if (input.messageID) {
        const all = yield* sessions.messages({ sessionID: input.sessionID })
        const target = all.find((message) => message.info.id === input.messageID)
        if (target?.info.role === "user") {
          const diffs = target.info.summary?.diffs ?? []
          if (diffs.length) return normalizeDiffs(diffs)
          const messages = all.filter(
            (m) => m.info.id === input.messageID || (m.info.role === "assistant" && m.info.parentID === input.messageID),
          )
          const metadataDiffs = diffsFromToolMetadata(messages)
          if (metadataDiffs.length) return normalizeDiffs(metadataDiffs)
        }
      }

      const diffs = yield* storage
        .read<Snapshot.FileDiff[]>(["session_diff", input.sessionID])
        .pipe(Effect.catch(() => Effect.succeed([] as Snapshot.FileDiff[])))
      const next = normalizeDiffs(diffs)
      const changed = next.some((item, i) => item.file !== diffs[i]?.file)
      if (changed) yield* storage.write(["session_diff", input.sessionID], next).pipe(Effect.ignore)
      if (next.length) return next

      const all = yield* sessions.messages({ sessionID: input.sessionID })
      const metadataDiffs = diffsFromToolMetadata(all)
      if (metadataDiffs.length) {
        const normalized = normalizeDiffs(metadataDiffs)
        yield* storage.write(["session_diff", input.sessionID], normalized).pipe(Effect.ignore)
        return normalized
      }
      return next
    })

    return Service.of({ summarize, diff, computeDiff })
  }),
)

export const defaultLayer = Layer.suspend(() =>
  layer.pipe(
    Layer.provide(Session.defaultLayer),
    Layer.provide(Snapshot.defaultLayer),
    Layer.provide(Storage.defaultLayer),
    Layer.provide(Bus.layer),
  ),
)

export const DiffInput = Schema.Struct({
  sessionID: SessionID,
  messageID: Schema.optional(MessageID),
}).pipe(withStatics((s) => ({ zod: zod(s) })))
export type DiffInput = Schema.Schema.Type<typeof DiffInput>

export * as SessionSummary from "./summary"
