use crate::{
    app::{administrator, AppState},
    types::{ServiceStatus, StrategyInfo},
};
use std::{fs, path::Path, process::Command};
use tauri::State;

fn output(program: &str, args: &[&str]) -> String {
    Command::new(program)
        .args(args)
        .output()
        .map(|o| String::from_utf8_lossy(&o.stdout).into_owned())
        .unwrap_or_default()
}
fn success(program: &str, args: &[&str]) -> bool {
    Command::new(program)
        .args(args)
        .status()
        .is_ok_and(|s| s.success())
}
pub fn active_strategy_name() -> Result<Option<String>, String> {
    let result = output(
        "reg",
        &[
            "query",
            r"HKLM\System\CurrentControlSet\Services\zapret",
            "/v",
            "zapret-discord-youtube",
        ],
    );
    Ok(result
        .lines()
        .find_map(|line| line.split("REG_SZ").nth(1))
        .map(|value| value.trim().to_string())
        .filter(|s| !s.is_empty()))
}
fn service_running(name: &str) -> bool {
    output("sc", &["query", name]).contains("RUNNING")
}
fn process_running(name: &str) -> bool {
    output("tasklist", &["/FI", &format!("IMAGENAME eq {name}")])
        .to_ascii_lowercase()
        .contains(&name.to_ascii_lowercase())
}
#[tauri::command]
pub fn get_service_status() -> ServiceStatus {
    let exists = !output("sc", &["query", "zapret"]).contains("FAILED 1060");
    ServiceStatus {
        is_admin: administrator(),
        service_exists: exists,
        service_running: service_running("zapret"),
        windivert_running: service_running("WinDivert") || service_running("WinDivert14"),
        winws_running: process_running("winws.exe"),
        active_strategy: active_strategy_name().ok().flatten(),
        message_code: if exists {
            "service.detected".into()
        } else {
            "service.notInstalled".into()
        },
    }
}
fn require_admin() -> Result<(), String> {
    if administrator() {
        Ok(())
    } else {
        Err("error.service.adminRequired".into())
    }
}
fn managed_strategy(path: &str, state: &AppState) -> Result<(), String> {
    let base = state
        .settings
        .lock()
        .map_err(|e| e.to_string())?
        .library_path
        .clone()
        .ok_or("error.library.notConfigured".to_string())?;
    let root = Path::new(&base)
        .join("versions")
        .canonicalize()
        .map_err(|_| "error.service.versionLibraryNotFound".to_string())?;
    let selected = Path::new(path)
        .canonicalize()
        .map_err(|_| "error.service.strategyNotFound".to_string())?;
    if !selected.starts_with(root)
        || selected
            .extension()
            .and_then(|e| e.to_str())
            .is_none_or(|e| !e.eq_ignore_ascii_case("bat"))
        || selected
            .file_name()
            .and_then(|n| n.to_str())
            .is_some_and(|n| n.to_ascii_lowercase().starts_with("service"))
    {
        return Err("error.service.managedStrategyOnly".into());
    }
    Ok(())
}
fn parse_winws_args(strategy: &Path) -> Result<String, String> {
    let content = fs::read_to_string(strategy).map_err(|e| e.to_string())?;
    let mut command = String::new();
    let mut capture = false;
    for raw in content.lines() {
        let line = raw.trim();
        if line.to_ascii_lowercase().contains("winws.exe") {
            capture = true;
            let after = line.split_once("winws.exe").map(|(_, r)| r).unwrap_or("");
            command.push_str(after.trim().trim_end_matches('^'));
            command.push(' ');
            if !line.ends_with('^') {
                break;
            }
        } else if capture {
            command.push_str(line.trim_end_matches('^'));
            command.push(' ');
            if !line.ends_with('^') {
                break;
            }
        }
    }
    if command.trim().is_empty() {
        return Err("error.service.winwsNotInStrategy".into());
    }
    let root = strategy.parent().ok_or("error.service.invalidStrategyPath".to_string())?;
    let bin = root.join("bin").to_string_lossy().replace('\\', "\\\\");
    let lists = root.join("lists").to_string_lossy().replace('\\', "\\\\");
    Ok(command
        .replace("%BIN%", &bin)
        .replace("%LISTS%", &lists)
        .replace("^", "")
        .trim()
        .to_string())
}
#[tauri::command]
pub fn activate_strategy(strategy: StrategyInfo, state: State<AppState>) -> Result<(), String> {
    require_admin()?;
    managed_strategy(&strategy.path, &state)?;
    let file = Path::new(&strategy.path);
    let root = file.parent().ok_or("error.service.invalidPath".to_string())?;
    let binary = root.join("bin").join("winws.exe");
    if !binary.exists() {
        return Err("error.service.winwsNotFound".into());
    }
    let args = parse_winws_args(file)?;
    let _ = success("sc", &["stop", "zapret"]);
    let _ = success("sc", &["delete", "zapret"]);
    let bin_path = format!("\"{}\" {}", binary.display(), args);
    if !success(
        "sc",
        &[
            "create",
            "zapret",
            &format!("binPath= {bin_path}"),
            "start= auto",
            "DisplayName= zapret",
        ],
    ) {
        return Err("error.service.createFailed".into());
    }
    let filename = file
        .file_name()
        .and_then(|n| n.to_str())
        .ok_or("error.service.invalidFileName".to_string())?;
    if !success(
        "reg",
        &[
            "add",
            r"HKLM\System\CurrentControlSet\Services\zapret",
            "/v",
            "zapret-discord-youtube",
            "/t",
            "REG_SZ",
            "/d",
            filename,
            "/f",
        ],
    ) {
        return Err("error.service.saveStrategyFailed".into());
    }
    if !success("sc", &["start", "zapret"]) {
        return Err("error.service.startFailed".into());
    }
    Ok(())
}
#[tauri::command]
pub fn stop_service() -> Result<(), String> {
    require_admin()?;
    if success("sc", &["stop", "zapret"]) {
        Ok(())
    } else {
        Err("error.service.stopFailed".into())
    }
}
#[tauri::command]
pub fn remove_service() -> Result<(), String> {
    require_admin()?;
    let _ = success("sc", &["stop", "zapret"]);
    if success("sc", &["delete", "zapret"]) {
        Ok(())
    } else {
        Err("error.service.removeFailed".into())
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn parses_embedded_command() {
        let file = std::env::temp_dir().join("zapretyd-test.bat");
        fs::write(
            &file,
            "@echo off\n%BIN%winws.exe --wf-tcp=80,443 ^\n --hostlist=%LISTS%list.txt",
        )
        .unwrap();
        let args = parse_winws_args(&file).unwrap();
        assert!(args.contains("--wf-tcp=80,443"));
        let _ = fs::remove_file(file);
    }
}
