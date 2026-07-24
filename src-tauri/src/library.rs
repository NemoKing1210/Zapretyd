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
            version.is_active = active
                .as_ref()
                .is_some_and(|name| entry.path().join(name).exists());
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
    state: State<'_, AppState>,
    window: Window,
) -> Result<InstalledVersion, String> {
    let base = state
        .settings
        .lock()
        .map_err(|e| e.to_string())?
        .library_path
        .clone()
        .ok_or("error.library.chooseFirst".to_string())?;
    let base = validate_library_path(&base)?;
    let target = base.join("versions").join(&release.tag);
    if target.exists() {
        return Err("error.library.versionExists".into());
    }
    fs::create_dir_all(base.join("versions")).map_err(|e| e.to_string())?;
    let temporary = base.join(format!(".{}.zip", release.tag));
    let response = reqwest::Client::builder()
        .user_agent("Zapretyd/0.3")
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
    let mut result = vec![];
    for entry in fs::read_dir(&root).map_err(|e| e.to_string())? {
        let path = entry.map_err(|e| e.to_string())?.path();
        let name = path
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or_default();
        if path
            .extension()
            .and_then(|e| e.to_str())
            .is_some_and(|e| e.eq_ignore_ascii_case("bat"))
            && !name.to_ascii_lowercase().starts_with("service")
        {
            result.push(StrategyInfo {
                name: name.into(),
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
}
