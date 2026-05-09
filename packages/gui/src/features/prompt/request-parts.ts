export type PromptRequestAttachment = {
  mime: string
  url: string
  filename?: string | null
}

export type PromptRequestPart =
  | {
      type: "text"
      text: string
    }
  | {
      type: "file"
      mime: string
      url: string
      filename?: string
    }

export function buildPromptRequestParts(text: string, attachments: PromptRequestAttachment[] = []): PromptRequestPart[] {
  const parts: PromptRequestPart[] = []
  const trimmed = text.trim()
  if (trimmed) {
    parts.push({ type: "text", text: trimmed })
  }

  for (const attachment of attachments) {
    const mime = attachment.mime.trim()
    const url = attachment.url.trim()
    if (!mime || !url) continue

    const part: PromptRequestPart = {
      type: "file",
      mime,
      url,
    }
    const filename = attachment.filename?.trim()
    if (filename) part.filename = filename
    parts.push(part)
  }

  return parts
}
