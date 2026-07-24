use crate::{
    app::AppState,
    service,
    types::{DownloadProgress, InstalledVersion, ReleaseInfo, StrategyInfo},
};
use chrono::Utc;
use futures_util::StreamExt;
use sha2::{Digest, Sha256};
use std::{
    fs,
    path::{Path, PathBuf},
};
use tauri::{Emitter, State, Window};
use tokio::io::AsyncWriteExt;

const META: &str = ".zapretyd.json";
/// Fallback when the app data path contains non-ASCII characters (e.g. Cyrillic username).
const ASCII_FALLBACK_LIBRARY: &str = r"C:\Zapretyd";

pub fn validate_library_path(path: &str) -> Result<PathBuf, String> {
    if path.trim().is_empty()
        || path
            .chars()
            .any(|c| !c.is_ascii() || matches!(c, '<' | '>' | '"' | '|' | '?' | '*'))
    {
        return Err("error.library.pathInvalid".into());
    }
    Ok(PathBuf::from(path))
}

/// Built-in library folder under the app config directory, or an ASCII fallback.
pub fn resolve_default_library_path(config_dir: &Path) -> PathBuf {
    let candidate = config_dir.join("library");
    match candidate.to_str() {
        Some(path) if validate_library_path(path).is_ok() => candidate,
        _ => PathBuf::from(ASCII_FALLBACK_LIBRARY),
    }
}

#[tauri::command]
pub fn get_default_library_path(state: State<AppState>) -> Result<String, String> {
    let path = resolve_default_library_path(&state.config_dir);
    path.to_str()
        .map(str::to_string)
        .ok_or_else(|| "error.library.pathInvalid".into())
}
fn versions_dir(base: &str) -> PathBuf {
    Path::new(base).join("versions")
}

fn is_strategy_bat(path: &Path) -> bool {
    let name = path
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or_default();
    path.extension()
        .and_then(|e| e.to_str())
        .is_some_and(|e| e.eq_ignore_ascii_case("bat"))
        && !name.to_ascii_lowercase().starts_with("service")
}

fn directory_has_strategy_bats(dir: &Path) -> bool {
    fs::read_dir(dir)
        .map(|entries| {
            entries
                .filter_map(|entry| entry.ok())
                .any(|entry| is_strategy_bat(&entry.path()))
        })
        .unwrap_or(false)
}

/// Upstream ZIPs often wrap files in a single folder (`zapret-discord-youtube-X.Y.Z/`).
/// Prefer that folder when the version root has no strategy `.bat` files.
fn resolve_version_payload_dir(version_dir: &Path) -> PathBuf {
    if directory_has_strategy_bats(version_dir) {
        return version_dir.to_path_buf();
    }
    let Ok(entries) = fs::read_dir(version_dir) else {
        return version_dir.to_path_buf();
    };
    let dirs: Vec<PathBuf> = entries
        .filter_map(|entry| entry.ok())
        .map(|entry| entry.path())
        .filter(|path| path.is_dir())
        .collect();
    if let Some(nested) = dirs
        .iter()
        .find(|path| directory_has_strategy_bats(path))
        .cloned()
    {
        return nested;
    }
    version_dir.to_path_buf()
}

/// After ZIP extract, hoist contents when the archive had a single root directory.
fn flatten_single_root_dir(target: &Path) -> Result<(), String> {
    let entries: Vec<_> = fs::read_dir(target)
        .map_err(|e| e.to_string())?
        .filter_map(|entry| entry.ok())
        .collect();
    let dirs: Vec<_> = entries
        .iter()
        .filter(|entry| entry.path().is_dir())
        .collect();
    let files: Vec<_> = entries
        .iter()
        .filter(|entry| entry.path().is_file())
        .collect();
    if !(files.is_empty() && dirs.len() == 1) {
        return Ok(());
    }
    let nested = dirs[0].path();
    for entry in fs::read_dir(&nested).map_err(|e| e.to_string())? {
        let entry = entry.map_err(|e| e.to_string())?;
        let destination = target.join(entry.file_name());
        fs::rename(entry.path(), &destination).map_err(|e| e.to_string())?;
    }
    fs::remove_dir(&nested).map_err(|e| e.to_string())?;
    Ok(())
}

pub fn installed_tags(base: &str) -> Result<Vec<String>, String> {
    Ok(list_versions_at(base)?.into_iter().map(|v| v.tag).collect())
}
fn list_versions_at(base: &str) -> Result<Vec<InstalledVersion>, String> {
    let root = versions_dir(base);
    if !root.exists() {
        return Ok(vec![]);
    }
    let active = service::active_strategy_name().ok().flatten();
    let mut list = vec![];
    for entry in fs::read_dir(root).map_err(|e| e.to_string())? {
        let entry = entry.map_err(|e| e.to_string())?;
        if !entry.path().is_dir() {
            continue;
        }
        let metadata = entry.path().join(META);
        let data = fs::read_to_string(metadata)
            .ok()
            .and_then(|s| serde_json::from_str::<InstalledVersion>(&s).ok());
        if let Some(mut version) = data {
            let payload = resolve_version_payload_dir(&entry.path());
            version.is_active = active
                .as_ref()
                .is_some_and(|name| payload.join(name).exists());
            list.push(version);
        }
    }
    list.sort_by(|a, b| b.installed_at.cmp(&a.installed_at));
    Ok(list)
}
#[tauri::command]
pub fn list_installed_versions(state: State<AppState>) -> Result<Vec<InstalledVersion>, String> {
    let settings = state.settings.lock().map_err(|e| e.to_string())?;
    settings
        .library_path
        .as_deref()
        .map(list_versions_at)
        .transpose()
        .map(|v| v.unwrap_or_default())
}
#[tauri::command]
pub async fn install_release(
    release: ReleaseInfo,
    force: bool,
    state: State<'_, AppState>,
    window: Window,
) -> Result<InstalledVersion, String> {
    let base_path = state
        .settings
        .lock()
        .map_err(|e| e.to_string())?
        .library_path
        .clone()
        .ok_or("error.library.chooseFirst".to_string())?;
    let base = validate_library_path(&base_path)?;
    let target = base.join("versions").join(&release.tag);
    if target.exists() {
        if !force {
            return Err("error.library.versionExists".into());
        }
        if list_versions_at(&base_path)?
            .iter()
            .any(|v| v.tag == release.tag && v.is_active)
        {
            return Err("error.library.cannotRemoveActive".into());
        }
        fs::remove_dir_all(&target).map_err(|e| e.to_string())?;
    }
    fs::create_dir_all(base.join("versions")).map_err(|e| e.to_string())?;
    let temporary = base.join(format!(".{}.zip", release.tag));
    let response = reqwest::Client::builder()
        .user_agent("Zapretyd/0.4")
        .build()
        .map_err(|e| e.to_string())?
        .get(&release.download_url)
        .send()
        .await
        .map_err(|e| e.to_string())?
        .error_for_status()
        .map_err(|e| e.to_string())?;
    let total = response.content_length();
    let mut stream = response.bytes_stream();
    let mut file = tokio::fs::File::create(&temporary)
        .await
        .map_err(|e| e.to_string())?;
    let mut hasher = Sha256::new();
    let mut downloaded = 0_u64;
    while let Some(chunk) = stream.next().await {
        let chunk = chunk.map_err(|e| e.to_string())?;
        file.write_all(&chunk).await.map_err(|e| e.to_string())?;
        hasher.update(&chunk);
        downloaded += chunk.len() as u64;
        let _ = window.emit(
            "download-progress",
            DownloadProgress {
                tag: release.tag.clone(),
                downloaded,
                total,
            },
        );
    }
    file.flush().await.map_err(|e| e.to_string())?;
    drop(file);
    let hash = format!("{:x}", hasher.finalize());
    extract_zip(&temporary, &target)?;
    flatten_single_root_dir(&target)?;
    let _ = fs::remove_file(&temporary);
    let version = InstalledVersion {
        tag: release.tag,
        path: target.to_string_lossy().into(),
        installed_at: Utc::now().to_rfc3339(),
        size: downloaded,
        sha256: hash,
        is_active: false,
    };
    fs::write(
        target.join(META),
        serde_json::to_vec_pretty(&version).map_err(|e| e.to_string())?,
    )
    .map_err(|e| e.to_string())?;
    Ok(version)
}
pub fn extract_zip(zip_path: &Path, target: &Path) -> Result<(), String> {
    let file = fs::File::open(zip_path).map_err(|e| e.to_string())?;
    let mut archive = zip::ZipArchive::new(file).map_err(|e| e.to_string())?;
    fs::create_dir_all(target).map_err(|e| e.to_string())?;
    for index in 0..archive.len() {
        let mut item = archive.by_index(index).map_err(|e| e.to_string())?;
        let relative = item
            .enclosed_name()
            .ok_or("error.library.unsafeZipPath".to_string())?
            .to_owned();
        let destination = target.join(relative);
        if item.is_dir() {
            fs::create_dir_all(destination).map_err(|e| e.to_string())?;
        } else {
            if let Some(parent) = destination.parent() {
                fs::create_dir_all(parent).map_err(|e| e.to_string())?;
            }
            let mut out = fs::File::create(destination).map_err(|e| e.to_string())?;
            std::io::copy(&mut item, &mut out).map_err(|e| e.to_string())?;
        }
    }
    Ok(())
}
#[tauri::command]
pub fn remove_version(tag: String, state: State<AppState>) -> Result<(), String> {
    let base = state
        .settings
        .lock()
        .map_err(|e| e.to_string())?
        .library_path
        .clone()
        .ok_or("error.library.notConfigured".to_string())?;
    let target = versions_dir(&base).join(&tag);
    if !target.starts_with(versions_dir(&base)) || !target.exists() {
        return Err("error.library.versionNotFound".into());
    }
    if list_versions_at(&base)?
        .iter()
        .any(|v| v.tag == tag && v.is_active)
    {
        return Err("error.library.cannotRemoveActive".into());
    }
    fs::remove_dir_all(target).map_err(|e| e.to_string())
}
#[tauri::command]
pub fn get_strategies(tag: String, state: State<AppState>) -> Result<Vec<StrategyInfo>, String> {
    let base = state
        .settings
        .lock()
        .map_err(|e| e.to_string())?
        .library_path
        .clone()
        .ok_or("error.library.notConfigured".to_string())?;
    let root = versions_dir(&base).join(&tag);
    if !root.exists() {
        return Err("error.library.versionNotFound".into());
    }
    let payload = resolve_version_payload_dir(&root);
    let mut result = vec![];
    for entry in fs::read_dir(&payload).map_err(|e| e.to_string())? {
        let path = entry.map_err(|e| e.to_string())?.path();
        if is_strategy_bat(&path) {
            let name = path
                .file_name()
                .and_then(|n| n.to_str())
                .unwrap_or_default()
                .to_string();
            result.push(StrategyInfo {
                name,
                path: path.to_string_lossy().into(),
                version: tag.clone(),
            });
        }
    }
    result.sort_by(|a, b| a.name.cmp(&b.name));
    Ok(result)
}
#[tauri::command]
pub fn open_directory(path: String) -> Result<(), String> {
    std::process::Command::new("explorer")
        .arg(path)
        .spawn()
        .map_err(|e| e.to_string())
        .map(|_| ())
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn rejects_non_ascii_paths() {
        assert!(validate_library_path("C:\\Запрет").is_err());
        assert!(validate_library_path("C:\\Zapret").is_ok());
    }
    #[test]
    fn default_library_uses_config_subdir_when_ascii() {
        let path = resolve_default_library_path(Path::new(r"C:\Users\user\AppData\Roaming\dev.zapretyd.desktop"));
        assert_eq!(
            path,
            PathBuf::from(r"C:\Users\user\AppData\Roaming\dev.zapretyd.desktop\library")
        );
    }
    #[test]
    fn default_library_falls_back_for_non_ascii_config_dir() {
        let path = resolve_default_library_path(Path::new(r"C:\Users\Имя\AppData\Roaming\dev.zapretyd.desktop"));
        assert_eq!(path, PathBuf::from(ASCII_FALLBACK_LIBRARY));
    }
    #[test]
    fn resolve_payload_dir_uses_nested_release_folder() {
        let root = std::env::temp_dir().join(format!("zapretyd-nested-{}", std::process::id()));
        let nested = root.join("zapret-discord-youtube-1.10.0");
        let _ = fs::remove_dir_all(&root);
        fs::create_dir_all(&nested).unwrap();
        fs::write(root.join(".zapretyd.json"), "{}").unwrap();
        fs::write(nested.join("general.bat"), "@echo off").unwrap();
        fs::write(nested.join("service.bat"), "@echo off").unwrap();
        assert_eq!(resolve_version_payload_dir(&root), nested);
        let _ = fs::remove_dir_all(&root);
    }
    #[test]
    fn resolve_payload_dir_keeps_flat_layout() {
        let root = std::env::temp_dir().join(format!("zapretyd-flat-{}", std::process::id()));
        let _ = fs::remove_dir_all(&root);
        fs::create_dir_all(&root).unwrap();
        fs::write(root.join("general.bat"), "@echo off").unwrap();
        assert_eq!(resolve_version_payload_dir(&root), root);
        let _ = fs::remove_dir_all(&root);
    }
    #[test]
    fn flatten_single_root_hoists_nested_files() {
        let root = std::env::temp_dir().join(format!("zapretyd-flatten-{}", std::process::id()));
        let nested = root.join("zapret-discord-youtube-1.10.0");
        let _ = fs::remove_dir_all(&root);
        fs::create_dir_all(&nested).unwrap();
        fs::write(nested.join("general.bat"), "@echo off").unwrap();
        flatten_single_root_dir(&root).unwrap();
        assert!(root.join("general.bat").is_file());
        assert!(!nested.exists());
        let _ = fs::remove_dir_all(&root);
    }
}
