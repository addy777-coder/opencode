use serde::{Deserialize, Serialize};
use serde_json::{json, Map, Value};
use std::path::PathBuf;
use std::process::Stdio;
use tokio::process::{Child, Command};
use tokio::time::{sleep, Duration};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ServerStatus {
    pub healthy: bool,
    pub mode: ServerMode,
    pub base_url: Option<String>,
    pub message: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionInfo {
    pub id: String,
    pub title: String,
    pub directory: Option<String>,
    pub path: Option<String>,
    pub parent_id: Option<String>,
    pub project_name: Option<String>,
    pub updated_at: Option<i64>,
    pub created_at: Option<i64>,
    pub changed_files: Option<usize>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PermissionInfo {
    pub id: String,
    pub session_id: Option<String>,
    pub permission: String,
    pub patterns: Vec<String>,
    pub always: Vec<String>,
    pub metadata: Value,
    pub tool: Option<Value>,
    pub raw: Value,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct QuestionOption {
    pub label: String,
    pub description: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct QuestionPrompt {
    pub question: String,
    pub header: String,
    pub options: Vec<QuestionOption>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub multiple: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub custom: Option<bool>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct QuestionToolRef {
    pub message_id: String,
    pub call_id: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct QuestionInfo {
    pub id: String,
    pub session_id: String,
    pub questions: Vec<QuestionPrompt>,
    pub tool: Option<QuestionToolRef>,
    pub raw: Value,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PermissionRule {
    pub permission: String,
    pub pattern: String,
    pub action: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PromptAttachment {
    pub mime: String,
    pub filename: Option<String>,
    pub url: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MessagePartInfo {
    pub id: Option<String>,
    pub kind: String,
    pub text: Option<String>,
    pub title: Option<String>,
    pub status: Option<String>,
    pub tool: Option<String>,
    pub file: Option<String>,
    pub raw: Value,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MessageInfo {
    pub id: String,
    pub session_id: Option<String>,
    pub role: String,
    pub text: String,
    pub agent: Option<String>,
    pub model: Option<String>,
    pub status: Option<String>,
    pub created_at: Option<i64>,
    pub completed_at: Option<i64>,
    pub parts: Vec<MessagePartInfo>,
    pub raw: Value,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DiffFileInfo {
    pub file: String,
    pub patch: String,
    pub additions: usize,
    pub deletions: usize,
    pub status: String,
    pub raw: Value,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CommandInfo {
    pub name: String,
    pub description: Option<String>,
    pub source: Option<String>,
    pub raw: Value,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentInfo {
    pub name: String,
    pub description: Option<String>,
    pub mode: String,
    pub native: bool,
    pub hidden: bool,
    pub color: Option<String>,
    pub model_provider_id: Option<String>,
    pub model_id: Option<String>,
    pub raw: Value,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProviderInfo {
    pub id: String,
    pub name: String,
    pub source: Option<String>,
    pub connected: bool,
    pub model_count: usize,
    pub default_model_id: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ModelInfo {
    pub id: String,
    pub name: String,
    pub provider_id: String,
    pub provider_name: String,
    pub status: String,
    pub family: Option<String>,
    pub context: Option<i64>,
    pub input: Option<i64>,
    pub output: Option<i64>,
    pub supports_reasoning: bool,
    pub supports_attachment: bool,
    pub raw: Value,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ExecutionOptions {
    pub agents: Vec<AgentInfo>,
    pub providers: Vec<ProviderInfo>,
    pub models: Vec<ModelInfo>,
    pub default_agent: Option<String>,
    pub default_provider_id: Option<String>,
    pub default_model_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ThirdPartyProviderConfig {
    pub id: String,
    pub name: String,
    pub protocol: String,
    pub base_url: String,
    #[serde(default)]
    pub models: Vec<String>,
    pub default_model: Option<String>,
    #[serde(default)]
    pub headers: String,
    pub timeout: Option<u64>,
    pub chunk_timeout: Option<u64>,
    pub context_limit: Option<i64>,
    pub output_limit: Option<i64>,
    #[serde(default)]
    pub supports_reasoning: bool,
    #[serde(default)]
    pub supports_attachment: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProviderModelsRequest {
    pub request_url: String,
    pub api_key: String,
    pub protocol: String,
    #[serde(default)]
    pub headers: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PtyShellInfo {
    pub path: String,
    pub name: String,
    pub acceptable: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PtyInfo {
    pub id: String,
    pub title: String,
    pub command: String,
    #[serde(default)]
    pub args: Vec<String>,
    pub cwd: String,
    pub status: String,
    pub pid: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PtySize {
    pub rows: u32,
    pub cols: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct PtyCreateRequest {
    pub command: Option<String>,
    pub args: Option<Vec<String>>,
    pub cwd: Option<String>,
    pub title: Option<String>,
    pub env: Option<Map<String, Value>>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct PtyUpdateRequest {
    pub title: Option<String>,
    pub size: Option<PtySize>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PtyConnectToken {
    pub ticket: String,
    #[serde(alias = "expires_in")]
    pub expires_in: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum ServerMode {
    Local,
    Remote,
    Unconfigured,
}

impl ServerStatus {
    pub fn unconfigured() -> Self {
        Self {
            healthy: false,
            mode: ServerMode::Unconfigured,
            base_url: None,
            message: "尚未配置 OpenCode server".to_string(),
        }
    }
}

pub async fn check_health(base_url: &str) -> Result<bool, reqwest::Error> {
    let url = format!("{}/global/health", base_url.trim_end_matches('/'));
    let response = reqwest::Client::new().get(url).send().await?;
    Ok(response.status().is_success())
}

pub async fn start_local_server(base_url: &str) -> Result<Child, String> {
    let parsed = reqwest::Url::parse(base_url)
        .map_err(|error| format!("OpenCode server 地址无效：{error}"))?;
    let hostname = parsed.host_str().unwrap_or("127.0.0.1").to_string();
    let port = parsed.port_or_known_default().unwrap_or(4096).to_string();
    let repo_root = repo_root()?;
    let npx = if cfg!(windows) { "npx.cmd" } else { "npx" };
    let args = vec![
        "--yes".to_string(),
        "bun@1.3.13".to_string(),
        "--cwd".to_string(),
        "packages/opencode".to_string(),
        "--conditions=browser".to_string(),
        "./src/index.ts".to_string(),
        "serve".to_string(),
        format!("--hostname={hostname}"),
        format!("--port={port}"),
    ];

    let child = Command::new(npx)
        .current_dir(&repo_root)
        .args(args)
        .env("OPENCODE_CLIENT", "desktop")
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn()
        .map_err(|error| format!("启动 OpenCode server 失败：{error}"))?;

    Ok(child)
}

pub async fn wait_until_healthy(base_url: &str, attempts: usize) -> bool {
    for _ in 0..attempts.max(1) {
        if check_health(base_url).await.unwrap_or(false) {
            return true;
        }
        sleep(Duration::from_millis(500)).await;
    }
    false
}

pub async fn stop_local_server(mut child: Child) {
    if cfg!(windows) {
        if let Some(pid) = child.id() {
            let _ = Command::new("taskkill")
                .args(["/PID", &pid.to_string(), "/T", "/F"])
                .stdin(Stdio::null())
                .stdout(Stdio::null())
                .stderr(Stdio::null())
                .status()
                .await;
            return;
        }
    }

    let _ = child.kill().await;
}

fn repo_root() -> Result<PathBuf, String> {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .parent()
        .and_then(|path| path.parent())
        .and_then(|path| path.parent())
        .map(PathBuf::from)
        .ok_or_else(|| "无法定位 OpenCode 仓库根目录".to_string())
}

pub async fn list_sessions(
    base_url: &str,
    directory: Option<&str>,
    limit: u32,
) -> Result<Vec<SessionInfo>, reqwest::Error> {
    let url = format!("{}/api/session", base_url.trim_end_matches('/'));
    let mut query = vec![
        ("limit".to_string(), limit.clamp(1, 200).to_string()),
        ("order".to_string(), "desc".to_string()),
    ];
    if let Some(directory) = directory.filter(|value| !value.trim().is_empty()) {
        query.push(("directory".to_string(), directory.to_string()));
    }

    let response = reqwest::Client::new()
        .get(url)
        .query(&query)
        .send()
        .await?
        .error_for_status()?
        .json::<Value>()
        .await?;

    let items = response
        .get("items")
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default();

    Ok(items.iter().filter_map(session_from_value).collect())
}

pub async fn session_status(
    base_url: &str,
    directory: Option<&str>,
) -> Result<Value, reqwest::Error> {
    let url = format!("{}/session/status", base_url.trim_end_matches('/'));
    request_with_directory(reqwest::Client::new().get(url), directory)
        .send()
        .await?
        .error_for_status()?
        .json::<Value>()
        .await
}

pub async fn create_session(
    base_url: &str,
    directory: Option<&str>,
    title: Option<&str>,
    permission: Option<&[PermissionRule]>,
) -> Result<SessionInfo, reqwest::Error> {
    let url = format!("{}/session", base_url.trim_end_matches('/'));
    let mut payload = serde_json::Map::new();
    if let Some(title) = title.filter(|value| !value.trim().is_empty()) {
        payload.insert("title".to_string(), json!(title));
    }
    if let Some(permission) = permission.filter(|value| !value.is_empty()) {
        payload.insert("permission".to_string(), json!(permission));
    }

    let response = request_with_directory(reqwest::Client::new().post(url), directory)
        .json(&Value::Object(payload))
        .send()
        .await?
        .error_for_status()?
        .json::<Value>()
        .await?;

    Ok(
        session_from_value(&response).unwrap_or_else(|| SessionInfo {
            id: string_field(&response, "id").unwrap_or_else(|| "unknown".to_string()),
            title: string_field(&response, "title").unwrap_or_else(|| "未命名线程".to_string()),
            directory: string_field(&response, "directory"),
            path: string_field(&response, "path"),
            parent_id: string_field(&response, "parentID"),
            project_name: None,
            updated_at: response
                .get("time")
                .and_then(|time| time.get("updated"))
                .and_then(Value::as_i64),
            created_at: response
                .get("time")
                .and_then(|time| time.get("created"))
                .and_then(Value::as_i64),
            changed_files: None,
        }),
    )
}

pub async fn update_session_title(
    base_url: &str,
    directory: Option<&str>,
    session_id: &str,
    title: &str,
) -> Result<SessionInfo, reqwest::Error> {
    let url = format!("{}/session/{}", base_url.trim_end_matches('/'), session_id);
    let response = request_with_directory(reqwest::Client::new().patch(url), directory)
        .json(&json!({ "title": title }))
        .send()
        .await?
        .error_for_status()?
        .json::<Value>()
        .await?;

    Ok(
        session_from_value(&response).unwrap_or_else(|| SessionInfo {
            id: string_field(&response, "id").unwrap_or_else(|| session_id.to_string()),
            title: string_field(&response, "title").unwrap_or_else(|| title.to_string()),
            directory: string_field(&response, "directory")
                .or_else(|| directory.map(ToOwned::to_owned)),
            path: string_field(&response, "path"),
            parent_id: string_field(&response, "parentID"),
            project_name: None,
            updated_at: response
                .get("time")
                .and_then(|time| time.get("updated"))
                .and_then(Value::as_i64),
            created_at: response
                .get("time")
                .and_then(|time| time.get("created"))
                .and_then(Value::as_i64),
            changed_files: None,
        }),
    )
}

pub async fn fork_session(
    base_url: &str,
    directory: Option<&str>,
    session_id: &str,
    message_id: Option<&str>,
) -> Result<SessionInfo, reqwest::Error> {
    let url = format!(
        "{}/session/{}/fork",
        base_url.trim_end_matches('/'),
        session_id
    );
    let payload = message_id
        .filter(|value| !value.trim().is_empty())
        .map(|value| json!({ "messageID": value }))
        .unwrap_or_else(|| json!({}));
    let response = request_with_directory(reqwest::Client::new().post(url), directory)
        .json(&payload)
        .send()
        .await?
        .error_for_status()?
        .json::<Value>()
        .await?;

    Ok(
        session_from_value(&response).unwrap_or_else(|| SessionInfo {
            id: string_field(&response, "id").unwrap_or_else(|| "unknown".to_string()),
            title: string_field(&response, "title").unwrap_or_else(|| "派生对话".to_string()),
            directory: string_field(&response, "directory")
                .or_else(|| directory.map(ToOwned::to_owned)),
            path: string_field(&response, "path"),
            parent_id: string_field(&response, "parentID")
                .or_else(|| Some(session_id.to_string())),
            project_name: None,
            updated_at: response
                .get("time")
                .and_then(|time| time.get("updated"))
                .and_then(Value::as_i64),
            created_at: response
                .get("time")
                .and_then(|time| time.get("created"))
                .and_then(Value::as_i64),
            changed_files: None,
        }),
    )
}

pub async fn prompt_session(
    base_url: &str,
    directory: Option<&str>,
    session_id: &str,
    text: &str,
    attachments: Option<&[PromptAttachment]>,
    system: Option<&str>,
    agent: Option<&str>,
    provider_id: Option<&str>,
    model_id: Option<&str>,
    permission: Option<&[PermissionRule]>,
) -> Result<(), reqwest::Error> {
    if let Some(permission) = permission {
        update_session_permission(base_url, directory, session_id, permission).await?;
    }

    let url = format!(
        "{}/session/{}/prompt_async",
        base_url.trim_end_matches('/'),
        session_id
    );
    let mut payload = serde_json::Map::new();
    let mut parts = Vec::new();
    if !text.trim().is_empty() {
        parts.push(json!({
            "type": "text",
            "text": text.trim(),
        }));
    }
    for attachment in attachments.unwrap_or(&[]) {
        if attachment.mime.trim().is_empty() || attachment.url.trim().is_empty() {
            continue;
        }
        let mut part = Map::new();
        part.insert("type".to_string(), json!("file"));
        part.insert("mime".to_string(), json!(attachment.mime.trim()));
        part.insert("url".to_string(), json!(attachment.url.trim()));
        if let Some(filename) = attachment
            .filename
            .as_deref()
            .map(str::trim)
            .filter(|value| !value.is_empty())
        {
            part.insert("filename".to_string(), json!(filename));
        }
        parts.push(Value::Object(part));
    }
    payload.insert("parts".to_string(), Value::Array(parts));
    if let Some(agent) = agent.filter(|value| !value.trim().is_empty()) {
        payload.insert("agent".to_string(), json!(agent));
    }
    if let Some(system) = system.filter(|value| !value.trim().is_empty()) {
        payload.insert("system".to_string(), json!(system.trim()));
    }
    if let (Some(provider_id), Some(model_id)) = (
        provider_id.filter(|value| !value.trim().is_empty()),
        model_id.filter(|value| !value.trim().is_empty()),
    ) {
        payload.insert(
            "model".to_string(),
            json!({
                "providerID": provider_id,
                "modelID": model_id,
            }),
        );
    }

    request_with_directory(reqwest::Client::new().post(url), directory)
        .json(&Value::Object(payload))
        .send()
        .await?
        .error_for_status()?;
    Ok(())
}

pub async fn update_session_permission(
    base_url: &str,
    directory: Option<&str>,
    session_id: &str,
    permission: &[PermissionRule],
) -> Result<(), reqwest::Error> {
    let url = format!("{}/session/{}", base_url.trim_end_matches('/'), session_id);
    request_with_directory(reqwest::Client::new().patch(url), directory)
        .json(&json!({ "permission": permission }))
        .send()
        .await?
        .error_for_status()?;

    Ok(())
}

pub async fn abort_session(
    base_url: &str,
    directory: Option<&str>,
    session_id: &str,
) -> Result<(), reqwest::Error> {
    let url = format!(
        "{}/session/{}/abort",
        base_url.trim_end_matches('/'),
        session_id
    );
    request_with_directory(reqwest::Client::new().post(url), directory)
        .send()
        .await?
        .error_for_status()?;
    Ok(())
}

pub async fn delete_session(
    base_url: &str,
    directory: Option<&str>,
    session_id: &str,
) -> Result<(), reqwest::Error> {
    let url = format!("{}/session/{}", base_url.trim_end_matches('/'), session_id);
    request_with_directory(reqwest::Client::new().delete(url), directory)
        .send()
        .await?
        .error_for_status()?;
    Ok(())
}

pub async fn execution_options(
    base_url: &str,
    directory: Option<&str>,
) -> Result<ExecutionOptions, reqwest::Error> {
    let client = reqwest::Client::new();
    let agent_url = format!("{}/agent", base_url.trim_end_matches('/'));
    let provider_url = format!("{}/provider", base_url.trim_end_matches('/'));
    let agents_response = request_with_directory(client.get(agent_url), directory)
        .send()
        .await?
        .error_for_status()?
        .json::<Value>()
        .await?;
    let providers_response = request_with_directory(client.get(provider_url), directory)
        .send()
        .await?
        .error_for_status()?
        .json::<Value>()
        .await?;

    let agents = agents_response
        .as_array()
        .cloned()
        .unwrap_or_default()
        .iter()
        .filter_map(agent_from_value)
        .collect::<Vec<_>>();

    let connected = providers_response
        .get("connected")
        .and_then(Value::as_array)
        .map(|items| {
            items
                .iter()
                .filter_map(Value::as_str)
                .map(ToOwned::to_owned)
                .collect::<Vec<_>>()
        })
        .unwrap_or_default();
    let defaults = providers_response
        .get("default")
        .cloned()
        .unwrap_or(Value::Null);

    let (providers, models) = providers_response
        .get("all")
        .and_then(Value::as_array)
        .map(|items| {
            let mut providers = Vec::new();
            let mut models = Vec::new();
            for provider in items {
                let Some(provider_info) = provider_from_value(provider, &connected, &defaults)
                else {
                    continue;
                };
                let provider_models = provider
                    .get("models")
                    .and_then(Value::as_object)
                    .map(|models| {
                        models
                            .values()
                            .filter_map(|model| model_from_value(model, &provider_info))
                            .collect::<Vec<_>>()
                    })
                    .unwrap_or_default();
                models.extend(provider_models);
                providers.push(provider_info);
            }
            (providers, models)
        })
        .unwrap_or_default();

    let default_agent = agents
        .iter()
        .find(|agent| !agent.hidden && agent.mode != "subagent" && agent.name == "build")
        .or_else(|| {
            agents
                .iter()
                .find(|agent| !agent.hidden && agent.mode != "subagent")
        })
        .map(|agent| agent.name.clone());
    let default_provider = providers
        .iter()
        .find(|provider| provider.connected)
        .or_else(|| providers.first());
    let default_provider_id = default_provider.map(|provider| provider.id.clone());
    let default_model_id = default_provider
        .and_then(|provider| provider.default_model_id.clone())
        .or_else(|| {
            default_provider.and_then(|provider| {
                models
                    .iter()
                    .find(|model| model.provider_id == provider.id)
                    .map(|model| model.id.clone())
            })
        });

    Ok(ExecutionOptions {
        agents,
        providers,
        models,
        default_agent,
        default_provider_id,
        default_model_id,
    })
}

pub async fn list_messages(
    base_url: &str,
    directory: Option<&str>,
    session_id: &str,
    limit: u32,
) -> Result<Vec<MessageInfo>, reqwest::Error> {
    let url = format!(
        "{}/session/{}/message",
        base_url.trim_end_matches('/'),
        session_id
    );
    let response = request_with_directory(reqwest::Client::new().get(url), directory)
        .query(&[("limit", limit.clamp(1, 200).to_string())])
        .send()
        .await?
        .error_for_status()?
        .json::<Value>()
        .await?;

    Ok(response
        .as_array()
        .cloned()
        .unwrap_or_default()
        .iter()
        .filter_map(|value| message_from_value(value, Some(session_id)))
        .collect())
}

pub async fn delete_message(
    base_url: &str,
    directory: Option<&str>,
    session_id: &str,
    message_id: &str,
) -> Result<(), reqwest::Error> {
    let url = format!(
        "{}/session/{}/message/{}",
        base_url.trim_end_matches('/'),
        session_id,
        message_id
    );
    request_with_directory(reqwest::Client::new().delete(url), directory)
        .send()
        .await?
        .error_for_status()?;
    Ok(())
}

pub async fn update_message_text_part(
    base_url: &str,
    directory: Option<&str>,
    session_id: &str,
    message_id: &str,
    part_id: &str,
    part: &Value,
    text: &str,
) -> Result<(), reqwest::Error> {
    let url = format!(
        "{}/session/{}/message/{}/part/{}",
        base_url.trim_end_matches('/'),
        session_id,
        message_id,
        part_id
    );
    let mut payload = part.clone();
    if let Value::Object(map) = &mut payload {
        map.insert("text".to_string(), Value::String(text.to_string()));
    }
    request_with_directory(reqwest::Client::new().patch(url), directory)
        .json(&payload)
        .send()
        .await?
        .error_for_status()?;
    Ok(())
}

pub async fn session_diff(
    base_url: &str,
    directory: Option<&str>,
    session_id: &str,
    message_id: Option<&str>,
) -> Result<Vec<DiffFileInfo>, reqwest::Error> {
    let url = format!(
        "{}/session/{}/diff",
        base_url.trim_end_matches('/'),
        session_id
    );
    let mut request = request_with_directory(reqwest::Client::new().get(url), directory);
    if let Some(message_id) = message_id.filter(|value| !value.trim().is_empty()) {
        request = request.query(&[("messageID", message_id)]);
    }
    let response = request.send().await?.error_for_status()?.json::<Value>().await?;

    Ok(response
        .as_array()
        .cloned()
        .unwrap_or_default()
        .iter()
        .filter_map(diff_from_value)
        .collect())
}

pub async fn find_files(
    base_url: &str,
    directory: Option<&str>,
    query: &str,
    limit: u32,
) -> Result<Vec<String>, reqwest::Error> {
    let url = format!("{}/find/file", base_url.trim_end_matches('/'));
    let response = request_with_directory(reqwest::Client::new().get(url), directory)
        .query(&[
            ("query", query.trim().to_string()),
            ("dirs", "true".to_string()),
            ("limit", limit.clamp(1, 200).to_string()),
        ])
        .send()
        .await?
        .error_for_status()?
        .json::<Value>()
        .await?;

    Ok(response
        .as_array()
        .cloned()
        .unwrap_or_default()
        .iter()
        .filter_map(Value::as_str)
        .map(ToOwned::to_owned)
        .collect())
}

pub async fn list_commands(
    base_url: &str,
    directory: Option<&str>,
) -> Result<Vec<CommandInfo>, reqwest::Error> {
    let url = format!("{}/command", base_url.trim_end_matches('/'));
    let response = request_with_directory(reqwest::Client::new().get(url), directory)
        .send()
        .await?
        .error_for_status()?
        .json::<Value>()
        .await?;

    Ok(response
        .as_array()
        .cloned()
        .unwrap_or_default()
        .iter()
        .filter_map(command_from_value)
        .collect())
}

pub async fn pty_shells(base_url: &str, directory: Option<&str>) -> Result<Vec<PtyShellInfo>, reqwest::Error> {
    let url = format!("{}/pty/shells", base_url.trim_end_matches('/'));
    request_with_directory(reqwest::Client::new().get(url), directory)
        .send()
        .await?
        .error_for_status()?
        .json::<Vec<PtyShellInfo>>()
        .await
}

pub async fn pty_list(base_url: &str, directory: Option<&str>) -> Result<Vec<PtyInfo>, reqwest::Error> {
    let url = format!("{}/pty", base_url.trim_end_matches('/'));
    request_with_directory(reqwest::Client::new().get(url), directory)
        .send()
        .await?
        .error_for_status()?
        .json::<Vec<PtyInfo>>()
        .await
}

pub async fn pty_create(
    base_url: &str,
    directory: Option<&str>,
    input: &PtyCreateRequest,
) -> Result<PtyInfo, reqwest::Error> {
    let url = format!("{}/pty", base_url.trim_end_matches('/'));
    let mut payload = Map::new();
    if let Some(command) = input.command.as_deref().map(str::trim).filter(|value| !value.is_empty()) {
        payload.insert("command".to_string(), json!(command));
    }
    if let Some(args) = input.args.as_ref().filter(|value| !value.is_empty()) {
        payload.insert("args".to_string(), json!(args));
    }
    if let Some(cwd) = input.cwd.as_deref().map(str::trim).filter(|value| !value.is_empty()) {
        payload.insert("cwd".to_string(), json!(cwd));
    }
    if let Some(title) = input.title.as_deref().map(str::trim).filter(|value| !value.is_empty()) {
        payload.insert("title".to_string(), json!(title));
    }
    if let Some(env) = input.env.as_ref().filter(|value| !value.is_empty()) {
        payload.insert("env".to_string(), Value::Object(env.clone()));
    }

    request_with_directory(reqwest::Client::new().post(url), directory)
        .json(&Value::Object(payload))
        .send()
        .await?
        .error_for_status()?
        .json::<PtyInfo>()
        .await
}

pub async fn pty_update(
    base_url: &str,
    directory: Option<&str>,
    pty_id: &str,
    input: &PtyUpdateRequest,
) -> Result<PtyInfo, reqwest::Error> {
    let url = format!("{}/pty/{}", base_url.trim_end_matches('/'), pty_id);
    let mut payload = Map::new();
    if let Some(title) = input.title.as_deref().map(str::trim).filter(|value| !value.is_empty()) {
        payload.insert("title".to_string(), json!(title));
    }
    if let Some(size) = input.size.as_ref().filter(|value| value.rows > 0 && value.cols > 0) {
        payload.insert(
            "size".to_string(),
            json!({
                "rows": size.rows,
                "cols": size.cols,
            }),
        );
    }

    request_with_directory(reqwest::Client::new().put(url), directory)
        .json(&Value::Object(payload))
        .send()
        .await?
        .error_for_status()?
        .json::<PtyInfo>()
        .await
}

pub async fn pty_remove(
    base_url: &str,
    directory: Option<&str>,
    pty_id: &str,
) -> Result<(), reqwest::Error> {
    let url = format!("{}/pty/{}", base_url.trim_end_matches('/'), pty_id);
    request_with_directory(reqwest::Client::new().delete(url), directory)
        .send()
        .await?
        .error_for_status()?;
    Ok(())
}

pub async fn pty_connect_token(
    base_url: &str,
    directory: Option<&str>,
    pty_id: &str,
) -> Result<PtyConnectToken, reqwest::Error> {
    let url = format!(
        "{}/pty/{}/connect-token",
        base_url.trim_end_matches('/'),
        pty_id
    );
    request_with_directory(reqwest::Client::new().post(url), directory)
        .header("x-opencode-ticket", "1")
        .send()
        .await?
        .error_for_status()?
        .json::<PtyConnectToken>()
        .await
}

pub async fn mcp_status(base_url: &str, directory: Option<&str>) -> Result<Value, reqwest::Error> {
    let url = format!("{}/mcp", base_url.trim_end_matches('/'));
    request_with_directory(reqwest::Client::new().get(url), directory)
        .send()
        .await?
        .error_for_status()?
        .json::<Value>()
        .await
}

pub async fn mcp_add(
    base_url: &str,
    directory: Option<&str>,
    name: &str,
    config: &Value,
) -> Result<Value, reqwest::Error> {
    let url = format!("{}/mcp", base_url.trim_end_matches('/'));
    request_with_directory(reqwest::Client::new().post(url), directory)
        .json(&json!({
            "name": name,
            "config": config,
        }))
        .send()
        .await?
        .error_for_status()?
        .json::<Value>()
        .await
}

pub async fn mcp_connect(
    base_url: &str,
    directory: Option<&str>,
    name: &str,
) -> Result<(), reqwest::Error> {
    let url = format!("{}/mcp/{}/connect", base_url.trim_end_matches('/'), name);
    request_with_directory(reqwest::Client::new().post(url), directory)
        .send()
        .await?
        .error_for_status()?;
    Ok(())
}

pub async fn mcp_disconnect(
    base_url: &str,
    directory: Option<&str>,
    name: &str,
) -> Result<(), reqwest::Error> {
    let url = format!("{}/mcp/{}/disconnect", base_url.trim_end_matches('/'), name);
    request_with_directory(reqwest::Client::new().post(url), directory)
        .send()
        .await?
        .error_for_status()?;
    Ok(())
}

pub async fn apply_third_party_provider(
    base_url: &str,
    provider: &ThirdPartyProviderConfig,
    api_key: Option<&str>,
) -> Result<Value, String> {
    validate_third_party_provider(provider)?;

    let client = reqwest::Client::new();
    if let Some(api_key) = api_key.map(str::trim).filter(|value| !value.is_empty()) {
        let auth_url = format!(
            "{}/auth/{}",
            base_url.trim_end_matches('/'),
            provider.id.trim()
        );
        client
            .put(auth_url)
            .json(&json!({
                "type": "api",
                "key": api_key,
            }))
            .send()
            .await
            .map_err(|error| format!("写入 OpenCode auth 失败：{error}"))?
            .error_for_status()
            .map_err(|error| format!("写入 OpenCode auth 失败：{error}"))?;
    }

    let current = global_config(&client, base_url)
        .await
        .unwrap_or_else(|_| json!({}));
    let disabled = current
        .get("disabled_providers")
        .and_then(Value::as_array)
        .map(|items| {
            items
                .iter()
                .filter_map(Value::as_str)
                .filter(|item| *item != provider.id.trim())
                .map(ToOwned::to_owned)
                .collect::<Vec<_>>()
        })
        .unwrap_or_default();

    let mut patch = Map::new();
    patch.insert("disabled_providers".to_string(), json!(disabled));
    let mut providers = Map::new();
    providers.insert(
        provider.id.trim().to_string(),
        third_party_provider_config(provider)?,
    );
    patch.insert("provider".to_string(), Value::Object(providers));

    let result = update_global_config(&client, base_url, Value::Object(patch)).await?;
    dispose_instances(&client, base_url).await;
    Ok(result)
}

pub async fn remove_third_party_provider(
    base_url: &str,
    provider_id: &str,
) -> Result<Value, String> {
    let provider_id = provider_id.trim();
    if provider_id.is_empty() {
        return Err("供应商 ID 不能为空。".to_string());
    }

    let client = reqwest::Client::new();
    let auth_url = format!("{}/auth/{}", base_url.trim_end_matches('/'), provider_id);
    let _ = client.delete(auth_url).send().await;

    let current = global_config(&client, base_url)
        .await
        .unwrap_or_else(|_| json!({}));
    let mut disabled = current
        .get("disabled_providers")
        .and_then(Value::as_array)
        .map(|items| {
            items
                .iter()
                .filter_map(Value::as_str)
                .map(ToOwned::to_owned)
                .collect::<Vec<_>>()
        })
        .unwrap_or_default();
    if !disabled.iter().any(|item| item == provider_id) {
        disabled.push(provider_id.to_string());
    }

    let result = update_global_config(
        &client,
        base_url,
        json!({
            "disabled_providers": disabled,
        }),
    )
    .await?;
    dispose_instances(&client, base_url).await;
    Ok(result)
}

pub async fn fetch_provider_models(input: &ProviderModelsRequest) -> Result<Vec<String>, String> {
    let token = input.api_key.trim();
    if token.is_empty() {
        return Err("请先输入 API Key，再获取模型列表。".to_string());
    }

    let urls = provider_models_urls(&input.request_url, &input.protocol)?;
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(45))
        .build()
        .map_err(|error| format!("创建 HTTP 客户端失败：{error}"))?;
    let mut errors = Vec::new();

    for url in urls {
        match fetch_provider_models_from_url(&client, &url, token, &input.protocol, &input.headers)
            .await
        {
            Ok(models) => return Ok(models),
            Err(error) => errors.push(error),
        }
    }

    Err(format!("获取模型列表失败：{}", errors.join(" | ")))
}

pub async fn list_permissions(
    base_url: &str,
    directory: Option<&str>,
) -> Result<Vec<PermissionInfo>, reqwest::Error> {
    let url = format!("{}/permission", base_url.trim_end_matches('/'));
    let response = request_with_directory(reqwest::Client::new().get(url), directory)
        .send()
        .await?
        .error_for_status()?
        .json::<Value>()
        .await?;

    Ok(response
        .as_array()
        .cloned()
        .unwrap_or_default()
        .iter()
        .filter_map(permission_from_value)
        .collect())
}

pub async fn reply_permission(
    base_url: &str,
    directory: Option<&str>,
    request_id: &str,
    reply: &str,
    message: Option<&str>,
) -> Result<(), reqwest::Error> {
    let url = format!(
        "{}/permission/{}/reply",
        base_url.trim_end_matches('/'),
        request_id
    );
    let mut payload = serde_json::Map::new();
    payload.insert("reply".to_string(), json!(reply));
    if let Some(message) = message.filter(|value| !value.trim().is_empty()) {
        payload.insert("message".to_string(), json!(message));
    }

    request_with_directory(reqwest::Client::new().post(url), directory)
        .json(&Value::Object(payload))
        .send()
        .await?
        .error_for_status()?;
    Ok(())
}

pub async fn list_questions(
    base_url: &str,
    directory: Option<&str>,
) -> Result<Vec<QuestionInfo>, reqwest::Error> {
    let url = format!("{}/question", base_url.trim_end_matches('/'));
    let response = request_with_directory(reqwest::Client::new().get(url), directory)
        .send()
        .await?
        .error_for_status()?
        .json::<Value>()
        .await?;

    Ok(response
        .as_array()
        .cloned()
        .unwrap_or_default()
        .iter()
        .filter_map(question_from_value)
        .collect())
}

pub async fn reply_question(
    base_url: &str,
    directory: Option<&str>,
    request_id: &str,
    answers: &[Vec<String>],
) -> Result<(), reqwest::Error> {
    let url = format!(
        "{}/question/{}/reply",
        base_url.trim_end_matches('/'),
        request_id
    );
    let payload = json!({ "answers": answers });
    request_with_directory(reqwest::Client::new().post(url), directory)
        .json(&payload)
        .send()
        .await?
        .error_for_status()?;
    Ok(())
}

pub async fn reject_question(
    base_url: &str,
    directory: Option<&str>,
    request_id: &str,
) -> Result<(), reqwest::Error> {
    let url = format!(
        "{}/question/{}/reject",
        base_url.trim_end_matches('/'),
        request_id
    );
    request_with_directory(reqwest::Client::new().post(url), directory)
        .send()
        .await?
        .error_for_status()?;
    Ok(())
}

fn session_from_value(value: &Value) -> Option<SessionInfo> {
    let id = value.get("id")?.as_str()?.to_string();
    let title = value
        .get("title")
        .and_then(Value::as_str)
        .filter(|value| !value.trim().is_empty())
        .unwrap_or("未命名线程")
        .to_string();

    let summary = value.get("summary");

    Some(SessionInfo {
        id,
        title,
        directory: string_field(value, "directory"),
        path: string_field(value, "path"),
        parent_id: string_field(value, "parentID"),
        project_name: value.get("project").and_then(|project| {
            string_field(project, "name").or_else(|| string_field(project, "id"))
        }),
        updated_at: value
            .get("time")
            .and_then(|time| time.get("updated"))
            .and_then(Value::as_i64),
        created_at: value
            .get("time")
            .and_then(|time| time.get("created"))
            .and_then(Value::as_i64),
        changed_files: summary
            .and_then(|summary| summary.get("files"))
            .and_then(Value::as_u64)
            .map(|value| value as usize),
    })
}

fn string_field(value: &Value, key: &str) -> Option<String> {
    value
        .get(key)
        .and_then(Value::as_str)
        .map(ToOwned::to_owned)
}

fn string_array(value: &Value, key: &str) -> Vec<String> {
    value
        .get(key)
        .and_then(Value::as_array)
        .map(|items| {
            items
                .iter()
                .filter_map(Value::as_str)
                .map(ToOwned::to_owned)
                .collect()
        })
        .unwrap_or_default()
}

fn permission_from_value(value: &Value) -> Option<PermissionInfo> {
    Some(PermissionInfo {
        id: string_field(value, "id")?,
        session_id: string_field(value, "sessionID"),
        permission: string_field(value, "permission").unwrap_or_else(|| "unknown".to_string()),
        patterns: string_array(value, "patterns"),
        always: string_array(value, "always"),
        metadata: value.get("metadata").cloned().unwrap_or(Value::Null),
        tool: value.get("tool").cloned(),
        raw: value.clone(),
    })
}

fn question_option_from_value(value: &Value) -> QuestionOption {
    QuestionOption {
        label: string_field(value, "label").unwrap_or_default(),
        description: string_field(value, "description").unwrap_or_default(),
    }
}

fn question_prompt_from_value(value: &Value) -> Option<QuestionPrompt> {
    let question = string_field(value, "question")?;
    let header = string_field(value, "header").unwrap_or_default();
    let options = value
        .get("options")
        .and_then(Value::as_array)
        .map(|items| items.iter().map(question_option_from_value).collect())
        .unwrap_or_default();
    Some(QuestionPrompt {
        question,
        header,
        options,
        multiple: value.get("multiple").and_then(Value::as_bool),
        custom: value.get("custom").and_then(Value::as_bool),
    })
}

fn question_from_value(value: &Value) -> Option<QuestionInfo> {
    let id = string_field(value, "id")?;
    let session_id = string_field(value, "sessionID")?;
    let questions = value
        .get("questions")
        .and_then(Value::as_array)
        .map(|items| items.iter().filter_map(question_prompt_from_value).collect())
        .unwrap_or_default();
    let tool = value.get("tool").and_then(|tool| {
        let message_id = string_field(tool, "messageID")?;
        let call_id = string_field(tool, "callID")?;
        Some(QuestionToolRef {
            message_id,
            call_id,
        })
    });
    Some(QuestionInfo {
        id,
        session_id,
        questions,
        tool,
        raw: value.clone(),
    })
}

fn message_from_value(value: &Value, fallback_session_id: Option<&str>) -> Option<MessageInfo> {
    let info = value.get("info").unwrap_or(value);
    let id = string_field(info, "id")?;
    let session_id = string_field(info, "sessionID")
        .or_else(|| string_field(value, "sessionID"))
        .or_else(|| fallback_session_id.map(ToOwned::to_owned));
    let role = string_field(info, "role").unwrap_or_else(|| "assistant".to_string());
    let parts = value
        .get("parts")
        .and_then(Value::as_array)
        .map(|items| {
            items
                .iter()
                .map(message_part_from_value)
                .collect::<Vec<_>>()
        })
        .unwrap_or_default();
    let text = parts
        .iter()
        .filter(|part| part.kind == "text")
        .filter_map(|part| part.text.as_deref())
        .filter(|text| !text.trim().is_empty())
        .collect::<Vec<_>>()
        .join("\n\n");

    Some(MessageInfo {
        id,
        session_id,
        role,
        text,
        agent: string_field(info, "agent").or_else(|| string_field(info, "mode")),
        model: string_field(info, "modelID").or_else(|| {
            info.get("model").and_then(|model| {
                string_field(model, "modelID")
                    .or_else(|| string_field(model, "id"))
                    .or_else(|| string_field(model, "providerID"))
            })
        }),
        status: string_field(info, "finish")
            .or_else(|| info.get("error").and_then(|_| Some("error".to_string()))),
        created_at: info
            .get("time")
            .and_then(|time| time.get("created"))
            .and_then(Value::as_i64),
        completed_at: info
            .get("time")
            .and_then(|time| time.get("completed"))
            .and_then(Value::as_i64),
        parts,
        raw: value.clone(),
    })
}

fn message_part_from_value(value: &Value) -> MessagePartInfo {
    let kind = string_field(value, "type").unwrap_or_else(|| "unknown".to_string());
    let state = value.get("state");
    let text = match kind.as_str() {
        "text" | "reasoning" => string_field(value, "text"),
        "tool" => state
            .and_then(|state| string_field(state, "output"))
            .or_else(|| state.and_then(|state| string_field(state, "error"))),
        "subtask" => string_field(value, "prompt"),
        "file" => string_field(value, "filename").or_else(|| string_field(value, "url")),
        "patch" => value.get("files").and_then(Value::as_array).map(|items| {
            items
                .iter()
                .filter_map(Value::as_str)
                .collect::<Vec<_>>()
                .join("\n")
        }),
        _ => None,
    };
    let title = state
        .and_then(|state| string_field(state, "title"))
        .or_else(|| string_field(value, "title"));
    let status = state
        .and_then(|state| string_field(state, "status"))
        .or_else(|| string_field(value, "status"));

    MessagePartInfo {
        id: string_field(value, "id"),
        kind,
        text,
        title,
        status,
        tool: string_field(value, "tool"),
        file: string_field(value, "filename")
            .or_else(|| string_field(value, "file"))
            .or_else(|| string_field(value, "url")),
        raw: value.clone(),
    }
}

fn diff_from_value(value: &Value) -> Option<DiffFileInfo> {
    Some(DiffFileInfo {
        file: string_field(value, "file")?,
        patch: string_field(value, "patch").unwrap_or_default(),
        additions: value
            .get("additions")
            .and_then(Value::as_u64)
            .unwrap_or_default() as usize,
        deletions: value
            .get("deletions")
            .and_then(Value::as_u64)
            .unwrap_or_default() as usize,
        status: string_field(value, "status").unwrap_or_else(|| "modified".to_string()),
        raw: value.clone(),
    })
}

fn command_from_value(value: &Value) -> Option<CommandInfo> {
    Some(CommandInfo {
        name: string_field(value, "name")?,
        description: string_field(value, "description"),
        source: string_field(value, "source"),
        raw: value.clone(),
    })
}

fn agent_from_value(value: &Value) -> Option<AgentInfo> {
    let model = value.get("model");
    Some(AgentInfo {
        name: string_field(value, "name")?,
        description: string_field(value, "description"),
        mode: string_field(value, "mode").unwrap_or_else(|| "all".to_string()),
        native: value
            .get("native")
            .and_then(Value::as_bool)
            .unwrap_or(false),
        hidden: value
            .get("hidden")
            .and_then(Value::as_bool)
            .unwrap_or(false),
        color: string_field(value, "color"),
        model_provider_id: model.and_then(|model| string_field(model, "providerID")),
        model_id: model.and_then(|model| string_field(model, "modelID")),
        raw: value.clone(),
    })
}

fn provider_from_value(
    value: &Value,
    connected: &[String],
    defaults: &Value,
) -> Option<ProviderInfo> {
    let id = string_field(value, "id")?;
    let model_count = value
        .get("models")
        .and_then(Value::as_object)
        .map(|models| models.len())
        .unwrap_or_default();

    Some(ProviderInfo {
        id: id.clone(),
        name: string_field(value, "name").unwrap_or_else(|| id.clone()),
        source: string_field(value, "source"),
        connected: connected.iter().any(|item| item == &id),
        model_count,
        default_model_id: defaults
            .get(&id)
            .and_then(Value::as_str)
            .map(ToOwned::to_owned),
    })
}

fn model_from_value(value: &Value, provider: &ProviderInfo) -> Option<ModelInfo> {
    let capabilities = value.get("capabilities");
    let limit = value.get("limit");
    Some(ModelInfo {
        id: string_field(value, "id")?,
        name: string_field(value, "name").unwrap_or_else(|| {
            string_field(value, "id").unwrap_or_else(|| "未命名模型".to_string())
        }),
        provider_id: provider.id.clone(),
        provider_name: provider.name.clone(),
        status: string_field(value, "status").unwrap_or_else(|| "active".to_string()),
        family: string_field(value, "family"),
        context: limit
            .and_then(|limit| limit.get("context"))
            .and_then(Value::as_i64),
        input: limit
            .and_then(|limit| limit.get("input"))
            .and_then(Value::as_i64),
        output: limit
            .and_then(|limit| limit.get("output"))
            .and_then(Value::as_i64),
        supports_reasoning: capabilities
            .and_then(|capabilities| capabilities.get("reasoning"))
            .and_then(Value::as_bool)
            .unwrap_or(false),
        supports_attachment: capabilities
            .and_then(|capabilities| capabilities.get("attachment"))
            .and_then(Value::as_bool)
            .unwrap_or(false),
        raw: value.clone(),
    })
}

fn validate_third_party_provider(provider: &ThirdPartyProviderConfig) -> Result<(), String> {
    let id = provider.id.trim();
    if id.is_empty() {
        return Err("供应商 ID 不能为空。".to_string());
    }
    if !id
        .chars()
        .all(|ch| ch.is_ascii_alphanumeric() || ch == '_' || ch == '-')
    {
        return Err("供应商 ID 只能使用字母、数字、下划线或短横线。".to_string());
    }
    if provider.base_url.trim().is_empty() {
        return Err("请填写 Base URL。".to_string());
    }
    if normalized_models(provider).is_empty() {
        return Err("请至少填写一个模型 ID。".to_string());
    }
    Ok(())
}

fn normalized_models(provider: &ThirdPartyProviderConfig) -> Vec<String> {
    let mut models = provider
        .models
        .iter()
        .map(|item| item.trim())
        .filter(|item| !item.is_empty())
        .map(ToOwned::to_owned)
        .collect::<Vec<_>>();
    models.sort();
    models.dedup();
    models
}

fn third_party_provider_config(provider: &ThirdPartyProviderConfig) -> Result<Value, String> {
    let npm = match provider.protocol.trim() {
        "anthropic" => "@ai-sdk/anthropic",
        _ => "@ai-sdk/openai-compatible",
    };
    let base_url = trim_api_url(&provider.base_url);
    let headers = parse_record_lines(&provider.headers);
    let context = provider.context_limit.unwrap_or(128_000).max(1);
    let output = provider.output_limit.unwrap_or(16_384).max(1);

    let mut options = Map::new();
    options.insert("baseURL".to_string(), json!(base_url));
    if let Some(timeout) = provider.timeout.filter(|value| *value > 0) {
        options.insert("timeout".to_string(), json!(timeout));
    }
    if let Some(chunk_timeout) = provider.chunk_timeout.filter(|value| *value > 0) {
        options.insert("chunkTimeout".to_string(), json!(chunk_timeout));
    }
    if !headers.is_empty() {
        options.insert("headers".to_string(), json!(headers));
    }

    let mut models = Map::new();
    for model_id in normalized_models(provider) {
        models.insert(
            model_id.clone(),
            json!({
                "id": model_id,
                "name": model_id,
                "reasoning": provider.supports_reasoning,
                "attachment": provider.supports_attachment,
                "temperature": true,
                "tool_call": true,
                "limit": {
                    "context": context,
                    "output": output,
                },
                "cost": {
                    "input": 0,
                    "output": 0,
                },
            }),
        );
    }

    Ok(json!({
        "name": provider.name.trim(),
        "npm": npm,
        "api": base_url,
        "env": [],
        "options": Value::Object(options),
        "models": Value::Object(models),
    }))
}

async fn global_config(client: &reqwest::Client, base_url: &str) -> Result<Value, String> {
    let url = format!("{}/global/config", base_url.trim_end_matches('/'));
    client
        .get(url)
        .send()
        .await
        .map_err(|error| format!("读取 OpenCode 全局配置失败：{error}"))?
        .error_for_status()
        .map_err(|error| format!("读取 OpenCode 全局配置失败：{error}"))?
        .json::<Value>()
        .await
        .map_err(|error| format!("解析 OpenCode 全局配置失败：{error}"))
}

async fn update_global_config(
    client: &reqwest::Client,
    base_url: &str,
    patch: Value,
) -> Result<Value, String> {
    let url = format!("{}/global/config", base_url.trim_end_matches('/'));
    client
        .patch(url)
        .json(&patch)
        .send()
        .await
        .map_err(|error| format!("更新 OpenCode 全局配置失败：{error}"))?
        .error_for_status()
        .map_err(|error| format!("更新 OpenCode 全局配置失败：{error}"))?
        .json::<Value>()
        .await
        .map_err(|error| format!("解析 OpenCode 全局配置响应失败：{error}"))
}

async fn dispose_instances(client: &reqwest::Client, base_url: &str) {
    let url = format!("{}/global/dispose", base_url.trim_end_matches('/'));
    let _ = client.post(url).send().await;
}

async fn fetch_provider_models_from_url(
    client: &reqwest::Client,
    url: &str,
    token: &str,
    protocol: &str,
    headers: &str,
) -> Result<Vec<String>, String> {
    let mut request = client.get(url);
    if protocol == "anthropic" {
        request = request.header("x-api-key", token);
        request = request.header("anthropic-version", "2023-06-01");
    } else {
        let token = token.strip_prefix("Bearer ").unwrap_or(token);
        request = request.bearer_auth(token);
    }
    for (key, value) in parse_record_lines(headers) {
        if let Some(value) = value.as_str() {
            request = request.header(key.as_str(), value);
        }
    }

    let response = request
        .send()
        .await
        .map_err(|error| format!("GET {url}: 请求失败：{error}"))?;
    let status = response.status();
    let bytes = response
        .bytes()
        .await
        .map_err(|error| format!("GET {url}: 读取响应失败：{error}"))?;
    if !status.is_success() {
        return Err(format!(
            "GET {url}: HTTP {}：{}",
            status,
            response_body_preview(&bytes)
        ));
    }

    let body: Value = serde_json::from_slice(&bytes).map_err(|error| {
        format!(
            "GET {url}: 解析模型列表失败：{error}；响应：{}",
            response_body_preview(&bytes)
        )
    })?;
    let models = extract_provider_models(&body);
    if models.is_empty() {
        return Err(format!(
            "GET {url}: 响应中没有找到模型 ID：{}",
            response_body_preview(&bytes)
        ));
    }
    Ok(models)
}

fn provider_models_urls(request_url: &str, protocol: &str) -> Result<Vec<String>, String> {
    let url = trim_api_url(request_url);
    if url.is_empty() {
        return Err("请填写 Base URL。".to_string());
    }
    let lower = url.to_ascii_lowercase();
    if lower.ends_with("/models") {
        return Ok(vec![url]);
    }

    let mut urls = Vec::new();
    if lower.ends_with("/v1") {
        push_unique_url(&mut urls, format!("{url}/models"));
    } else {
        if protocol == "anthropic" {
            push_unique_url(&mut urls, format!("{url}/v1/models"));
            push_unique_url(&mut urls, format!("{url}/models"));
        } else {
            push_unique_url(&mut urls, format!("{url}/models"));
            push_unique_url(&mut urls, format!("{url}/v1/models"));
        }
    }
    Ok(urls)
}

fn extract_provider_models(body: &Value) -> Vec<String> {
    let mut out = Vec::new();
    if let Some(items) = body.get("data").and_then(Value::as_array) {
        for item in items {
            collect_model_id(item, &mut out);
        }
    }
    if let Some(items) = body.get("models").and_then(Value::as_array) {
        for item in items {
            collect_model_id(item, &mut out);
        }
    }
    collect_model_id(body, &mut out);
    out.sort();
    out.dedup();
    out
}

fn collect_model_id(value: &Value, out: &mut Vec<String>) {
    if let Some(id) = value
        .get("id")
        .or_else(|| value.get("name"))
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|id| !id.is_empty())
    {
        out.push(id.to_string());
    }
}

fn parse_record_lines(value: &str) -> Map<String, Value> {
    let mut record = Map::new();
    for line in value.lines().map(str::trim).filter(|line| !line.is_empty()) {
        let Some((key, value)) = line.split_once('=') else {
            continue;
        };
        let key = key.trim();
        if key.is_empty() {
            continue;
        }
        record.insert(key.to_string(), Value::String(value.trim().to_string()));
    }
    record
}

fn push_unique_url(urls: &mut Vec<String>, url: String) {
    if !urls.iter().any(|item| item == &url) {
        urls.push(url);
    }
}

fn trim_api_url(url: &str) -> String {
    url.trim().trim_end_matches('/').to_string()
}

fn response_body_preview(bytes: &[u8]) -> String {
    let text = String::from_utf8_lossy(bytes);
    let mut preview = text.chars().take(300).collect::<String>();
    if text.chars().count() > 300 {
        preview.push_str("...");
    }
    preview
}

fn request_with_directory(
    builder: reqwest::RequestBuilder,
    directory: Option<&str>,
) -> reqwest::RequestBuilder {
    if let Some(directory) = directory.filter(|value| !value.trim().is_empty()) {
        builder.query(&[("directory", directory)])
    } else {
        builder
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn pty_connect_token_accepts_server_snake_case() {
        let token: PtyConnectToken =
            serde_json::from_value(serde_json::json!({ "ticket": "abc", "expires_in": 60 }))
                .expect("token should deserialize from server payload");

        assert_eq!(token.ticket, "abc");
        assert_eq!(token.expires_in, 60);
        assert_eq!(
            serde_json::to_value(token).expect("token should serialize for frontend"),
            serde_json::json!({ "ticket": "abc", "expiresIn": 60 })
        );
    }
}
