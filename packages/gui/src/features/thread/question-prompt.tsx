import { useEffect, useMemo, useState } from "react"
import { Loader2, X } from "lucide-react"
import { cn } from "@/lib/utils"
import type { QuestionInfo, QuestionPrompt as QuestionPromptInfo } from "@/lib/tauri"

const Loader2Icon = Loader2 as unknown as React.ComponentType<React.SVGProps<SVGSVGElement>>
const XIcon = X as unknown as React.ComponentType<React.SVGProps<SVGSVGElement>>

type Selection = { labels: Set<string>; custom: string }

function isCustomAllowed(question: QuestionPromptInfo) {
  return question.custom !== false
}

function isMultiSelect(question: QuestionPromptInfo) {
  return question.multiple === true
}

function isReady(question: QuestionPromptInfo, selection: Selection) {
  if (selection.labels.size > 0) return true
  if (isCustomAllowed(question) && selection.custom.trim().length > 0) return true
  return false
}

function buildAnswer(question: QuestionPromptInfo, selection: Selection): string[] {
  const answers: string[] = []
  for (const option of question.options) {
    if (selection.labels.has(option.label)) answers.push(option.label)
  }
  const custom = selection.custom.trim()
  if (custom) answers.push(custom)
  return answers
}

export function QuestionPrompt({
  info,
  count = 1,
  onReply,
  onReject,
}: {
  info: QuestionInfo
  count?: number
  onReply: (question: QuestionInfo, answers: string[][]) => Promise<unknown>
  onReject: (question: QuestionInfo) => Promise<unknown>
}) {
  const [selections, setSelections] = useState<Selection[]>(() =>
    info.questions.map(() => ({ labels: new Set<string>(), custom: "" })),
  )
  const [pending, setPending] = useState<"reply" | "reject" | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Reset local state when this prompt's identity changes.
  useEffect(() => {
    setSelections(info.questions.map(() => ({ labels: new Set<string>(), custom: "" })))
    setPending(null)
    setError(null)
  }, [info.id, info.questions])

  const allReady = useMemo(
    () => info.questions.every((question, index) => isReady(question, selections[index])),
    [info.questions, selections],
  )

  function toggleOption(index: number, label: string) {
    setSelections((current) => {
      const next = current.map((selection, i) => {
        if (i !== index) return selection
        const labels = new Set(selection.labels)
        if (isMultiSelect(info.questions[index])) {
          if (labels.has(label)) labels.delete(label)
          else labels.add(label)
        } else {
          if (labels.has(label)) labels.delete(label)
          else {
            labels.clear()
            labels.add(label)
          }
        }
        return { ...selection, labels }
      })
      return next
    })
  }

  function setCustom(index: number, value: string) {
    setSelections((current) =>
      current.map((selection, i) => (i === index ? { ...selection, custom: value } : selection)),
    )
  }

  async function submit() {
    if (!allReady || pending) return
    setPending("reply")
    setError(null)
    const answers = info.questions.map((question, index) => buildAnswer(question, selections[index]))
    try {
      await onReply(info, answers)
    } catch (err) {
      setError(err instanceof Error ? err.message : "提交失败")
      setPending(null)
    }
    // No need to reset on success: the parent will remove this prompt.
  }

  async function reject() {
    if (pending) return
    setPending("reject")
    setError(null)
    try {
      await onReject(info)
    } catch (err) {
      setError(err instanceof Error ? err.message : "跳过失败")
      setPending(null)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 px-4 py-6 backdrop-blur-[2px]">
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="question-prompt-title"
        className="flex max-h-full w-full max-w-[720px] flex-col overflow-hidden rounded-2xl border border-[var(--app-border)] bg-[var(--app-panel)] shadow-2xl shadow-black/45"
      >
        <header className="flex shrink-0 items-start justify-between gap-4 border-b border-[var(--app-divider)] px-5 py-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full border border-[var(--app-border)] bg-[var(--app-panel-2)] px-2.5 py-0.5 text-[11px] font-medium text-[var(--app-muted)]">
                问题 · 待你回复
              </span>
              {count > 1 ? (
                <span className="text-[11px] font-medium text-[var(--app-accent)]">还有 {count - 1} 个问题等待处理</span>
              ) : null}
            </div>
            <div id="question-prompt-title" className="mt-2 text-[15px] font-semibold text-[var(--app-text)]">需要你的选择</div>
          </div>
          <button
            type="button"
            className="flex h-8 shrink-0 items-center gap-1 rounded-md px-2 text-[12px] font-medium text-[var(--app-muted)] hover:bg-[var(--app-hover)] hover:text-[var(--app-text)] disabled:opacity-50"
            onClick={() => void reject()}
            disabled={Boolean(pending)}
            title="跳过这次提问"
          >
            {pending === "reject" ? <Loader2Icon className="h-3.5 w-3.5 animate-spin" /> : <XIcon className="h-3.5 w-3.5" />}
            跳过
          </button>
        </header>

        <div className="min-h-0 overflow-y-auto px-5 py-4">
          <div className="flex flex-col gap-5">
            {info.questions.map((question, index) => {
              const selection = selections[index]
              const multi = isMultiSelect(question)
              return (
                <div key={`${index}-${question.question}`} className="flex flex-col gap-3">
                  <div className="flex flex-wrap items-center gap-2">
                    {question.header ? (
                      <span className="rounded-md bg-[var(--app-hover)] px-2 py-0.5 text-[11px] font-medium text-[var(--app-muted)]">
                        {question.header}
                      </span>
                    ) : null}
                    <span className="text-[11px] text-[var(--app-subtle)]">{multi ? "可多选" : "单选"}</span>
                  </div>
                  <div className="text-[15px] leading-6 text-[var(--app-text)]">{question.question}</div>
                  <div className="flex flex-col gap-2">
                    {question.options.map((option) => {
                      const active = selection.labels.has(option.label)
                      return (
                        <button
                          key={option.label}
                          type="button"
                          className={cn(
                            "flex w-full items-start gap-3 rounded-lg border px-3 py-3 text-left transition-colors",
                            active
                              ? "border-[var(--app-accent)] bg-[var(--app-accent-soft)]"
                              : "border-[var(--app-border)] bg-[var(--app-panel-2)] hover:bg-[var(--app-hover)]",
                          )}
                          onClick={() => toggleOption(index, option.label)}
                          disabled={Boolean(pending)}
                        >
                          <span
                            className={cn(
                              "mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border",
                              active
                                ? "border-[var(--app-accent)] bg-[var(--app-accent)]"
                                : "border-[var(--app-border)] bg-transparent",
                            )}
                          >
                            {active ? <span className="h-1.5 w-1.5 rounded-full bg-white" /> : null}
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block text-[13px] font-medium text-[var(--app-text)]">{option.label}</span>
                            {option.description ? (
                              <span className="mt-0.5 block text-[12px] leading-5 text-[var(--app-muted)]">
                                {option.description}
                              </span>
                            ) : null}
                          </span>
                        </button>
                      )
                    })}
                  </div>
                  {isCustomAllowed(question) ? (
                    <input
                      type="text"
                      value={selection.custom}
                      onChange={(event) => setCustom(index, event.target.value)}
                      placeholder="或填写自己的答案..."
                      className="h-10 w-full rounded-md border border-[var(--app-border)] bg-[var(--app-input)] px-3 text-[13px] text-[var(--app-text)] outline-none transition-colors placeholder:text-[var(--app-muted)] focus:border-[var(--app-accent)] disabled:opacity-60"
                      disabled={Boolean(pending)}
                    />
                  ) : null}
                </div>
              )
            })}
          </div>
        </div>

        <footer className="flex shrink-0 flex-col gap-3 border-t border-[var(--app-divider)] px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          {error ? <div className="text-[12px] text-[var(--app-danger)]">{error}</div> : <div />}
          <button
            type="button"
            className="flex h-10 items-center justify-center gap-2 rounded-md bg-[var(--app-text)] px-5 text-[13px] font-medium text-[var(--app-bg)] hover:opacity-90 disabled:opacity-50"
            onClick={() => void submit()}
            disabled={!allReady || Boolean(pending)}
          >
            {pending === "reply" ? <Loader2Icon className="h-3.5 w-3.5 animate-spin" /> : null}
            提交回答
          </button>
        </footer>
      </section>
    </div>
  )
}
