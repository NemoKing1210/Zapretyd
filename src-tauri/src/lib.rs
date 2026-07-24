mod app;
mod library;
mod releases;
mod service;
mod tray;
mod types;
mod window_chrome;

use app::AppState;
use tauri::{Manager, RunEvent, WindowEvent};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let app = tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            app.manage(AppState::load(app.path().app_config_dir()?)?);
            window_chrome::init_window_chrome(app.handle());
            tray::init_tray(app.handle())?;
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
            library::get_default_library_path,
            library::list_installed_versions,
            library::install_release,
            library::remove_version,
            library::get_strategies,
            library::open_directory,
            service::get_service_status,
            service::activate_strategy,
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
