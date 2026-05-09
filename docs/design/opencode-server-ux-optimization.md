# OpenCode 服务端用户体验优化建议

## 1. 背景

本文基于 `packages/opencode` 服务端源码观察，并参考一个更成熟的 Claude Code 类项目的体验设计思路，整理 OpenCode 服务端在用户体验层面的优化建议。

本文刻意不讨论安全加固，重点关注：

- 启动和首次使用的感知速度
- 长任务运行时的状态透明度
- 错误后的恢复体验
- 会话恢复和重试体验
- Web、TUI、SDK 多端一致性
- Workspace、PTY、工具执行等能力的交互反馈

## 2. 当前服务端体验基础

OpenCode 服务端已经具备较好的工程基础：

| 能力 | 当前实现 | 体验价值 |
| --- | --- | --- |
| 双后端 | Hono legacy + Effect HttpApi | 便于逐步迁移和对齐 SDK |
| OpenAPI/SDK | `Server.openapi()`、`PublicApi`、parity tests | 降低多端接口不一致风险 |
| 会话流式事件 | `SessionProcessor`、SSE event | 支撑实时消息和工具状态 |
| 会话并发控制 | `SessionRunState` | 避免同一会话重复运行 |
| 工具注册 | `ToolRegistry`、plugin tools、built-in tools | 可扩展工具体验 |
| 权限与问题事件 | `Permission`、`Question` | 支撑交互式审批和确认 |
| 文件索引 | `File.init()`、ripgrep cache | 支撑快速搜索和文件选择 |
| Workspace 路由 | local/remote workspace routing | 支撑多工作区和远程执行 |
| PTY | PTY JSON routes + WebSocket connect | 支撑终端体验 |

这些能力说明服务端已经不是功能薄弱点。用户体验优化的核心，不是推翻结构，而是让现有能力以更明确、连续、可恢复的方式暴露给前端和 CLI。

## 3. 参考成熟项目的体验特征

成熟项目里最值得借鉴的不是单个 API，而是以下产品感觉：

1. 启动后先进入可用状态，后台逐步预热模型、工具、插件、上下文。
2. 长任务不会表现成“卡住”，每个阶段都有可见状态。
3. 工具执行、权限请求、错误、重试、上下文压缩都能被用户理解。
4. 会话中断后能自然恢复，用户知道上次停在哪里。
5. 日志、错误和事件能串起来，前端可以给出更准确的提示。
6. CLI、Web、Desktop 对同一行为的反馈语义一致。

OpenCode 目前已经有底层事件和服务分层，缺的是一层更面向 UX 的状态模型。

## 4. 优化方向总览

| 优先级 | 方向 | 建议结论 |
| --- | --- | --- |
| P0 | Session 状态流细化 | 最先做，收益最大 |
| P0 | Warmup 预热事件 | 改善启动和首次交互体验 |
| P1 | UX Error Shape | 让错误能被 UI 转成恢复动作 |
| P1 | 会话恢复与重试 | 让中断、失败、busy 都可解释 |
| P1 | Workspace 状态事件 | 让切换、代理、同步状态可见 |
| P2 | PTY 连接体验 | 提供连接、重连、断开原因 |
| P2 | 双后端体验一致性 | 减少 Web/TUI/SDK 行为差异 |
| P2 | 可观测性与 request trace | 支撑诊断和更好的错误提示 |

## 5. P0：细化 Session 状态流

### 5.1 问题

当前会话已经有流式消息、工具 part、`session.status` 等事件，但从用户视角看，很多阶段仍然容易像“正在转圈”：

- 正在解析上下文
- 正在加载 instruction/AGENTS/CLAUDE.md
- 正在解析可用工具
- 正在等待模型首 token
- 正在执行某个工具
- 正在等待权限回复
- 正在压缩上下文
- 正在重试 provider 请求
- 正在整理总结

这些阶段在服务端内部存在，但没有统一为前端友好的 progress/state 模型。

### 5.2 建议

新增一组面向 UX 的 session lifecycle events，例如：

```ts
type SessionPhase =
  | "context_loading"
  | "instruction_loading"
  | "tool_resolving"
  | "model_waiting"
  | "streaming"
  | "tool_running"
  | "permission_waiting"
  | "compacting"
  | "retrying"
  | "summarizing"
  | "idle"
```

事件形态建议：

```json
{
  "type": "session.phase",
  "properties": {
    "sessionID": "ses_xxx",
    "messageID": "msg_xxx",
    "phase": "tool_running",
    "label": "Running shell command",
    "detail": "bun test",
    "startedAt": 1710000000000
  }
}
```

### 5.3 主要落点

- `packages/opencode/src/session/prompt.ts`
- `packages/opencode/src/session/processor.ts`
- `packages/opencode/src/session/compaction.ts`
- `packages/opencode/src/session/summary.ts`
- `packages/opencode/src/session/run-state.ts`

### 5.4 前端收益

前端可以把状态展示为：

- 顶部运行状态：`正在加载上下文`
- activity timeline：`解析工具完成，启用 12 个工具`
- composer 状态：`等待权限确认`
- long-running task 状态：`模型请求重试中，第 2 次`

这类改动通常不改变核心业务，却能显著降低用户的不确定感。

## 6. P0：服务端 Warmup 机制

### 6.1 问题

首次进入项目时，模型列表、工具定义、文件索引、LSP 状态、formatter 状态、provider 状态等信息往往会在用户真正点击时才被动加载。用户感觉是：

- 第一次打开慢
- 第一次搜索慢
- 第一次发消息慢
- 首次模型/provider 展示不稳定

### 6.2 建议

引入统一的 warmup service，将可后台执行的任务分层预热：

| 阶段 | 任务 | 用户感知 |
| --- | --- | --- |
| immediate | health、config、project path | UI 立即可用 |
| fast | agent、skill、tool ids、provider list | 选择器快速展开 |
| background | file scan、LSP touch、formatter status | 文件和诊断逐步可用 |
| lazy | model pricing、remote provider metadata | 需要时补全 |

事件建议：

```json
{
  "type": "server.warmup.progress",
  "properties": {
    "directory": "D:/project",
    "task": "file_index",
    "status": "running",
    "completed": 3,
    "total": 7
  }
}
```

### 6.3 主要落点

- `packages/opencode/src/server/server.ts`
- `packages/opencode/src/file/index.ts`
- `packages/opencode/src/tool/registry.ts`
- `packages/opencode/src/provider/provider.ts`
- `packages/opencode/src/agent/agent.ts`
- `packages/opencode/src/skill`

### 6.4 前端收益

- 应用启动后可以先显示主界面。
- 下拉项、文件搜索、LSP 状态逐步点亮。
- 用户知道“还在预热”，而不是误以为服务端慢。

## 7. P1：统一 UX Error Shape

### 7.1 问题

当前错误更多偏技术异常，前端需要猜测如何展示。比如：

- provider auth 失败
- model not found
- session busy
- workspace disconnected
- PTY session not found
- file read/list 失败
- remote workspace proxy failed

如果只返回通用 error，UI 很难提供下一步按钮。

### 7.2 建议

在现有错误结构外，补充 UX 字段：

```json
{
  "name": "ProviderAuthError",
  "message": "Provider authentication failed",
  "ux": {
    "title": "模型服务需要重新登录",
    "hint": "请检查 provider 凭据或重新完成认证。",
    "severity": "warning",
    "actions": [
      {
        "id": "open_provider_settings",
        "label": "打开模型设置"
      },
      {
        "id": "retry",
        "label": "重试"
      }
    ]
  }
}
```

### 7.3 推荐 actions

| 场景 | action |
| --- | --- |
| Provider 认证失败 | `open_provider_settings` |
| Model 不存在 | `select_model` |
| Session busy | `show_running_session`、`abort` |
| Workspace 丢失 | `reconnect_workspace` |
| PTY 断开 | `reconnect_terminal` |
| Context overflow | `compact_and_retry` |
| Tool 被拒绝 | `revise_prompt`、`retry_without_tool` |

### 7.4 主要落点

- `packages/opencode/src/server/middleware.ts`
- `packages/opencode/src/server/routes/instance/httpapi/middleware/error.ts`
- `packages/opencode/src/session/retry.ts`
- `packages/opencode/src/provider`
- `packages/opencode/src/workspace`

## 8. P1：会话恢复、重试和 Busy 体验

### 8.1 问题

长任务最影响体验的情况通常不是失败，而是不知道能不能继续：

- 用户刷新页面后，之前的任务是否还在跑？
- Session busy 时，当前到底在做什么？
- 工具失败后，是整个任务失败，还是可以重试工具？
- 中断后，从哪里继续？

### 8.2 建议

为 session 暴露更强的 run snapshot：

```json
{
  "sessionID": "ses_xxx",
  "status": "busy",
  "phase": "tool_running",
  "messageID": "msg_xxx",
  "currentTool": {
    "callID": "call_xxx",
    "name": "shell",
    "title": "bun test",
    "startedAt": 1710000000000
  },
  "canAbort": true,
  "canResume": false,
  "canRetry": false
}
```

### 8.3 推荐接口增强

| 接口 | 建议 |
| --- | --- |
| `GET /session/:id/status` | 返回 phase、currentTool、retry info |
| `POST /session/:id/abort` | 返回中断后的 session snapshot |
| `POST /session/:id/retry` | 支持从最后失败 step 继续 |
| `POST /session/:id/tool/:callID/retry` | 支持单个工具重试，后续版本实现 |

### 8.4 前端收益

- 刷新页面后能恢复运行状态。
- Busy 不再只是错误，而是可展示当前任务。
- 用户可以看到“正在执行哪个工具，已经多久”。
- 失败后能提供重试入口。

## 9. P1：Workspace 体验事件

### 9.1 问题

Workspace routing 和 proxy 能力已经较强，但从体验上看，用户需要知道：

- 当前请求被路由到哪个 workspace
- workspace 是 local 还是 remote
- remote 是否同步中
- proxy 是否断开
- 切换 workspace 后当前目录、分支、文件状态如何

### 9.2 建议

新增 workspace lifecycle events：

```json
{
  "type": "workspace.route",
  "properties": {
    "workspaceID": "wk_xxx",
    "target": "remote",
    "status": "proxying",
    "url": "/session/ses_xxx/message"
  }
}
```

```json
{
  "type": "workspace.sync.status",
  "properties": {
    "workspaceID": "wk_xxx",
    "status": "connected",
    "latencyMs": 32
  }
}
```

### 9.3 主要落点

- `packages/opencode/src/server/workspace.ts`
- `packages/opencode/src/server/routes/instance/httpapi/middleware/workspace-routing.ts`
- `packages/opencode/src/server/proxy.ts`
- `packages/opencode/src/server/routes/instance/httpapi/middleware/proxy.ts`

### 9.4 前端收益

- 工作区切换有明确反馈。
- 远程 workspace 断开后，UI 可以显示“正在重连”。
- 用户能理解为什么某个请求慢，是本地执行还是远程代理。

## 10. P2：PTY 连接体验

### 10.1 问题

PTY 已经有 ticket 和 WebSocket connect，但终端 UI 需要更细的连接状态：

- connecting
- connected
- reconnecting
- closed
- session not found
- process exited
- server closing

### 10.2 建议

为 PTY 增加状态事件和断开原因：

```json
{
  "type": "pty.connection",
  "properties": {
    "ptyID": "pty_xxx",
    "status": "closed",
    "reason": "process_exited",
    "exitCode": 0
  }
}
```

### 10.3 主要落点

- `packages/opencode/src/server/routes/instance/pty.ts`
- `packages/opencode/src/server/routes/instance/httpapi/handlers/pty.ts`
- `packages/opencode/src/pty`

### 10.4 前端收益

- 终端断开不再像“黑屏”。
- 用户可以看到进程退出码。
- UI 可以提供重新连接、重新启动 shell。

## 11. P2：双后端体验一致性

### 11.1 问题

Hono 和 Effect HttpApi 并存是合理迁移策略，但体验上容易出现：

- 错误格式略不同
- status code 略不同
- SSE 事件细节不同
- SDK 行为与 legacy path 行为不同

当前项目已经有 parity 测试，这是很好的基础。

### 11.2 建议

继续保留 parity 测试，同时新增 UX parity 维度：

| 类别 | 校验 |
| --- | --- |
| error shape | `message`、`name`、`ux.actions` 一致 |
| session status | busy、idle、retry、phase 一致 |
| SSE events | event type、payload 字段一致 |
| workspace proxy | local/remote 响应语义一致 |
| PTY | JSON route 和 WebSocket 错误语义一致 |

### 11.3 主要落点

- `packages/opencode/test/server/httpapi-bridge.test.ts`
- `packages/opencode/test/server/httpapi-parity.test.ts`
- `packages/opencode/test/server/httpapi-sdk.test.ts`
- `packages/opencode/src/server/routes/instance/index.ts`

## 12. P2：可观测性和 request trace

### 12.1 问题

服务端已经使用 Effect span 和 log，但前端难以把一次用户操作串起来：

- 点击发送 prompt
- 创建 assistant message
- 模型请求
- 工具调用
- 权限请求
- 重试
- 最终完成或失败

### 12.2 建议

引入 request/run correlation id：

```json
{
  "runID": "run_xxx",
  "requestID": "req_xxx",
  "sessionID": "ses_xxx",
  "messageID": "msg_xxx"
}
```

要求：

- HTTP response header 返回 `x-opencode-request-id`
- SSE event 附带 `runID`
- tool execution span 附带 `runID`
- error response 附带 `requestID`

### 12.3 前端收益

- 错误弹窗能提供“复制诊断信息”。
- activity timeline 可以按同一次 run 聚合。
- 用户反馈问题时更容易定位。

## 13. 推荐实施路线

### Phase 1：状态透明

目标：让用户知道服务端正在做什么。

任务：

1. 增加 `session.phase` 事件。
2. 在 prompt、processor、compaction、summary 中埋点。
3. 扩展 `GET /session/:id/status`，返回 phase 和 currentTool。
4. 前端/TUI 消费 phase，展示运行阶段。

验收：

- 发起一次 prompt 后，UI 至少能看到 context、model、tool、summary 四类阶段。
- provider 重试时，用户能看到重试次数和下一次时间。

### Phase 2：首次体验

目标：减少首次打开和首次对话的等待感。

任务：

1. 新增 warmup service。
2. 后台预热 config、agent、tool、provider、file index。
3. 发出 `server.warmup.progress` 事件。
4. 前端展示预热状态。

验收：

- 打开项目后主界面立即可用。
- 文件搜索、agent/model 选择器能逐步显示 ready 状态。

### Phase 3：恢复能力

目标：失败、刷新、中断后都能继续。

任务：

1. 增强 session run snapshot。
2. BusyError 返回当前运行信息。
3. 增加 retry/resume 相关 API 设计。
4. 工具失败时保留可重试元数据。

验收：

- 页面刷新后能恢复正在运行的任务状态。
- session busy 时，UI 能跳转到正在运行的消息。

### Phase 4：多端一致性

目标：Web、TUI、SDK 使用同一种体验语义。

任务：

1. 增加 UX error shape。
2. 补充 UX parity tests。
3. 统一 Hono 和 Effect HttpApi 的 session/status/error/event 输出。
4. 文档化事件契约。

验收：

- Web 和 TUI 对同一个错误展示同类提示。
- SDK 调用者能根据 `ux.actions` 构建恢复入口。

## 14. 建议新增事件清单

| 事件 | 用途 |
| --- | --- |
| `server.warmup.started` | 服务端或项目预热开始 |
| `server.warmup.progress` | 预热进度 |
| `server.warmup.completed` | 预热完成 |
| `session.phase` | 会话运行阶段 |
| `session.run.snapshot` | 当前运行快照 |
| `session.retry.scheduled` | provider 或工具重试计划 |
| `session.recovered` | 会话恢复完成 |
| `tool.execution.progress` | 长工具运行进度 |
| `workspace.route` | workspace 请求路由 |
| `workspace.sync.status` | workspace 同步状态 |
| `proxy.status` | proxy 连接状态 |
| `pty.connection` | 终端连接状态 |

## 15. 建议新增或增强接口

| 接口 | 类型 | 建议 |
| --- | --- | --- |
| `GET /session/:id/status` | 增强 | 返回 phase、currentTool、runID |
| `GET /session/:id/run` | 新增 | 返回当前 run snapshot |
| `POST /session/:id/retry` | 新增 | 从失败点继续 |
| `POST /session/:id/resume` | 新增 | 恢复中断任务 |
| `GET /server/warmup` | 新增 | 查询预热状态 |
| `POST /server/warmup` | 新增 | 手动触发预热 |
| `GET /workspace/:id/status` | 增强 | 返回 target、sync、latency |
| `GET /pty/:id/status` | 增强 | 返回连接状态和退出信息 |

## 16. 风险和取舍

| 风险 | 说明 | 建议 |
| --- | --- | --- |
| 事件过多 | 前端处理复杂度上升 | 使用 phase/snapshot 聚合，不把每个内部步骤都暴露 |
| 状态重复 | message part、session status、activity 可能重复 | 定义 UX event 是展示层语义，不替代底层事件 |
| 双后端迁移期成本 | Hono 和 Effect 都要对齐 | 先在 Effect 实现，再用 parity tests 约束 Hono |
| 前端过度依赖文字 label | 多语言和文案调整困难 | event 中保留 machine-readable phase/action |
| Warmup 增加启动负载 | 后台任务可能抢资源 | 分阶段、可取消、低优先级执行 |

## 17. 最小可落地版本

建议第一轮只做以下内容：

1. `session.phase` 事件。
2. `GET /session/:id/status` 返回 `phase` 和 `currentTool`。
3. provider retry 事件增加重试次数和下一次时间。
4. context compaction 增加开始/结束事件。
5. `server.warmup.progress` 支持 agent/tool/file index 三类预热。
6. BusyError 响应中包含当前 run snapshot。

这 6 个点改动不大，但能让 UI 从“聊天流”进化成“可理解的 agent 工作台”。

## 18. 总结

OpenCode 服务端已经具备较完整的基础能力。若只看用户体验，最值得优化的是“把内部状态翻译成用户能理解的进度和恢复动作”。

优先级建议：

1. 先做 session phase，让长任务不再像卡住。
2. 再做 warmup，让首次使用更快进入可用状态。
3. 然后做 UX error shape，让错误变成可恢复动作。
4. 最后统一 workspace、PTY、proxy、双后端的体验语义。

这条路线不需要重写服务端核心，却能明显提升 Web、TUI、Desktop 和 SDK 用户的整体感受。
