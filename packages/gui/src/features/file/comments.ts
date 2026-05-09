export type ReviewComment = {
  file: string
  line?: number | null
  body: string
  side?: "old" | "new" | "context"
}

export function buildReviewCommentPrompt(comments: ReviewComment[]) {
  const normalized = comments
    .map((comment) => ({
      ...comment,
      body: comment.body.trim(),
      file: comment.file.trim(),
    }))
    .filter((comment) => comment.file && comment.body)

  if (!normalized.length) return ""

  return [
    "请根据这些 review 评论修改代码：",
    "",
    ...normalized.flatMap((comment, index) => [
      `${index + 1}. ${comment.file}${comment.line ? `:${comment.line}` : ""}`,
      `   ${comment.body}`,
    ]),
  ].join("\n")
}

export function commentAnchorKey(comment: Pick<ReviewComment, "file" | "line" | "side">) {
  return [comment.file.replace(/\\/g, "/"), comment.line ?? 0, comment.side ?? "new"].join(":")
}
