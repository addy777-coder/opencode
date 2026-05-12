# OpenCode GUI 本地版

这份 README 描述当前本地工作树的实际功能，而不是上游 OpenCode 的通用安装页。
当前桌面端主线是 `packages/gui` 中的 Tauri + React GUI，后端由
`packages/opencode` 中的 OpenCode agent/server 提供。

旧的 `packages/app` 前端和 Electron `packages/desktop` 桌面壳已经不再是当前 GUI
方向。新的桌面端功能、修复和发布流程都应围绕 `packages/gui` 进行。

## 当前功能

- 基于 React 18、Vite、Tailwind CSS 和 Tauri v2 的桌面 GUI。
- 支持连接、启动和停止本地 OpenCode server，并清理 GUI 自己启动的 server 进程。
- 支持选择工作区，并在 Tauri/Rust 侧持久化最近工作区。
- 会话侧边栏展示顶层对话，并支持归档会话。
- 线程视图支持用户/助手消息、工具输出、Markdown 渲染、diff 摘要和进度摘要。
- 输入框支持文本、文件/图片附件、模型选择和权限模式。
- 支持 OpenCode 的权限请求和问题确认流程，可直接在 GUI 中处理。
- 支持 provider、模型、第三方 API、常用模型和隐藏模型等设置。
- 支持对当前工作区进行文件搜索、文本搜索和符号搜索。
- 支持通过 OpenCode 后端 PTY API 使用集成终端。
- 支持 Skills、MCP/browser 配置辅助和项目个性化设置。
- 支持通过 Tauri 构建 Windows NSIS 安装包。

## 目录结构

- `packages/gui`：当前桌面 GUI 和 Tauri 壳。
- `packages/gui/src`：React 应用代码、功能模块、UI 组件、查询缓存逻辑和前端测试。
- `packages/gui/src-tauri`：Rust 命令、SQLite 本地存储、进程生命周期、OpenCode API 桥接和 Tauri 配置。
- `packages/opencode`：OpenCode CLI、HTTP API、会话运行时、provider、权限、问题、终端 API 和 agent 执行逻辑。
- `packages/console`：console/docs Web 应用及相关服务。
- `packages/sdk`：SDK 包。
- `packages/ui`、`packages/core`、`packages/plugin`、`packages/script`：共享库和项目工具。
- `.github`、`infra`、`nix`、`script`、`docs`、`specs`：CI、发布、部署、打包、文档和设计资料。

## 环境要求

- Bun `1.3.13`。
- Rust 工具链。
- Tauri v2 桌面开发依赖。
- Windows 环境需要 Microsoft C++ Build Tools 和 WebView2。

在本目录安装依赖：

```bash
bun install
```

## 启动当前 GUI

在本仓库目录运行：

```bash
bun run dev:gui
```

该命令会启动 Tauri 桌面应用。前端开发服务地址为：

```text
http://127.0.0.1:1420
```

GUI 默认连接本地 OpenCode server：

```text
http://127.0.0.1:4096
```

本地模式下，如果该地址已有 server，GUI 会直接连接；如果不可用，GUI 可以启动一个
自己管理的 OpenCode server。GUI 断开或退出时，会清理自己启动的 server 进程。

父级工作区也提供同名入口：

```bash
bun run dev:gui
```

当你在本仓库上一层目录工作时，可以使用这个入口。

## 常用命令

```bash
# 启动 Tauri 桌面 GUI
bun run dev:gui

# 构建 Tauri 桌面 GUI
bun run build:gui

# 启动 OpenCode CLI/server 开发入口
bun run dev

# 启动 console Web 应用
bun run dev:console

# 启动 Storybook
bun run dev:storybook

# lint 和整体 typecheck
bun run lint
bun run typecheck
```

根目录的 `test` 脚本会故意退出，请在具体 package 目录运行测试。

## GUI 开发命令

```bash
cd packages/gui

# 只启动 Vite 前端服务
bun run dev

# 启动 Tauri 桌面应用
bun run tauri:dev

# 构建前端
bun run build

# 运行 GUI 单元测试
bun run test

# GUI typecheck
bun run typecheck

# 构建 Tauri 安装包
bun run tauri:build
```

## 后端开发命令

```bash
cd packages/opencode

# 启动开发入口
bun run dev

# 运行单元测试
bun run test

# 后端 typecheck
bun run typecheck

# 构建后端包
bun run build
```

## 验证方式

按改动范围选择最小但足够的验证命令：

```bash
# 通用检查
bun run lint
bun run typecheck

# GUI 检查
cd packages/gui
bun run typecheck
bun run test
bun run build

# 后端检查
cd packages/opencode
bun run typecheck
bun run test
```

如果修改了 Rust/Tauri 侧代码，请在 `packages/gui/src-tauri` 运行对应 Cargo 命令，
或在 `packages/gui` 运行对应 Tauri 命令。

## GUI 发布构建

当前 GUI bundle 目标是 Windows NSIS：

```bash
bun run build:gui
```

本地安装包产物会输出到：

```text
packages/gui/src-tauri/target/release/bundle/nsis/
```

GUI 打包对应的 GitHub Actions workflow 是：

```text
.github/workflows/publish-gui.yml
```

主 CLI/npm 发布流程不应再依赖已删除的 Electron desktop 产物。

## 开发注意事项

- GUI 工作统一放在 `packages/gui`。
- 不要为了桌面端修复恢复 `packages/app` 或 `packages/desktop`。
- 优先使用现有本地 helper 和 Bun API。
- 修改代码前阅读并遵循 `AGENTS.md`。
- 需要 package 级 typecheck 时，在对应 package 目录运行。
- 当前工作树可能有其它未完成改动，提交或修改时保持范围收敛。

## 上游资料

如果需要查看上游 OpenCode 的用户文档、安装方式或发行信息：

- <https://opencode.ai>
- <https://opencode.ai/docs>
- <https://github.com/anomalyco/opencode>
