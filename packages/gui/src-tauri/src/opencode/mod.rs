use serde::{Deserialize, Serialize};
use serde_json::{json, Map, Value};
use sqlx::sqlite::{SqliteConnectOptions, SqlitePoolOptions, SqliteRow};
use sqlx::Row;
use std::collections::{HashMap, HashSet};
use std::fs;
use std::path::{Path, PathBuf};
use std::process::Stdio;
use std::sync::{Mutex, OnceLock};
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::{path::BaseDirectory, AppHandle, Manager};
use tokio::process::{Child, Command};
use tokio::task::JoinSet;
use tokio::time::{sleep, Duration};

const CODEX_SKILLS_REPO: &str = "openai/skills";
const CODEX_SKILLS_REF: &str = "main";
const CODEX_CURATED_SKILLS_PATH: &str = "skills/.curated";
const CODEX_RECOMMENDATION_CACHE_TTL_SECONDS: u64 = 10 * 60;
const BUNDLED_SERVER_BINARY_NAME: &str = if cfg!(windows) {
    "opencode-server.exe"
} else {
    "opencode-server"
};
#[cfg(windows)]
const CREATE_NO_WINDOW: u32 = 0x08000000;

type CodexRecommendationCache = Option<(SystemTime, Vec<SkillRecommendationInfo>)>;
static CODEX_RECOMMENDATION_CACHE: OnceLock<Mutex<CodexRecommendationCache>> = OnceLock::new();

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ServerStatus {
    pub healthy: bool,
    pub mode: ServerMode,
    pub base_url: Option<String>,
    pub message: String,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NetworkProxyConfig {
    #[serde(default)]
    pub enabled: bool,
    #[serde(default)]
    pub protocol: String,
    #[serde(default)]
    pub host: String,
    pub port: Option<u16>,
    #[serde(default)]
    pub username: Option<String>,
    #[serde(default)]
    pub password: Option<String>,
    #[serde(default)]
    pub no_proxy: Option<String>,
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
    pub archived_at: Option<i64>,
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

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GitStatus {
    pub root_path: String,
    pub branch: Option<String>,
    pub detached: bool,
    pub dirty: bool,
    pub ahead: u32,
    pub behind: u32,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TextSearchSubmatch {
    pub text: String,
    pub start: u64,
    pub end: u64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TextSearchMatch {
    pub path: String,
    pub line: String,
    pub line_number: u64,
    pub absolute_offset: u64,
    pub submatches: Vec<TextSearchSubmatch>,
    pub raw: Value,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SymbolSearchResult {
    pub name: String,
    pub kind: u64,
    pub uri: Option<String>,
    pub line: Option<u64>,
    pub character: Option<u64>,
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
pub struct SkillInfo {
    pub name: String,
    pub description: String,
    pub location: String,
    pub content: String,
    pub enabled: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SkillRecommendationInfo {
    pub name: String,
    pub title: String,
    pub description: String,
    pub repo: String,
    pub path: String,
    pub ref_name: String,
    pub installed: bool,
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
pub struct ProviderAuthStatus {
    pub stored: bool,
    #[serde(rename = "type")]
    pub kind: Option<String>,
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

pub fn network_proxy_signature(proxy: Option<&NetworkProxyConfig>) -> Result<String, String> {
    let Some(config) = proxy.filter(|config| config.enabled) else {
        return Ok("disabled".to_string());
    };
    let proxy_url = network_proxy_url(config)?;
    let no_proxy = config
        .no_proxy
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .unwrap_or_default();
    Ok(format!("{}|{}", proxy_url.as_str(), no_proxy))
}

pub fn apply_network_proxy(
    builder: reqwest::ClientBuilder,
    proxy: Option<&NetworkProxyConfig>,
) -> Result<reqwest::ClientBuilder, String> {
    let Some(proxy) = network_reqwest_proxy(proxy)? else {
        return Ok(builder);
    };
    Ok(builder.proxy(proxy))
}

pub fn network_reqwest_proxy(
    proxy: Option<&NetworkProxyConfig>,
) -> Result<Option<reqwest::Proxy>, String> {
    let Some(config) = proxy.filter(|config| config.enabled) else {
        return Ok(None);
    };
    let proxy_url = network_proxy_url(config)?;
    let no_proxy = config
        .no_proxy
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .and_then(reqwest::NoProxy::from_string);
    let proxy = reqwest::Proxy::all(proxy_url.as_str())
        .map_err(|error| format!("网络代理地址无效：{error}"))?
        .no_proxy(no_proxy);
    Ok(Some(proxy))
}

pub fn network_proxy_bypasses_host(config: &NetworkProxyConfig, host: &str) -> bool {
    let host = host.trim().trim_matches('.').to_ascii_lowercase();
    if host.is_empty() {
        return false;
    }
    let Some(no_proxy) = config.no_proxy.as_deref() else {
        return false;
    };

    no_proxy.split(',').any(|entry| {
        let entry = entry.trim().trim_matches('.').to_ascii_lowercase();
        if entry.is_empty() {
            return false;
        }
        if entry == "*" {
            return true;
        }
        let entry = entry
            .strip_prefix('.')
            .unwrap_or(entry.as_str())
            .trim_matches('.');
        host == entry || host.ends_with(&format!(".{entry}"))
    })
}

pub fn network_proxy_url(config: &NetworkProxyConfig) -> Result<reqwest::Url, String> {
    let protocol = match config.protocol.trim().to_ascii_lowercase().as_str() {
        "" | "http" => "http",
        "https" => "https",
        other => return Err(format!("暂不支持的代理协议：{other}")),
    };
    let host = config.host.trim();
    if host.is_empty() {
        return Err("请填写网络代理主机。".to_string());
    }
    let port = config
        .port
        .ok_or_else(|| "请填写网络代理端口。".to_string())?;
    if port == 0 {
        return Err("网络代理端口必须在 1-65535 之间。".to_string());
    }

    let mut url = reqwest::Url::parse(&format!("{protocol}://{host}:{port}"))
        .map_err(|error| format!("网络代理地址无效：{error}"))?;
    if let Some(username) = config
        .username
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
    {
        url.set_username(username)
            .map_err(|_| "网络代理用户名无效。".to_string())?;
        if let Some(password) = config.password.as_deref() {
            url.set_password(Some(password))
                .map_err(|_| "网络代理密码无效。".to_string())?;
        }
    }
    Ok(url)
}

fn network_proxy_env(proxy: Option<&NetworkProxyConfig>) -> Result<Vec<(String, String)>, String> {
    let Some(config) = proxy.filter(|config| config.enabled) else {
        return Ok(Vec::new());
    };
    let proxy_url = network_proxy_url(config)?.to_string();
    let mut env = vec![
        ("HTTP_PROXY".to_string(), proxy_url.clone()),
        ("HTTPS_PROXY".to_string(), proxy_url.clone()),
        ("ALL_PROXY".to_string(), proxy_url.clone()),
        ("http_proxy".to_string(), proxy_url.clone()),
        ("https_proxy".to_string(), proxy_url.clone()),
        ("all_proxy".to_string(), proxy_url),
    ];
    if let Some(no_proxy) = config
        .no_proxy
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
    {
        env.push(("NO_PROXY".to_string(), no_proxy.to_string()));
        env.push(("no_proxy".to_string(), no_proxy.to_string()));
    }
    Ok(env)
}

pub async fn start_local_server(
    app: &AppHandle,
    base_url: &str,
    proxy: Option<&NetworkProxyConfig>,
) -> Result<Child, String> {
    let (hostname, port) = local_server_bind(base_url)?;
    let args = local_server_args(&hostname, &port);

    if let Some(sidecar) = bundled_server_binary(app) {
        let mut command = Command::new(&sidecar);
        command.args(&args);
        return spawn_local_server(command, "内置 OpenCode backend", proxy);
    }

    if !cfg!(debug_assertions) {
        return Err("安装包缺少内置 OpenCode backend，请重新安装完整发布包。".to_string());
    }

    let command = dev_source_server_command(&args)?;
    spawn_local_server(command, "开发源码 OpenCode server", proxy)
}

fn local_server_bind(base_url: &str) -> Result<(String, String), String> {
    let parsed = reqwest::Url::parse(base_url)
        .map_err(|error| format!("OpenCode server 地址无效：{error}"))?;
    let hostname = parsed.host_str().unwrap_or("127.0.0.1").to_string();
    let port = parsed.port_or_known_default().unwrap_or(4096).to_string();
    Ok((hostname, port))
}

fn local_server_args(hostname: &str, port: &str) -> Vec<String> {
    vec![
        "serve".to_string(),
        format!("--hostname={hostname}"),
        format!("--port={port}"),
    ]
}

fn dev_source_server_command(server_args: &[String]) -> Result<Command, String> {
    let repo_root = repo_root()?;
    let spec = dev_source_server_command_spec(server_args, command_exists_on_path(dev_bun()));
    let mut command = Command::new(&spec.program);
    command.current_dir(repo_root).args(spec.args);
    Ok(command)
}

#[derive(Debug, Clone, PartialEq, Eq)]
struct DevSourceServerCommandSpec {
    program: String,
    args: Vec<String>,
}

fn dev_source_server_command_spec(
    server_args: &[String],
    use_installed_bun: bool,
) -> DevSourceServerCommandSpec {
    let mut args = if use_installed_bun {
        vec![
            "--cwd".to_string(),
            "packages/opencode".to_string(),
            "--conditions=browser".to_string(),
            "./src/index.ts".to_string(),
        ]
    } else {
        vec![
            "--yes".to_string(),
            "bun@1.3.13".to_string(),
            "--cwd".to_string(),
            "packages/opencode".to_string(),
            "--conditions=browser".to_string(),
            "./src/index.ts".to_string(),
        ]
    };
    args.extend(server_args.iter().cloned());

    DevSourceServerCommandSpec {
        program: if use_installed_bun {
            dev_bun()
        } else {
            dev_npx()
        }
        .to_string(),
        args,
    }
}

fn dev_bun() -> &'static str {
    if cfg!(windows) {
        "bun.exe"
    } else {
        "bun"
    }
}

fn dev_npx() -> &'static str {
    if cfg!(windows) {
        "npx.cmd"
    } else {
        "npx"
    }
}

fn command_exists_on_path(command: &str) -> bool {
    std::env::var_os("PATH")
        .map(|paths| {
            std::env::split_paths(&paths).any(|dir| {
                fs::metadata(dir.join(command))
                    .map(|metadata| metadata.is_file())
                    .unwrap_or(false)
            })
        })
        .unwrap_or(false)
}

fn spawn_local_server(
    mut command: Command,
    launcher: &str,
    proxy: Option<&NetworkProxyConfig>,
) -> Result<Child, String> {
    hide_windows_console(&mut command);

    for (key, value) in network_proxy_env(proxy)? {
        command.env(key, value);
    }

    let child = command
        .env("OPENCODE_CLIENT", "desktop")
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn()
        .map_err(|error| format!("启动 {launcher} 失败：{error}"))?;

    Ok(child)
}

fn bundled_server_binary(app: &AppHandle) -> Option<PathBuf> {
    bundled_server_candidates(app)
        .into_iter()
        .find(|path| is_usable_sidecar(path))
}

fn bundled_server_candidates(app: &AppHandle) -> Vec<PathBuf> {
    let mut candidates = Vec::new();
    if let Ok(path) = app
        .path()
        .resolve(BUNDLED_SERVER_BINARY_NAME, BaseDirectory::Resource)
    {
        candidates.push(path);
    }
    if let Ok(exe) = std::env::current_exe() {
        if let Some(parent) = exe.parent() {
            candidates.push(parent.join(BUNDLED_SERVER_BINARY_NAME));
        }
    }
    candidates
}

fn is_usable_sidecar(path: &Path) -> bool {
    fs::metadata(path)
        .map(|metadata| metadata.is_file() && metadata.len() > 0)
        .unwrap_or(false)
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
            let mut command = Command::new("taskkill");
            hide_windows_console(&mut command);

            let _ = command
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

#[cfg(windows)]
fn hide_windows_console(command: &mut Command) {
    command.creation_flags(CREATE_NO_WINDOW);
}

#[cfg(not(windows))]
fn hide_windows_console(_command: &mut Command) {}

pub async fn list_sessions(
    base_url: &str,
    directory: Option<&str>,
    limit: u32,
    archived: Option<bool>,
) -> Result<Vec<SessionInfo>, reqwest::Error> {
    let url = format!("{}/experimental/session", base_url.trim_end_matches('/'));
    let mut query = vec![("limit".to_string(), limit.clamp(1, 200).to_string())];
    if let Some(directory) = directory.filter(|value| !value.trim().is_empty()) {
        query.push(("directory".to_string(), directory.to_string()));
    }
    if let Some(archived) = archived {
        query.push(("archived".to_string(), archived.to_string()));
    }

    let response = reqwest::Client::new()
        .get(url)
        .query(&query)
        .send()
        .await?
        .error_for_status()?
        .json::<Value>()
        .await?;

    let items = response.as_array().cloned().unwrap_or_else(|| {
        response
            .get("items")
            .and_then(Value::as_array)
            .cloned()
            .unwrap_or_default()
    });

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
            archived_at: response
                .get("time")
                .and_then(|time| time.get("archived"))
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
            archived_at: response
                .get("time")
                .and_then(|time| time.get("archived"))
                .and_then(Value::as_i64),
            changed_files: None,
        }),
    )
}

pub async fn update_session_archived(
    base_url: &str,
    directory: Option<&str>,
    session_id: &str,
    archived: bool,
) -> Result<SessionInfo, String> {
    let url = format!("{}/session/{}", base_url.trim_end_matches('/'), session_id);
    let archived_at: Option<i64> = if archived {
        Some(
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .map(|duration| duration.as_millis() as i64)
                .unwrap_or_default(),
        )
    } else {
        None
    };

    let response = match request_with_directory(reqwest::Client::new().patch(url), directory)
        .json(&json!({ "time": { "archived": archived_at } }))
        .send()
        .await
        .and_then(|response| response.error_for_status())
    {
        Ok(response) => response
            .json::<Value>()
            .await
            .map_err(|error| format!("解析 OpenCode server 响应失败：{error}"))?,
        Err(error) => {
            return update_session_archived_local_db(session_id, archived_at)
                .await?
                .ok_or_else(|| format!("OpenCode server 更新归档失败：{error}"));
        }
    };

    let parsed = session_from_value(&response).unwrap_or_else(|| SessionInfo {
        id: string_field(&response, "id").unwrap_or_else(|| session_id.to_string()),
        title: string_field(&response, "title").unwrap_or_else(|| "未命名线程".to_string()),
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
        archived_at: response
            .get("time")
            .and_then(|time| time.get("archived"))
            .and_then(Value::as_i64),
        changed_files: None,
    });

    if parsed.archived_at == archived_at || (!archived && parsed.archived_at.is_none()) {
        return Ok(parsed);
    }

    update_session_archived_local_db(session_id, archived_at)
        .await?
        .ok_or_else(|| {
            if archived {
                "OpenCode server 未写入归档状态，且本地数据库中未找到该会话。".to_string()
            } else {
                "OpenCode server 未清除归档状态，且本地数据库中未找到该会话。".to_string()
            }
        })
}

async fn update_session_archived_local_db(
    session_id: &str,
    archived_at: Option<i64>,
) -> Result<Option<SessionInfo>, String> {
    let candidates = opencode_db_candidates();
    let mut errors = Vec::new();

    for path in candidates {
        let options = SqliteConnectOptions::new()
            .filename(&path)
            .create_if_missing(false)
            .busy_timeout(Duration::from_secs(5));
        let pool = match SqlitePoolOptions::new()
            .max_connections(1)
            .connect_with(options)
            .await
        {
            Ok(pool) => pool,
            Err(error) => {
                errors.push(format!("{}: {error}", path.display()));
                continue;
            }
        };

        let updated = sqlx::query("UPDATE session SET time_archived = ? WHERE id = ?")
            .bind(archived_at)
            .bind(session_id)
            .execute(&pool)
            .await;
        let rows_affected = match updated {
            Ok(result) => result.rows_affected(),
            Err(error) => {
                errors.push(format!("{}: {error}", path.display()));
                pool.close().await;
                continue;
            }
        };

        if rows_affected > 0 {
            let session = local_session_from_db(&pool, session_id)
                .await
                .map_err(|error| format!("读取本地会话失败：{error}"))?;
            pool.close().await;
            return Ok(session);
        }

        pool.close().await;
    }

    if errors.is_empty() {
        Ok(None)
    } else {
        Err(format!("本地数据库兜底失败：{}", errors.join("; ")))
    }
}

async fn local_session_from_db(
    pool: &sqlx::SqlitePool,
    session_id: &str,
) -> Result<Option<SessionInfo>, sqlx::Error> {
    let row = sqlx::query(
        "SELECT id, title, directory, path, parent_id, time_updated, time_created, time_archived, summary_files
         FROM session
         WHERE id = ?",
    )
    .bind(session_id)
    .fetch_optional(pool)
    .await?;

    Ok(row.map(session_info_from_sqlite_row))
}

fn session_info_from_sqlite_row(row: SqliteRow) -> SessionInfo {
    SessionInfo {
        id: sqlite_string(&row, "id").unwrap_or_else(|| "unknown".to_string()),
        title: sqlite_string(&row, "title").unwrap_or_else(|| "未命名线程".to_string()),
        directory: sqlite_string(&row, "directory"),
        path: sqlite_string(&row, "path"),
        parent_id: sqlite_string(&row, "parent_id"),
        project_name: None,
        updated_at: sqlite_i64(&row, "time_updated"),
        created_at: sqlite_i64(&row, "time_created"),
        archived_at: sqlite_i64(&row, "time_archived"),
        changed_files: sqlite_i64(&row, "summary_files")
            .and_then(|value| usize::try_from(value).ok()),
    }
}

fn sqlite_string(row: &SqliteRow, field: &str) -> Option<String> {
    row.try_get::<Option<String>, _>(field).ok().flatten()
}

fn sqlite_i64(row: &SqliteRow, field: &str) -> Option<i64> {
    row.try_get::<Option<i64>, _>(field).ok().flatten()
}

fn opencode_db_candidates() -> Vec<PathBuf> {
    let mut paths = Vec::new();
    let mut seen = HashSet::new();
    let data_dirs = opencode_data_dirs();

    if let Ok(raw) = std::env::var("OPENCODE_DB") {
        let trimmed = raw.trim();
        if !trimmed.is_empty() && trimmed != ":memory:" {
            let configured = PathBuf::from(trimmed);
            if configured.is_absolute() {
                push_existing_path(&mut paths, &mut seen, configured);
            } else {
                for dir in &data_dirs {
                    push_existing_path(&mut paths, &mut seen, dir.join(trimmed));
                }
            }
        }
    }

    for dir in data_dirs {
        push_existing_path(&mut paths, &mut seen, dir.join("opencode-local.db"));
        push_existing_path(&mut paths, &mut seen, dir.join("opencode.db"));

        if let Ok(entries) = fs::read_dir(&dir) {
            for entry in entries.flatten() {
                let path = entry.path();
                let Some(name) = path.file_name().and_then(|value| value.to_str()) else {
                    continue;
                };
                if name == "opencode.db" || (name.starts_with("opencode-") && name.ends_with(".db"))
                {
                    push_existing_path(&mut paths, &mut seen, path);
                }
            }
        }
    }

    paths.sort_by_key(|path| std::cmp::Reverse(modified_millis(path)));
    paths
}

fn opencode_data_dirs() -> Vec<PathBuf> {
    let mut dirs = Vec::new();
    let mut seen = HashSet::new();

    if let Ok(raw) = std::env::var("XDG_DATA_HOME") {
        let trimmed = raw.trim();
        if !trimmed.is_empty() {
            push_unique_path(
                &mut dirs,
                &mut seen,
                PathBuf::from(trimmed).join("opencode"),
            );
        }
    }
    if let Some(home) = dirs::home_dir() {
        push_unique_path(
            &mut dirs,
            &mut seen,
            home.join(".local").join("share").join("opencode"),
        );
    }
    if let Some(data) = dirs::data_dir() {
        push_unique_path(&mut dirs, &mut seen, data.join("opencode"));
    }

    dirs
}

fn push_existing_path(paths: &mut Vec<PathBuf>, seen: &mut HashSet<String>, path: PathBuf) {
    if path.exists() {
        push_unique_path(paths, seen, path);
    }
}

fn push_unique_path(paths: &mut Vec<PathBuf>, seen: &mut HashSet<String>, path: PathBuf) {
    let key = fs::canonicalize(&path)
        .unwrap_or_else(|_| path.clone())
        .to_string_lossy()
        .to_lowercase();
    if seen.insert(key) {
        paths.push(path);
    }
}

fn modified_millis(path: &Path) -> u128 {
    fs::metadata(path)
        .and_then(|metadata| metadata.modified())
        .ok()
        .and_then(|modified| modified.duration_since(UNIX_EPOCH).ok())
        .map(|duration| duration.as_millis())
        .unwrap_or_default()
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
            parent_id: string_field(&response, "parentID").or_else(|| Some(session_id.to_string())),
            project_name: None,
            updated_at: response
                .get("time")
                .and_then(|time| time.get("updated"))
                .and_then(Value::as_i64),
            created_at: response
                .get("time")
                .and_then(|time| time.get("created"))
                .and_then(Value::as_i64),
            archived_at: response
                .get("time")
                .and_then(|time| time.get("archived"))
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
    let response = request
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
        .filter_map(diff_from_value)
        .collect())
}

pub async fn git_status(
    base_url: &str,
    directory: Option<&str>,
) -> Result<Option<GitStatus>, reqwest::Error> {
    let url = format!("{}/file/git/status", base_url.trim_end_matches('/'));
    request_with_directory(reqwest::Client::new().get(url), directory)
        .send()
        .await?
        .error_for_status()?
        .json::<Option<GitStatus>>()
        .await
}

pub async fn workspace_file_diffs(
    base_url: &str,
    directory: Option<&str>,
    files: &[String],
) -> Result<Vec<DiffFileInfo>, reqwest::Error> {
    let url = format!("{}/file/diff", base_url.trim_end_matches('/'));
    let response = request_with_directory(reqwest::Client::new().post(url), directory)
        .json(&json!({ "files": files }))
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

pub async fn find_text(
    base_url: &str,
    directory: Option<&str>,
    pattern: &str,
    limit: u32,
) -> Result<Vec<TextSearchMatch>, reqwest::Error> {
    let url = format!("{}/find", base_url.trim_end_matches('/'));
    let response = request_with_directory(reqwest::Client::new().get(url), directory)
        .query(&[("pattern", pattern.trim().to_string())])
        .send()
        .await?
        .error_for_status()?
        .json::<Value>()
        .await?;

    let mut matches = response
        .as_array()
        .map(|items| {
            items
                .iter()
                .filter_map(text_match_from_value)
                .collect::<Vec<_>>()
        })
        .unwrap_or_default();
    matches.truncate(limit.clamp(1, 200) as usize);
    Ok(matches)
}

pub async fn find_symbols(
    base_url: &str,
    directory: Option<&str>,
    query: &str,
    limit: u32,
) -> Result<Vec<SymbolSearchResult>, reqwest::Error> {
    let url = format!("{}/find/symbol", base_url.trim_end_matches('/'));
    let response = request_with_directory(reqwest::Client::new().get(url), directory)
        .query(&[("query", query.trim().to_string())])
        .send()
        .await?
        .error_for_status()?
        .json::<Value>()
        .await?;

    let mut symbols = response
        .as_array()
        .map(|items| {
            items
                .iter()
                .filter_map(symbol_search_result_from_value)
                .collect::<Vec<_>>()
        })
        .unwrap_or_default();
    symbols.truncate(limit.clamp(1, 200) as usize);
    Ok(symbols)
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

pub async fn list_skills(
    base_url: &str,
    directory: Option<&str>,
) -> Result<Vec<SkillInfo>, reqwest::Error> {
    let url = format!("{}/skill", base_url.trim_end_matches('/'));
    let response = request_with_directory(reqwest::Client::new().get(url), directory)
        .send()
        .await?
        .error_for_status()?
        .json::<Value>()
        .await?;

    let mut skills = response
        .as_array()
        .cloned()
        .unwrap_or_default()
        .iter()
        .filter_map(skill_from_value)
        .collect::<Vec<_>>();

    if let Ok(config) = global_config(&reqwest::Client::new(), base_url).await {
        apply_skill_enabled_state(&mut skills, &config);
    }

    Ok(skills)
}

pub async fn list_codex_recommended_skills() -> Result<Vec<SkillRecommendationInfo>, String> {
    let installed = local_codex_skill_names();
    if let Some(mut recommendations) = cached_codex_recommendations() {
        apply_recommendation_install_state(&mut recommendations, &installed);
        return Ok(recommendations);
    }

    let client = github_client();
    let entries = github_contents(
        &client,
        CODEX_SKILLS_REPO,
        CODEX_SKILLS_REF,
        CODEX_CURATED_SKILLS_PATH,
    )
    .await?;
    let mut recommendations = Vec::new();
    let mut tasks = JoinSet::new();

    for entry in entries.into_iter().filter(|entry| entry.kind == "dir") {
        let client = client.clone();
        tasks.spawn(async move { codex_recommendation_from_entry(client, entry).await });
    }

    while let Some(result) = tasks.join_next().await {
        recommendations.push(result.map_err(|error| format!("读取推荐技能失败：{error}"))?);
    }

    recommendations.sort_by(|a, b| {
        a.title
            .to_lowercase()
            .cmp(&b.title.to_lowercase())
            .then_with(|| a.name.to_lowercase().cmp(&b.name.to_lowercase()))
    });
    store_codex_recommendations(&recommendations);
    apply_recommendation_install_state(&mut recommendations, &installed);
    Ok(recommendations)
}

pub async fn install_codex_skill(
    name: &str,
    repo: Option<&str>,
    path: Option<&str>,
    ref_name: Option<&str>,
) -> Result<SkillInfo, String> {
    let name = name.trim();
    if !is_safe_path_segment(name) {
        return Err("技能名称无效".to_string());
    }

    let repo = repo
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .unwrap_or(CODEX_SKILLS_REPO);
    let ref_name = ref_name
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .unwrap_or(CODEX_SKILLS_REF);
    let skill_path = path
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(ToOwned::to_owned)
        .unwrap_or_else(|| format!("{CODEX_CURATED_SKILLS_PATH}/{name}"));

    let root = local_codex_skills_root()?;
    fs::create_dir_all(&root).map_err(|error| format!("创建技能目录失败：{error}"))?;

    let destination = root.join(name);
    if destination.exists() {
        return Err(format!("技能已安装：{name}"));
    }

    let stamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|value| value.as_millis())
        .unwrap_or_default();
    let temp = root.join(format!(
        ".opencode-gui-skill-install-{}-{stamp}",
        std::process::id()
    ));
    let _ = fs::remove_dir_all(&temp);

    let client = github_client();
    let result = async {
        download_github_directory(&client, repo, ref_name, &skill_path, &temp).await?;
        let parsed = parse_local_skill_file(&temp.join("SKILL.md"))
            .ok_or_else(|| "推荐技能缺少有效的 SKILL.md".to_string())?;
        fs::rename(&temp, &destination).map_err(|error| format!("安装技能失败：{error}"))?;
        Ok(SkillInfo {
            location: destination.join("SKILL.md").to_string_lossy().to_string(),
            ..parsed
        })
    }
    .await;

    if result.is_err() {
        let _ = fs::remove_dir_all(&temp);
    }
    result
}

pub async fn set_skill_enabled(base_url: &str, name: &str, enabled: bool) -> Result<Value, String> {
    let name = name.trim();
    if name.is_empty() {
        return Err("技能名称不能为空。".to_string());
    }

    let client = reqwest::Client::new();
    let current = global_config(&client, base_url)
        .await
        .unwrap_or_else(|_| json!({}));
    let mut skill_permissions = current
        .get("permission")
        .and_then(|permission| permission.get("skill"))
        .and_then(Value::as_object)
        .cloned()
        .unwrap_or_default();
    skill_permissions.insert(
        name.to_string(),
        Value::String(if enabled { "allow" } else { "deny" }.to_string()),
    );

    let result = update_global_config(
        &client,
        base_url,
        json!({
            "permission": {
                "skill": skill_permissions,
            },
        }),
    )
    .await?;
    dispose_instances(&client, base_url).await;
    Ok(result)
}

pub fn uninstall_skill(name: &str, location: &str, directory: Option<&str>) -> Result<(), String> {
    let name = name.trim();
    if name.is_empty() {
        return Err("技能名称不能为空。".to_string());
    }

    let skill_file =
        fs::canonicalize(location).map_err(|error| format!("定位技能文件失败：{error}"))?;
    if !skill_file.is_file() {
        return Err("只能卸载本地 SKILL.md 文件。".to_string());
    }
    if skill_file
        .file_name()
        .map(|value| value.to_string_lossy().eq_ignore_ascii_case("SKILL.md"))
        != Some(true)
    {
        return Err("只能卸载 SKILL.md 对应的技能目录。".to_string());
    }

    let skill_dir = skill_file
        .parent()
        .ok_or_else(|| "无法定位技能目录。".to_string())?;
    ensure_uninstallable_skill_dir(skill_dir, directory)?;
    fs::remove_dir_all(skill_dir).map_err(|error| format!("卸载技能失败：{error}"))
}

pub async fn pty_shells(
    base_url: &str,
    directory: Option<&str>,
) -> Result<Vec<PtyShellInfo>, reqwest::Error> {
    let url = format!("{}/pty/shells", base_url.trim_end_matches('/'));
    request_with_directory(reqwest::Client::new().get(url), directory)
        .send()
        .await?
        .error_for_status()?
        .json::<Vec<PtyShellInfo>>()
        .await
}

pub async fn pty_list(
    base_url: &str,
    directory: Option<&str>,
) -> Result<Vec<PtyInfo>, reqwest::Error> {
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
    if let Some(command) = input
        .command
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
    {
        payload.insert("command".to_string(), json!(command));
    }
    if let Some(args) = input.args.as_ref().filter(|value| !value.is_empty()) {
        payload.insert("args".to_string(), json!(args));
    }
    if let Some(cwd) = input
        .cwd
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
    {
        payload.insert("cwd".to_string(), json!(cwd));
    }
    if let Some(title) = input
        .title
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
    {
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
    if let Some(title) = input
        .title
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
    {
        payload.insert("title".to_string(), json!(title));
    }
    if let Some(size) = input
        .size
        .as_ref()
        .filter(|value| value.rows > 0 && value.cols > 0)
    {
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
    original_provider_id: Option<&str>,
) -> Result<Value, String> {
    validate_third_party_provider(provider)?;

    let client = reqwest::Client::new();
    let provider_id = provider.id.trim();
    if let Some(api_key) = api_key.map(str::trim).filter(|value| !value.is_empty()) {
        let auth_url = format!("{}/auth/{}", base_url.trim_end_matches('/'), provider_id);
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
    } else if let Some(original_id) = original_provider_id
        .map(str::trim)
        .filter(|value| !value.is_empty() && *value != provider_id)
    {
        let auth_move_url = format!(
            "{}/auth/{}/move/{}",
            base_url.trim_end_matches('/'),
            original_id,
            provider_id
        );
        client
            .post(auth_move_url)
            .send()
            .await
            .map_err(|error| format!("迁移 OpenCode auth 失败：{error}"))?
            .error_for_status()
            .map_err(|error| format!("迁移 OpenCode auth 失败：{error}"))?;
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

pub async fn provider_auth_status(
    base_url: &str,
) -> Result<HashMap<String, ProviderAuthStatus>, String> {
    let url = format!("{}/auth", base_url.trim_end_matches('/'));
    reqwest::Client::new()
        .get(url)
        .send()
        .await
        .map_err(|error| format!("读取 OpenCode auth 状态失败：{error}"))?
        .error_for_status()
        .map_err(|error| format!("读取 OpenCode auth 状态失败：{error}"))?
        .json::<HashMap<String, ProviderAuthStatus>>()
        .await
        .map_err(|error| format!("解析 OpenCode auth 状态失败：{error}"))
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
        archived_at: value
            .get("time")
            .and_then(|time| time.get("archived"))
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

fn u64_field(value: &Value, key: &str) -> Option<u64> {
    value.get(key).and_then(Value::as_u64)
}

fn text_submatch_from_value(value: &Value) -> Option<TextSearchSubmatch> {
    Some(TextSearchSubmatch {
        text: value
            .get("match")
            .and_then(|matched| string_field(matched, "text"))
            .or_else(|| string_field(value, "text"))
            .unwrap_or_default(),
        start: u64_field(value, "start").unwrap_or_default(),
        end: u64_field(value, "end").unwrap_or_default(),
    })
}

fn text_match_from_value(value: &Value) -> Option<TextSearchMatch> {
    let path = value
        .get("path")
        .and_then(|path| string_field(path, "text"))
        .or_else(|| string_field(value, "path"))?;
    let line = value
        .get("lines")
        .and_then(|lines| string_field(lines, "text"))
        .or_else(|| string_field(value, "line"))
        .unwrap_or_default();
    let submatches = value
        .get("submatches")
        .and_then(Value::as_array)
        .map(|items| {
            items
                .iter()
                .filter_map(text_submatch_from_value)
                .collect::<Vec<_>>()
        })
        .unwrap_or_default();

    Some(TextSearchMatch {
        path,
        line,
        line_number: u64_field(value, "line_number")
            .or_else(|| u64_field(value, "lineNumber"))
            .unwrap_or_default(),
        absolute_offset: u64_field(value, "absolute_offset")
            .or_else(|| u64_field(value, "absoluteOffset"))
            .unwrap_or_default(),
        submatches,
        raw: value.clone(),
    })
}

fn symbol_search_result_from_value(value: &Value) -> Option<SymbolSearchResult> {
    let location = value.get("location");
    let range = location
        .and_then(|location| location.get("range"))
        .or_else(|| value.get("range"));
    let start = range.and_then(|range| range.get("start"));
    let line = start
        .and_then(|start| u64_field(start, "line"))
        .map(|line| line + 1);
    let character = start.and_then(|start| u64_field(start, "character"));

    Some(SymbolSearchResult {
        name: string_field(value, "name")?,
        kind: u64_field(value, "kind").unwrap_or_default(),
        uri: location
            .and_then(|location| string_field(location, "uri"))
            .or_else(|| string_field(value, "uri")),
        line,
        character,
        raw: value.clone(),
    })
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
        .map(|items| {
            items
                .iter()
                .filter_map(question_prompt_from_value)
                .collect()
        })
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

fn skill_from_value(value: &Value) -> Option<SkillInfo> {
    Some(SkillInfo {
        name: string_field(value, "name")?,
        description: string_field(value, "description").unwrap_or_default(),
        location: string_field(value, "location").unwrap_or_default(),
        content: string_field(value, "content").unwrap_or_default(),
        enabled: true,
    })
}

fn local_codex_skill_roots() -> Vec<PathBuf> {
    let mut roots = Vec::new();
    if let Ok(home) = std::env::var("CODEX_HOME") {
        roots.push(PathBuf::from(home).join("skills"));
    }
    if let Some(home) = dirs::home_dir() {
        roots.push(home.join(".codex").join("skills"));
    }

    roots.dedup();
    roots
}

#[cfg(test)]
fn read_skill_root(root: &Path) -> Vec<SkillInfo> {
    let Ok(entries) = fs::read_dir(root) else {
        return Vec::new();
    };

    entries
        .filter_map(Result::ok)
        .filter_map(|entry| {
            let path = entry.path();
            if !path.is_dir() {
                return None;
            }
            let name = path.file_name()?.to_string_lossy();
            if name.starts_with('.') {
                return None;
            }
            parse_local_skill_file(&path.join("SKILL.md"))
        })
        .collect()
}

fn parse_local_skill_file(path: &Path) -> Option<SkillInfo> {
    let raw = fs::read_to_string(path).ok()?;
    let (frontmatter, content) = split_frontmatter(&raw)?;
    let name = frontmatter_field(frontmatter, "name")?;
    Some(SkillInfo {
        name,
        description: frontmatter_field(frontmatter, "description").unwrap_or_default(),
        location: path.to_string_lossy().to_string(),
        content: content.trim_start().to_string(),
        enabled: true,
    })
}

fn apply_skill_enabled_state(skills: &mut [SkillInfo], config: &Value) {
    for skill in skills {
        skill.enabled = skill_enabled_from_config(config, &skill.name);
    }
}

fn skill_enabled_from_config(config: &Value, name: &str) -> bool {
    let Some(rule) = config
        .get("permission")
        .and_then(|permission| permission.get("skill"))
    else {
        return true;
    };

    if let Some(action) = rule.as_str() {
        return action != "deny";
    }

    let Some(map) = rule.as_object() else {
        return true;
    };

    let mut enabled = true;
    for (pattern, action) in map {
        if !wildcard_match(pattern, name) {
            continue;
        }
        enabled = action.as_str() != Some("deny");
    }
    enabled
}

fn wildcard_match(pattern: &str, value: &str) -> bool {
    let pattern = pattern.to_ascii_lowercase();
    let value = value.to_ascii_lowercase();
    if pattern == "*" || pattern == value {
        return true;
    }
    if !pattern.contains('*') {
        return false;
    }

    let anchored_start = !pattern.starts_with('*');
    let anchored_end = !pattern.ends_with('*');
    let parts = pattern
        .split('*')
        .filter(|part| !part.is_empty())
        .collect::<Vec<_>>();
    if parts.is_empty() {
        return true;
    }

    let mut cursor = 0usize;
    for (index, part) in parts.iter().enumerate() {
        let Some(found) = value[cursor..].find(part) else {
            return false;
        };
        if index == 0 && anchored_start && found != 0 {
            return false;
        }
        cursor += found + part.len();
    }

    if anchored_end {
        value.ends_with(parts.last().copied().unwrap_or_default())
    } else {
        true
    }
}

fn ensure_uninstallable_skill_dir(skill_dir: &Path, directory: Option<&str>) -> Result<(), String> {
    for root in local_codex_skill_roots() {
        let Ok(root) = fs::canonicalize(root) else {
            continue;
        };
        if !skill_dir.starts_with(&root) {
            continue;
        }
        let relative = skill_dir
            .strip_prefix(&root)
            .map_err(|error| error.to_string())?;
        if relative
            .components()
            .next()
            .map(|component| component.as_os_str().to_string_lossy().starts_with('.'))
            .unwrap_or(true)
        {
            return Err("系统内置技能不能卸载，请改为禁用。".to_string());
        }
        return Ok(());
    }

    if is_inside_named_skill_root(skill_dir, ".opencode", "skills") {
        return Ok(());
    }

    if let Some(directory) = directory {
        let _ = fs::canonicalize(directory).map_err(|error| format!("定位工作区失败：{error}"))?;
    }
    Err("这个技能来自插件缓存、系统目录或当前工作区之外，不能直接卸载，请改为禁用。".to_string())
}

fn is_inside_named_skill_root(skill_dir: &Path, config_dir: &str, skill_root: &str) -> bool {
    let parts = skill_dir
        .components()
        .map(|component| component.as_os_str().to_string_lossy().to_string())
        .collect::<Vec<_>>();
    for index in 0..parts.len().saturating_sub(2) {
        if parts[index].eq_ignore_ascii_case(config_dir)
            && parts[index + 1].eq_ignore_ascii_case(skill_root)
        {
            return true;
        }
    }
    false
}

fn split_frontmatter(raw: &str) -> Option<(&str, &str)> {
    let raw = raw.strip_prefix('\u{feff}').unwrap_or(raw);
    let mut lines = raw.split_inclusive('\n');
    let first = lines.next()?;
    if first.trim_end_matches(['\r', '\n']) != "---" {
        return None;
    }

    let frontmatter_start = first.len();
    let mut cursor = frontmatter_start;
    for line in lines {
        if line.trim_end_matches(['\r', '\n']) == "---" {
            return Some((&raw[frontmatter_start..cursor], &raw[cursor + line.len()..]));
        }
        cursor += line.len();
    }

    None
}

fn frontmatter_field(frontmatter: &str, key: &str) -> Option<String> {
    for line in frontmatter.lines() {
        let line = line.trim();
        if line.is_empty() || line.starts_with('#') {
            continue;
        }
        let Some((name, value)) = line.split_once(':') else {
            continue;
        };
        if name.trim() != key {
            continue;
        }
        let value = value.trim();
        let unquoted = value
            .strip_prefix('"')
            .and_then(|value| value.strip_suffix('"'))
            .or_else(|| {
                value
                    .strip_prefix('\'')
                    .and_then(|value| value.strip_suffix('\''))
            })
            .unwrap_or(value);
        return Some(unquoted.to_string());
    }

    None
}

#[derive(Debug, Clone)]
struct GithubContentEntry {
    name: String,
    path: String,
    kind: String,
    download_url: Option<String>,
}

fn local_codex_skills_root() -> Result<PathBuf, String> {
    if let Ok(home) = std::env::var("CODEX_HOME") {
        return Ok(PathBuf::from(home).join("skills"));
    }
    dirs::home_dir()
        .map(|home| home.join(".codex").join("skills"))
        .ok_or_else(|| "无法定位 Codex skills 目录".to_string())
}

fn local_codex_skill_names() -> Vec<String> {
    local_codex_skill_roots()
        .into_iter()
        .flat_map(|root| {
            fs::read_dir(root)
                .ok()
                .into_iter()
                .flat_map(|entries| entries.filter_map(Result::ok))
                .filter_map(|entry| {
                    let path = entry.path();
                    let name = path.file_name()?.to_string_lossy();
                    if name.starts_with('.') {
                        return None;
                    }
                    if !path.is_dir() || !path.join("SKILL.md").is_file() {
                        return None;
                    }
                    parse_local_skill_file(&path.join("SKILL.md")).map(|skill| skill.name)
                })
        })
        .collect()
}

fn cached_codex_recommendations() -> Option<Vec<SkillRecommendationInfo>> {
    let cache = CODEX_RECOMMENDATION_CACHE
        .get_or_init(|| Mutex::new(None))
        .lock()
        .ok()?;
    let (cached_at, recommendations) = cache.as_ref()?;
    let age = cached_at.elapsed().ok()?;
    if age.as_secs() <= CODEX_RECOMMENDATION_CACHE_TTL_SECONDS {
        Some(recommendations.clone())
    } else {
        None
    }
}

fn store_codex_recommendations(recommendations: &[SkillRecommendationInfo]) {
    if let Ok(mut cache) = CODEX_RECOMMENDATION_CACHE
        .get_or_init(|| Mutex::new(None))
        .lock()
    {
        *cache = Some((SystemTime::now(), recommendations.to_vec()));
    }
}

fn apply_recommendation_install_state(
    recommendations: &mut [SkillRecommendationInfo],
    installed: &[String],
) {
    for recommendation in recommendations {
        recommendation.installed =
            recommendation_installed(installed, &recommendation.name, &recommendation.path);
    }
}

fn recommendation_installed(installed: &[String], name: &str, path: &str) -> bool {
    let path_name = path.rsplit('/').next().unwrap_or(path);
    installed.iter().any(|installed_name| {
        installed_name.eq_ignore_ascii_case(name) || installed_name.eq_ignore_ascii_case(path_name)
    })
}

fn github_client() -> reqwest::Client {
    reqwest::Client::builder()
        .user_agent("opencode-gui-skills")
        .connect_timeout(Duration::from_secs(5))
        .timeout(Duration::from_secs(20))
        .build()
        .unwrap_or_else(|_| reqwest::Client::new())
}

async fn codex_recommendation_from_entry(
    client: reqwest::Client,
    entry: GithubContentEntry,
) -> SkillRecommendationInfo {
    let GithubContentEntry {
        name: entry_name,
        path: skill_path,
        ..
    } = entry;
    let skill_md_path = format!("{skill_path}/SKILL.md");
    let raw = fetch_github_text(&client, CODEX_SKILLS_REPO, CODEX_SKILLS_REF, &skill_md_path)
        .await
        .unwrap_or_default();
    let metadata = split_frontmatter(&raw).map(|(frontmatter, _)| frontmatter);
    let name = metadata
        .and_then(|frontmatter| frontmatter_field(frontmatter, "name"))
        .unwrap_or(entry_name);
    let description = metadata
        .and_then(|frontmatter| frontmatter_field(frontmatter, "description"))
        .unwrap_or_default();

    SkillRecommendationInfo {
        title: title_from_skill_name(&name),
        installed: false,
        name,
        description,
        repo: CODEX_SKILLS_REPO.to_string(),
        path: skill_path,
        ref_name: CODEX_SKILLS_REF.to_string(),
    }
}

async fn github_contents(
    client: &reqwest::Client,
    repo: &str,
    ref_name: &str,
    path: &str,
) -> Result<Vec<GithubContentEntry>, String> {
    let url = github_contents_url(repo, ref_name, path)?;
    let response = client
        .get(url)
        .header("Accept", "application/vnd.github+json")
        .send()
        .await
        .map_err(|error| format!("读取推荐技能失败：{error}"))?
        .error_for_status()
        .map_err(|error| format!("读取推荐技能失败：{error}"))?
        .json::<Value>()
        .await
        .map_err(|error| format!("解析推荐技能失败：{error}"))?;

    Ok(response
        .as_array()
        .cloned()
        .unwrap_or_default()
        .into_iter()
        .filter_map(github_content_entry_from_value)
        .collect())
}

fn github_content_entry_from_value(value: Value) -> Option<GithubContentEntry> {
    Some(GithubContentEntry {
        name: string_field(&value, "name")?,
        path: string_field(&value, "path")?,
        kind: string_field(&value, "type")?,
        download_url: string_field(&value, "download_url"),
    })
}

async fn fetch_github_text(
    client: &reqwest::Client,
    repo: &str,
    ref_name: &str,
    path: &str,
) -> Result<String, String> {
    let url = github_raw_url(repo, ref_name, path)?;
    client
        .get(url)
        .send()
        .await
        .map_err(|error| format!("读取技能说明失败：{error}"))?
        .error_for_status()
        .map_err(|error| format!("读取技能说明失败：{error}"))?
        .text()
        .await
        .map_err(|error| format!("读取技能说明失败：{error}"))
}

async fn download_github_directory(
    client: &reqwest::Client,
    repo: &str,
    ref_name: &str,
    repo_path: &str,
    destination: &Path,
) -> Result<(), String> {
    fs::create_dir_all(destination).map_err(|error| format!("创建临时目录失败：{error}"))?;
    let mut pending = vec![(repo_path.to_string(), destination.to_path_buf())];

    while let Some((current_path, current_destination)) = pending.pop() {
        let entries = github_contents(client, repo, ref_name, &current_path).await?;
        fs::create_dir_all(&current_destination)
            .map_err(|error| format!("创建技能目录失败：{error}"))?;

        for entry in entries {
            if !is_safe_path_segment(&entry.name) {
                return Err("推荐技能包含无效文件名".to_string());
            }

            let target = current_destination.join(&entry.name);
            match entry.kind.as_str() {
                "dir" => pending.push((entry.path, target)),
                "file" => {
                    let url = entry
                        .download_url
                        .or_else(|| github_raw_url(repo, ref_name, &entry.path).ok())
                        .ok_or_else(|| "推荐技能文件缺少下载地址".to_string())?;
                    let bytes = client
                        .get(url)
                        .send()
                        .await
                        .map_err(|error| format!("下载技能文件失败：{error}"))?
                        .error_for_status()
                        .map_err(|error| format!("下载技能文件失败：{error}"))?
                        .bytes()
                        .await
                        .map_err(|error| format!("下载技能文件失败：{error}"))?;
                    fs::write(&target, &bytes)
                        .map_err(|error| format!("写入技能文件失败：{error}"))?;
                }
                _ => {}
            }
        }
    }

    Ok(())
}

fn github_contents_url(repo: &str, ref_name: &str, path: &str) -> Result<String, String> {
    let (owner, repo_name) = split_github_repo(repo)?;
    let mut url = reqwest::Url::parse("https://api.github.com/")
        .map_err(|error| format!("GitHub 地址无效：{error}"))?;
    {
        let mut segments = url
            .path_segments_mut()
            .map_err(|_| "GitHub 地址无效".to_string())?;
        segments
            .push("repos")
            .push(owner)
            .push(repo_name)
            .push("contents");
        for segment in path.split('/').filter(|segment| !segment.is_empty()) {
            segments.push(segment);
        }
    }
    url.query_pairs_mut().append_pair("ref", ref_name);
    Ok(url.to_string())
}

fn github_raw_url(repo: &str, ref_name: &str, path: &str) -> Result<String, String> {
    let (owner, repo_name) = split_github_repo(repo)?;
    let mut url = reqwest::Url::parse("https://raw.githubusercontent.com/")
        .map_err(|error| format!("GitHub 地址无效：{error}"))?;
    {
        let mut segments = url
            .path_segments_mut()
            .map_err(|_| "GitHub 地址无效".to_string())?;
        segments.push(owner).push(repo_name).push(ref_name);
        for segment in path.split('/').filter(|segment| !segment.is_empty()) {
            segments.push(segment);
        }
    }
    Ok(url.to_string())
}

fn split_github_repo(repo: &str) -> Result<(&str, &str), String> {
    let mut parts = repo.split('/');
    let owner = parts.next().filter(|value| !value.trim().is_empty());
    let name = parts.next().filter(|value| !value.trim().is_empty());
    if parts.next().is_some() {
        return Err("GitHub repo 格式应为 owner/repo".to_string());
    }
    match (owner, name) {
        (Some(owner), Some(name)) => Ok((owner, name)),
        _ => Err("GitHub repo 格式应为 owner/repo".to_string()),
    }
}

fn is_safe_path_segment(name: &str) -> bool {
    !name.is_empty() && name != "." && name != ".." && !name.contains('/') && !name.contains('\\')
}

fn title_from_skill_name(name: &str) -> String {
    name.split(['-', '_'])
        .filter(|part| !part.is_empty())
        .map(|part| {
            if part.eq_ignore_ascii_case("aspnet") {
                "Aspnet".to_string()
            } else if part.eq_ignore_ascii_case("cli") {
                "CLI".to_string()
            } else if part.eq_ignore_ascii_case("pdf") {
                "PDF".to_string()
            } else {
                let mut chars = part.chars();
                match chars.next() {
                    Some(first) => first.to_uppercase().collect::<String>() + chars.as_str(),
                    None => String::new(),
                }
            }
        })
        .collect::<Vec<_>>()
        .join(" ")
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
        let input_modalities = if provider.supports_attachment {
            json!(["text", "image", "pdf"])
        } else {
            json!(["text"])
        };
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
                "modalities": {
                    "input": input_modalities,
                    "output": ["text"],
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

pub async fn dispose_instance(base_url: &str, directory: Option<&str>) {
    let url = format!("{}/instance/dispose", base_url.trim_end_matches('/'));
    let request = request_with_directory(reqwest::Client::new().post(url), directory);
    let _ = request.send().await;
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

    fn test_third_party_provider(supports_attachment: bool) -> ThirdPartyProviderConfig {
        ThirdPartyProviderConfig {
            id: "custom".to_string(),
            name: "Custom".to_string(),
            protocol: "openai-compatible".to_string(),
            base_url: "https://example.com/v1".to_string(),
            models: vec!["vision-model".to_string()],
            default_model: Some("vision-model".to_string()),
            headers: String::new(),
            timeout: None,
            chunk_timeout: None,
            context_limit: Some(128_000),
            output_limit: Some(16_384),
            supports_reasoning: true,
            supports_attachment,
        }
    }

    #[test]
    fn third_party_provider_config_maps_attachment_to_input_modalities() {
        let config = third_party_provider_config(&test_third_party_provider(true))
            .expect("provider config should build");

        assert_eq!(
            config["models"]["vision-model"]["modalities"]["input"],
            serde_json::json!(["text", "image", "pdf"])
        );
        assert_eq!(
            config["models"]["vision-model"]["modalities"]["output"],
            serde_json::json!(["text"])
        );
    }

    #[test]
    fn third_party_provider_config_keeps_text_only_without_attachment_support() {
        let config = third_party_provider_config(&test_third_party_provider(false))
            .expect("provider config should build");

        assert_eq!(
            config["models"]["vision-model"]["modalities"]["input"],
            serde_json::json!(["text"])
        );
    }

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

    #[test]
    fn local_codex_skill_reader_skips_system_dirs_and_parses_frontmatter() {
        let root =
            std::env::temp_dir().join(format!("opencode-gui-skill-test-{}", std::process::id()));
        let _ = fs::remove_dir_all(&root);

        let skill_dir = root.join("code");
        fs::create_dir_all(&skill_dir).expect("skill dir should be created");
        fs::write(
            skill_dir.join("SKILL.md"),
            "---\nname: code\ndescription: Development skill.\n---\n\n# Code\n",
        )
        .expect("skill file should be written");

        let system_dir = root.join(".system");
        fs::create_dir_all(&system_dir).expect("system dir should be created");
        fs::write(
            system_dir.join("SKILL.md"),
            "---\nname: internal\ndescription: Hidden system skill.\n---\n\n# Internal\n",
        )
        .expect("system skill file should be written");

        let skills = read_skill_root(&root);
        assert_eq!(skills.len(), 1);
        assert_eq!(skills[0].name, "code");
        assert_eq!(skills[0].description, "Development skill.");
        assert_eq!(skills[0].content, "# Code\n");

        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn opencode_skill_dirs_can_be_uninstalled_from_parent_config_dirs() {
        let root = PathBuf::from("D:\\Desktop\\开发工具\\.opencode\\skills\\code");
        assert!(is_inside_named_skill_root(&root, ".opencode", "skills"));

        let plugin_skill =
            PathBuf::from("C:\\Users\\d8743\\.codex\\plugins\\cache\\browser\\skills\\browser");
        assert!(!is_inside_named_skill_root(
            &plugin_skill,
            ".opencode",
            "skills"
        ));
    }

    #[test]
    fn uninstall_skill_removes_local_opencode_skill_dir() {
        let root = std::env::temp_dir().join(format!(
            "opencode-gui-uninstall-skill-test-{}",
            std::process::id()
        ));
        let skill_dir = root.join(".opencode").join("skills").join("demo");
        let skill_file = skill_dir.join("SKILL.md");
        let _ = fs::remove_dir_all(&root);
        fs::create_dir_all(&skill_dir).expect("skill dir should be created");
        fs::write(
            &skill_file,
            "---\nname: demo\ndescription: Demo skill.\n---\n\n# Demo\n",
        )
        .expect("skill file should be written");

        uninstall_skill("demo", &skill_file.to_string_lossy(), None)
            .expect("local opencode skill should uninstall");

        assert!(!skill_dir.exists());
        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn local_server_bind_uses_requested_host_and_port() {
        let (hostname, port) =
            local_server_bind("http://127.0.0.1:5099").expect("server bind should parse");

        assert_eq!(hostname, "127.0.0.1");
        assert_eq!(port, "5099");
        assert_eq!(
            local_server_args(&hostname, &port),
            vec![
                "serve".to_string(),
                "--hostname=127.0.0.1".to_string(),
                "--port=5099".to_string()
            ]
        );
    }

    #[test]
    fn local_server_bind_defaults_known_http_port() {
        let (hostname, port) =
            local_server_bind("http://localhost").expect("server bind should parse");

        assert_eq!(hostname, "localhost");
        assert_eq!(port, "80");
    }

    #[test]
    fn dev_source_server_prefers_installed_bun() {
        let args = local_server_args("127.0.0.1", "4096");
        let spec = dev_source_server_command_spec(&args, true);

        assert_eq!(spec.program, dev_bun());
        assert_eq!(
            spec.args,
            vec![
                "--cwd".to_string(),
                "packages/opencode".to_string(),
                "--conditions=browser".to_string(),
                "./src/index.ts".to_string(),
                "serve".to_string(),
                "--hostname=127.0.0.1".to_string(),
                "--port=4096".to_string()
            ]
        );
    }

    #[test]
    fn dev_source_server_uses_npx_fallback_when_bun_is_missing() {
        let args = local_server_args("127.0.0.1", "4096");
        let spec = dev_source_server_command_spec(&args, false);

        assert_eq!(spec.program, dev_npx());
        assert_eq!(
            spec.args,
            vec![
                "--yes".to_string(),
                "bun@1.3.13".to_string(),
                "--cwd".to_string(),
                "packages/opencode".to_string(),
                "--conditions=browser".to_string(),
                "./src/index.ts".to_string(),
                "serve".to_string(),
                "--hostname=127.0.0.1".to_string(),
                "--port=4096".to_string()
            ]
        );
    }

    #[test]
    fn usable_sidecar_requires_nonempty_file() {
        let root =
            std::env::temp_dir().join(format!("opencode-gui-sidecar-test-{}", std::process::id()));
        let _ = fs::remove_dir_all(&root);
        fs::create_dir_all(&root).expect("test dir should be created");

        let empty = root.join("empty.exe");
        fs::write(&empty, []).expect("empty sidecar should be written");
        assert!(!is_usable_sidecar(&empty));

        let nonempty = root.join("nonempty.exe");
        fs::write(&nonempty, [1]).expect("nonempty sidecar should be written");
        assert!(is_usable_sidecar(&nonempty));

        let _ = fs::remove_dir_all(&root);
    }
}
