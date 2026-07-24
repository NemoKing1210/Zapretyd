mod app;
mod library;
mod releases;
mod service;
mod types;

use app::AppState;
use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            app.manage(AppState::load(app.path().app_config_dir()?)?);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            app::get_settings,
            app::save_settings,
            app::get_system_locale,
            app::is_administrator,
            app::relaunch_as_admin,
            releases::check_latest_release,
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
        .run(tauri::generate_context!())
        .expect("error while running Zapretyd");
}
