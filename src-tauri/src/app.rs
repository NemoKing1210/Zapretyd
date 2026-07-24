use crate::types::AppSettings;
use std::{fs, path::PathBuf, sync::Mutex};
use tauri::State;

pub struct AppState {
    pub config_path: PathBuf,
    pub settings: Mutex<AppSettings>,
}
impl AppState {
    pub fn load(dir: PathBuf) -> Result<Self, String> {
        fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
        let config_path = dir.join("settings.json");
        let settings = fs::read_to_string(&config_path)
            .ok()
            .and_then(|s| serde_json::from_str(&s).ok())
            .unwrap_or(AppSettings {
                auto_check_updates: true,
                theme: "system".into(),
                ..Default::default()
            });
        Ok(Self {
            config_path,
            settings: Mutex::new(settings),
        })
    }
    pub(crate) fn persist(&self, settings: &AppSettings) -> Result<(), String> {
        fs::write(
            &self.config_path,
            serde_json::to_vec_pretty(settings).map_err(|e| e.to_string())?,
        )
        .map_err(|e| e.to_string())
    }
}
#[tauri::command]
pub fn get_settings(state: State<AppState>) -> Result<AppSettings, String> {
    Ok(state.settings.lock().map_err(|e| e.to_string())?.clone())
}
#[tauri::command]
pub fn save_settings(settings: AppSettings, state: State<AppState>) -> Result<(), String> {
    if let Some(path) = &settings.library_path {
        let path = crate::library::validate_library_path(path)?;
        fs::create_dir_all(path.join("versions")).map_err(|e| e.to_string())?;
    }
    let mut saved = state.settings.lock().map_err(|e| e.to_string())?;
    state.persist(&settings)?;
    *saved = settings;
    Ok(())
}
pub fn administrator() -> bool {
    std::process::Command::new("powershell").args(["-NoProfile", "-Command", "([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)"]).output().map(|o| String::from_utf8_lossy(&o.stdout).trim().eq_ignore_ascii_case("true")).unwrap_or(false)
}
#[tauri::command]
pub fn get_system_locale() -> String {
    std::process::Command::new("powershell")
        .args(["-NoProfile", "-Command", "(Get-Culture).Name"])
        .output()
        .ok()
        .and_then(|output| String::from_utf8(output.stdout).ok())
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
        .unwrap_or_else(|| "en-US".into())
}
#[tauri::command]
pub fn is_administrator() -> bool {
    administrator()
}
#[tauri::command]
pub fn relaunch_as_admin() -> Result<(), String> {
    let executable = std::env::current_exe().map_err(|e| e.to_string())?;
    std::process::Command::new("powershell")
        .args([
            "-NoProfile",
            "-Command",
            &format!(
                "Start-Process -FilePath '{}' -Verb RunAs",
                executable.display()
            ),
        ])
        .spawn()
        .map_err(|e| e.to_string())?;
    Ok(())
}
