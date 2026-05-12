import type { OpenCodeMessage, SessionDiffFile } from "@/lib/tauri"

type DiffSummaryIntentMessage = Pick<OpenCodeMessage, "role" | "text" | "parts">

const WORKSPACE_DIFF_INTENT_PATTERNS = [
  /(?:^|[\s/])review\b/i,
  /\b(?:git\s+)?diff\b/i,
  /\bpatch(?:es)?\b/i,
  /(?:代码|code)?\s*(?:审查|审核|review)/i,
  /(?:审查|审核|检视|检查|查看|展示|显示|打开|生成).{0,12}(?:改动|变更|diff|patch|代码差异|文件差异)/i,
  /(?:改动|变更|diff|patch|代码差异|文件差异).{0,12}(?:审查|审核|检视|检查|查看|展示|显示|打开|生成)/i,
  /(?:当前|这次|本次|工作区|未提交|git).{0,12}(?:改动|变更)/i,
  /(?:changes?|diffs?|patches?).{0,12}(?:review|inspect|show|open|view|list)/i,
  /(?:review|inspect|show|open|view|list).{0,12}(?:changes?|diffs?|patches?)/i,
]

function messageIntentText(message: DiffSummaryIntentMessage) {
  const partText = message.parts
    .map((part) => part.text?.trim())
    .filter((text): text is string => Boolean(text))
    .join("\n")
  return [message.text.trim(), partText].filter(Boolean).join("\n")
}

export function asksForWorkspaceDiffSummary(text: string) {
  const normalized = text.trim()
  if (!normalized) return false
  return WORKSPACE_DIFF_INTENT_PATTERNS.some((pattern) => pattern.test(normalized))
}

export function shouldShowStandaloneThreadDiffSummary(
  messages: DiffSummaryIntentMessage[],
  diffs: Pick<SessionDiffFile, "file">[],
) {
  if (!diffs.length) return false
  const latestUserMessage = [...messages].reverse().find((message) => message.role === "user")
  if (!latestUserMessage) return false
  return asksForWorkspaceDiffSummary(messageIntentText(latestUserMessage))
}
