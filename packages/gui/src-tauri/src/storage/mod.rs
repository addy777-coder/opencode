use crate::error::AppResult;
use serde_json::Value;
use sqlx::sqlite::{SqliteConnectOptions, SqlitePoolOptions};
use sqlx::{Row, SqlitePool};
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Manager};

pub async fn init(app: &AppHandle) -> AppResult<SqlitePool> {
    let app_dir = app.path().app_data_dir()?;
    std::fs::create_dir_all(&app_dir)?;
    let db_path = app_dir.join("opencode-gui.sqlite");

    let options = SqliteConnectOptions::new()
        .filename(db_path)
        .create_if_missing(true);

    let pool = SqlitePoolOptions::new()
        .max_connections(5)
        .connect_with(options)
        .await?;

    sqlx::migrate!("./migrations").run(&pool).await?;

    Ok(pool)
}

pub async fn get_setting(pool: &SqlitePool, key: &str) -> AppResult<Option<Value>> {
    let raw = sqlx::query_scalar::<_, String>("SELECT value_json FROM app_settings WHERE key = ?")
        .bind(key)
        .fetch_optional(pool)
        .await?;

    raw.map(|value| serde_json::from_str(&value))
        .transpose()
        .map_err(Into::into)
}

pub async fn set_setting(pool: &SqlitePool, key: &str, value: Value) -> AppResult<()> {
    let value_json = serde_json::to_string(&value)?;
    sqlx::query(
    "INSERT INTO app_settings (key, value_json, updated_at)
     VALUES (?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json, updated_at = excluded.updated_at",
  )
  .bind(key)
  .bind(value_json)
  .bind(now_ms())
  .execute(pool)
  .await?;

    Ok(())
}

pub async fn upsert_workspace(
    pool: &SqlitePool,
    path: &str,
    name: Option<&str>,
) -> AppResult<WorkspaceRecord> {
    let now = now_ms();
    let id = format!("wks_{}", stable_id(path));

    sqlx::query(
    "INSERT INTO workspaces (id, path, name, icon, last_opened_at, created_at)
     VALUES (?, ?, ?, NULL, ?, ?)
     ON CONFLICT(path) DO UPDATE SET name = excluded.name, last_opened_at = excluded.last_opened_at",
  )
  .bind(&id)
  .bind(path)
  .bind(name)
  .bind(now)
  .bind(now)
  .execute(pool)
  .await?;

    Ok(WorkspaceRecord {
        id,
        path: path.to_string(),
        name: name.map(ToOwned::to_owned),
        last_opened_at: now,
    })
}

pub async fn list_workspaces(pool: &SqlitePool, limit: i64) -> AppResult<Vec<WorkspaceRecord>> {
    let rows = sqlx::query(
        "SELECT id, path, name, last_opened_at
         FROM workspaces
         ORDER BY last_opened_at DESC
         LIMIT ?",
    )
    .bind(limit.clamp(1, 50))
    .fetch_all(pool)
    .await?;

    Ok(rows
        .into_iter()
        .map(|row| WorkspaceRecord {
            id: row.get("id"),
            path: row.get("path"),
            name: row.get("name"),
            last_opened_at: row.get("last_opened_at"),
        })
        .collect())
}

pub async fn remove_workspace(pool: &SqlitePool, id: &str) -> AppResult<()> {
    sqlx::query("DELETE FROM workspaces WHERE id = ?")
        .bind(id)
        .execute(pool)
        .await?;

    Ok(())
}

#[derive(Debug, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceRecord {
    pub id: String,
    pub path: String,
    pub name: Option<String>,
    pub last_opened_at: i64,
}

pub fn now_ms() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as i64
}

fn stable_id(value: &str) -> String {
    let mut hash: u64 = 14695981039346656037;
    for byte in value.as_bytes() {
        hash ^= *byte as u64;
        hash = hash.wrapping_mul(1099511628211);
    }
    format!("{hash:x}")
}
