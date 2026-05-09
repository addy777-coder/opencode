use crate::error::command_error;
use crate::events;
use crate::opencode::{self, ServerMode, ServerStatus};
use crate::state::AppState;
use crate::storage;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::io::Read;
use std::path::{Path, PathBuf};
use std::process::Command;
use tauri::{AppHandle, State};
use tauri_plugin_dialog::DialogExt;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AppInitResult {
    pub version: String,
    pub database_ready: bool,
    pub server: ServerStatus,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PlaywrightInstallState {
    pub root_path: String,
    pub root_exists: bool,
    pub env_override: Option<String>,
    pub chromium: bool,
    pub firefox: bool,
    pub webkit: bool,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FilePreview {
    pub path: String,
    pub name: String,
    pub size: u64,
    pub content: Option<String>,
    pub truncated: bool,
    pub binary: bool,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FileTreeInput {
    pub directory: String,
    pub root: Option<String>,
    pub max_depth: Option<u32>,
    pub max_entries: Option<usize>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FileTreeEntry {
    pub path: String,
    pub name: String,
    pub kind: String,
    pub depth: u32,
    pub size: Option<u64>,
    pub modified: Option<i64>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ServerStartInput {
    pub base_url: Option<String>,
    pub mode: Option<ServerMode>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceOpenInput {
    pub path: String,
    pub name: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceRemoveInput {
    pub id: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionListInput {
    pub base_url: Option<String>,
    pub directory: Option<String>,
    pub limit: Option<u32>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionStatusInput {
    pub base_url: Option<String>,
    pub directory: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionCreateInput {
    pub base_url: Option<String>,
    pub directory: Option<String>,
    pub title: Option<String>,
    pub permission: Option<Vec<opencode::PermissionRule>>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionUpdateTitleInput {
    pub base_url: Option<String>,
    pub directory: Option<String>,
    pub session_id: String,
    pub title: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionUpdatePermissionInput {
    pub base_url: Option<String>,
    pub directory: Option<String>,
    pub session_id: String,
    pub permission: Vec<opencode::PermissionRule>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionForkInput {
    pub base_url: Option<String>,
    pub directory: Option<String>,
    pub session_id: String,
    pub message_id: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionPromptInput {
    pub base_url: Option<String>,
    pub directory: Option<String>,
    pub session_id: String,
    pub text: String,
    pub attachments: Option<Vec<opencode::PromptAttachment>>,
    pub system: Option<String>,
    pub agent: Option<String>,
    pub provider_id: Option<String>,
    pub model_id: Option<String>,
    pub permission: Option<Vec<opencode::PermissionRule>>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionAbortInput {
    pub base_url: Option<String>,
    pub directory: Option<String>,
    pub session_id: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionDeleteInput {
    pub base_url: Option<String>,
    pub directory: Option<String>,
    pub session_id: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionMessageDeleteInput {
    pub base_url: Option<String>,
    pub directory: Option<String>,
    pub session_id: String,
    pub message_id: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionMessageUpdateTextInput {
    pub base_url: Option<String>,
    pub directory: Option<String>,
    pub session_id: String,
    pub message_id: String,
    pub part_id: String,
    pub part: serde_json::Value,
    pub text: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionMessagesInput {
    pub base_url: Option<String>,
    pub directory: Option<String>,
    pub session_id: String,
    pub limit: Option<u32>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionDiffInput {
    pub base_url: Option<String>,
    pub directory: Option<String>,
    pub session_id: String,
    pub message_id: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExecutionOptionsInput {
    pub base_url: Option<String>,
    pub directory: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FileSearchInput {
    pub base_url: Option<String>,
    pub directory: Option<String>,
    pub query: String,
    pub limit: Option<u32>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GitStatusInput {
    pub directory: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceFileDiffInput {
    pub directory: String,
    pub files: Vec<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceFileDiff {
    pub file: String,
    pub patch: String,
    pub additions: u32,
    pub deletions: u32,
    pub status: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitStatus {
    pub root_path: String,
    pub branch: Option<String>,
    pub detached: bool,
    pub dirty: bool,
    pub ahead: u32,
    pub behind: u32,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CommandListInput {
    pub base_url: Option<String>,
    pub directory: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PtyListInput {
    pub base_url: Option<String>,
    pub directory: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PtyCreateInput {
    pub base_url: Option<String>,
    pub directory: Option<String>,
    pub command: Option<String>,
    pub args: Option<Vec<String>>,
    pub cwd: Option<String>,
    pub title: Option<String>,
    pub env: Option<serde_json::Map<String, Value>>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PtyUpdateInput {
    pub base_url: Option<String>,
    pub directory: Option<String>,
    pub pty_id: String,
    pub title: Option<String>,
    pub size: Option<opencode::PtySize>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PtyIdInput {
    pub base_url: Option<String>,
    pub directory: Option<String>,
    pub pty_id: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct McpStatusInput {
    pub base_url: Option<String>,
    pub directory: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct McpAddInput {
    pub base_url: Option<String>,
    pub directory: Option<String>,
    pub name: String,
    pub config: Value,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct McpNameInput {
    pub base_url: Option<String>,
    pub directory: Option<String>,
    pub name: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ThirdPartyProviderApplyInput {
    pub base_url: Option<String>,
    pub provider: opencode::ThirdPartyProviderConfig,
    pub api_key: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ThirdPartyProviderRemoveInput {
    pub base_url: Option<String>,
    pub provider_id: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProviderModelsInput {
    pub request_url: String,
    pub api_key: String,
    pub protocol: String,
    pub headers: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PermissionListInput {
    pub base_url: Option<String>,
    pub directory: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PermissionReplyInput {
    pub base_url: Option<String>,
    pub directory: Option<String>,
    pub request_id: String,
    pub reply: String,
    pub message: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct QuestionListInput {
    pub base_url: Option<String>,
    pub directory: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct QuestionReplyInput {
    pub base_url: Option<String>,
    pub directory: Option<String>,
    pub request_id: String,
    pub answers: Vec<Vec<String>>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct QuestionRejectInput {
    pub base_url: Option<String>,
    pub directory: Option<String>,
    pub request_id: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum OpenPathTarget {
    Terminal,
    Editor,
    System,
    Cursor,
    Explorer,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum IntegratedShell {
    Powershell,
    Cmd,
    Gitbash,
}

#[tauri::command]
pub async fn app_init(state: State<'_, AppState>) -> Result<AppInitResult, String> {
    let server = state.server.read().await.clone();
    Ok(AppInitResult {
        version: state.info.version.clone(),
        database_ready: state.info.database_ready,
        server,
    })
}

#[tauri::command]
pub async fn server_start(
    input: ServerStartInput,
    app: AppHandle,
    state: State<'_, AppState>,
) -> Result<ServerStatus, String> {
    let base_url = input
        .base_url
        .unwrap_or_else(|| "http://127.0.0.1:4096".to_string());
    let mode = input.mode.unwrap_or(ServerMode::Local);
    let mut healthy = opencode::check_health(&base_url).await.unwrap_or(false);

    if !healthy && matches!(mode, ServerMode::Local) {
        let mut child_guard = state.opencode_child.lock().await;
        if child_guard
            .as_mut()
            .and_then(|child| child.try_wait().ok().flatten())
            .is_some()
        {
            *child_guard = None;
        }
        if child_guard.is_none() {
            let child = opencode::start_local_server(&base_url).await?;
            *child_guard = Some(child);
        }
        drop(child_guard);
        healthy = opencode::wait_until_healthy(&base_url, 24).await;
    }

    let status = ServerStatus {
        healthy,
        mode,
        base_url: Some(base_url.clone()),
        message: if healthy {
            "OpenCode server 状态正常".to_string()
        } else {
            "暂时无法连接 OpenCode server；本地启动可能仍在初始化，或端口被其他程序占用。"
                .to_string()
        },
    };

    *state.server.write().await = status.clone();
    if status.healthy {
        events::start_global_bridge(app, state.event_bridge.clone(), base_url).await;
    } else {
        events::stop_global_bridge(state.event_bridge.clone()).await;
    }
    Ok(status)
}

#[tauri::command]
pub async fn server_stop(state: State<'_, AppState>) -> Result<(), String> {
    events::stop_global_bridge(state.event_bridge.clone()).await;
    if let Some(child) = state.opencode_child.lock().await.take() {
        opencode::stop_local_server(child).await;
    }
    *state.server.write().await = ServerStatus::unconfigured();
    Ok(())
}

#[tauri::command]
pub async fn server_status(state: State<'_, AppState>) -> Result<ServerStatus, String> {
    let current = state.server.read().await.clone();
    let Some(base_url) = current.base_url.clone() else {
        return Ok(current);
    };

    let healthy = opencode::check_health(&base_url).await.unwrap_or(false);
    let status = ServerStatus {
        healthy,
        message: if healthy {
            "OpenCode server 状态正常".to_string()
        } else {
            "暂时无法连接 OpenCode server".to_string()
        },
        ..current
    };

    *state.server.write().await = status.clone();
    Ok(status)
}

#[tauri::command]
pub async fn thread_activity_recent(
    state: State<'_, AppState>,
) -> Result<Vec<events::ThreadActivityItem>, String> {
    Ok(events::recent_activity(state.event_bridge.clone()).await)
}

#[tauri::command]
pub async fn session_list(
    input: SessionListInput,
    state: State<'_, AppState>,
) -> Result<Vec<opencode::SessionInfo>, String> {
    let base_url = resolve_base_url(input.base_url, &state).await?;

    opencode::list_sessions(
        &base_url,
        input.directory.as_deref(),
        input.limit.unwrap_or(50),
    )
    .await
    .map_err(command_error)
}

#[tauri::command]
pub async fn session_status(
    input: SessionStatusInput,
    state: State<'_, AppState>,
) -> Result<Value, String> {
    let base_url = resolve_base_url(input.base_url, &state).await?;
    opencode::session_status(&base_url, input.directory.as_deref())
        .await
        .map_err(command_error)
}

#[tauri::command]
pub async fn session_create(
    input: SessionCreateInput,
    state: State<'_, AppState>,
) -> Result<opencode::SessionInfo, String> {
    let base_url = resolve_base_url(input.base_url, &state).await?;
    opencode::create_session(
        &base_url,
        input.directory.as_deref(),
        input.title.as_deref(),
        input.permission.as_deref(),
    )
    .await
    .map_err(command_error)
}

#[tauri::command]
pub async fn session_update_title(
    input: SessionUpdateTitleInput,
    state: State<'_, AppState>,
) -> Result<opencode::SessionInfo, String> {
    let title = input.title.trim();
    if title.is_empty() {
        return Err("会话标题不能为空".to_string());
    }

    let base_url = resolve_base_url(input.base_url, &state).await?;
    opencode::update_session_title(
        &base_url,
        input.directory.as_deref(),
        &input.session_id,
        title,
    )
    .await
    .map_err(command_error)
}

#[tauri::command]
pub async fn session_update_permission(
    input: SessionUpdatePermissionInput,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let base_url = resolve_base_url(input.base_url, &state).await?;
    opencode::update_session_permission(
        &base_url,
        input.directory.as_deref(),
        &input.session_id,
        &input.permission,
    )
    .await
    .map_err(command_error)
}

#[tauri::command]
pub async fn session_fork(
    input: SessionForkInput,
    state: State<'_, AppState>,
) -> Result<opencode::SessionInfo, String> {
    let base_url = resolve_base_url(input.base_url, &state).await?;
    opencode::fork_session(
        &base_url,
        input.directory.as_deref(),
        &input.session_id,
        input.message_id.as_deref(),
    )
    .await
    .map_err(command_error)
}

#[tauri::command]
pub async fn session_prompt(
    input: SessionPromptInput,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let has_attachments = input
        .attachments
        .as_ref()
        .map(|items| !items.is_empty())
        .unwrap_or(false);
    if input.text.trim().is_empty() && !has_attachments {
        return Err("请输入要交给 OpenCode 执行的任务".to_string());
    }

    let base_url = resolve_base_url(input.base_url, &state).await?;
    opencode::prompt_session(
        &base_url,
        input.directory.as_deref(),
        &input.session_id,
        input.text.trim(),
        input.attachments.as_deref(),
        input.system.as_deref(),
        input.agent.as_deref(),
        input.provider_id.as_deref(),
        input.model_id.as_deref(),
        input.permission.as_deref(),
    )
    .await
    .map_err(command_error)
}

#[tauri::command]
pub async fn session_abort(
    input: SessionAbortInput,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let base_url = resolve_base_url(input.base_url, &state).await?;
    opencode::abort_session(&base_url, input.directory.as_deref(), &input.session_id)
        .await
        .map_err(command_error)
}

#[tauri::command]
pub async fn session_delete(
    input: SessionDeleteInput,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let base_url = resolve_base_url(input.base_url, &state).await?;
    opencode::delete_session(&base_url, input.directory.as_deref(), &input.session_id)
        .await
        .map_err(command_error)
}

#[tauri::command]
pub async fn session_message_delete(
    input: SessionMessageDeleteInput,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let base_url = resolve_base_url(input.base_url, &state).await?;
    opencode::delete_message(
        &base_url,
        input.directory.as_deref(),
        &input.session_id,
        &input.message_id,
    )
    .await
    .map_err(command_error)
}

#[tauri::command]
pub async fn session_message_update_text(
    input: SessionMessageUpdateTextInput,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let base_url = resolve_base_url(input.base_url, &state).await?;
    opencode::update_message_text_part(
        &base_url,
        input.directory.as_deref(),
        &input.session_id,
        &input.message_id,
        &input.part_id,
        &input.part,
        input.text.trim(),
    )
    .await
    .map_err(command_error)
}

#[tauri::command]
pub async fn session_messages(
    input: SessionMessagesInput,
    state: State<'_, AppState>,
) -> Result<Vec<opencode::MessageInfo>, String> {
    let base_url = resolve_base_url(input.base_url, &state).await?;
    opencode::list_messages(
        &base_url,
        input.directory.as_deref(),
        &input.session_id,
        input.limit.unwrap_or(80),
    )
    .await
    .map_err(command_error)
}

#[tauri::command]
pub async fn session_diff(
    input: SessionDiffInput,
    state: State<'_, AppState>,
) -> Result<Vec<opencode::DiffFileInfo>, String> {
    let base_url = resolve_base_url(input.base_url, &state).await?;
    opencode::session_diff(
        &base_url,
        input.directory.as_deref(),
        &input.session_id,
        input.message_id.as_deref(),
    )
        .await
        .map_err(command_error)
}

#[tauri::command]
pub async fn execution_options(
    input: ExecutionOptionsInput,
    state: State<'_, AppState>,
) -> Result<opencode::ExecutionOptions, String> {
    let base_url = resolve_base_url(input.base_url, &state).await?;
    opencode::execution_options(&base_url, input.directory.as_deref())
        .await
        .map_err(command_error)
}

#[tauri::command]
pub async fn file_search(
    input: FileSearchInput,
    state: State<'_, AppState>,
) -> Result<Vec<String>, String> {
    let base_url = resolve_base_url(input.base_url, &state).await?;
    opencode::find_files(
        &base_url,
        input.directory.as_deref(),
        &input.query,
        input.limit.unwrap_or(60),
    )
    .await
    .map_err(command_error)
}

#[tauri::command]
pub async fn command_list(
    input: CommandListInput,
    state: State<'_, AppState>,
) -> Result<Vec<opencode::CommandInfo>, String> {
    let base_url = resolve_base_url(input.base_url, &state).await?;
    opencode::list_commands(&base_url, input.directory.as_deref())
        .await
        .map_err(command_error)
}

#[tauri::command]
pub async fn pty_shells(
    input: PtyListInput,
    state: State<'_, AppState>,
) -> Result<Vec<opencode::PtyShellInfo>, String> {
    let base_url = resolve_base_url(input.base_url, &state).await?;
    opencode::pty_shells(&base_url, input.directory.as_deref())
        .await
        .map_err(command_error)
}

#[tauri::command]
pub async fn pty_list(
    input: PtyListInput,
    state: State<'_, AppState>,
) -> Result<Vec<opencode::PtyInfo>, String> {
    let base_url = resolve_base_url(input.base_url, &state).await?;
    opencode::pty_list(&base_url, input.directory.as_deref())
        .await
        .map_err(command_error)
}

#[tauri::command]
pub async fn pty_create(
    input: PtyCreateInput,
    state: State<'_, AppState>,
) -> Result<opencode::PtyInfo, String> {
    let base_url = resolve_base_url(input.base_url.clone(), &state).await?;
    let request = opencode::PtyCreateRequest {
        command: input.command,
        args: input.args,
        cwd: input.cwd.or_else(|| input.directory.clone()),
        title: input.title,
        env: input.env,
    };
    opencode::pty_create(&base_url, input.directory.as_deref(), &request)
        .await
        .map_err(command_error)
}

#[tauri::command]
pub async fn pty_update(
    input: PtyUpdateInput,
    state: State<'_, AppState>,
) -> Result<opencode::PtyInfo, String> {
    let base_url = resolve_base_url(input.base_url, &state).await?;
    let request = opencode::PtyUpdateRequest {
        title: input.title,
        size: input.size,
    };
    opencode::pty_update(
        &base_url,
        input.directory.as_deref(),
        &input.pty_id,
        &request,
    )
    .await
    .map_err(command_error)
}

#[tauri::command]
pub async fn pty_remove(input: PtyIdInput, state: State<'_, AppState>) -> Result<(), String> {
    let base_url = resolve_base_url(input.base_url, &state).await?;
    opencode::pty_remove(&base_url, input.directory.as_deref(), &input.pty_id)
        .await
        .map_err(command_error)
}

#[tauri::command]
pub async fn pty_connect_token(
    input: PtyIdInput,
    state: State<'_, AppState>,
) -> Result<opencode::PtyConnectToken, String> {
    let base_url = resolve_base_url(input.base_url, &state).await?;
    opencode::pty_connect_token(&base_url, input.directory.as_deref(), &input.pty_id)
        .await
        .map_err(command_error)
}

#[tauri::command]
pub async fn mcp_status(
    input: McpStatusInput,
    state: State<'_, AppState>,
) -> Result<Value, String> {
    let base_url = resolve_base_url(input.base_url, &state).await?;
    opencode::mcp_status(&base_url, input.directory.as_deref())
        .await
        .map_err(command_error)
}

#[tauri::command]
pub async fn mcp_add(input: McpAddInput, state: State<'_, AppState>) -> Result<Value, String> {
    let base_url = resolve_base_url(input.base_url, &state).await?;
    opencode::mcp_add(
        &base_url,
        input.directory.as_deref(),
        input.name.trim(),
        &input.config,
    )
    .await
    .map_err(command_error)
}

#[tauri::command]
pub async fn mcp_connect(input: McpNameInput, state: State<'_, AppState>) -> Result<(), String> {
    let base_url = resolve_base_url(input.base_url, &state).await?;
    opencode::mcp_connect(&base_url, input.directory.as_deref(), input.name.trim())
        .await
        .map_err(command_error)
}

#[tauri::command]
pub async fn mcp_disconnect(input: McpNameInput, state: State<'_, AppState>) -> Result<(), String> {
    let base_url = resolve_base_url(input.base_url, &state).await?;
    opencode::mcp_disconnect(&base_url, input.directory.as_deref(), input.name.trim())
        .await
        .map_err(command_error)
}

#[tauri::command]
pub async fn third_party_provider_apply(
    input: ThirdPartyProviderApplyInput,
    state: State<'_, AppState>,
) -> Result<Value, String> {
    let base_url = resolve_base_url(input.base_url, &state).await?;
    opencode::apply_third_party_provider(&base_url, &input.provider, input.api_key.as_deref()).await
}

#[tauri::command]
pub async fn third_party_provider_remove(
    input: ThirdPartyProviderRemoveInput,
    state: State<'_, AppState>,
) -> Result<Value, String> {
    let base_url = resolve_base_url(input.base_url, &state).await?;
    opencode::remove_third_party_provider(&base_url, &input.provider_id).await
}

#[tauri::command]
pub async fn third_party_provider_models(
    input: ProviderModelsInput,
) -> Result<Vec<String>, String> {
    opencode::fetch_provider_models(&opencode::ProviderModelsRequest {
        request_url: input.request_url,
        api_key: input.api_key,
        protocol: input.protocol,
        headers: input.headers,
    })
    .await
}

#[tauri::command]
pub async fn permission_list(
    input: PermissionListInput,
    state: State<'_, AppState>,
) -> Result<Vec<opencode::PermissionInfo>, String> {
    let base_url = resolve_base_url(input.base_url, &state).await?;
    opencode::list_permissions(&base_url, input.directory.as_deref())
        .await
        .map_err(command_error)
}

#[tauri::command]
pub async fn permission_reply(
    input: PermissionReplyInput,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let base_url = resolve_base_url(input.base_url, &state).await?;
    opencode::reply_permission(
        &base_url,
        input.directory.as_deref(),
        &input.request_id,
        &input.reply,
        input.message.as_deref(),
    )
    .await
    .map_err(command_error)
}

#[tauri::command]
pub async fn question_list(
    input: QuestionListInput,
    state: State<'_, AppState>,
) -> Result<Vec<opencode::QuestionInfo>, String> {
    let base_url = resolve_base_url(input.base_url, &state).await?;
    opencode::list_questions(&base_url, input.directory.as_deref())
        .await
        .map_err(command_error)
}

#[tauri::command]
pub async fn question_reply(
    input: QuestionReplyInput,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let base_url = resolve_base_url(input.base_url, &state).await?;
    opencode::reply_question(
        &base_url,
        input.directory.as_deref(),
        &input.request_id,
        &input.answers,
    )
    .await
    .map_err(command_error)
}

#[tauri::command]
pub async fn question_reject(
    input: QuestionRejectInput,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let base_url = resolve_base_url(input.base_url, &state).await?;
    opencode::reject_question(&base_url, input.directory.as_deref(), &input.request_id)
        .await
        .map_err(command_error)
}

#[tauri::command]
pub async fn workspace_pick(app: AppHandle) -> Result<Option<String>, String> {
    app.dialog()
        .file()
        .set_title("选择工作区")
        .blocking_pick_folder()
        .map(|path| {
            path.into_path()
                .map(|path| path.to_string_lossy().to_string())
                .map_err(command_error)
        })
        .transpose()
}

#[tauri::command]
pub async fn workspace_open(
    input: WorkspaceOpenInput,
    state: State<'_, AppState>,
) -> Result<storage::WorkspaceRecord, String> {
    storage::upsert_workspace(&state.db, &input.path, input.name.as_deref())
        .await
        .map_err(command_error)
}

#[tauri::command]
pub async fn workspace_list(
    state: State<'_, AppState>,
) -> Result<Vec<storage::WorkspaceRecord>, String> {
    storage::list_workspaces(&state.db, 20)
        .await
        .map_err(command_error)
}

#[tauri::command]
pub async fn workspace_remove(
    input: WorkspaceRemoveInput,
    state: State<'_, AppState>,
) -> Result<(), String> {
    storage::remove_workspace(&state.db, &input.id)
        .await
        .map_err(command_error)
}

#[tauri::command]
pub async fn settings_get(
    key: String,
    state: State<'_, AppState>,
) -> Result<Option<Value>, String> {
    storage::get_setting(&state.db, &key)
        .await
        .map_err(command_error)
}

#[tauri::command]
pub async fn settings_set(
    key: String,
    value: Value,
    state: State<'_, AppState>,
) -> Result<(), String> {
    storage::set_setting(&state.db, &key, value)
        .await
        .map_err(command_error)
}

#[tauri::command]
pub async fn open_path(
    path: String,
    target: Option<OpenPathTarget>,
    shell: Option<IntegratedShell>,
) -> Result<(), String> {
    let target = target.unwrap_or(OpenPathTarget::System);
    match target {
        OpenPathTarget::System => opener::open(path).map_err(command_error),
        OpenPathTarget::Editor => {
            open_in_editor(&path).or_else(|_| opener::open(path).map_err(command_error))
        }
        OpenPathTarget::Cursor => {
            open_in_cursor(&path).or_else(|_| opener::open(path).map_err(command_error))
        }
        OpenPathTarget::Explorer => open_in_file_manager(&path)
            .or_else(|_| opener::open(open_target_dir(&path)).map_err(command_error)),
        OpenPathTarget::Terminal => {
            open_in_terminal(&path, shell.unwrap_or(IntegratedShell::Powershell))
                .or_else(|_| opener::open(path).map_err(command_error))
        }
    }
}

#[tauri::command]
pub async fn read_file_preview(path: String) -> Result<FilePreview, String> {
    const PREVIEW_LIMIT: u64 = 512 * 1024;

    let candidate = PathBuf::from(&path);
    let metadata = std::fs::metadata(&candidate).map_err(command_error)?;
    if !metadata.is_file() {
        return Err("只能预览文件。".to_string());
    }

    let mut file = std::fs::File::open(&candidate).map_err(command_error)?;
    let mut bytes = Vec::new();
    file.by_ref()
        .take(PREVIEW_LIMIT + 1)
        .read_to_end(&mut bytes)
        .map_err(command_error)?;

    let truncated = bytes.len() as u64 > PREVIEW_LIMIT;
    if truncated {
        bytes.truncate(PREVIEW_LIMIT as usize);
    }

    let (content, binary) = match String::from_utf8(bytes) {
        Ok(text) => (Some(text), false),
        Err(_) => (None, true),
    };

    Ok(FilePreview {
        path,
        name: candidate
            .file_name()
            .map(|name| name.to_string_lossy().to_string())
            .unwrap_or_else(|| candidate.to_string_lossy().to_string()),
        size: metadata.len(),
        content,
        truncated,
        binary,
    })
}

#[tauri::command]
pub async fn file_tree(input: FileTreeInput) -> Result<Vec<FileTreeEntry>, String> {
    tokio::task::spawn_blocking(move || compute_file_tree(input))
        .await
        .map_err(|err| err.to_string())?
}

#[tauri::command]
pub async fn open_url(url: String) -> Result<(), String> {
    opener::open(url).map_err(command_error)
}

#[tauri::command]
pub async fn detect_playwright_install() -> Result<PlaywrightInstallState, String> {
    let env_override = std::env::var("PLAYWRIGHT_BROWSERS_PATH")
        .ok()
        .filter(|value| !value.trim().is_empty());
    let root = if let Some(path) = env_override.as_deref() {
        PathBuf::from(path)
    } else {
        playwright_browsers_default_path().map_err(command_error)?
    };
    let root_exists = root.is_dir();
    let (chromium, firefox, webkit) = if root_exists {
        (
            dir_has_prefix(&root, "chromium"),
            dir_has_prefix(&root, "firefox"),
            dir_has_prefix(&root, "webkit"),
        )
    } else {
        (false, false, false)
    };

    Ok(PlaywrightInstallState {
        root_path: root.display().to_string(),
        root_exists,
        env_override,
        chromium,
        firefox,
        webkit,
    })
}

#[tauri::command]
pub async fn notify(title: String, body: Option<String>) -> Result<(), String> {
    tracing::info!(title, body = body.unwrap_or_default(), "请求发送系统通知");
    Ok(())
}

#[tauri::command]
pub async fn git_status(input: GitStatusInput) -> Result<Option<GitStatus>, String> {
    let dir = PathBuf::from(&input.directory);
    if !dir.is_dir() {
        return Ok(None);
    }
    // Run the read-only git probes synchronously on a blocking thread —
    // they're fast (a few ms on a healthy repo) and avoid the complexity
    // of mixing tokio::process with the rest of the command surface.
    tokio::task::spawn_blocking(move || compute_git_status(&dir))
        .await
        .map_err(|err| err.to_string())
}

#[tauri::command]
pub async fn workspace_file_diffs(
    input: WorkspaceFileDiffInput,
) -> Result<Vec<WorkspaceFileDiff>, String> {
    let dir = PathBuf::from(&input.directory);
    if !dir.is_dir() || input.files.is_empty() {
        return Ok(Vec::new());
    }
    tokio::task::spawn_blocking(move || compute_workspace_file_diffs(&dir, &input.files))
        .await
        .map_err(|err| err.to_string())
}

fn compute_file_tree(input: FileTreeInput) -> Result<Vec<FileTreeEntry>, String> {
    const DEFAULT_MAX_DEPTH: u32 = 3;
    const DEFAULT_MAX_ENTRIES: usize = 800;
    const HARD_MAX_DEPTH: u32 = 8;
    const HARD_MAX_ENTRIES: usize = 5_000;

    let workspace = PathBuf::from(&input.directory);
    if !workspace.is_dir() {
        return Err("工作区目录不存在。".to_string());
    }
    let workspace_root = workspace.canonicalize().map_err(command_error)?;
    let root = match input.root.as_deref().filter(|value| !value.trim().is_empty()) {
        Some(root) => {
            let candidate = PathBuf::from(root);
            if candidate.is_absolute() {
                candidate
            } else {
                workspace_root.join(candidate)
            }
        }
        None => workspace_root.clone(),
    };
    let root = root.canonicalize().map_err(command_error)?;
    if !root.starts_with(&workspace_root) {
        return Err("只能列出工作区内的文件。".to_string());
    }
    if !root.is_dir() {
        return Err("只能列出目录。".to_string());
    }

    let max_depth = input
        .max_depth
        .unwrap_or(DEFAULT_MAX_DEPTH)
        .clamp(0, HARD_MAX_DEPTH);
    let max_entries = input
        .max_entries
        .unwrap_or(DEFAULT_MAX_ENTRIES)
        .clamp(1, HARD_MAX_ENTRIES);
    let mut entries = Vec::new();
    collect_file_tree(&workspace_root, &root, 0, max_depth, max_entries, &mut entries)?;
    Ok(entries)
}

fn collect_file_tree(
    workspace: &Path,
    dir: &Path,
    depth: u32,
    max_depth: u32,
    max_entries: usize,
    out: &mut Vec<FileTreeEntry>,
) -> Result<(), String> {
    if depth > max_depth || out.len() >= max_entries {
        return Ok(());
    }

    let mut entries = std::fs::read_dir(dir)
        .map_err(command_error)?
        .flatten()
        .filter(|entry| !is_ignored_tree_entry(&entry.path()))
        .collect::<Vec<_>>();
    entries.sort_by(|left, right| {
        let left_dir = left.path().is_dir();
        let right_dir = right.path().is_dir();
        right_dir
            .cmp(&left_dir)
            .then_with(|| left.file_name().cmp(&right.file_name()))
    });

    for entry in entries {
        if out.len() >= max_entries {
            break;
        }
        let path = entry.path();
        let metadata = match entry.metadata() {
            Ok(metadata) => metadata,
            Err(_) => continue,
        };
        let is_dir = metadata.is_dir();
        out.push(FileTreeEntry {
            path: relative_tree_path(workspace, &path),
            name: entry.file_name().to_string_lossy().to_string(),
            kind: if is_dir { "directory" } else { "file" }.to_string(),
            depth,
            size: if is_dir { None } else { Some(metadata.len()) },
            modified: metadata
                .modified()
                .ok()
                .and_then(|value| value.duration_since(std::time::SystemTime::UNIX_EPOCH).ok())
                .map(|value| value.as_millis() as i64),
        });

        if is_dir {
            collect_file_tree(workspace, &path, depth + 1, max_depth, max_entries, out)?;
        }
    }

    Ok(())
}

fn relative_tree_path(workspace: &Path, path: &Path) -> String {
    path.strip_prefix(workspace)
        .unwrap_or(path)
        .to_string_lossy()
        .replace('\\', "/")
}

fn is_ignored_tree_entry(path: &Path) -> bool {
    let name = path
        .file_name()
        .map(|value| value.to_string_lossy().to_ascii_lowercase())
        .unwrap_or_default();
    matches!(
        name.as_str(),
        ".git" | "node_modules" | "target" | "dist" | ".next" | ".turbo" | ".cache"
    )
}

fn compute_git_status(dir: &Path) -> Option<GitStatus> {
    let root = resolve_git_root(dir)?;
    // `git -C <dir> rev-parse --abbrev-ref HEAD` returns "HEAD" when
    // detached; otherwise the branch name.
    let head = run_git(&root, &["rev-parse", "--abbrev-ref", "HEAD"])?;
    let head_trim = head.trim();
    let detached = head_trim == "HEAD";

    let branch = if detached {
        // For detached HEADs, fall back to the short sha so the chip
        // still shows something useful.
        run_git(&root, &["rev-parse", "--short", "HEAD"]).map(|sha| sha.trim().to_string())
    } else if head_trim.is_empty() {
        None
    } else {
        Some(head_trim.to_string())
    };

    let dirty = run_git(&root, &["status", "--porcelain"])
        .map(|out| !out.trim().is_empty())
        .unwrap_or(false);

    let (ahead, behind) = run_git(&root, &["rev-list", "--left-right", "--count", "@{u}...HEAD"])
        .and_then(|out| {
            let trimmed = out.trim();
            let mut parts = trimmed.split_whitespace();
            let behind: u32 = parts.next()?.parse().ok()?;
            let ahead: u32 = parts.next()?.parse().ok()?;
            Some((ahead, behind))
        })
        .unwrap_or((0, 0));

    Some(GitStatus {
        root_path: root.display().to_string(),
        branch,
        detached,
        dirty,
        ahead,
        behind,
    })
}

fn compute_workspace_file_diffs(dir: &Path, files: &[String]) -> Vec<WorkspaceFileDiff> {
    let Some(root) = resolve_git_root(dir) else {
        return Vec::new();
    };

    files
        .iter()
        .filter_map(|file| compute_workspace_file_diff(dir, &root, file))
        .collect()
}

fn compute_workspace_file_diff(dir: &Path, root: &Path, file: &str) -> Option<WorkspaceFileDiff> {
    let input = PathBuf::from(file);
    let absolute = if input.is_absolute() {
        input
    } else {
        dir.join(input)
    };
    let relative = absolute
        .strip_prefix(root)
        .ok()
        .map(|path| path.to_string_lossy().replace('\\', "/"))
        .unwrap_or_else(|| file.replace('\\', "/"));

    let patch = run_git(
        root,
        &[
            "diff",
            "--no-ext-diff",
            "--no-renames",
            "--unified=100000",
            "HEAD",
            "--",
            &relative,
        ],
    )
    .unwrap_or_default();

    let patch = if patch.trim().is_empty() && absolute.is_file() {
        run_git_allow_failure(
            root,
            &[
                "diff",
                "--no-index",
                "--unified=100000",
                "--",
                if cfg!(windows) { "NUL" } else { "/dev/null" },
                absolute.to_string_lossy().as_ref(),
            ],
        )
        .unwrap_or_default()
    } else {
        patch
    };

    if patch.trim().is_empty() {
        return None;
    }

    let (additions, deletions) = diff_stats(&patch);
    let status = diff_status(&patch).to_string();
    Some(WorkspaceFileDiff {
        file: relative,
        patch,
        additions,
        deletions,
        status,
    })
}

fn diff_stats(patch: &str) -> (u32, u32) {
    let mut additions = 0;
    let mut deletions = 0;
    for line in patch.lines() {
        if line.starts_with("+++") || line.starts_with("---") {
            continue;
        }
        if line.starts_with('+') {
            additions += 1;
        }
        if line.starts_with('-') {
            deletions += 1;
        }
    }
    (additions, deletions)
}

fn diff_status(patch: &str) -> &'static str {
    if patch.contains("\n--- /dev/null") || patch.contains("\n--- NUL") {
        return "added";
    }
    if patch.contains("\n+++ /dev/null") || patch.contains("\n+++ NUL") {
        return "deleted";
    }
    "modified"
}

fn resolve_git_root(dir: &Path) -> Option<PathBuf> {
    if let Some(root) = run_git(dir, &["rev-parse", "--show-toplevel"]) {
        let path = PathBuf::from(root.trim());
        if path.is_dir() {
            return Some(path);
        }
    }

    let mut nested_roots = Vec::new();
    let entries = std::fs::read_dir(dir).ok()?;
    for entry in entries.flatten() {
        let path = entry.path();
        if path.is_dir() && path.join(".git").exists() {
            nested_roots.push(path);
        }
    }

    if nested_roots.len() == 1 {
        nested_roots.pop()
    } else {
        None
    }
}

fn run_git(dir: &Path, args: &[&str]) -> Option<String> {
    let output = Command::new("git")
        .args(args)
        .current_dir(dir)
        .output()
        .ok()?;
    if !output.status.success() {
        return None;
    }
    Some(String::from_utf8_lossy(&output.stdout).into_owned())
}

fn run_git_allow_failure(dir: &Path, args: &[&str]) -> Option<String> {
    let output = Command::new("git")
        .args(args)
        .current_dir(dir)
        .output()
        .ok()?;
    let stdout = String::from_utf8_lossy(&output.stdout).into_owned();
    if stdout.trim().is_empty() {
        None
    } else {
        Some(stdout)
    }
}

fn playwright_browsers_default_path() -> Result<PathBuf, String> {
    let home = dirs::home_dir().ok_or_else(|| "无法定位用户主目录".to_string())?;
    #[cfg(target_os = "windows")]
    {
        Ok(home.join("AppData").join("Local").join("ms-playwright"))
    }
    #[cfg(target_os = "macos")]
    {
        Ok(home.join("Library").join("Caches").join("ms-playwright"))
    }
    #[cfg(all(unix, not(target_os = "macos")))]
    {
        Ok(home.join(".cache").join("ms-playwright"))
    }
}

fn dir_has_prefix(root: &Path, prefix: &str) -> bool {
    let Ok(entries) = std::fs::read_dir(root) else {
        return false;
    };
    entries.flatten().any(|entry| {
        entry
            .file_name()
            .to_string_lossy()
            .to_ascii_lowercase()
            .starts_with(prefix)
    })
}

fn open_target_dir(path: &str) -> PathBuf {
    let candidate = PathBuf::from(path);
    if candidate.is_file() {
        candidate
            .parent()
            .map(Path::to_path_buf)
            .unwrap_or(candidate)
    } else {
        candidate
    }
}

fn open_in_editor(path: &str) -> Result<(), String> {
    let candidates = if cfg!(windows) {
        vec!["code.cmd", "code.exe", "code"]
    } else {
        vec!["code"]
    };

    for command in candidates {
        if Command::new(command).arg(path).spawn().is_ok() {
            return Ok(());
        }
    }

    Err("无法启动 VS Code。".to_string())
}

fn open_in_cursor(path: &str) -> Result<(), String> {
    let candidates = if cfg!(windows) {
        vec!["cursor.cmd", "cursor.exe", "cursor"]
    } else {
        vec!["cursor"]
    };

    for command in candidates {
        if Command::new(command).arg(path).spawn().is_ok() {
            return Ok(());
        }
    }

    Err("无法启动 Cursor。".to_string())
}

fn open_in_file_manager(path: &str) -> Result<(), String> {
    let candidate = PathBuf::from(path);

    if cfg!(windows) {
        let mut command = Command::new("explorer.exe");
        if candidate.is_file() {
            command.arg(format!("/select,{}", candidate.to_string_lossy()));
        } else {
            command.arg(candidate);
        }
        return command.spawn().map(|_| ()).map_err(command_error);
    }

    opener::open(open_target_dir(path)).map_err(command_error)
}

fn open_in_terminal(path: &str, shell: IntegratedShell) -> Result<(), String> {
    let dir = open_target_dir(path);

    if cfg!(windows) {
        return open_windows_terminal(&dir, shell);
    }

    if Command::new("sh")
        .arg("-c")
        .arg(format!("cd {} && exec ${{SHELL:-sh}}", shell_quote(&dir)))
        .spawn()
        .is_ok()
    {
        return Ok(());
    }

    Err("无法启动终端。".to_string())
}

#[cfg(windows)]
fn open_windows_terminal(dir: &Path, shell: IntegratedShell) -> Result<(), String> {
    let dir_text = dir.to_string_lossy().to_string();

    let status = match shell {
        IntegratedShell::Powershell => Command::new("cmd")
            .args([
                "/C",
                "start",
                "",
                "powershell.exe",
                "-NoExit",
                "-Command",
                &format!("Set-Location -LiteralPath {}", powershell_quote(&dir_text)),
            ])
            .spawn(),
        IntegratedShell::Cmd => Command::new("cmd")
            .args([
                "/C",
                "start",
                "",
                "cmd.exe",
                "/K",
                &format!("cd /D \"{}\"", dir_text.replace('"', "\"\"")),
            ])
            .spawn(),
        IntegratedShell::Gitbash => open_git_bash(&dir_text),
    };

    status.map(|_| ()).map_err(command_error)
}

#[cfg(not(windows))]
fn open_windows_terminal(_dir: &Path, _shell: IntegratedShell) -> Result<(), String> {
    Err("当前平台不支持 Windows 终端启动方式。".to_string())
}

#[cfg(windows)]
fn open_git_bash(dir: &str) -> std::io::Result<std::process::Child> {
    let candidates = [
        "git-bash.exe".to_string(),
        "C:\\Program Files\\Git\\git-bash.exe".to_string(),
        "C:\\Program Files (x86)\\Git\\git-bash.exe".to_string(),
    ];

    let mut last_error = None;
    for candidate in candidates {
        match Command::new(candidate).arg(format!("--cd={dir}")).spawn() {
            Ok(child) => return Ok(child),
            Err(error) => last_error = Some(error),
        }
    }

    Err(last_error.unwrap_or_else(|| std::io::Error::from(std::io::ErrorKind::NotFound)))
}

fn powershell_quote(value: &str) -> String {
    format!("'{}'", value.replace('\'', "''"))
}

fn shell_quote(path: &Path) -> String {
    format!("'{}'", path.to_string_lossy().replace('\'', "'\\''"))
}

async fn resolve_base_url(
    input: Option<String>,
    state: &State<'_, AppState>,
) -> Result<String, String> {
    if let Some(base_url) = input.filter(|value| !value.trim().is_empty()) {
        return Ok(base_url);
    }

    state
        .server
        .read()
        .await
        .base_url
        .clone()
        .ok_or_else(|| "请先连接 OpenCode server".to_string())
}
