export type PromptSubmissionAttachment = {
  id: string
  name: string
  mime: string
  url: string
  size: number
}

export type PreparedPromptSubmission = {
  text: string
  attachments: PromptSubmissionAttachment[]
  convertedLongInput: boolean
}

export const LONG_INPUT_ATTACHMENT_THRESHOLD = 12_000

const LONG_INPUT_FILENAME_PREFIX = "long-input"
const LONG_INPUT_INLINE_PROMPT =
  "较长输入已整理到附件 {filename}。请读取附件内容，并按附件中的完整要求执行。"

function textByteSize(text: string) {
  return new TextEncoder().encode(text).byteLength
}

function bytesToBase64(bytes: Uint8Array) {
  let binary = ""
  const chunkSize = 0x8000
  for (let index = 0; index < bytes.length; index += chunkSize) {
    const chunk = bytes.subarray(index, index + chunkSize)
    binary += String.fromCharCode(...chunk)
  }
  return btoa(binary)
}

function textToDataUrl(text: string) {
  const encoded = new TextEncoder().encode(text)
  return `data:text/plain;base64,${bytesToBase64(encoded)}`
}

function longInputFilename(now: number) {
  const stamp = new Date(now).toISOString().replace(/[:.]/g, "-")
  return `${LONG_INPUT_FILENAME_PREFIX}-${stamp}.txt`
}

export function preparePromptSubmission({
  text,
  attachments,
  maxAttachments,
  maxAttachmentBytes,
  threshold = LONG_INPUT_ATTACHMENT_THRESHOLD,
  now = Date.now(),
}: {
  text: string
  attachments: PromptSubmissionAttachment[]
  maxAttachments: number
  maxAttachmentBytes: number
  threshold?: number
  now?: number
}): PreparedPromptSubmission {
  const trimmed = text.trim()
  if (trimmed.length <= threshold) {
    return {
      text: trimmed,
      attachments,
      convertedLongInput: false,
    }
  }

  if (attachments.length >= maxAttachments) {
    throw new Error(`输入超过 ${threshold.toLocaleString()} 字符，需要转为 txt 附件，但附件数量已达上限。`)
  }

  const size = textByteSize(trimmed)
  if (size > maxAttachmentBytes) {
    throw new Error("输入内容过长，转为 txt 后仍超过附件大小限制。")
  }

  const name = longInputFilename(now)
  const attachment: PromptSubmissionAttachment = {
    id: `${LONG_INPUT_FILENAME_PREFIX}-${now}-${size}`,
    name,
    mime: "text/plain",
    url: textToDataUrl(trimmed),
    size,
  }

  return {
    text: LONG_INPUT_INLINE_PROMPT.replace("{filename}", name),
    attachments: [...attachments, attachment],
    convertedLongInput: true,
  }
}
