import { useEffect, useMemo, useState, type ComponentType, type ReactNode, type SVGProps } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import {
  AlertCircle,
  Ban,
  BookOpen,
  Box,
  Check,
  Code2,
  Download,
  FileText,
  Globe2,
  Image as ImageIcon,
  Loader2,
  Package,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  Wrench,
  X,
} from "lucide-react"
import { ScrollArea } from "@/components/ui/scroll-area"
import { syncQueryKeys } from "@/features/sync/query-keys"
import { MessageMarkdown } from "@/features/thread/markdown"
import {
  openPath,
  skillInstall,
  skillList,
  skillRecommendations,
  skillSetEnabled,
  skillUninstall,
  type OpenCodeSkill,
  type OpenCodeSkillRecommendation,
  type ServerStatus,
} from "@/lib/tauri"
import { cn } from "@/lib/utils"

type IconComponent = ComponentType<SVGProps<SVGSVGElement>>

const AlertCircleIcon = AlertCircle as IconComponent
const BanIcon = Ban as IconComponent
const BookOpenIcon = BookOpen as IconComponent
const BoxIcon = Box as IconComponent
const CheckIcon = Check as IconComponent
const Code2Icon = Code2 as IconComponent
const DownloadIcon = Download as IconComponent
const FileTextIcon = FileText as IconComponent
const Globe2Icon = Globe2 as IconComponent
const ImageGlyphIcon = ImageIcon as IconComponent
const Loader2Icon = Loader2 as IconComponent
const PackageIcon = Package as IconComponent
const PencilIcon = Pencil as IconComponent
const PlusIcon = Plus as IconComponent
const RefreshCwIcon = RefreshCw as IconComponent
const SearchIcon = Search as IconComponent
const Trash2Icon = Trash2 as IconComponent
const WrenchIcon = Wrench as IconComponent
const XIcon = X as IconComponent

type Props = {
  server?: ServerStatus
  serverUrl?: string
  directory?: string
}

type SkillActionVariables = {
  skill: OpenCodeSkill
  enabled?: boolean
}

type SkillSourceFilter = "all" | "codex" | "opencode" | "disabled"

const EMPTY_SKILLS: OpenCodeSkill[] = []

export function SkillsWorkspace({ server, serverUrl, directory }: Props) {
  const queryClient = useQueryClient()
  const [query, setQuery] = useState("")
  const [sourceFilter, setSourceFilter] = useState<SkillSourceFilter>("all")
  const [selectedSkillKey, setSelectedSkillKey] = useState<string | null>(null)
  const serverHealthy = Boolean(server?.healthy)
  const baseUrl = serverHealthy ? (server?.baseUrl ?? serverUrl) : undefined
  const skillsKey = syncQueryKeys.skills(baseUrl, directory)
  const recommendationsKey = syncQueryKeys.skillRecommendations()

  const skillsQuery = useQuery({
    queryKey: skillsKey,
    queryFn: () =>
      skillList({
        baseUrl: baseUrl ?? undefined,
        directory,
      }),
    staleTime: 30_000,
  })
  const installedSkillData = skillsQuery.data ?? EMPTY_SKILLS

  const recommendationsQuery = useQuery({
    queryKey: recommendationsKey,
    queryFn: skillRecommendations,
    staleTime: 5 * 60_000,
    retry: 1,
  })

  const installedNames = useMemo(() => {
    return new Set(installedSkillData.map((skill) => skill.name.toLowerCase()))
  }, [installedSkillData])

  const sourceCounts = useMemo(() => {
    return installedSkillData.reduce(
      (counts, skill) => {
        counts.all += 1
        if (skillSourceType(skill.location) === "codex") counts.codex += 1
        if (skillSourceType(skill.location) === "opencode") counts.opencode += 1
        if (!isSkillEnabled(skill)) counts.disabled += 1
        return counts
      },
      { all: 0, codex: 0, opencode: 0, disabled: 0 } satisfies Record<SkillSourceFilter, number>,
    )
  }, [installedSkillData])

  const installedSkills = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return [...installedSkillData]
      .sort((a, b) => displaySkillTitle(a).localeCompare(displaySkillTitle(b)))
      .filter((skill) => {
        if (sourceFilter === "disabled" && isSkillEnabled(skill)) return false
        if (sourceFilter !== "all" && sourceFilter !== "disabled" && skillSourceType(skill.location) !== sourceFilter) {
          return false
        }
        if (!needle) return true
        return `${skill.name} ${displaySkillTitle(skill)} ${skill.description} ${skillSource(skill.location)} ${skill.location}`
          .toLowerCase()
          .includes(needle)
      })
  }, [installedSkillData, query, sourceFilter])

  const recommendedSkills = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return (recommendationsQuery.data ?? []).filter((skill) => {
      const installed = skill.installed || installedNames.has(skill.name.toLowerCase())
      if (installed) return false
      if (!needle) return true
      return `${skill.title} ${skill.name} ${skill.description}`.toLowerCase().includes(needle)
    })
  }, [installedNames, query, recommendationsQuery.data])

  const selectedSkill = useMemo(() => {
    if (!selectedSkillKey) return null
    return installedSkillData.find((skill) => skillKey(skill) === selectedSkillKey) ?? null
  }, [installedSkillData, selectedSkillKey])

  useEffect(() => {
    if (selectedSkillKey && skillsQuery.data && !selectedSkill) setSelectedSkillKey(null)
  }, [selectedSkill, selectedSkillKey, skillsQuery.data])

  const refreshSkills = () => {
    void queryClient.invalidateQueries({ queryKey: skillsKey })
    void queryClient.invalidateQueries({ queryKey: recommendationsKey })
  }

  const installSkill = useMutation({
    mutationFn: (skill: OpenCodeSkillRecommendation) =>
      skillInstall({
        name: skill.name,
        repo: skill.repo,
        path: skill.path,
        refName: skill.refName,
        baseUrl,
        directory,
      }),
    onSuccess: refreshSkills,
  })

  const setEnabled = useMutation({
    mutationFn: ({ skill, enabled }: SkillActionVariables) =>
      skillSetEnabled({
        name: skill.name,
        enabled: enabled ?? !isSkillEnabled(skill),
        baseUrl,
        directory,
      }),
    onSuccess: refreshSkills,
  })

  const uninstall = useMutation({
    mutationFn: ({ skill }: SkillActionVariables) =>
      skillUninstall({
        name: skill.name,
        location: skill.location,
        baseUrl,
        directory,
      }),
    onSuccess: () => {
      setSelectedSkillKey(null)
      refreshSkills()
    },
  })

  const openSkillDialog = (skill: OpenCodeSkill) => {
    setEnabled.reset()
    uninstall.reset()
    setSelectedSkillKey(skillKey(skill))
  }

  const closeSkillDialog = () => {
    setEnabled.reset()
    uninstall.reset()
    setSelectedSkillKey(null)
  }

  const unavailable = !serverHealthy
  const skillsLoading = skillsQuery.isLoading
  const recommendationsLoading = recommendationsQuery.isLoading
  const refreshing = skillsQuery.isFetching || recommendationsQuery.isFetching
  const modalError = setEnabled.error ?? uninstall.error
  const activeFilters = Boolean(query.trim()) || sourceFilter !== "all"

  const resetFilters = () => {
    setQuery("")
    setSourceFilter("all")
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-[var(--app-bg)]">
      <ScrollArea className="min-h-0 flex-1">
        <div className="mx-auto flex w-full max-w-5xl flex-col gap-8 px-8 py-8">
          <div className="flex flex-wrap items-center gap-3">
            <div className="min-w-0 flex-1">
              <h1 className="text-xl font-semibold tracking-normal text-[var(--app-text)]">技能</h1>
              <p className="mt-1 text-sm font-medium text-[var(--app-muted)]">管理 Codex 和 OpenCode 可用的本地技能</p>
            </div>

            <div className="flex h-9 min-w-[220px] items-center gap-2 rounded-full bg-[var(--app-input)] px-3 text-[var(--app-muted)] ring-1 ring-[var(--app-divider)]">
              <SearchIcon className="h-4 w-4 shrink-0" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                className="h-full min-w-0 flex-1 bg-transparent text-sm font-medium text-[var(--app-text)] outline-none placeholder:text-[var(--app-muted)]"
                placeholder="搜索技能"
              />
              {query.trim() ? (
                <button
                  type="button"
                  className="-mr-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[var(--app-muted)] transition-colors hover:bg-[var(--app-hover-strong)] hover:text-[var(--app-text)]"
                  title="清除搜索"
                  onClick={() => setQuery("")}
                >
                  <XIcon className="h-3.5 w-3.5" />
                </button>
              ) : null}
            </div>

            <button
              type="button"
              className="flex h-9 w-9 items-center justify-center rounded-full text-[var(--app-muted)] transition-colors hover:bg-[var(--app-hover)] hover:text-[var(--app-text)] disabled:cursor-not-allowed disabled:opacity-45"
              title="刷新"
              disabled={refreshing}
              onClick={refreshSkills}
            >
              <RefreshCwIcon className={cn("h-4 w-4", refreshing && "animate-spin")} />
            </button>
          </div>

          {skillsQuery.error ? (
            <InlineWarning title="读取已安装技能失败" detail={getErrorMessage(skillsQuery.error)} />
          ) : unavailable ? (
            <InlineWarning title="OpenCode server 未连接" detail={server?.message ?? "当前无法读取 OpenCode 技能列表。"} />
          ) : null}

          <div className="flex flex-wrap items-center gap-2 px-1">
            <SkillFilterButton
              label="全部"
              count={sourceCounts.all}
              active={sourceFilter === "all"}
              onClick={() => setSourceFilter("all")}
            />
            <SkillFilterButton
              label="Codex"
              count={sourceCounts.codex}
              active={sourceFilter === "codex"}
              onClick={() => setSourceFilter("codex")}
            />
            <SkillFilterButton
              label="OpenCode"
              count={sourceCounts.opencode}
              active={sourceFilter === "opencode"}
              onClick={() => setSourceFilter("opencode")}
            />
            <SkillFilterButton
              label="禁用"
              count={sourceCounts.disabled}
              active={sourceFilter === "disabled"}
              onClick={() => setSourceFilter("disabled")}
            />
            {activeFilters ? (
              <button
                type="button"
                className="ml-1 inline-flex h-8 items-center gap-1.5 rounded-lg px-2 text-xs font-semibold text-[var(--app-muted)] transition-colors hover:bg-[var(--app-hover)] hover:text-[var(--app-text)]"
                onClick={resetFilters}
              >
                <XIcon className="h-3.5 w-3.5" />
                清除筛选
              </button>
            ) : null}
          </div>

          <section className="min-w-0">
            <div className="mb-6 flex items-center justify-between gap-3 px-1">
              <h2 className="text-base font-semibold text-[var(--app-text)]">已安装</h2>
              <span className="text-sm font-medium text-[var(--app-muted)]">
                {activeFilters ? `${installedSkills.length} / ${sourceCounts.all}` : `${installedSkills.length}`}
              </span>
            </div>

            {skillsLoading ? (
              <SkillsState icon={Loader2Icon} title="正在读取已安装技能" detail=" " spinning />
            ) : installedSkills.length ? (
              <div className="grid gap-x-12 gap-y-4 xl:grid-cols-2">
                {installedSkills.map((skill) => (
                  <SkillRow
                    key={skillKey(skill)}
                    skill={skill}
                    onOpen={() => openSkillDialog(skill)}
                  />
                ))}
              </div>
            ) : (
              <EmptySection
                title={query.trim() ? "没有匹配的已安装技能" : "没有发现已安装技能"}
                detail={activeFilters ? "清除搜索或切换来源后再试。" : "可以从下面的推荐技能开始添加。"}
              />
            )}
          </section>

          <section className="min-w-0">
            <div className="mb-4 flex items-center justify-between gap-3 px-1">
              <h2 className="text-base font-semibold text-[var(--app-text)]">可安装</h2>
              {recommendationsQuery.error ? (
                <span className="text-xs font-medium text-[var(--app-danger)]">
                  {getErrorMessage(recommendationsQuery.error)}
                </span>
              ) : recommendationsLoading ? (
                <span className="text-sm font-medium text-[var(--app-muted)]">读取中</span>
              ) : (
                <span className="text-sm font-medium text-[var(--app-muted)]">{recommendedSkills.length}</span>
              )}
            </div>

            {installSkill.error ? (
              <InlineWarning title="安装失败" detail={getErrorMessage(installSkill.error)} />
            ) : null}

            {recommendationsLoading ? (
              <SkillsState icon={Loader2Icon} title="正在读取推荐技能" detail=" " spinning compact />
            ) : recommendedSkills.length ? (
              <div className="grid gap-x-12 gap-y-3 xl:grid-cols-2">
                {recommendedSkills.map((skill) => {
                  const installing = installSkill.isPending && installSkill.variables?.name === skill.name
                  return (
                    <RecommendedSkillRow
                      key={`${skill.repo}:${skill.path}`}
                      skill={skill}
                      installing={installing}
                      onInstall={() => installSkill.mutate(skill)}
                    />
                  )
                })}
              </div>
            ) : (
              <EmptySection
                title={
                  recommendationsQuery.error
                    ? "推荐技能读取失败"
                    : query.trim()
                      ? "没有匹配的推荐技能"
                      : "推荐技能都已安装"
                }
                detail=" "
              />
            )}
          </section>
        </div>
      </ScrollArea>

      {selectedSkill ? (
        <SkillDetailDialog
          skill={selectedSkill}
          source={skillSource(selectedSkill.location)}
          directory={directory}
          busy={setEnabled.isPending || uninstall.isPending}
          error={modalError ? getErrorMessage(modalError) : null}
          onClose={closeSkillDialog}
          onToggle={(enabled) => setEnabled.mutate({ skill: selectedSkill, enabled })}
          onUninstall={() => uninstall.mutate({ skill: selectedSkill })}
        />
      ) : null}
    </div>
  )
}

function SkillRow({ skill, onOpen }: { skill: OpenCodeSkill; onOpen: () => void }) {
  const enabled = isSkillEnabled(skill)
  const icon = skillIcon(skill)
  const source = skillSource(skill.location)

  return (
    <button
      type="button"
      className={cn(
        "group flex min-h-[74px] w-full min-w-0 items-center gap-4 rounded-xl px-3 py-3 text-left transition-colors hover:bg-[var(--app-hover)] focus-visible:bg-[var(--app-hover)]",
        !enabled && "opacity-55",
      )}
      onClick={onOpen}
    >
      <SkillGlyph icon={icon.icon} className={icon.className} />
      <div className="min-w-0 flex-1">
        <div className="truncate text-[15px] font-semibold leading-5 text-[var(--app-text)]">
          {displaySkillTitle(skill)}
        </div>
        <div className="mt-1 truncate text-sm font-medium leading-5 text-[var(--app-muted)]">
          {shortDescription(skill.description)}
        </div>
      </div>
      <div className="hidden shrink-0 rounded-md bg-[var(--app-input)] px-2 py-1 text-[11px] font-semibold text-[var(--app-muted)] ring-1 ring-[var(--app-divider)] sm:block">
        {source}
      </div>
      <div
        className={cn(
          "flex h-7 w-7 shrink-0 items-center justify-center text-[var(--app-subtle)] transition-colors group-hover:text-[var(--app-muted)]",
          !enabled && "text-[var(--app-danger)]",
        )}
        title={enabled ? "已启用" : "已禁用"}
      >
        {enabled ? <CheckIcon className="h-4 w-4" /> : <BanIcon className="h-4 w-4" />}
      </div>
    </button>
  )
}

function SkillFilterButton({
  label,
  count,
  active,
  onClick,
}: {
  label: string
  count: number
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      className={cn(
        "inline-flex h-8 items-center gap-2 rounded-lg px-3 text-xs font-semibold transition-colors",
        active
          ? "bg-[var(--app-text)] text-[var(--app-bg)]"
          : "bg-[var(--app-input)] text-[var(--app-muted)] ring-1 ring-[var(--app-divider)] hover:bg-[var(--app-hover)] hover:text-[var(--app-text)]",
      )}
      onClick={onClick}
    >
      <span>{label}</span>
      <span className={cn("tabular-nums", active ? "text-[color-mix(in_srgb,var(--app-bg)_72%,transparent)]" : "text-[var(--app-subtle)]")}>
        {count}
      </span>
    </button>
  )
}

function SkillDetailDialog({
  skill,
  source,
  directory,
  busy,
  error,
  onClose,
  onToggle,
  onUninstall,
}: {
  skill: OpenCodeSkill
  source: string
  directory?: string
  busy?: boolean
  error?: string | null
  onClose: () => void
  onToggle: (enabled: boolean) => void
  onUninstall: () => void
}) {
  const [copied, setCopied] = useState(false)
  const enabled = isSkillEnabled(skill)
  const icon = skillIcon(skill)
  const canUninstall = isUninstallableSkill(skill)

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose()
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [onClose])

  const copyCommand = async () => {
    try {
      await navigator.clipboard.writeText(`/${skill.name} `)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1500)
    } catch {
      setCopied(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-[120] flex items-center justify-center bg-black/60 p-5 backdrop-blur-sm"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <section className="flex max-h-[calc(100vh-40px)] w-full max-w-[820px] flex-col overflow-hidden rounded-3xl border border-[var(--app-divider)] bg-[var(--app-panel)] shadow-2xl shadow-black/45">
        <div className="grid shrink-0 grid-cols-[52px_minmax(0,1fr)_auto] items-start gap-4 px-7 pb-4 pt-7">
          <SkillGlyph icon={icon.icon} className={cn("h-[52px] w-[52px] rounded-2xl", icon.className)} iconClassName="h-6 w-6" />
          <div className="min-w-0 pr-2">
            <div className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-0.5">
              <h2 className="min-w-0 truncate text-[25px] font-semibold leading-8 text-[var(--app-text)]">{displaySkillTitle(skill)}</h2>
              <span className="text-[25px] font-medium leading-8 text-[var(--app-muted)]">Skill</span>
            </div>
            <p className="mt-1 line-clamp-2 max-w-[620px] text-[13px] font-medium leading-6 text-[var(--app-muted)]">
              {skill.description || "未提供描述"}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Switch checked={enabled} disabled={busy} onChange={(checked) => onToggle(checked)} />
            <button
              type="button"
              className="flex h-8 w-8 items-center justify-center rounded-full text-[var(--app-muted)] transition-colors hover:bg-[var(--app-hover)] hover:text-[var(--app-text)]"
              title="关闭"
              onClick={onClose}
            >
              <XIcon className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="shrink-0 px-7">
          <div className="grid gap-x-3 gap-y-1.5 rounded-2xl bg-[var(--app-panel-2)] px-4 py-3 text-xs font-medium ring-1 ring-[var(--app-divider)] sm:grid-cols-[34px_minmax(0,1fr)]">
            <span className="text-[var(--app-subtle)]">来源</span>
            <span className="min-w-0 truncate text-[var(--app-muted)]">{source}</span>
            <span className="text-[var(--app-subtle)]">路径</span>
            <button
              type="button"
              className="min-w-0 truncate text-left font-mono text-[11px] text-[var(--app-muted)] hover:text-[var(--app-text)]"
              title={skill.location}
              onClick={() => void openPath(skill.location, { target: "editor" })}
            >
              {skill.location}
            </button>
          </div>
        </div>

        {error ? <InlineWarning className="mx-7 mt-3" title="操作失败" detail={error} /> : null}

        <div className="mx-7 mt-4 min-h-0 flex-1 overflow-hidden rounded-2xl bg-[var(--app-bg)] ring-1 ring-[var(--app-divider)]">
          <ScrollArea className="max-h-[min(52vh,520px)] min-h-[260px]">
            <div className="px-6 py-5">
              <MessageMarkdown
                text={skill.content?.trim() ? skill.content : "这个技能没有提供正文。"}
                className="text-[13px] leading-[1.7]"
                workspaceDirectory={directory}
                onLocalFileOpen={(path) => void openPath(path, { target: "editor" })}
              />
            </div>
          </ScrollArea>
        </div>

        <div className="mt-5 flex shrink-0 flex-wrap items-center justify-between gap-3 border-t border-[var(--app-divider)] px-7 py-5">
          <button
            type="button"
            className="inline-flex h-9 items-center gap-2 rounded-lg px-3 text-sm font-semibold text-[var(--app-danger)] transition-colors hover:bg-[var(--app-danger-soft)] disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:bg-transparent"
            disabled={busy || !canUninstall}
            title={canUninstall ? "卸载技能" : "系统或插件技能不能卸载，可以禁用"}
            onClick={onUninstall}
          >
            {busy ? <Loader2Icon className="h-4 w-4 animate-spin" /> : <Trash2Icon className="h-4 w-4" />}
            卸载
          </button>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              className="inline-flex h-9 items-center gap-2 rounded-lg px-3 text-sm font-semibold text-[var(--app-muted)] transition-colors hover:bg-[var(--app-hover)] hover:text-[var(--app-text)]"
              onClick={() => void openPath(skill.location, { target: "editor" })}
            >
              <FileTextIcon className="h-4 w-4" />
              打开文件
            </button>
            <button
              type="button"
              className="inline-flex h-9 items-center gap-2 rounded-lg bg-[var(--app-text)] px-3 text-sm font-semibold text-[var(--app-bg)] transition-opacity hover:opacity-90"
              onClick={copyCommand}
            >
              <BoxIcon className="h-4 w-4" />
              {copied ? "已复制" : "在对话中试用"}
            </button>
          </div>
        </div>
      </section>
    </div>
  )
}

function RecommendedSkillRow({
  skill,
  installing,
  onInstall,
}: {
  skill: OpenCodeSkillRecommendation
  installing?: boolean
  onInstall: () => void
}) {
  const icon = recommendationIcon(skill)

  return (
    <div className="group flex min-h-[68px] min-w-0 items-center gap-4 rounded-xl px-3 py-2 transition-colors hover:bg-[var(--app-hover)]">
      <SkillGlyph icon={icon.icon} className={icon.className} />
      <div className="min-w-0 flex-1">
        <div className="truncate text-[15px] font-semibold leading-5 text-[var(--app-text)]">{skill.title}</div>
        <div className="mt-1 truncate text-sm font-medium leading-5 text-[var(--app-muted)]">
          {shortDescription(skill.description || skill.name)}
        </div>
      </div>
      <button
        type="button"
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[var(--app-muted)] transition-colors hover:bg-[var(--app-hover-strong)] hover:text-[var(--app-text)] disabled:cursor-wait disabled:opacity-55"
        title={`安装 ${skill.title}`}
        disabled={installing}
        onClick={onInstall}
      >
        {installing ? <Loader2Icon className="h-4 w-4 animate-spin" /> : <PlusIcon className="h-5 w-5" />}
      </button>
    </div>
  )
}

function SkillGlyph({
  icon: Icon,
  className,
  iconClassName,
}: {
  icon: IconComponent
  className?: string
  iconClassName?: string
}) {
  return (
    <div className={cn("flex h-12 w-12 shrink-0 items-center justify-center rounded-xl", className)}>
      <Icon className={cn("h-5 w-5", iconClassName)} />
    </div>
  )
}

function Switch({
  checked,
  disabled,
  onChange,
}: {
  checked: boolean
  disabled?: boolean
  onChange: (checked: boolean) => void
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      className={cn(
        "relative h-6 w-11 rounded-full transition-colors disabled:cursor-wait disabled:opacity-60",
        checked ? "bg-[#4d9cff]" : "bg-[var(--app-hover-strong)]",
      )}
      onClick={() => onChange(!checked)}
    >
      <span
        className={cn(
          "absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition-transform",
          checked ? "translate-x-5" : "translate-x-0",
        )}
      />
    </button>
  )
}

function InlineWarning({
  title,
  detail,
  className,
}: {
  title: string
  detail: string
  className?: string
}) {
  return (
    <div
      className={cn(
        "flex items-start gap-2 rounded-xl bg-[color-mix(in_srgb,var(--app-warning)_12%,transparent)] px-3 py-2",
        className,
      )}
    >
      <AlertCircleIcon className="mt-0.5 h-4 w-4 shrink-0 text-[var(--app-warning)]" />
      <div className="min-w-0 text-xs font-medium leading-5 text-[var(--app-muted)]">
        <span className="text-[var(--app-text)]">{title}</span>
        {detail ? <span>：{detail}</span> : null}
      </div>
    </div>
  )
}

function EmptySection({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="rounded-xl border border-dashed border-[var(--app-divider)] px-4 py-8 text-center">
      <div className="text-sm font-semibold text-[var(--app-text)]">{title}</div>
      {detail.trim() ? <div className="mt-1 text-sm leading-6 text-[var(--app-muted)]">{detail}</div> : null}
    </div>
  )
}

function SkillsState({
  icon: Icon,
  title,
  detail,
  action,
  spinning,
  compact,
}: {
  icon: IconComponent
  title: string
  detail: string
  action?: ReactNode
  spinning?: boolean
  compact?: boolean
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center rounded-xl border border-dashed border-[var(--app-divider)] px-6 text-center",
        compact ? "min-h-[128px] py-7" : "min-h-[260px] py-10",
      )}
    >
      <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[var(--app-input)] text-[var(--app-muted)]">
        <Icon className={cn("h-5 w-5", spinning && "animate-spin")} />
      </div>
      <div className="mt-3 text-sm font-semibold text-[var(--app-text)]">{title}</div>
      {detail.trim() ? <div className="mt-1 max-w-md text-sm leading-6 text-[var(--app-muted)]">{detail}</div> : null}
      {action}
    </div>
  )
}

function skillKey(skill: OpenCodeSkill) {
  return `${skill.name}:${skill.location}`
}

function isSkillEnabled(skill: OpenCodeSkill) {
  return skill.enabled !== false
}

function isUninstallableSkill(skill: OpenCodeSkill) {
  const normalized = normalizePath(skill.location)
  if (normalized.includes("/.codex/skills/.system/")) return false
  if (normalized.includes("/.codex/plugins/")) return false
  return normalized.includes("/.codex/skills/") || normalized.includes("/.opencode/skills/")
}

function skillSourceType(location: string) {
  const normalized = normalizePath(location)
  if (normalized.includes("/.codex/skills/") || normalized.includes("/.codex/plugins/")) return "codex"
  if (normalized.includes("/.opencode/")) return "opencode"
  return "other"
}

function skillSource(location: string) {
  const normalized = normalizePath(location)
  if (normalized.includes("/.codex/plugins/")) return "Codex 插件"
  if (normalized.includes("/.codex/skills/.system/")) return "Codex 系统"
  if (normalized.includes("/.codex/skills/")) return "Codex 本地"
  if (normalized.includes("/.opencode/")) return "OpenCode"
  if (normalized.includes("/.claude/")) return "Claude"
  if (normalized.includes("/.agents/")) return "Agents"
  return "用户"
}

function displaySkillTitle(skill: OpenCodeSkill) {
  return displayName(skill.name)
}

function displayName(name: string) {
  const known: Record<string, string> = {
    browser: "Browser",
    code: "Java Code",
    decompiler: "Decompiler",
    design: "Design Docs",
    documents: "Documents",
    "gh-address-comments": "GH Address Comments",
    "gh-fix-ci": "GH Fix CI",
    github: "GitHub",
    imagegen: "Image Gen",
    junit5: "JUnit5",
    "maven-mapping": "Maven Mapping",
    "maven-research": "Maven Research",
    "openai-docs": "OpenAI Docs",
    "plugin-creator": "Plugin Creator",
    "skill-creator": "Skill Creator",
    "skill-installer": "Skill Installer",
    "skill-optimizer": "Skill Optimizer",
  }
  if (known[name]) return known[name]
  return name
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ")
}

function shortDescription(description: string) {
  const clean = (description || "未提供描述").replace(/\s+/g, " ").trim()
  const sentence = clean.split(/(?<=[。.!?])\s+/)[0] ?? clean
  return sentence.length > 86 ? `${sentence.slice(0, 84)}...` : sentence
}

function skillIcon(skill: OpenCodeSkill) {
  const name = skill.name.toLowerCase()
  if (name.includes("browser")) return iconMeta(Globe2Icon, "bg-[#111111] text-[#d6d6d6]")
  if (name.includes("image")) return iconMeta(ImageGlyphIcon, "bg-[#8bd7ff] text-[#155e75]")
  if (name.includes("doc") || name.includes("design")) return iconMeta(BookOpenIcon, "bg-[#fff7ed] text-[#c2410c]")
  if (name.includes("creator") || name.includes("installer")) return iconMeta(PencilIcon, "bg-[#fff7cc] text-[#b45309]")
  if (name.includes("maven") || name.includes("decompiler")) return iconMeta(PackageIcon, "bg-[#151515] text-[#f5b56a]")
  if (name.includes("junit") || name.includes("code")) return iconMeta(Code2Icon, "bg-[#151515] text-[#8fb7ff]")
  if (name.includes("github") || name.startsWith("gh-")) return iconMeta(WrenchIcon, "bg-[#151515] text-[#b8b8b8]")
  return iconMeta(BoxIcon, "bg-[#151515] text-[#f6b76d]")
}

function recommendationIcon(skill: OpenCodeSkillRecommendation) {
  const pseudoSkill: OpenCodeSkill = {
    name: skill.name,
    description: skill.description,
    location: skill.path,
    content: "",
    enabled: true,
  }
  if (skill.name.includes("install")) return iconMeta(DownloadIcon, "bg-[#fff7cc] text-[#b45309]")
  return skillIcon(pseudoSkill)
}

function iconMeta(icon: IconComponent, className: string) {
  return { icon, className }
}

function normalizePath(path: string) {
  return path.replace(/\\/g, "/").replace(/\/+$/, "").toLowerCase()
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message
  if (typeof error === "string") return error
  return "未知错误"
}
