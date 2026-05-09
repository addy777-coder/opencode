import { useEffect, useRef, useState } from "react"
import DOMPurify from "dompurify"
import { marked } from "marked"
import markedShiki from "marked-shiki"
import { codeToHtml } from "shiki"

/**
 * Async markdown renderer for assistant messages.
 *
 * - GFM via marked
 * - Syntax highlighting via shiki (dual github-light / github-dark themes,
 *   active theme picked by the [data-theme] attribute on a parent — see
 *   globals.css `.md-prose .shiki ...` rules)
 * - Output sanitised by DOMPurify before injection
 * - Code blocks get a small toolbar with a copy button after mount
 *
 * The component re-parses on every text change which is intentional: assistant
 * messages stream in, so we want each new token to flow through. Stale parses
 * are discarded via a `cancelled` flag.
 */

const renderer = marked.use(
  {
    gfm: true,
    breaks: false,
    renderer: {
      link({ href, title, text }) {
        const safeHref = href ?? ""
        const titleAttr = title ? ` title="${escapeAttr(title)}"` : ""
        return `<a href="${escapeAttr(safeHref)}"${titleAttr} target="_blank" rel="noopener noreferrer">${text}</a>`
      },
    },
  },
  markedShiki({
    async highlight(code, lang) {
      return codeToHtml(code, {
        lang: lang || "text",
        themes: {
          light: "github-light",
          dark: "github-dark-default",
        },
        defaultColor: "light",
      })
    },
  }),
)

function escapeAttr(value: string) {
  return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
}

async function renderMarkdown(text: string): Promise<string> {
  const html = await renderer.parse(text, { async: true })
  return DOMPurify.sanitize(html, {
    ADD_ATTR: ["target", "rel"],
    ADD_TAGS: ["figure", "figcaption"],
  })
}

const COPY_LABEL = "复制"
const COPIED_LABEL = "已复制"

export type LocalFileLinkPosition = {
  x: number
  y: number
}

const LOCAL_FILE_EXTENSIONS = new Set([
  "c",
  "cpp",
  "cs",
  "css",
  "csv",
  "go",
  "h",
  "hpp",
  "html",
  "java",
  "js",
  "json",
  "jsonl",
  "jsx",
  "kt",
  "log",
  "markdown",
  "md",
  "pdf",
  "php",
  "py",
  "rb",
  "rs",
  "sh",
  "sql",
  "toml",
  "ts",
  "tsx",
  "txt",
  "xml",
  "yaml",
  "yml",
])

function trimPathCandidate(value: string) {
  return value
    .trim()
    .replace(/^file:\/\//i, "")
    .replace(/^["'`]+|["'`]+$/g, "")
    .replace(/[.,;:，。；：]+$/g, "")
}

function isAbsolutePath(value: string) {
  return /^[a-zA-Z]:[\\/]/.test(value) || /^\\\\/.test(value) || value.startsWith("/")
}

function isLocalFileCandidate(value: string) {
  const candidate = trimPathCandidate(value)
  if (!candidate || candidate.length > 500) return false
  if (/^(https?:|mailto:|data:|blob:|#)/i.test(candidate)) return false
  if (/[\n\r<>|*?]/.test(candidate)) return false
  if (candidate.startsWith("-")) return false

  const clean = candidate.split(/[?#]/)[0] ?? candidate
  const filename = clean.split(/[\\/]/).filter(Boolean).at(-1) ?? clean
  const ext = filename.includes(".") ? filename.split(".").pop()?.toLowerCase() : null
  if (!ext || !LOCAL_FILE_EXTENSIONS.has(ext)) return false

  return isAbsolutePath(clean) || clean.includes("/") || clean.includes("\\") || filename === clean
}

function resolveLocalPath(value: string, workspaceDirectory?: string | null) {
  let candidate = trimPathCandidate(value)
  try {
    candidate = decodeURIComponent(candidate)
  } catch {
    // Keep the raw path when it contains a literal `%`.
  }
  candidate = candidate.replace(/^\/([a-zA-Z]:[\\/])/, "$1")
  const pathOnly = candidate.split(/[?#]/)[0] ?? candidate
  if (!isLocalFileCandidate(pathOnly)) return null
  if (isAbsolutePath(pathOnly)) return pathOnly
  if (!workspaceDirectory) return null
  const separator = workspaceDirectory.includes("\\") ? "\\" : "/"
  const root = workspaceDirectory.replace(/[\\/]+$/, "")
  const relative = pathOnly.replace(/^\.?[\\/]+/, "").replace(/[\\/]+/g, separator)
  return `${root}${separator}${relative}`
}

function makeLocalFileLink(code: HTMLElement, localPath: string) {
  const link = document.createElement("a")
  link.href = "#"
  link.className = "md-local-file-link"
  link.dataset.localPath = localPath
  link.title = `打开 ${localPath}`
  link.appendChild(code.cloneNode(true))
  code.replaceWith(link)
}

export function MessageMarkdown({
  text,
  className,
  workspaceDirectory,
  onLocalFileOpen,
  onLocalFileContextMenu,
  onUrlOpen,
}: {
  text: string
  className?: string
  workspaceDirectory?: string | null
  onLocalFileOpen?: (path: string) => void
  onLocalFileContextMenu?: (path: string, position: LocalFileLinkPosition) => void
  onUrlOpen?: (url: string) => void
}) {
  const [html, setHtml] = useState("")
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let cancelled = false
    renderMarkdown(text)
      .then((next) => {
        if (!cancelled) setHtml(next)
      })
      .catch((error) => {
        if (cancelled) return
        console.error("markdown render failed", error)
        setHtml(escapeAttr(text).replace(/\n/g, "<br/>"))
      })
    return () => {
      cancelled = true
    }
  }, [text])

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const removers: Array<() => void> = []
    const blocks = container.querySelectorAll<HTMLPreElement>("pre")
    blocks.forEach((pre) => {
      if (pre.dataset.mdEnhanced === "1") return
      pre.dataset.mdEnhanced = "1"
      pre.classList.add("md-code-block")

      const codeEl = pre.querySelector("code")
      const langMatch = codeEl?.className.match(/language-(\S+)/)
      const lang = langMatch?.[1] ?? ""

      const toolbar = document.createElement("div")
      toolbar.className = "md-code-toolbar"
      toolbar.contentEditable = "false"

      const langLabel = document.createElement("span")
      langLabel.className = "md-code-lang"
      langLabel.textContent = lang || "text"
      toolbar.appendChild(langLabel)

      const copyBtn = document.createElement("button")
      copyBtn.type = "button"
      copyBtn.className = "md-code-copy"
      copyBtn.textContent = COPY_LABEL
      toolbar.appendChild(copyBtn)

      pre.insertBefore(toolbar, pre.firstChild)

      let resetTimer: number | null = null
      const onClick = async () => {
        const code = codeEl?.textContent ?? ""
        try {
          await navigator.clipboard.writeText(code)
          copyBtn.textContent = COPIED_LABEL
          copyBtn.dataset.copied = "1"
        } catch {
          copyBtn.textContent = "复制失败"
        }
        if (resetTimer) window.clearTimeout(resetTimer)
        resetTimer = window.setTimeout(() => {
          copyBtn.textContent = COPY_LABEL
          delete copyBtn.dataset.copied
          resetTimer = null
        }, 1600)
      }
      copyBtn.addEventListener("click", onClick)
      removers.push(() => {
        copyBtn.removeEventListener("click", onClick)
        if (resetTimer) window.clearTimeout(resetTimer)
      })
    })

    const localFileLinks = container.querySelectorAll<HTMLAnchorElement>("a[href]")
    localFileLinks.forEach((link) => {
      const href = link.getAttribute("href") ?? ""
      const localPath = resolveLocalPath(href, workspaceDirectory)
      if (!localPath) {
        if (onUrlOpen && /^https?:\/\//i.test(href)) {
          link.dataset.webUrl = href
          link.classList.add("md-browser-link")
          link.removeAttribute("target")
          link.removeAttribute("rel")
        }
        return
      }
      link.dataset.localPath = localPath
      link.classList.add("md-local-file-link")
      link.removeAttribute("target")
      link.removeAttribute("rel")
      link.title = `打开 ${localPath}`
    })

    const inlineCodes = container.querySelectorAll<HTMLElement>("code")
    inlineCodes.forEach((code) => {
      if (code.closest("pre") || code.closest("a.md-local-file-link")) return
      const localPath = resolveLocalPath(code.textContent ?? "", workspaceDirectory)
      if (!localPath) return
      makeLocalFileLink(code, localPath)
    })

    const onLocalFileClick = (event: MouseEvent) => {
      const target = event.target instanceof Element ? event.target.closest<HTMLElement>("[data-local-path]") : null
      if (!target || !container.contains(target)) return
      const localPath = target.dataset.localPath
      if (!localPath) return
      event.preventDefault()
      event.stopPropagation()
      onLocalFileOpen?.(localPath)
    }
    container.addEventListener("click", onLocalFileClick)
    removers.push(() => container.removeEventListener("click", onLocalFileClick))

    const onUrlClick = (event: MouseEvent) => {
      const target = event.target instanceof Element ? event.target.closest<HTMLElement>("[data-web-url]") : null
      if (!target || !container.contains(target)) return
      const url = target.dataset.webUrl
      if (!url) return
      event.preventDefault()
      event.stopPropagation()
      onUrlOpen?.(url)
    }
    container.addEventListener("click", onUrlClick)
    removers.push(() => container.removeEventListener("click", onUrlClick))

    const handleLocalFileContextMenu = (event: MouseEvent) => {
      const target = event.target instanceof Element ? event.target.closest<HTMLElement>("[data-local-path]") : null
      if (!target || !container.contains(target)) return
      const localPath = target.dataset.localPath
      if (!localPath) return
      event.preventDefault()
      event.stopPropagation()
      onLocalFileContextMenu?.(localPath, { x: event.clientX, y: event.clientY })
    }
    container.addEventListener("contextmenu", handleLocalFileContextMenu)
    removers.push(() => container.removeEventListener("contextmenu", handleLocalFileContextMenu))

    return () => {
      removers.forEach((cleanup) => cleanup())
    }
  }, [html, onLocalFileContextMenu, onLocalFileOpen, onUrlOpen, workspaceDirectory])

  return (
    <div
      ref={containerRef}
      className={className ? `md-prose ${className}` : "md-prose"}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  )
}
