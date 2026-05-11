import * as InstanceState from "@/effect/instance-state"
import { File } from "@/file"
import { Ripgrep } from "@/file/ripgrep"
import { Git } from "@/git"
import { Vcs } from "@/project/vcs"
import { Effect } from "effect"
import { HttpApiBuilder } from "effect/unstable/httpapi"
import { InstanceHttpApi } from "../api"
import { FileDiffPayload } from "../groups/file"

function normalizeRequestedFile(file: string, directory: string) {
  const normalized = file.replace(/\\/g, "/").replace(/^\.\/+/, "")
  const root = directory.replace(/\\/g, "/").replace(/\/+$/, "")
  const lower = normalized.toLowerCase()
  const lowerRoot = root.toLowerCase()
  if (lower === lowerRoot) return ""
  if (lower.startsWith(`${lowerRoot}/`)) return normalized.slice(root.length + 1)
  return normalized
}

function parseAheadBehind(value: string) {
  const [behindText, aheadText] = value.trim().split(/\s+/, 2)
  const behind = Number.parseInt(behindText ?? "", 10)
  const ahead = Number.parseInt(aheadText ?? "", 10)
  return {
    ahead: Number.isFinite(ahead) ? ahead : 0,
    behind: Number.isFinite(behind) ? behind : 0,
  }
}

export const fileHandlers = HttpApiBuilder.group(InstanceHttpApi, "file", (handlers) =>
  Effect.gen(function* () {
    const svc = yield* File.Service
    const ripgrep = yield* Ripgrep.Service
    const git = yield* Git.Service
    const vcs = yield* Vcs.Service

    const findText = Effect.fn("FileHttpApi.findText")(function* (ctx: { query: { pattern: string } }) {
      return (yield* ripgrep
        .search({ cwd: (yield* InstanceState.context).directory, pattern: ctx.query.pattern, limit: 10 })
        .pipe(Effect.orDie)).items
    })

    const findFile = Effect.fn("FileHttpApi.findFile")(function* (ctx: {
      query: { query: string; dirs?: "true" | "false"; type?: "file" | "directory"; limit?: number }
    }) {
      return yield* svc.search({
        query: ctx.query.query,
        limit: ctx.query.limit ?? 10,
        dirs: ctx.query.dirs !== "false",
        type: ctx.query.type,
      })
    })

    const findSymbol = Effect.fn("FileHttpApi.findSymbol")(function* () {
      return []
    })

    const list = Effect.fn("FileHttpApi.list")(function* (ctx: { query: { path: string } }) {
      return yield* svc.list(ctx.query.path)
    })

    const content = Effect.fn("FileHttpApi.content")(function* (ctx: { query: { path: string } }) {
      return yield* svc.read(ctx.query.path)
    })

    const status = Effect.fn("FileHttpApi.status")(function* () {
      return yield* svc.status()
    })

    const gitStatus = Effect.fn("FileHttpApi.gitStatus")(function* () {
      const ctx = yield* InstanceState.context
      if (ctx.project.vcs !== "git") return null

      const root = yield* git.run(["rev-parse", "--show-toplevel"], { cwd: ctx.directory })
      if (root.exitCode !== 0) return null

      const branch = yield* git.branch(ctx.directory)
      const head = branch ? undefined : yield* git.run(["rev-parse", "--short", "HEAD"], { cwd: ctx.directory })
      const detached = !branch && head?.exitCode === 0
      const upstream = yield* git.run(["rev-list", "--left-right", "--count", "@{u}...HEAD"], { cwd: ctx.directory })
      const { ahead, behind } = upstream.exitCode === 0 ? parseAheadBehind(upstream.text()) : { ahead: 0, behind: 0 }

      return {
        rootPath: root.text().trim(),
        branch: branch ?? (detached ? head?.text().trim() || null : null),
        detached,
        dirty: (yield* git.status(ctx.directory)).length > 0,
        ahead,
        behind,
      }
    })

    const diff = Effect.fn("FileHttpApi.diff")(function* (ctx: { payload: typeof FileDiffPayload.Type }) {
      const state = yield* InstanceState.context
      const diffs = yield* vcs.diff("git")
      const requested = (ctx.payload.files ?? [])
        .map((file) => normalizeRequestedFile(file, state.directory))
        .filter(Boolean)

      if (!requested.length) return diffs

      const requestedSet = new Set(requested.map((file) => file.toLowerCase()))
      return diffs.filter((item) => requestedSet.has(normalizeRequestedFile(item.file, state.directory).toLowerCase()))
    })

    return handlers
      .handle("findText", findText)
      .handle("findFile", findFile)
      .handle("findSymbol", findSymbol)
      .handle("list", list)
      .handle("content", content)
      .handle("status", status)
      .handle("gitStatus", gitStatus)
      .handle("diff", diff)
  }),
)
