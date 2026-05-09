use thiserror::Error;

#[derive(Debug, Error)]
pub enum AppError {
    #[error("数据库错误：{0}")]
    Sqlx(#[from] sqlx::Error),
    #[error("数据库迁移错误：{0}")]
    Migration(#[from] sqlx::migrate::MigrateError),
    #[error("文件系统错误：{0}")]
    Io(#[from] std::io::Error),
    #[error("Tauri 路径错误：{0}")]
    TauriPath(#[from] tauri::Error),
    #[error("HTTP 请求错误：{0}")]
    Http(#[from] reqwest::Error),
    #[error("JSON 解析错误：{0}")]
    Json(#[from] serde_json::Error),
}

pub type AppResult<T> = Result<T, AppError>;

pub fn command_error(error: impl std::fmt::Display) -> String {
    error.to_string()
}
