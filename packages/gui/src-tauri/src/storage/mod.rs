use crate::error::AppResult;
use serde_json::Value;
use sqlx::migrate::MigrateError;
use sqlx::sqlite::{SqliteConnectOptions, SqlitePoolOptions};
use sqlx::{Row, SqlitePool};
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Manager};

const DB_FILE_NAME: &str = "opencode-gui.sqlite";

pub async fn init(app: &AppHandle) -> AppResult<SqlitePool> {
    let app_dir = app.path().app_data_dir()?;
    std::fs::create_dir_all(&app_dir)?;
    let db_path = app_dir.join(DB_FILE_NAME);

    let pool = connect_pool(&db_path).await?;

    if let Err(error) = sqlx::migrate!("./migrations").run(&pool).await {
        if !is_recoverable_migration_error(&error) {
            return Err(error.into());
        }

        let error_message = error.to_string();
        pool.close().await;
        drop(pool);

        let backups = backup_incompatible_database(&db_path)?;
        tracing::warn!(
            database = %db_path.display(),
            backups = ?backups,
            "Reset GUI database after incompatible migration history: {error_message}"
        );

        let pool = connect_pool(&db_path).await?;
        sqlx::migrate!("./migrations").run(&pool).await?;
        return Ok(pool);
    }

    Ok(pool)
}

async fn connect_pool(db_path: &Path) -> Result<SqlitePool, sqlx::Error> {
    let options = SqliteConnectOptions::new()
        .filename(db_path)
        .create_if_missing(true);

    SqlitePoolOptions::new()
        .max_connections(5)
        .connect_with(options)
        .await
}

fn is_recoverable_migration_error(error: &MigrateError) -> bool {
    matches!(error, MigrateError::VersionMismatch(1))
}

fn backup_incompatible_database(db_path: &Path) -> std::io::Result<Vec<PathBuf>> {
    let backup_suffix = format!("bad-migration-{}", now_ms());
    backup_database_files(db_path, &backup_suffix)
}

fn backup_database_files(db_path: &Path, backup_suffix: &str) -> std::io::Result<Vec<PathBuf>> {
    let mut backups = Vec::new();
    for path in [
        db_path.to_path_buf(),
        companion_path(db_path, "-wal"),
        companion_path(db_path, "-shm"),
    ] {
        if !path.exists() {
            continue;
        }

        let backup_path = backup_path(&path, backup_suffix);
        std::fs::rename(&path, &backup_path)?;
        backups.push(backup_path);
    }
    Ok(backups)
}

fn companion_path(db_path: &Path, suffix: &str) -> PathBuf {
    let mut file_name = db_path.file_name().unwrap_or_default().to_os_string();
    file_name.push(suffix);
    db_path.with_file_name(file_name)
}

fn backup_path(path: &Path, backup_suffix: &str) -> PathBuf {
    let mut file_name = path.file_name().unwrap_or_default().to_os_string();
    file_name.push(format!(".bak-{backup_suffix}"));
    path.with_file_name(file_name)
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

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    #[test]
    fn backs_up_sqlite_database_and_companion_files() {
        let temp_dir = std::env::temp_dir().join(format!("opencode-gui-storage-{}", now_ms()));
        fs::create_dir_all(&temp_dir).unwrap();

        let db_path = temp_dir.join(DB_FILE_NAME);
        let wal_path = companion_path(&db_path, "-wal");
        let shm_path = companion_path(&db_path, "-shm");
        fs::write(&db_path, b"db").unwrap();
        fs::write(&wal_path, b"wal").unwrap();
        fs::write(&shm_path, b"shm").unwrap();

        let backups = backup_database_files(&db_path, "test").unwrap();

        assert_eq!(backups.len(), 3);
        assert!(!db_path.exists());
        assert!(!wal_path.exists());
        assert!(!shm_path.exists());
        assert_eq!(fs::read(backup_path(&db_path, "test")).unwrap(), b"db");
        assert_eq!(fs::read(backup_path(&wal_path, "test")).unwrap(), b"wal");
        assert_eq!(fs::read(backup_path(&shm_path, "test")).unwrap(), b"shm");

        fs::remove_dir_all(temp_dir).unwrap();
    }
}
