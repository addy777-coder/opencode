export function normalizePathForKey(path: string) {
  return path.trim().replace(/\\/g, "/").replace(/\/+/g, "/")
}

export function pathKey(path: string) {
  const normalized = normalizePathForKey(path)
  return isWindowsPath(normalized) ? normalized.toLowerCase() : normalized
}

export function resolveWorkspacePath(input: string, workspaceDirectory?: string | null) {
  const path = input.trim()
  if (!workspaceDirectory || isAbsolutePath(path)) return path
  return `${workspaceDirectory.replace(/[\\/]+$/, "")}/${path.replace(/^[\\/]+/, "")}`
}

export function relativeWorkspacePath(input: string, workspaceDirectory?: string | null) {
  if (!workspaceDirectory) return normalizePathForKey(input)
  const normalizedInput = normalizePathForKey(input)
  const normalizedWorkspace = normalizePathForKey(workspaceDirectory).replace(/\/+$/, "")
  const inputKey = pathKey(normalizedInput)
  const workspaceKey = pathKey(normalizedWorkspace)
  if (inputKey === workspaceKey) return ""
  if (!inputKey.startsWith(`${workspaceKey}/`)) return normalizedInput
  return normalizedInput.slice(normalizedWorkspace.length + 1)
}

export function isPathInsideWorkspace(input: string, workspaceDirectory?: string | null) {
  if (!workspaceDirectory) return false
  const relative = relativeWorkspacePath(input, workspaceDirectory)
  return relative !== normalizePathForKey(input) && !relative.startsWith("../") && relative !== ".."
}

function isAbsolutePath(path: string) {
  return path.startsWith("/") || path.startsWith("\\") || isWindowsPath(path)
}

function isWindowsPath(path: string) {
  return /^[A-Za-z]:[\\/]/.test(path)
}
