mod commands;
mod error;
mod events;
mod opencode;
mod state;
mod storage;
mod watcher;

use state::AppState;
use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tracing_subscriber::fmt()
        .with_env_filter(tracing_subscriber::EnvFilter::from_default_env())
        .init();

    let builder = tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init());
    #[cfg(desktop)]
    let builder = builder.plugin(tauri_plugin_updater::Builder::new().build());

    let app = builder
        .setup(|app| {
            let handle = app.handle().clone();
            let state =
                tauri::async_runtime::block_on(async move { AppState::new(&handle).await })?;
            app.manage(state);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::app_init,
            commands::gui_update_check,
            commands::gui_update_install,
            commands::server_start,
            commands::server_stop,
            commands::server_status,
            commands::thread_activity_recent,
            commands::session_list,
            commands::session_status,
            commands::session_create,
            commands::session_update_title,
            commands::session_update_permission,
            commands::session_update_archived,
            commands::session_fork,
            commands::session_prompt,
            commands::session_abort,
            commands::session_delete,
            commands::session_message_delete,
            commands::session_message_update_text,
            commands::session_messages,
            commands::session_diff,
            commands::execution_options,
            commands::file_search,
            commands::text_search,
            commands::symbol_search,
            commands::command_list,
            commands::skill_list,
            commands::skill_recommendations,
            commands::skill_install,
            commands::skill_set_enabled,
            commands::skill_uninstall,
            commands::pty_shells,
            commands::pty_list,
            commands::pty_create,
            commands::pty_update,
            commands::pty_remove,
            commands::pty_connect_token,
            commands::mcp_status,
            commands::mcp_add,
            commands::mcp_connect,
            commands::mcp_disconnect,
            commands::third_party_provider_apply,
            commands::third_party_provider_remove,
            commands::third_party_provider_auth_status,
            commands::third_party_provider_models,
            commands::permission_list,
            commands::permission_reply,
            commands::question_list,
            commands::question_reply,
            commands::question_reject,
            commands::workspace_pick,
            commands::workspace_open,
            commands::workspace_list,
            commands::workspace_remove,
            commands::settings_get,
            commands::settings_set,
            commands::open_path,
            commands::read_file_preview,
            commands::file_tree,
            commands::open_url,
            commands::detect_playwright_install,
            commands::notify,
            commands::git_status,
            commands::workspace_file_diffs
        ])
        .build(tauri::generate_context!())
        .expect("初始化 OpenCode GUI 时发生错误");

    app.run(|app_handle, event| {
        if let tauri::RunEvent::ExitRequested { .. } = event {
            let state = app_handle.state::<AppState>();
            tauri::async_runtime::block_on(commands::shutdown_managed_server(&state));
        }
    });
}
