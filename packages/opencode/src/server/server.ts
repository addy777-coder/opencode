import * as Log from "@opencode-ai/core/util/log"
import { InstallationChannel, InstallationVersion } from "@opencode-ai/core/installation/version"
import { ConfigProvider, Context, Effect, Exit, Layer, Scope } from "effect"
import { HttpRouter, HttpServer } from "effect/unstable/http"
import { OpenApi } from "effect/unstable/httpapi"
import * as HttpApiServer from "#httpapi-server"
import { lazy } from "@/util/lazy"
import { MDNS } from "./mdns"
import { initProjectors } from "./projectors"
import { ExperimentalHttpApiServer } from "./routes/instance/httpapi/server"
import { disposeMiddleware } from "./routes/instance/httpapi/lifecycle"
import { WebSocketTracker } from "./routes/instance/httpapi/websocket-tracker"
import { PublicApi } from "./routes/instance/httpapi/public"
import type { CorsOptions } from "./cors"

// @ts-ignore This global is needed to prevent ai-sdk from logging warnings to stdout https://github.com/vercel/ai/blob/2dc67e0ef538307f21368db32d5a12345d98831b/packages/ai/src/logger/log-warnings.ts#L85
globalThis.AI_SDK_LOG_WARNINGS = false

initProjectors()

const log = Log.create({ service: "server" })

const backendAttributes = {
  "opencode.server.backend": "effect-httpapi",
  "opencode.server.backend.reason": "stable",
  "opencode.installation.channel": InstallationChannel,
  "opencode.installation.version": InstallationVersion,
}

export type Listener = {
  hostname: string
  port: number
  url: URL
  stop: (close?: boolean) => Promise<void>
}

type ServerApp = {
  fetch(request: Request): Response | Promise<Response>
  request(input: string | URL | Request, init?: RequestInit): Response | Promise<Response>
}

type ListenOptions = CorsOptions & {
  port: number
  hostname: string
  mdns?: boolean
  mdnsDomain?: string
}

const DefaultHttpApi = lazy(() => createHttpApi())

export function backend() {
  return { backend: "effect-httpapi" as const, reason: "stable" as const }
}

export const Default = () => DefaultHttpApi()

function createHttpApi(corsOptions?: CorsOptions) {
  log.info("server backend selected", backendAttributes)
  const handler = ExperimentalHttpApiServer.webHandler(corsOptions).handler
  const app: ServerApp = {
    fetch: (request: Request) => handler(request, ExperimentalHttpApiServer.context),
    request(input, init) {
      return app.fetch(input instanceof Request ? input : new Request(new URL(input, "http://localhost"), init))
    },
  }
  return { app }
}

/**
 * Generate the OpenAPI document used by the SDK build from the Effect HttpApi
 * contract.
 */
export async function openapi() {
  return OpenApi.fromApi(PublicApi)
}

export let url: URL

export async function listen(opts: ListenOptions): Promise<Listener> {
  const inner = await listenHttpApi(opts)

  const next = new URL(inner.url)
  url = next

  const mdns =
    opts.mdns && inner.port && opts.hostname !== "127.0.0.1" && opts.hostname !== "localhost" && opts.hostname !== "::1"
  if (mdns) {
    MDNS.publish(inner.port, opts.mdnsDomain)
  } else if (opts.mdns) {
    log.warn("mDNS enabled but hostname is loopback; skipping mDNS publish")
  }

  let closing: Promise<void> | undefined
  let mdnsUnpublished = false
  const unpublish = () => {
    if (!mdns || mdnsUnpublished) return
    mdnsUnpublished = true
    MDNS.unpublish()
  }
  return {
    hostname: inner.hostname,
    port: inner.port,
    url: next,
    stop(close?: boolean) {
      unpublish()
      // Always forward stop(true), even if a graceful stop was requested
      // first, so native listeners can escalate shutdown in-place.
      const next = inner.stop(close)
      closing ??= next
      return close ? next.then(() => closing!) : closing
    },
  }
}

/**
 * Run the Effect HttpApi backend on a native Effect HTTP server. This supports
 * raw websocket upgrades used by PTY connect and workspace-routing proxy
 * bridges.
 */
async function listenHttpApi(opts: ListenOptions): Promise<Listener> {
  log.info("server backend selected", {
    ...backendAttributes,
    "opencode.server.runtime": HttpApiServer.name,
  })

  const buildLayer = (port: number) =>
    HttpRouter.serve(ExperimentalHttpApiServer.createRoutes(opts), {
      middleware: disposeMiddleware,
      disableLogger: true,
      disableListenLog: true,
    }).pipe(
      Layer.provideMerge(WebSocketTracker.layer),
      Layer.provideMerge(HttpApiServer.layer({ port, hostname: opts.hostname })),
      // Install a fresh `ConfigProvider` per listener so `Config.string(...)`
      // reads reflect the current `process.env`. Effect's default
      // `ConfigProvider` snapshots `process.env` on first read and caches the
      // result on a module-singleton Reference; without overriding it here,
      // every later `Server.listen()` keeps observing that initial snapshot.
      Layer.provide(ConfigProvider.layer(ConfigProvider.fromEnv())),
    )

  const start = async (port: number) => {
    const scope = Scope.makeUnsafe()
    try {
      // Effect's `HttpMiddleware` interface returns `Effect<..., any, any>` by
      // design, which leaks `R = any` through `HttpRouter.serve`. The actual
      // requirements at this point are fully satisfied by `createRoutes` and the
      // platform HTTP server layer; cast away the `any` to satisfy `runPromise`.
      const layer = buildLayer(port) as Layer.Layer<
        HttpServer.HttpServer | WebSocketTracker.Service | HttpApiServer.Service,
        unknown,
        never
      >
      const ctx = await Effect.runPromise(Layer.buildWithMemoMap(layer, Layer.makeMemoMapUnsafe(), scope))
      return { scope, ctx }
    } catch (err) {
      await Effect.runPromise(Scope.close(scope, Exit.void)).catch(() => undefined)
      throw err
    }
  }

  // Preserve the historical port-resolution behavior: explicit `0` prefers
  // 4096 first, then any free port.
  let resolved: Awaited<ReturnType<typeof start>> | undefined
  if (opts.port === 0) {
    resolved = await start(4096).catch(() => undefined)
    if (!resolved) resolved = await start(0)
  } else {
    resolved = await start(opts.port)
  }
  if (!resolved) throw new Error(`Failed to start server on port ${opts.port}`)

  const server = Context.get(resolved.ctx, HttpServer.HttpServer)
  if (server.address._tag !== "TcpAddress") {
    await Effect.runPromise(Scope.close(resolved.scope, Exit.void))
    throw new Error(`Unexpected HttpServer address tag: ${server.address._tag}`)
  }
  const port = server.address.port

  const innerUrl = new URL("http://localhost")
  innerUrl.hostname = opts.hostname
  innerUrl.port = String(port)
  let forceStopPromise: Promise<void> | undefined
  let stopPromise: Promise<void> | undefined
  const forceStop = () => {
    forceStopPromise ??= Effect.runPromiseExit(
      Effect.gen(function* () {
        yield* Context.get(resolved!.ctx, HttpApiServer.Service).closeAll
        yield* Context.get(resolved!.ctx, WebSocketTracker.Service).closeAll
      }),
    ).then(() => undefined)
    return forceStopPromise
  }

  return {
    hostname: opts.hostname,
    port,
    url: innerUrl,
    stop: (close?: boolean) => {
      const requested = close ? forceStop() : Promise.resolve()
      // The first call starts scope shutdown. A later stop(true) cannot undo
      // that, but it still runs forceStop() before awaiting the original close.
      stopPromise ??= requested
        .then(() => Effect.runPromiseExit(Scope.close(resolved!.scope, Exit.void)))
        .then(() => undefined)
      return requested.then(() => stopPromise!)
    },
  }
}

export * as Server from "./server"
