mod app;
mod error_log;
mod library;
mod process_win;
mod releases;
mod service;
mod tray;
mod types;
mod window_chrome;

use app::AppState;
use tauri::{Manager, RunEvent, WindowEvent};

const AUTOSTART_ARG: &str = "--autostart";

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let app = tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(
            tauri_plugin_autostart::Builder::new()
                .arg(AUTOSTART_ARG)
                .build(),
        )
        .setup(|app| {
            let config_dir = app.path().app_config_dir()?;
            error_log::install_panic_hook(config_dir.clone());
            let state = AppState::load(config_dir)?;
            let settings = state
                .settings
                .lock()
                .map_err(|e| e.to_string())?
                .clone();
            app.manage(state);

            window_chrome::init_window_chrome(app.handle());
            tray::init_tray(app.handle())?;

            let _ = app::apply_autostart(app.handle(), settings.autostart);

            let from_autostart = std::env::args().any(|arg| arg == AUTOSTART_ARG);
            if from_autostart && settings.start_minimized {
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.hide();
                }
            }

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            app::get_settings,
            app::save_settings,
            app::get_system_locale,
            app::is_administrator,
            app::relaunch_as_admin,
            window_chrome::sync_window_chrome,
            releases::check_latest_release,
            releases::refresh_release_catalog,
            releases::list_releases,
            releases::get_release,
            library::list_installed_versions,
            library::install_release,
            library::remove_version,
            library::get_strategies,
            library::list_version_list_files,
            library::read_version_list_file,
            library::write_version_list_file,
            library::delete_version_list_file,
            library::restore_version_list_file,
            library::open_directory,
            error_log::append_error_logs,
            error_log::get_logs_dir,
            error_log::open_logs_directory,
            error_log::clear_error_logs,
            service::get_service_status,
            service::activate_strategy,
            service::start_service,
            service::stop_service,
            service::remove_service
        ])
        .build(tauri::generate_context!())
        .expect("error while building Zapretyd");

    app.run(|app, event| {
        if let RunEvent::WindowEvent {
            label,
            event: WindowEvent::CloseRequested { api, .. },
            ..
        } = event
        {
            if label == "main" {
                api.prevent_close();
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.hide();
                }
            }
        }
    });
}
