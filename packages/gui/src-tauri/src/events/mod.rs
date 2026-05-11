use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::sync::Arc;
use tauri::{AppHandle, Emitter};
use tokio::sync::RwLock;
use tokio::task::JoinHandle;
use tokio::time::{sleep, Duration};

const RAW_EVENT_NAME: &str = "opencode.event";
const ACTIVITY_EVENT_NAME: &str = "thread.activity";
const BRIDGE_STATUS_EVENT_NAME: &str = "opencode.event.status";
const MAX_RECENT_ACTIVITY: usize = 200;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OpenCodeEventEnvelope {
    pub directory: Option<String>,
    pub project: Option<String>,
    pub workspace: Option<String>,
    pub payload: Value,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ThreadActivityItem {
    pub id: String,
    pub kind: String,
    pub status: String,
    pub title: String,
    pub detail: Option<String>,
    pub source_event_type: String,
    pub session_id: Option<String>,
    pub directory: Option<String>,
    pub created_at: i64,
    pub raw: Value,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct EventBridgeStatus {
    connected: bool,
    base_url: String,
    message: String,
}

#[derive(Debug, Default)]
pub struct EventBridgeState {
    pub task: Option<JoinHandle<()>>,
    pub activities: Vec<ThreadActivityItem>,
}

pub type SharedEventBridgeState = Arc<RwLock<EventBridgeState>>;

pub async fn start_global_bridge(app: AppHandle, state: SharedEventBridgeState, base_url: String) {
    stop_global_bridge(state.clone()).await;

    let task_state = state.clone();
    let task = tokio::spawn(async move {
        run_global_bridge(app, task_state, base_url).await;
    });

    state.write().await.task = Some(task);
}

pub async fn stop_global_bridge(state: SharedEventBridgeState) {
    let task = state.write().await.task.take();
    if let Some(task) = task {
        task.abort();
    }
}

pub async fn recent_activity(state: SharedEventBridgeState) -> Vec<ThreadActivityItem> {
    state.read().await.activities.clone()
}

async fn run_global_bridge(app: AppHandle, state: SharedEventBridgeState, base_url: String) {
    let client = reqwest::Client::new();
    let url = format!("{}/global/event", base_url.trim_end_matches('/'));
    let mut retry_delay = Duration::from_secs(1);

    loop {
        emit_bridge_status(&app, true, &base_url, "正在连接 OpenCode 事件流");

        match connect_once(&client, &app, state.clone(), &url, &base_url).await {
            Ok(()) => {
                retry_delay = Duration::from_secs(1);
            }
            Err(error) => {
                tracing::warn!(%error, "OpenCode 事件流断开");
                emit_bridge_status(
                    &app,
                    false,
                    &base_url,
                    &format!("OpenCode 事件流断开，准备重连：{error}"),
                );
                sleep(retry_delay).await;
                retry_delay = (retry_delay * 2).min(Duration::from_secs(30));
            }
        }
    }
}

async fn connect_once(
    client: &reqwest::Client,
    app: &AppHandle,
    state: SharedEventBridgeState,
    url: &str,
    base_url: &str,
) -> Result<(), reqwest::Error> {
    let mut response = client
        .get(url)
        .header("accept", "text/event-stream")
        .send()
        .await?
        .error_for_status()?;

    emit_bridge_status(app, true, base_url, "OpenCode 事件流已连接");

    let mut buffer = String::new();
    while let Some(chunk) = response.chunk().await? {
        buffer.push_str(&String::from_utf8_lossy(&chunk));

        while let Some((index, separator_len)) = find_sse_boundary(&buffer) {
            let frame = buffer[..index].to_string();
            buffer.drain(..index + separator_len);

            let Some(data) = parse_sse_frame(&frame) else {
                continue;
            };
            let Ok(envelope) = serde_json::from_str::<OpenCodeEventEnvelope>(&data) else {
                tracing::debug!(data, "忽略无法解析的 OpenCode SSE 数据");
                continue;
            };

            handle_envelope(app, state.clone(), envelope).await;
        }
    }

    Ok(())
}

async fn handle_envelope(
    app: &AppHandle,
    state: SharedEventBridgeState,
    envelope: OpenCodeEventEnvelope,
) {
    let _ = app.emit(RAW_EVENT_NAME, &envelope);

    let Some(activity) = map_activity(&envelope) else {
        return;
    };

    {
        let mut guard = state.write().await;
        guard.activities.insert(0, activity.clone());
        if guard.activities.len() > MAX_RECENT_ACTIVITY {
            guard.activities.truncate(MAX_RECENT_ACTIVITY);
        }
    }

    let _ = app.emit(ACTIVITY_EVENT_NAME, activity);
}

fn map_activity(envelope: &OpenCodeEventEnvelope) -> Option<ThreadActivityItem> {
    let payload = &envelope.payload;
    let payload_type = payload.get("type")?.as_str()?.to_string();
    if payload_type == "server.heartbeat" {
        return None;
    }

    let id = payload
        .get("id")
        .and_then(Value::as_str)
        .map(ToOwned::to_owned)
        .unwrap_or_else(|| format!("evt_{}", crate::storage::now_ms()));

    let (source_type, data) = if payload_type == "sync" {
        let sync = payload.get("syncEvent")?;
        let sync_type = sync
            .get("type")
            .and_then(Value::as_str)
            .map(strip_event_version)
            .unwrap_or_else(|| "sync".to_string());
        (sync_type, sync.get("data").unwrap_or(sync))
    } else {
        (
            payload_type.clone(),
            payload.get("properties").unwrap_or(payload),
        )
    };

    let session_id = data
        .get("sessionID")
        .and_then(Value::as_str)
        .or_else(|| {
            payload
                .get("properties")
                .and_then(|properties| properties.get("sessionID"))
                .and_then(Value::as_str)
        })
        .map(ToOwned::to_owned);

    let mapped = match source_type.as_str() {
        "server.connected" => Some((
            "server",
            "success",
            "已连接 OpenCode 事件流".to_string(),
            envelope.directory.clone(),
        )),
        "global.disposed" => Some((
            "server",
            "warning",
            "OpenCode 全局实例已释放".to_string(),
            None,
        )),
        "server.instance.disposed" => Some((
            "server",
            "warning",
            "工作区实例已释放".to_string(),
            data.get("directory")
                .and_then(Value::as_str)
                .map(ToOwned::to_owned),
        )),
        "session.created" | "session.updated" | "session.deleted" => None,
        "message.updated" | "message.part.updated" | "message.removed" | "message.part.removed" => {
            None
        }
        "session.status" => {
            let status = data
                .get("status")
                .and_then(|status| status.get("type"))
                .and_then(Value::as_str)
                .unwrap_or("unknown");
            if status == "idle" {
                None
            } else {
                Some((
                    "session",
                    "running",
                    "线程正在运行".to_string(),
                    Some(format!("状态：{status}")),
                ))
            }
        }
        "session.idle" => None,
        "session.error" => Some((
            "error",
            "failed",
            "线程运行出错".to_string(),
            data.get("error")
                .and_then(|error| error.get("message"))
                .and_then(Value::as_str)
                .map(ToOwned::to_owned),
        )),
        "session.diff" => Some((
            "file_edit",
            "success",
            "检测到线程文件变更".to_string(),
            data.get("diff")
                .and_then(Value::as_array)
                .map(|items| format!("{} 个 diff 项", items.len())),
        )),
        "file.edited" => Some((
            "file_edit",
            "success",
            "文件已修改".to_string(),
            data.get("file")
                .and_then(Value::as_str)
                .map(ToOwned::to_owned),
        )),
        "permission.asked" => Some((
            "approval",
            "waiting",
            "等待权限审批".to_string(),
            permission_detail(data),
        )),
        "permission.replied" => Some((
            "approval",
            "success",
            "权限请求已处理".to_string(),
            data.get("reply")
                .and_then(Value::as_str)
                .map(|reply| format!("处理结果：{reply}")),
        )),
        "question.asked" => Some((
            "approval",
            "waiting",
            "等待用户回答".to_string(),
            data.get("query")
                .and_then(Value::as_str)
                .map(ToOwned::to_owned),
        )),
        "question.replied" | "question.rejected" => {
            Some(("approval", "success", "用户问题已处理".to_string(), None))
        }
        "session.next.prompted" => Some((
            "message",
            "running",
            "收到新的用户任务".to_string(),
            prompt_detail(data),
        )),
        "session.next.step.started" => Some((
            "thinking",
            "running",
            "智能体开始执行步骤".to_string(),
            agent_model_detail(data),
        )),
        "session.next.step.ended" => Some((
            "result",
            "success",
            "智能体步骤已完成".to_string(),
            usage_detail(data),
        )),
        "session.next.step.failed" => Some((
            "error",
            "failed",
            "智能体步骤失败".to_string(),
            data.get("error")
                .and_then(|error| error.get("message"))
                .and_then(Value::as_str)
                .map(ToOwned::to_owned),
        )),
        "session.next.shell.started" => Some((
            "command",
            "running",
            "开始执行 shell 命令".to_string(),
            data.get("command")
                .and_then(Value::as_str)
                .map(ToOwned::to_owned),
        )),
        "session.next.shell.ended" => Some((
            "command",
            "success",
            "shell 命令执行完成".to_string(),
            output_detail(data),
        )),
        "session.next.tool.called" => Some((
            "tool",
            "running",
            format!(
                "调用工具：{}",
                data.get("tool")
                    .and_then(Value::as_str)
                    .unwrap_or("unknown")
            ),
            call_detail(data),
        )),
        "session.next.tool.success" => Some((
            "tool",
            "success",
            "工具执行完成".to_string(),
            call_detail(data),
        )),
        "session.next.tool.failed" => Some((
            "tool",
            "failed",
            "工具执行失败".to_string(),
            data.get("error")
                .and_then(|error| error.get("message"))
                .and_then(Value::as_str)
                .map(ToOwned::to_owned)
                .or_else(|| call_detail(data)),
        )),
        "session.next.text.ended" => Some((
            "message",
            "success",
            "助手回复完成".to_string(),
            text_excerpt(data, "text"),
        )),
        "session.next.reasoning.ended" => Some((
            "thinking",
            "success",
            "推理内容已完成".to_string(),
            text_excerpt(data, "text"),
        )),
        "session.next.retried" => Some((
            "error",
            "running",
            "请求正在重试".to_string(),
            data.get("error")
                .and_then(|error| error.get("message"))
                .and_then(Value::as_str)
                .map(ToOwned::to_owned),
        )),
        "session.next.compaction.started" => Some((
            "thinking",
            "running",
            "开始压缩上下文".to_string(),
            data.get("reason")
                .and_then(Value::as_str)
                .map(|reason| format!("原因：{reason}")),
        )),
        "session.next.compaction.ended" => Some((
            "thinking",
            "success",
            "上下文压缩完成".to_string(),
            text_excerpt(data, "text"),
        )),
        _ if source_type.ends_with(".delta") => None,
        _ if source_type.starts_with("message.") => None,
        _ => None,
    }?;

    Some(ThreadActivityItem {
        id,
        kind: mapped.0.to_string(),
        status: mapped.1.to_string(),
        title: mapped.2,
        detail: mapped.3,
        source_event_type: source_type,
        session_id,
        directory: envelope.directory.clone(),
        created_at: crate::storage::now_ms(),
        raw: envelope.payload.clone(),
    })
}

fn emit_bridge_status(app: &AppHandle, connected: bool, base_url: &str, message: &str) {
    let _ = app.emit(
        BRIDGE_STATUS_EVENT_NAME,
        EventBridgeStatus {
            connected,
            base_url: base_url.to_string(),
            message: message.to_string(),
        },
    );
}

fn find_sse_boundary(input: &str) -> Option<(usize, usize)> {
    match (input.find("\n\n"), input.find("\r\n\r\n")) {
        (Some(lf), Some(crlf)) if crlf < lf => Some((crlf, 4)),
        (Some(lf), _) => Some((lf, 2)),
        (_, Some(crlf)) => Some((crlf, 4)),
        _ => None,
    }
}

fn parse_sse_frame(frame: &str) -> Option<String> {
    let data = frame
        .lines()
        .filter_map(|line| line.strip_prefix("data:"))
        .map(|line| line.strip_prefix(' ').unwrap_or(line))
        .collect::<Vec<_>>()
        .join("\n");

    if data.is_empty() {
        None
    } else {
        Some(data)
    }
}

fn strip_event_version(value: &str) -> String {
    let Some((base, version)) = value.rsplit_once('.') else {
        return value.to_string();
    };
    if version.chars().all(|ch| ch.is_ascii_digit()) {
        base.to_string()
    } else {
        value.to_string()
    }
}

fn permission_detail(data: &Value) -> Option<String> {
    let permission = data.get("permission").and_then(Value::as_str)?;
    let patterns = data
        .get("patterns")
        .and_then(Value::as_array)
        .map(|items| {
            items
                .iter()
                .filter_map(Value::as_str)
                .collect::<Vec<_>>()
                .join(", ")
        })
        .filter(|value| !value.is_empty());

    Some(match patterns {
        Some(patterns) => format!("{permission}：{patterns}"),
        None => permission.to_string(),
    })
}

fn prompt_detail(data: &Value) -> Option<String> {
    let prompt = data.get("prompt")?;
    if let Some(text) = prompt.get("text").and_then(Value::as_str) {
        return Some(excerpt(text, 120));
    }
    if let Some(parts) = prompt.get("parts").and_then(Value::as_array) {
        let text = parts
            .iter()
            .filter_map(|part| part.get("text").and_then(Value::as_str))
            .collect::<Vec<_>>()
            .join("\n");
        if !text.is_empty() {
            return Some(excerpt(&text, 120));
        }
    }
    None
}

fn agent_model_detail(data: &Value) -> Option<String> {
    let agent = data.get("agent").and_then(Value::as_str);
    let model = data
        .get("model")
        .and_then(|model| model.get("id").or_else(|| model.get("model")))
        .and_then(Value::as_str);
    match (agent, model) {
        (Some(agent), Some(model)) => Some(format!("agent：{agent}，model：{model}")),
        (Some(agent), None) => Some(format!("agent：{agent}")),
        (None, Some(model)) => Some(format!("model：{model}")),
        _ => None,
    }
}

fn usage_detail(data: &Value) -> Option<String> {
    let finish = data.get("finish").and_then(Value::as_str);
    let cost = data.get("cost").and_then(Value::as_f64);
    match (finish, cost) {
        (Some(finish), Some(cost)) => Some(format!("结束原因：{finish}，成本：{cost:.4}")),
        (Some(finish), None) => Some(format!("结束原因：{finish}")),
        (None, Some(cost)) => Some(format!("成本：{cost:.4}")),
        _ => None,
    }
}

fn output_detail(data: &Value) -> Option<String> {
    data.get("output")
        .and_then(Value::as_str)
        .map(|output| excerpt(output, 160))
}

fn call_detail(data: &Value) -> Option<String> {
    data.get("callID")
        .and_then(Value::as_str)
        .map(|call| format!("调用 ID：{call}"))
}

fn text_excerpt(data: &Value, key: &str) -> Option<String> {
    data.get(key)
        .and_then(Value::as_str)
        .map(|text| excerpt(text, 160))
}

fn excerpt(value: &str, limit: usize) -> String {
    let compact = value.split_whitespace().collect::<Vec<_>>().join(" ");
    if compact.chars().count() <= limit {
        return compact;
    }

    let mut output = compact.chars().take(limit).collect::<String>();
    output.push_str("...");
    output
}
