use crate::types::AppSettings;
use std::{
    fs,
    path::PathBuf,
    sync::{Mutex, OnceLock},
};
use tauri::{AppHandle, State};

pub struct AppState {
    pub config_dir: PathBuf,
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
                theme: "system".into(),
                locale: "system".into(),
                ..Default::default()
            });
        Ok(Self {
            config_dir: dir,
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
pub fn save_settings(
    settings: AppSettings,
    state: State<AppState>,
    app: AppHandle,
) -> Result<(), String> {
    if let Some(path) = &settings.library_path {
        let path = crate::library::validate_library_path(path)?;
        fs::create_dir_all(path.join("versions")).map_err(|e| e.to_string())?;
    }
    sync_autostart(&app, settings.autostart)?;
    let mut saved = state.settings.lock().map_err(|e| e.to_string())?;
    state.persist(&settings)?;
    *saved = settings;
    drop(saved);
    let _ = crate::tray::rebuild_menu(&app);
    Ok(())
}

fn sync_autostart(app: &AppHandle, enabled: bool) -> Result<(), String> {
    use tauri_plugin_autostart::ManagerExt;
    let launcher = app.autolaunch();
    if enabled {
        launcher
            .enable()
            .map_err(|_| "error.autostart.failed".to_string())?;
    } else {
        launcher
            .disable()
            .map_err(|_| "error.autostart.failed".to_string())?;
    }
    Ok(())
}

pub(crate) fn apply_autostart(app: &AppHandle, enabled: bool) -> Result<(), String> {
    sync_autostart(app, enabled)
}

fn detect_administrator() -> bool {
    #[cfg(windows)]
    {
        use std::mem::size_of;
        use windows::Win32::Foundation::{CloseHandle, HANDLE};
        use windows::Win32::Security::{
            GetTokenInformation, TokenElevation, TOKEN_ELEVATION, TOKEN_QUERY,
        };
        use windows::Win32::System::Threading::{GetCurrentProcess, OpenProcessToken};

        // IsUserAnAdmin is wrong under UAC: it can be true for a non-elevated admin.
        // TokenElevation matches the old PowerShell IsInRole(Administrator) check.
        unsafe {
            let mut token = HANDLE::default();
            if OpenProcessToken(GetCurrentProcess(), TOKEN_QUERY, &mut token).is_err() {
                return false;
            }
            let mut elevation = TOKEN_ELEVATION::default();
            let mut returned = 0u32;
            let ok = GetTokenInformation(
                token,
                TokenElevation,
                Some((&raw mut elevation).cast()),
                size_of::<TOKEN_ELEVATION>() as u32,
                &mut returned,
            );
            let _ = CloseHandle(token);
            ok.is_ok() && elevation.TokenIsElevated != 0
        }
    }
    #[cfg(not(windows))]
    {
        false
    }
}

fn detect_system_locale() -> String {
    #[cfg(windows)]
    {
        use windows::Win32::Globalization::GetUserDefaultLocaleName;

        let mut buffer = [0u16; 85]; // LOCALE_NAME_MAX_LENGTH
        let len = unsafe { GetUserDefaultLocaleName(&mut buffer) };
        if len > 0 {
            let name = String::from_utf16_lossy(&buffer[..(len as usize - 1)]);
            if !name.is_empty() {
                return name;
            }
        }
        "en-US".into()
    }
    #[cfg(not(windows))]
    {
        "en-US".into()
    }
}

pub fn administrator() -> bool {
    static CACHED: OnceLock<bool> = OnceLock::new();
    *CACHED.get_or_init(detect_administrator)
}

#[tauri::command]
pub fn get_system_locale() -> String {
    static CACHED: OnceLock<String> = OnceLock::new();
    CACHED.get_or_init(detect_system_locale).clone()
}

#[tauri::command]
pub fn is_administrator() -> bool {
    administrator()
}
/// Elevate a new instance via UAC. Does not exit the current process.
pub fn elevate_self() -> Result<(), String> {
    let executable = std::env::current_exe().map_err(|e| e.to_string())?;
    let path: Vec<u16> = {
        use std::os::windows::ffi::OsStrExt;
        executable
            .as_os_str()
            .encode_wide()
            .chain(std::iter::once(0))
            .collect()
    };
    // ShellExecuteW with "runas" shows UAC without spawning a PowerShell console.
    let result = unsafe {
        use windows::core::{w, PCWSTR};
        use windows::Win32::UI::Shell::ShellExecuteW;
        use windows::Win32::UI::WindowsAndMessaging::SW_SHOWNORMAL;
        ShellExecuteW(
            None,
            w!("runas"),
            PCWSTR(path.as_ptr()),
            None,
            None,
            SW_SHOWNORMAL,
        )
    };
    // Per MSDN, values > 32 mean success; ≤ 32 means failure (incl. UAC cancel).
    if result.0 as isize <= 32 {
        return Err("error.service.adminRequired".into());
    }
    Ok(())
}

#[tauri::command]
pub fn relaunch_as_admin(app: AppHandle) -> Result<(), String> {
    elevate_self()?;
    app.exit(0);
    Ok(())
}
