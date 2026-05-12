use crate::error::AppResult;
use crate::events::{EventBridgeState, SharedEventBridgeState};
use crate::opencode::ServerStatus;
use crate::storage;
use serde::{Deserialize, Serialize};
use sqlx::SqlitePool;
use std::sync::Arc;
use tauri::AppHandle;
use tokio::process::Child;
use tokio::sync::{Mutex, RwLock};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AppInfo {
    pub version: String,
    pub database_ready: bool,
}

#[derive(Debug)]
pub struct ManagedServerChild {
    pub base_url: String,
    pub child: Child,
}

#[derive(Debug)]
pub struct AppState {
    pub db: SqlitePool,
    pub info: AppInfo,
    pub server: Arc<RwLock<ServerStatus>>,
    pub opencode_child: Arc<Mutex<Option<ManagedServerChild>>>,
    pub event_bridge: SharedEventBridgeState,
}

impl AppState {
    pub async fn new(app: &AppHandle) -> AppResult<Self> {
        let db = storage::init(app).await?;
        Ok(Self {
            db,
            info: AppInfo {
                version: env!("CARGO_PKG_VERSION").to_string(),
                database_ready: true,
            },
            server: Arc::new(RwLock::new(ServerStatus::unconfigured())),
            opencode_child: Arc::new(Mutex::new(None)),
            event_bridge: Arc::new(RwLock::new(EventBridgeState::default())),
        })
    }
}
