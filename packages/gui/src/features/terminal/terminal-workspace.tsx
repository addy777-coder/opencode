import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentType,
  type ReactNode,
  type SVGProps,
} from "react"
import type { FitAddon, Ghostty, Terminal as GhosttyTerminal } from "ghostty-web"
import { Loader2, Plus, RefreshCw, Trash2, X, Zap } from "lucide-react"
import {
  ptyConnectToken,
  ptyCreate,
  ptyList,
  ptyRemove,
  ptyUpdate,
  settingsGet,
  settingsSet,
  type PtyInfo,
  type PtySize,
} from "@/lib/tauri"
import { cn } from "@/lib/utils"
import {
  appendTerminalBuffer,
  migrateTerminalWorkspaceState,
  removeTerminalSession,
  terminalCacheKey,
  upsertTerminalSession,
  type LocalPty,
  type TerminalWorkspaceState,
} from "./terminal-state"
import { parsePtyCursorFrame, terminalWebSocketUrl } from "./terminal-url"

type Props = {
  baseUrl?: string | null
  directory?: string | null
}

type IconComponent = ComponentType<SVGProps<SVGSVGElement>>

const Loader2Icon = Loader2 as IconComponent
const PlusIcon = Plus as IconComponent
const RefreshCwIcon = RefreshCw as IconComponent
const Trash2Icon = Trash2 as IconComponent
const XIcon = X as IconComponent
const ZapIcon = Zap as IconComponent

type ConnectionState = "idle" | "connecting" | "connected" | "reconnecting" | "failed"
type GhosttyModule = typeof import("ghostty-web")

const decoder = new TextDecoder()
let ghosttyShared: Promise<{ mod: GhosttyModule; ghostty: Ghostty }> | undefined

function loadGhostty() {
  if (ghosttyShared) return ghosttyShared
  ghosttyShared = import("ghostty-web")
    .then(async (mod) => ({ mod, ghostty: await mod.Ghostty.load() }))
    .catch((error) => {
      ghosttyShared = undefined
      throw error
    })
  return ghosttyShared
}

export function TerminalWorkspace({ baseUrl, directory }: Props) {
  const cacheKey = useMemo(() => terminalCacheKey(baseUrl, directory), [baseUrl, directory])
  const [state, setState] = useState<TerminalWorkspaceState>({ sessions: [] })
  const [connection, setConnection] = useState<ConnectionState>("idle")
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [size, setSize] = useState<PtySize>({ cols: 100, rows: 24 })
  const socketRef = useRef<WebSocket | null>(null)
  const reconnectRef = useRef<number | undefined>()
  const cursorRef = useRef<Record<string, number>>({})
  const activeCursorRef = useRef<number | undefined>()
  const createdForKeyRef = useRef<string | null>(null)
  const active = state.sessions.find((session) => session.id === state.activeId) ?? state.sessions[0]
  const activeId = active?.id
  const canConnect = Boolean(baseUrl && directory)

  const setActiveId = useCallback((id: string) => {
    setState((current) => ({ ...current, activeId: id }))
  }, [])

  const updateSize = useCallback((next: PtySize) => {
    setSize((current) => (current.cols === next.cols && current.rows === next.rows ? current : next))
  }, [])

  const appendOutput = useCallback((id: string, chunk: string) => {
    setState((current) => {
      const session = current.sessions.find((item) => item.id === id)
      if (!session) return current
      return upsertTerminalSession(current, {
        ...session,
        buffer: appendTerminalBuffer(session.buffer, chunk),
        cursor: cursorRef.current[id],
      })
    })
  }, [])

  useEffect(() => {
    activeCursorRef.current = active?.cursor
  }, [active?.cursor])

  const refresh = useCallback(
    async (createIfEmpty = false) => {
      if (!baseUrl || !directory) return
      setBusy(true)
      setError(null)
      try {
        const sessions = await ptyList({ baseUrl, directory })
        setState((current) => {
          let next = current
          for (const session of sessions) next = upsertTerminalSession(next, toLocalPty(session))
          if (next.activeId && !next.sessions.some((session) => session.id === next.activeId)) {
            next = { ...next, activeId: next.sessions[0]?.id }
          }
          return next
        })
        if (createIfEmpty && sessions.length === 0 && createdForKeyRef.current !== cacheKey) {
          createdForKeyRef.current = cacheKey
          const created = await ptyCreate({ baseUrl, directory, cwd: directory, title: "Terminal 1" })
          setState((current) => ({ ...upsertTerminalSession(current, toLocalPty(created)), activeId: created.id }))
        }
      } catch (err) {
        setError(errorMessage(err) ?? "无法读取终端会话。")
      } finally {
        setBusy(false)
      }
    },
    [baseUrl, cacheKey, directory],
  )

  useEffect(() => {
    let disposed = false
    setState({ sessions: [] })
    cursorRef.current = {}
    void settingsGet<unknown>(cacheKey)
      .then((stored) => {
        if (disposed) return
        const migrated = migrateTerminalWorkspaceState(stored)
        for (const session of migrated.sessions) {
          if (session.cursor !== undefined) cursorRef.current[session.id] = session.cursor
        }
        setState(migrated)
      })
      .finally(() => {
        if (!disposed) void refresh(true)
      })
    return () => {
      disposed = true
    }
  }, [cacheKey, refresh])

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void settingsSet(cacheKey, state)
    }, 250)
    return () => window.clearTimeout(timer)
  }, [cacheKey, state])

  useEffect(() => {
    if (!activeId || !baseUrl || !directory) return
    const timer = window.setTimeout(() => {
      void ptyUpdate({ baseUrl, directory, ptyId: activeId, size }).catch(() => undefined)
    }, 120)
    return () => window.clearTimeout(timer)
  }, [activeId, baseUrl, directory, size])

  useEffect(() => {
    if (!activeId || !baseUrl || !directory) {
      setConnection("idle")
      return
    }

    let disposed = false
    let tries = 0

    const closeSocket = () => {
      if (reconnectRef.current !== undefined) {
        window.clearTimeout(reconnectRef.current)
        reconnectRef.current = undefined
      }
      const socket = socketRef.current
      socketRef.current = null
      if (socket && socket.readyState !== WebSocket.CLOSED && socket.readyState !== WebSocket.CLOSING) {
        socket.close(1000)
      }
    }

    const connect = async () => {
      if (disposed) return
      closeSocket()
      setConnection(tries > 0 ? "reconnecting" : "connecting")
      try {
        const token = await ptyConnectToken({ baseUrl, directory, ptyId: activeId })
        if (disposed) return
        const socket = new WebSocket(
          terminalWebSocketUrl({
            baseUrl,
            ptyId: activeId,
            directory,
            cursor: cursorRef.current[activeId] ?? activeCursorRef.current ?? 0,
            ticket: token.ticket,
          }),
        )
        socket.binaryType = "arraybuffer"
        socketRef.current = socket

        socket.addEventListener("open", () => {
          tries = 0
          setConnection("connected")
          setError(null)
        })
        socket.addEventListener("message", (event) => {
          if (disposed) return
          if (event.data instanceof ArrayBuffer) {
            const cursor = parsePtyCursorFrame(event.data)
            if (cursor !== null) {
              cursorRef.current[activeId] = cursor
              return
            }
            appendOutput(activeId, decoder.decode(event.data))
            return
          }
          if (typeof event.data === "string") {
            cursorRef.current[activeId] = (cursorRef.current[activeId] ?? 0) + event.data.length
            appendOutput(activeId, event.data)
          }
        })
        socket.addEventListener("close", (event) => {
          if (disposed || event.code === 1000) return
          const ms = Math.min(300 * 2 ** Math.min(tries, 4), 4_000)
          tries += 1
          reconnectRef.current = window.setTimeout(connect, ms)
        })
        socket.addEventListener("error", () => {
          if (disposed) return
          setConnection("failed")
          setError("终端连接失败，正在尝试恢复。")
        })
      } catch (err) {
        if (disposed) return
        setConnection("failed")
        setError(errorMessage(err) ?? "终端连接失败。")
      }
    }

    void connect()
    return () => {
      disposed = true
      closeSocket()
    }
  }, [activeId, appendOutput, baseUrl, directory])

  async function createTerminal() {
    if (!baseUrl || !directory || busy) return
    setBusy(true)
    setError(null)
    try {
      const title = `Terminal ${state.sessions.length + 1}`
      const created = await ptyCreate({ baseUrl, directory, cwd: directory, title })
      setState((current) => ({ ...upsertTerminalSession(current, toLocalPty(created)), activeId: created.id }))
    } catch (err) {
      setError(errorMessage(err) ?? "新建终端失败。")
    } finally {
      setBusy(false)
    }
  }

  async function closeTerminal(id: string) {
    if (!baseUrl || !directory) return
    setState((current) => removeTerminalSession(current, id))
    try {
      await ptyRemove({ baseUrl, directory, ptyId: id })
    } catch (err) {
      setError(errorMessage(err) ?? "关闭终端失败。")
      void refresh(false)
    }
  }

  const send = useCallback((data: string) => {
    const socket = socketRef.current
    if (!data || !socket || socket.readyState !== WebSocket.OPEN) return
    socket.send(data)
  }, [])

  return (
    <div className="flex h-full min-h-[480px] flex-col bg-[var(--app-inspector)]">
      <div className="flex h-10 shrink-0 items-center gap-1 border-b border-[var(--app-divider)] px-2">
        <div className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto">
          {state.sessions.map((session) => (
            <button
              key={session.id}
              type="button"
              className={cn(
                "flex h-7 max-w-[180px] shrink-0 items-center gap-2 rounded-md px-2 text-xs font-medium",
                session.id === activeId
                  ? "bg-[var(--app-selected)] text-[var(--app-text)]"
                  : "text-[var(--app-muted)] hover:bg-[var(--app-hover)] hover:text-[var(--app-text)]",
              )}
              title={session.cwd ?? session.title}
              onClick={() => setActiveId(session.id)}
            >
              <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", session.status === "exited" ? "bg-[var(--app-subtle)]" : "bg-[var(--app-success)]")} />
              <span className="truncate">{session.title}</span>
            </button>
          ))}
        </div>
        <TerminalIconButton label="新建终端" disabled={!canConnect || busy} onClick={createTerminal}>
          {busy ? <Loader2Icon className="h-3.5 w-3.5 animate-spin" /> : <PlusIcon className="h-3.5 w-3.5" />}
        </TerminalIconButton>
        <TerminalIconButton label="刷新终端" disabled={!canConnect || busy} onClick={() => void refresh(false)}>
          <RefreshCwIcon className={cn("h-3.5 w-3.5", busy && "animate-spin")} />
        </TerminalIconButton>
        <TerminalIconButton label="关闭当前终端" disabled={!activeId} onClick={() => activeId && void closeTerminal(activeId)}>
          <Trash2Icon className="h-3.5 w-3.5" />
        </TerminalIconButton>
      </div>

      {!canConnect ? (
        <div className="flex min-h-0 flex-1 items-center justify-center px-6 text-center text-sm font-medium leading-6 text-[var(--app-muted)]">
          请先连接 OpenCode server 并选择工作区。
        </div>
      ) : active ? (
        <>
          <div className="flex h-8 shrink-0 items-center gap-2 border-b border-[var(--app-divider)] px-3 text-[11px] font-medium text-[var(--app-subtle)]">
            <span className="truncate">{active.cwd ?? directory}</span>
            <span className="shrink-0">·</span>
            <span className="shrink-0">{connectionLabel(connection)}</span>
            {connection === "connected" ? <ZapIcon className="h-3 w-3 shrink-0 text-[var(--app-success)]" /> : null}
          </div>
          {error ? (
            <div className="flex shrink-0 items-center gap-2 border-b border-[var(--app-divider)] bg-[var(--app-danger-soft)] px-3 py-2 text-xs font-medium text-[var(--app-danger)]">
              <span className="min-w-0 flex-1">{error}</span>
              <button type="button" className="shrink-0" onClick={() => setError(null)}>
                <XIcon className="h-3.5 w-3.5" />
              </button>
            </div>
          ) : null}
          <TerminalSurface
            key={active.id}
            connected={connection === "connected"}
            onData={send}
            onError={setError}
            onSizeChange={updateSize}
            session={active}
          />
        </>
      ) : (
        <div className="flex min-h-0 flex-1 items-center justify-center px-6 text-center">
          <button
            type="button"
            className="inline-flex h-9 items-center gap-2 rounded-md bg-[var(--app-text)] px-3 text-sm font-semibold text-[var(--app-bg)] hover:opacity-90 disabled:opacity-50"
            onClick={createTerminal}
            disabled={busy}
          >
            {busy ? <Loader2Icon className="h-4 w-4 animate-spin" /> : <PlusIcon className="h-4 w-4" />}
            新建终端
          </button>
        </div>
      )}
    </div>
  )
}

function TerminalSurface({
  session,
  connected,
  onData,
  onError,
  onSizeChange,
}: {
  session: LocalPty
  connected: boolean
  onData: (data: string) => void
  onError: (message: string | null) => void
  onSizeChange: (size: PtySize) => void
}) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const terminalRef = useRef<GhosttyTerminal | null>(null)
  const writerRef = useRef<ReturnType<typeof terminalWriter> | null>(null)
  const writtenBufferRef = useRef("")
  const sessionBufferRef = useRef(session.buffer ?? "")
  const onDataRef = useRef(onData)
  const onErrorRef = useRef(onError)
  const onSizeChangeRef = useRef(onSizeChange)

  useEffect(() => {
    onDataRef.current = onData
  }, [onData])

  useEffect(() => {
    onErrorRef.current = onError
  }, [onError])

  useEffect(() => {
    onSizeChangeRef.current = onSizeChange
  }, [onSizeChange])

  useEffect(() => {
    sessionBufferRef.current = session.buffer ?? ""
  }, [session.buffer])

  useEffect(() => {
    let disposed = false
    let fitFrame: number | undefined
    const cleanups: VoidFunction[] = []
    const container = containerRef.current
    if (!container) return

    const cleanup = () => {
      if (fitFrame !== undefined) cancelAnimationFrame(fitFrame)
      for (const fn of cleanups.splice(0).reverse()) {
        try {
          fn()
        } catch {
          // Ignore browser/addon cleanup races while tearing down a terminal tab.
        }
      }
      terminalRef.current = null
      writerRef.current = null
      writtenBufferRef.current = ""
    }

    const run = async () => {
      try {
        const { mod, ghostty } = await loadGhostty()
        if (disposed) return

        const term = new mod.Terminal({
          allowTransparency: false,
          cols: session.cols,
          convertEol: false,
          cursorBlink: true,
          cursorStyle: "bar",
          fontFamily: "Cascadia Mono, JetBrains Mono, Consolas, monospace",
          fontSize: 13,
          ghostty,
          rows: session.rows,
          scrollback: 10_000,
          theme: {
            background: "#0c0c0d",
            cursor: "#f5f5f5",
            foreground: "#f5f5f5",
            selectionBackground: "rgba(245, 245, 245, 0.24)",
          },
        })
        const fit = new mod.FitAddon()
        const writer = terminalWriter((data, done) => term.write(data, done))

        terminalRef.current = term
        writerRef.current = writer
        cleanups.push(() => disposeIfDisposable(fit))
        cleanups.push(() => term.dispose())

        term.loadAddon(fit)
        term.open(container)

        const focus = () => {
          term.focus()
          term.textarea?.focus()
        }
        const scheduleFit = () => {
          if (disposed || fitFrame !== undefined) return
          fitFrame = requestAnimationFrame(() => {
            fitFrame = undefined
            if (disposed) return
            fit.fit()
            onSizeChangeRef.current({ cols: term.cols, rows: term.rows })
          })
        }

        const onDataDisposable = term.onData((data) => onDataRef.current(data))
        const onResizeDisposable = term.onResize((next) => onSizeChangeRef.current({ cols: next.cols, rows: next.rows }))
        cleanups.push(() => disposeIfDisposable(onDataDisposable))
        cleanups.push(() => disposeIfDisposable(onResizeDisposable))

        container.addEventListener("pointerdown", focus)
        cleanups.push(() => container.removeEventListener("pointerdown", focus))

        if (typeof document !== "undefined" && document.fonts) {
          void document.fonts.ready.then(scheduleFit)
        }

        const resizeObserver = new ResizeObserver(scheduleFit)
        resizeObserver.observe(container)
        cleanups.push(() => resizeObserver.disconnect())

        const fitAddon = fit as FitAddon & { observeResize?: () => void }
        fitAddon.observeResize?.()
        scheduleFit()
        requestAnimationFrame(focus)

        const buffer = sessionBufferRef.current
        if (buffer) {
          writtenBufferRef.current = buffer
          writer.push(buffer)
          writer.flush(scheduleFit)
        }
      } catch (error) {
        if (!disposed) onErrorRef.current(errorMessage(error) ?? "终端控件加载失败。")
      }
    }

    void run()

    return () => {
      disposed = true
      cleanup()
    }
  }, [session.id])

  useEffect(() => {
    const writer = writerRef.current
    if (!writer) return
    const previous = writtenBufferRef.current
    const next = session.buffer ?? ""
    if (next === previous) return
    const delta = appendedBufferDelta(previous, next)
    writtenBufferRef.current = next
    if (delta) writer.push(delta)
  }, [session.buffer])

  useEffect(() => {
    if (!connected) return
    const term = terminalRef.current
    if (!term) return
    requestAnimationFrame(() => {
      term.focus()
      term.textarea?.focus()
    })
  }, [connected])

  return (
    <div className="min-h-0 flex-1 overflow-hidden bg-[#0c0c0d]">
      <div ref={containerRef} className="h-full w-full select-text px-3 py-2" data-terminal-id={session.id} />
    </div>
  )
}

function TerminalIconButton({
  label,
  disabled,
  children,
  onClick,
}: {
  label: string
  disabled?: boolean
  children: ReactNode
  onClick: () => void
}) {
  return (
    <button
      type="button"
      className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-[var(--app-muted)] hover:bg-[var(--app-hover)] hover:text-[var(--app-text)] disabled:opacity-45 disabled:hover:bg-transparent"
      title={label}
      disabled={disabled}
      onClick={onClick}
    >
      {children}
    </button>
  )
}

function terminalWriter(write: (data: string, done?: VoidFunction) => void) {
  let chunks: string[] | undefined
  let waits: VoidFunction[] | undefined
  let scheduled = false
  let writing = false

  const settle = () => {
    if (scheduled || writing || chunks?.length) return
    const list = waits
    if (!list?.length) return
    waits = undefined
    for (const fn of list) fn()
  }

  const run = () => {
    if (writing) return
    scheduled = false
    const items = chunks
    if (!items?.length) {
      settle()
      return
    }
    chunks = undefined
    writing = true
    write(items.join(""), () => {
      writing = false
      if (chunks?.length) {
        if (scheduled) return
        scheduled = true
        queueMicrotask(run)
        return
      }
      settle()
    })
  }

  const push = (data: string) => {
    if (!data) return
    if (chunks) chunks.push(data)
    else chunks = [data]

    if (scheduled || writing) return
    scheduled = true
    queueMicrotask(run)
  }

  const flush = (done?: VoidFunction) => {
    if (!scheduled && !writing && !chunks?.length) {
      done?.()
      return
    }
    if (done) {
      if (waits) waits.push(done)
      else waits = [done]
    }
    run()
  }

  return { push, flush }
}

function appendedBufferDelta(previous: string, next: string) {
  if (!next) return ""
  if (!previous) return next
  if (next.startsWith(previous)) return next.slice(previous.length)

  const probeLength = Math.min(4096, next.length)
  const probe = next.slice(0, probeLength)
  const index = previous.lastIndexOf(probe)
  if (index < 0) return next

  let overlap = previous.length - index
  while (overlap < next.length && previous[index + overlap] === next[overlap]) {
    overlap += 1
  }
  return next.slice(overlap)
}

function disposeIfDisposable(value: unknown) {
  const disposable = value as { dispose?: () => void } | null | undefined
  if (typeof disposable?.dispose === "function") disposable.dispose()
}

function toLocalPty(info: PtyInfo): LocalPty {
  return {
    id: info.id,
    title: info.title || `Terminal ${info.id.slice(-4)}`,
    cwd: info.cwd,
    status: info.status,
  }
}

function connectionLabel(value: ConnectionState) {
  if (value === "connecting") return "连接中"
  if (value === "connected") return "已连接"
  if (value === "reconnecting") return "恢复连接"
  if (value === "failed") return "连接异常"
  return "未连接"
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : error ? String(error) : null
}
