# opencode 服务端优化建议

> **范围**：`packages/opencode/src/server/` 全部文件
> **参照对象**：Claude Code（`QueryEngine` + Ink + 多入口形态 + feature flag 裁剪）的成熟工程模式
> **风格**：每条建议都给出 *现状 → 问题 → 建议方案*，附具体文件:行号
> **生成时间**：2026-05-08

---

## 目录

- [一、架构层面：双后端过渡债](#一架构层面honoeffect-httpapi-双后端的过渡债)
- [二、可观测性：缺少请求关联](#二可观测性缺少请求关联)
- [三、安全：几个值得收紧的口子](#三安全几个值得收紧的口子)
- [四、性能与扩展性](#四性能与扩展性)
- [五、代码层面的小优化](#五代码层面的小优化)
- [六、按优先级汇总](#六按优先级汇总)
- [七、对照 Claude Code 的高层启发](#七对照-claude-code-的几个高层启发)

---

## 一、架构层面：Hono / effect-httpapi 双后端的过渡债

### 1. 双后端是当前最大的工程债

**现状**（`server.ts:56-77, 106-143`）

两套 HTTP 后端并存：
- **Hono**：`createHono()` + `adapter.create(app)`，现有稳态
- **effect-httpapi**：`createHttpApi()` + `ExperimentalHttpApiServer`，通过 `OPENCODE_EXPERIMENTAL_HTTPAPI` 切换
- 同时存在 `openapi()`（基于 HttpApi）与 `openapiHono()`（基于 Hono），后者注释明确写着「once the Hono backend is deleted that helper goes with it」

**问题**

| 维度 | Hono | HttpApi | 影响 |
|---|---|---|---|
| `/event` SSE 体 | `{id, type, properties}` | `Sse.Event` 包 `{_tag, event, data: JSON.stringify(...)}` | 客户端要写两套解析 |
| `/global/event` | 多一层 `{payload: ...}` wrapper | 无 | 同一系统三种格式 |
| 错误响应 | `NamedError.toObject()` | `errorLayer` 输出的 schema | SDK 需 `matchLegacyOpenApi()` 兜底 |
| Auth 401 | basicAuth 无 body | `HttpApiError.UnauthorizedNoContent` | 客户端识别不一致 |

**建议**

参照 Claude Code 的 `feature()` + DCE 思路：

- **设迁移截止日期**：给 Hono 路径加 `OPENCODE_FORCE_HONO` 环境变量 + 启动期警告 log，仅作应急回退
- **统一 wire 格式**：抽 `shared/sse-format.ts`，两后端调用同一编码函数，杜绝 `payload` wrapper 仅出现在 global 这种不对称
- **删除兼容补丁**：把 `openapiHono()` 与 `matchLegacyOpenApi()` 的清理作为迁移完成的 acceptance gate

---

### 2. SSE / 事件流的资源生命周期

**现状**（`event.ts:40-90`、`global.ts:22-72`）

```ts
const q = new AsyncQueue<string | null>()           // 无界
const heartbeat = setInterval(..., 10_000)           // 没 unref()
const unsub = Bus.subscribeAll(event => q.push(...)) // 直接 push 到队列
```

**问题**

- `AsyncQueue` 没有容量限制，慢客户端会让序列化好的事件在内存里堆积
- `setInterval` 句柄未 `unref()`，进程退出仍会被 interval 阻塞最多 10s
- 一旦 `Bus.subscribeAll` 的 handler 抛错，订阅状态与 `done` 标志会不一致

**对比 Claude Code**

QueryEngine 的流式输出走 `AsyncGenerator` + `AbortController`，每次 yield 都受控；compact 模块还有 `contentReplacementState` 这种「会话级预算」。

**建议**

```ts
// shared/sse-stream.ts（新建，两后端共享）
export function createSseStream(opts: {
  signal: AbortSignal
  maxQueueDepth?: number          // 默认 1024
  onOverflow?: 'drop-oldest' | 'close'
  heartbeatMs?: number
}) { ... }
```

- `AsyncQueue` 加水位阈值，超过 `maxQueueDepth` 时按策略 `drop-oldest`（事件流幂等的话）或主动 close
- `setInterval(...).unref()`（Bun/Node 都支持）
- `Bus.subscribeAll` 的 handler 用 try/catch 包裹

---

### 3. 全局副作用：`initProjectors()` 没有作用域

**现状**（`server.ts:33`、`projectors.ts:28`）

```ts
initProjectors()          // 模块顶层就执行
```

**问题**

- 模块 load 时就建立订阅，无论是否真启动 server（仅跑 `openapi()` 也会触发）
- 没有 dispose 钩子，`global-lifecycle.ts` 的 `disposeAllInstancesAndEmitGlobalDisposed` 不覆盖 projectors

**对比 Claude Code**

`bootstrap/state.ts` 注释明确禁止增加全局单例；OpenTelemetry 是懒加载（注释写着「避免冷启动 ~1MB 开销」）。

**建议**

- `initProjectors()` 改 `getProjectors()`，第一次调用才建立订阅，unsubscribe 句柄存到模块级 Set
- `listen()` 关停的 finally 调用 `disposeProjectors()`，与 MDNS unpublish 同级
- 更彻底：装到 Effect Layer，仅在 server `Scope` 内存活

---

## 二、可观测性：缺少请求关联

### 4. 请求级别没有 trace id

**现状**（`middleware.ts:20-73`）

```ts
log.error("failed", { error: err })       // 不带请求标识
log.info("request", attributes)            // 只有 method / path
```

错误日志和访问日志无法关联。一个 SSE 长连接 30 分钟里产生的 100 行 log 全部混在一起。

**对比 Claude Code**

所有 service log 都通过 `Log.create({ service })` 拿到 logger，但 QueryEngine 内部还有 sessionId / agentId / conversationId 三层链路。

**建议**

1. `AuthMiddleware` 之前加 `RequestIdMiddleware`：
   ```ts
   const id = c.req.header('x-request-id') ?? crypto.randomUUID()
   c.set('requestId', id)
   c.res.headers.set('x-request-id', id)
   ```
2. 从 Hono context（或 Effect FiberRef）取 `requestId`，注入到 log attributes
3. SSE 路由记录 `connectedRequestId`，断开时打 `event disconnected` 必须带这个 id

---

### 5. `LoggerMiddleware` 的 timer 没绑 status

**现状**（`middleware.ts:69-72`）

```ts
const timer = log.time("request", attributes)
await next()
timer.stop()
```

- 没记录最终 status code，无法做 P95 监控
- 没记录 response size，gzip 是否生效不可见

**建议**

```ts
await next()
timer.stop({ status: c.res.status, bytes: c.res.headers.get('content-length') })
```

---

## 三、安全：几个值得收紧的口子

### 6. CORS 对无 Origin 默认放行

**现状**（`cors.ts:11-12`）

```ts
export function isAllowedCorsOrigin(input: string | undefined, opts?: CorsOptions) {
  if (!input) return true   // ← 无 Origin header 直接放行
```

非浏览器请求（curl、SSRF 受害脚本）都会落到这条分支。结合 `AuthMiddleware` 在 `OPENCODE_SERVER_PASSWORD` 未设置时也直接放行（`middleware.ts:48`），等于**默认部署模式下任意来源都能访问 instance API**。

**建议**

- 区分两个语义：`isAllowedCorsOrigin`（CORS 决策）与 `isAllowedRequestOrigin`（同源校验）。`cors.ts:22` 已有后者但没在 middleware 里使用
- 非安全方法（POST/PATCH/DELETE）启用 `isAllowedRequestOrigin(origin, host)`，缺 Origin 时**仅允许同源 host**
- 文档加一句：「监听 0.0.0.0 + 未设置密码 = 任意来源可读写，禁止生产使用」

---

### 7. PTY ticket 验证下沉到 handler

**现状**（`shared/pty-ticket.ts` + `middleware.ts:50`）

```ts
if (isPtyConnectPath(c.req.path) && c.req.query(PTY_CONNECT_TICKET_QUERY)) return next()
```

中间件只检查 ticket query 参数**存在**，不验证有效性。真实校验在 handler 内——这意味着任何 `/pty/<id>/connect?ticket=anything` 都能跳过 basicAuth 进入 handler。

**建议**

- 在 middleware 层就调 `PtyTickets.verify(ticket)`（不存在/过期/已用直接 401），失败时不要透露失败原因
- ticket 单次使用：成功后立即作废（`pending` → `consumed`）

---

### 8. 路径穿越缺乏显式校验

**现状**（`routes/instance/middleware.ts:9-18`）

```ts
const raw = c.req.query("directory") || c.req.header("x-opencode-directory") || process.cwd()
const directory = AppFileSystem.resolve(decodeURIComponent(raw))
```

`AppFileSystem.resolve` 把任意路径解析为绝对路径，没有「必须落在某个 workspace 根目录下」的限制。

**建议**

- 参考 Claude Code 的 `additionalWorkingDirectories: Map<string, AdditionalWorkingDirectory>` 模型：维护白名单，`resolve()` 后必须 `startsWith` 白名单中的某个根
- 如果 instance 是 multi-tenant 模式，`directory` 应该不可外部覆盖，只能由 control-plane 派发的 workspace 决定

---

### 9. `auth_token` query 参数会进 access log 与浏览器历史

**现状**（`middleware.ts:53`）

```ts
if (c.req.query("auth_token")) c.req.raw.headers.set("authorization", `Basic ${c.req.query("auth_token")}`)
```

代码注释已预警（`middleware.ts:65`：「如果未来日志加 URL 字段，记得脱敏」），但目前没做。

**建议**

- 如果一定要支持 query 鉴权，立即把 `auth_token` 从 URL 中**剥离**：避免下游中间件/proxy log 记到
- 优先推 cookie 或 `Sec-WebSocket-Protocol` 挟带 token

---

## 四、性能与扩展性

### 10. `FenceMiddleware` 在每次写请求做两次全表扫描

**现状**（`fence.ts:7-20` + `shared/fence.ts:14-24`）

```ts
const prev = load()      // SELECT * FROM event_sequence
await next()
const current = diff(prev, load())  // 又一次 SELECT *
```

- 每个 POST/PATCH/DELETE 都两次 `SELECT * FROM EventSequenceTable`
- 这是同步 sqlite 调用（`Database.use((db) => db.select().all())`），落在 event loop 上
- 表大小随 aggregate 数量线性增长

**建议**

- **Hot path 优化**：维护一个内存 `Map<aggregate_id, seq>` 镜像，仅写 fence 表的事务才更新它，`load()` 直接读 Map
- **增量化**：`load(ids?)` 已支持按 id 过滤，让下游路由声明它**会写**的 aggregate id，只 diff 这些
- 给 `EventSequenceTable.aggregate_id` 加 covering index（如果 drizzle 没声明）

---

### 11. `createHono` 在每次 listen 时都重新构建路由树

**现状**（`server.ts:106-143`）

`create(opts)` 在 `listenLegacy` 里被调用，每次 `Server.listen()` 都新建一个 `new Hono()` + 注册所有 route。`Default()` 走 `lazy()` 缓存，`create()` 不缓存。

**问题**

对单进程多次 listen/stop 的场景（测试、热重启）会重复编译路由。

**建议**

- 把 route 注册（不含 cors/opts 相关部分）抽到一个 `lazy()`，再用 `app.route("/", routes())` 套用
- 或直接共享 `DefaultHono()` 的 app，把 cors options 注入到 middleware 而非整个 app

---

### 12. 没有 fast-path / 预热机制

**对比 Claude Code**

`cli.tsx` 顶部用 `await import(...)` + `feature()` 把 `--version`、`--dump-system-prompt`、daemon worker 等做成 fast-path，避免加载 ~135ms 的主模块依赖。

**opencode 服务端机会点**

- `/health`（`global.ts:77-96`）目前要走完所有 middleware（Auth / Logger / Compression / Cors）才返回 `{healthy:true}`。负载均衡 health check 调用频次高时，建议：
  ```ts
  // 在 ErrorMiddleware 之前加
  app.get('/health', c => c.json({ healthy: true, version: ... }))
  ```
  或单独建一个无中间件的 sub-app
- `MDNS.publish` 在 `listen` 完成后才调用，可以提前 prefetch；首次 OAuth keychain / `loadPolicyLimits` 类的 IO 也可以并行启动（参考 Claude Code 的 `startKeychainPrefetch` / `startMdmRawRead`）

---

### 13. WebSocket / 长连接缺背压与上限

**现状**（`websocket-tracker.ts:17`）

```ts
const sockets = new Set<Close>()
```

- 没有 max connections
- 没有 per-IP / per-workspace 限流
- `closeAll` 是 `concurrency: "unbounded"`（line 41），关停千连接时会瞬间冲掉 1s timeout

**建议**

- 加 `MAX_WEBSOCKETS`（默认 256）软上限，超过返回 503 + Retry-After
- `closeAll` 的 concurrency 改为 64，避免 close 风暴
- per-connection 的 `Effect.timeout` 在 register 阶段就生效，确保握手挂掉也会自释放

---

## 五、代码层面的小优化

### 14. 正则在每次请求重新解析

**现状**（`middleware.ts:89`）

```ts
if (method === "POST" && /\/session\/[^/]+\/(message|prompt_async)$/.test(path)) return next()
```

正则字面量在 v8 里会缓存，但写法不友好。

**建议**

```ts
const SKIP_COMPRESSION_POST = /\/session\/[^/]+\/(message|prompt_async)$/
const SKIP_COMPRESSION_PATHS = new Set(['/event', '/global/event'])
```

顶层提出，加注释解释为什么 skip（这两个是 SSE / 大 prompt body）。

---

### 15. `disposeAfterResponse` 的清理依赖 middleware 必跑

**现状**（`httpapi/lifecycle.ts:16-52`）

```ts
const disposeAfterResponse = new WeakMap<object, MarkedInstance>()
```

WeakMap 防泄漏没问题，但**当 response 由 stream/upgrade 提前发出时，dispose middleware 不会跑**。

**建议**

- 换成 `FinalizationRegistry` 兜底（GC 时回收），WeakMap 仅作正常路径加速
- 或用 Effect 的 `Scope` + `addFinalizer` 严格绑生命周期，stream/upgrade 路径也走 scope

---

### 16. `globalThis.AI_SDK_LOG_WARNINGS = false` 有副作用风险

**现状**（`server.ts:30-31`）

顶层写 globalThis，影响整个进程内所有 ai-sdk 实例，包括测试套件。

**建议**

- 用 ai-sdk 的 logger 接口（`createOpenAI({ logger: noop })`）按 client 注入
- 或在 server 启动函数里临时 set，stop 时恢复

---

### 17. `routes/global.ts` 里 `event: any`

**现状**（`global.ts:132`）

```ts
async function handler(event: any) {
  q.push(JSON.stringify(event))
}
```

- 没 schema 校验
- 直接 `JSON.stringify` 一个 any，如果 event 含 `BigInt` 或 `circular ref` 会抛错并把整个流拉死

**建议**

```ts
async function handler(event: GlobalEvent) {
  try {
    q.push(JSON.stringify(event))
  } catch (err) {
    log.error('failed to serialize global event', { type: event?.payload?.type, err })
  }
}
```

顺便给 `GlobalBus.emit` 接口加 zod schema 校验，发布期就拦下脏事件。

---

## 六、按优先级汇总

| 优先级 | 项目 | 文件 | 估工 |
|---|---|---|---|
| **P0** | CORS 默认放行 + Auth 默认空密码 (#6) | `cors.ts:12`, `middleware.ts:48` | 0.5d |
| **P0** | PTY ticket 校验下沉到 middleware (#7) | `middleware.ts:50`, `shared/pty-ticket.ts` | 1d |
| **P0** | SSE 队列加上限 + interval `unref()` (#2) | `event.ts:40-60`, `global.ts:22-72` | 1d |
| **P1** | 请求 trace id + 错误日志关联 (#4) | `middleware.ts:20-73` | 1d |
| **P1** | Fence 内存镜像替代每请求两次全表扫 (#10) | `shared/fence.ts:14-24` | 2d |
| **P1** | 路径穿越白名单校验 (#8) | `routes/instance/middleware.ts:7-18` | 1d |
| **P2** | `/health` fast-path / 中间件旁路 (#12) | `server.ts`, `routes/global.ts:77` | 0.5d |
| **P2** | `auth_token` query 脱敏 (#9) | `middleware.ts:53-65` | 0.5d |
| **P2** | WebSocket 总数与 close concurrency 上限 (#13) | `websocket-tracker.ts:17,41` | 1d |
| **P2** | SSE wire format 收敛 (#1 子项) | `shared/sse-format.ts`（新建） | 2d |
| **P3** | `initProjectors` 加 dispose (#3) | `server.ts:33`, `projectors.ts` | 0.5d |
| **P3** | LoggerMiddleware timer 加 status/bytes (#5) | `middleware.ts:69-72` | 0.25d |
| **P3** | `disposeAfterResponse` 兜底 (#15) | `httpapi/lifecycle.ts` | 1d |
| **P4** | 双后端正式选定截止日期、移除 `matchLegacyOpenApi` (#1) | `server.ts`, `public.ts:96-197` | 持续推进 |
| **P4** | `globalThis.AI_SDK_LOG_WARNINGS` 局部化 (#16) | `server.ts:30` | 0.25d |
| **P4** | 路径正则提到顶层 (#14) | `middleware.ts:89` | 0.25d |
| **P4** | `event: any` 收类型 (#17) | `global.ts:132` | 0.5d |

---

## 七、对照 Claude Code 的几个高层启发

### 1. fast-path 思想

Claude Code 在 `cli.tsx` 用动态 import 让冷启动只支付必要的代价。opencode 服务端可以在 listen 之前**并行预热**（MDNS / DB / GrowthBook 等同 Claude Code 的 `startKeychainPrefetch`），并把 `/health` 类轻路由旁路所有中间件。

### 2. 会话级预算

Claude Code 的 `contentReplacementState` 让「工具结果占满上下文」这种次生问题被显式预算。opencode 的 SSE 队列、WebSocket 集合、Fence 表都缺类似硬上限，长期容易出现「看起来正常但内存悄悄涨」。

### 3. 生命周期闭环

Claude Code 的 `ToolUseContext` 把 abort、清理、通知、UI 副作用都注入；opencode 的 lifecycle 分散在 `disposeAfterResponse` / `WebSocketTracker` / `initProjectors` / `MDNS.unpublish` 里。建议建立统一的 `ServerScope`（基于 Effect Scope），所有可清理资源都 `addFinalizer`，`stop()` 一把 close。

### 4. 特性裁剪

Claude Code 用 `feature()` 在编译期 DCE 掉整个分支。opencode 双后端切换是运行时 if，建议至少给 effect-httpapi 路径加一个 `OPENCODE_LEGACY_HONO=1` 兜底环境变量，正常构建直接 DCE 掉 Hono backend，减小包体与攻击面。

### 5. OpenAPI 单一来源

`openapi()` 与 `openapiHono()` 双源 + `matchLegacyOpenApi()` 兼容补丁是技术债典型。一旦完成迁移，这部分清理本身就是最大的可读性提升。

---

## 附：最值得马上动手的三件

1. **CORS + Auth 默认放行**（`cors.ts:12` + `middleware.ts:48`）
   任意来源默认可读写，是部署红线
2. **PTY ticket 中间件层校验**（`middleware.ts:50`）
   当前等于让 `/pty/<id>/connect?ticket=anything` 跳过 basicAuth
3. **SSE 队列加上限 + `setInterval.unref()`**（`event.ts:40-60`、`global.ts:22-72`）
   慢客户端会让内存悄悄涨，属于「看起来正常的内存炸弹」

其余偏架构债（双后端 wire 格式收敛、Fence 表内存镜像、统一 `ServerScope` 生命周期），建议放到一个迁移迭代里集中推。

---

*文档基于 `D:/Desktop/开发工具/openCode/opencode/packages/opencode/src/server/` 的源码静态扫描；行号引用基于扫描时点。*
