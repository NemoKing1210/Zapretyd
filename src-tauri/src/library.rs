use crate::{
    app::AppState,
    service,
    types::{DownloadProgress, InstalledVersion, ListFileInfo, ReleaseInfo, StrategyInfo},
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
const LISTS_ORIGINAL_DIR: &str = ".zapretyd-original";
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

/// Always-on library path: default under the app config dir (or ASCII fallback).
/// Ensures `<path>/versions` exists.
pub fn managed_library_path(config_dir: &Path) -> Result<String, String> {
    let path = resolve_default_library_path(config_dir);
    fs::create_dir_all(path.join("versions")).map_err(|e| e.to_string())?;
    path.to_str()
        .map(str::to_string)
        .ok_or_else(|| "error.library.pathInvalid".into())
}

/// Force `settings.library_path` to the managed default. Returns true if settings changed.
pub fn ensure_settings_library_path(
    config_dir: &Path,
    settings: &mut crate::types::AppSettings,
) -> Result<bool, String> {
    let path = managed_library_path(config_dir)?;
    let changed = settings
        .library_path
        .as_deref()
        .is_none_or(|current| !paths_equal(current, &path));
    settings.library_path = Some(path);
    Ok(changed)
}

fn paths_equal(a: &str, b: &str) -> bool {
    a.replace('/', "\\").eq_ignore_ascii_case(&b.replace('/', "\\"))
}
fn versions_dir(base: &str) -> PathBuf {
    Path::new(base).join("versions")
}

/// Flowseal `service.bat` `:load_user_lists` — strategy args always reference these files.
pub fn ensure_user_lists(version_root: &Path) -> Result<(), String> {
    let lists = resolve_version_payload_dir(version_root).join("lists");
    if !lists.is_dir() {
        return Err("error.library.listsNotFound".into());
    }
    write_if_missing(
        &lists.join("ipset-exclude-user.txt"),
        "203.0.113.113/32\n",
    )?;
    write_if_missing(
        &lists.join("list-general-user.txt"),
        "# Never leave this file empty\ndomain.example.abc\n",
    )?;
    write_if_missing(&lists.join("list-exclude-user.txt"), "domain.example.abc\n")?;
    Ok(())
}

fn write_if_missing(path: &Path, contents: &str) -> Result<(), String> {
    if path.exists() {
        return Ok(());
    }
    fs::write(path, contents).map_err(|e| e.to_string())
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
pub(crate) fn list_versions_at(base: &str) -> Result<Vec<InstalledVersion>, String> {
    let root = versions_dir(base);
    if !root.exists() {
        return Ok(vec![]);
    }
    let active_tag = service::active_version_tag(base);
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
            version.path = entry.path().to_string_lossy().into();
            // Active = version that owns the service ImagePath / stored tag.
            // Matching only by strategy .bat name marks every release that ships
            // the same file (e.g. general (ALT4).bat) as active.
            version.is_active = active_tag
                .as_ref()
                .is_some_and(|tag| tag.eq_ignore_ascii_case(&version.tag));
            list.push(version);
        }
    }
    list.sort_by(|a, b| cmp_version_tags_desc(&a.tag, &b.tag));
    Ok(list)
}

/// Newest-first tag order (numeric segments, then full string).
fn cmp_version_tags_desc(a: &str, b: &str) -> std::cmp::Ordering {
    let key = |tag: &str| -> Vec<u64> {
        tag.split(|c: char| !c.is_ascii_digit())
            .filter(|part| !part.is_empty())
            .filter_map(|part| part.parse().ok())
            .collect()
    };
    key(b).cmp(&key(a)).then_with(|| b.cmp(a))
}
#[tauri::command]
pub fn list_installed_versions(state: State<AppState>) -> Result<Vec<InstalledVersion>, String> {
    let base = managed_library_path(&state.config_dir)?;
    list_versions_at(&base)
}
#[tauri::command]
pub async fn install_release(
    release: ReleaseInfo,
    force: bool,
    state: State<'_, AppState>,
    window: Window,
) -> Result<InstalledVersion, String> {
    let base_path = managed_library_path(&state.config_dir)?;
    let base = PathBuf::from(&base_path);
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
    let response = crate::http::http_client()?
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
    let extract_tmp = temporary.clone();
    let extract_target = target.clone();
    tokio::task::spawn_blocking(move || extract_zip(&extract_tmp, &extract_target))
        .await
        .map_err(|e| e.to_string())??;
    flatten_single_root_dir(&target)?;
    let _ = ensure_user_lists(&target);
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
    let base = managed_library_path(&state.config_dir)?;
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
    let base = managed_library_path(&state.config_dir)?;
    let root = versions_dir(&base).join(&tag);
    if !root.exists() {
        return Err("error.library.versionNotFound".into());
    }
    let payload = resolve_version_payload_dir(&root);
    let _ = ensure_user_lists(&root);
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

fn is_safe_path_segment(value: &str) -> bool {
    !value.is_empty()
        && value != "."
        && value != ".."
        && !value.contains(['/', '\\'])
        && Path::new(value).file_name().and_then(|n| n.to_str()) == Some(value)
}

fn library_path_from_state(state: &State<AppState>) -> Result<String, String> {
    managed_library_path(&state.config_dir)
}

fn resolve_version_lists_dir(base: &str, tag: &str) -> Result<PathBuf, String> {
    if !is_safe_path_segment(tag) {
        return Err("error.library.listFileInvalid".into());
    }
    let root = versions_dir(base).join(tag);
    if !root.is_dir() {
        return Err("error.library.versionNotFound".into());
    }
    let lists = resolve_version_payload_dir(&root).join("lists");
    if !lists.is_dir() {
        return Err("error.library.listsNotFound".into());
    }
    Ok(lists)
}

fn resolve_managed_list_path(base: &str, tag: &str, name: &str) -> Result<PathBuf, String> {
    if !is_safe_path_segment(name) {
        return Err("error.library.listFileInvalid".into());
    }
    let lists = resolve_version_lists_dir(base, tag)?;
    let lists_canon = lists
        .canonicalize()
        .map_err(|_| "error.library.listsNotFound".to_string())?;
    let file_path = lists.join(name);
    let file_canon = file_path
        .canonicalize()
        .map_err(|_| "error.library.listFileNotFound".to_string())?;
    if !file_canon.starts_with(&lists_canon) || !file_canon.is_file() {
        return Err("error.library.listFileInvalid".into());
    }
    // Keep backups and other hidden dirs out of editable paths.
    if file_canon
        .strip_prefix(&lists_canon)
        .ok()
        .and_then(|rel| rel.components().next())
        .is_some_and(|component| {
            component
                .as_os_str()
                .to_str()
                .is_some_and(|part| part.starts_with('.'))
        })
    {
        return Err("error.library.listFileInvalid".into());
    }
    Ok(file_canon)
}

fn list_file_differs_from_original(live: &Path, original: &Path) -> bool {
    match (fs::read(live), fs::read(original)) {
        (Ok(live_bytes), Ok(original_bytes)) => live_bytes != original_bytes,
        _ => true,
    }
}

fn list_files_in_lists_dir(lists: &Path) -> Result<Vec<ListFileInfo>, String> {
    use std::collections::BTreeMap;

    let backup_dir = lists.join(LISTS_ORIGINAL_DIR);
    let mut by_name: BTreeMap<String, ListFileInfo> = BTreeMap::new();

    for entry in fs::read_dir(lists).map_err(|e| e.to_string())? {
        let entry = entry.map_err(|e| e.to_string())?;
        let path = entry.path();
        if !path.is_file() {
            continue;
        }
        let name = path
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or_default()
            .to_string();
        if name.is_empty() || name.starts_with('.') {
            continue;
        }
        let size = entry.metadata().map(|m| m.len()).unwrap_or(0);
        let original = backup_dir.join(&name);
        // has_original means "restore would change something" (backup exists and differs, or deleted).
        let has_original = original.is_file() && list_file_differs_from_original(&path, &original);
        by_name.insert(
            name.clone(),
            ListFileInfo {
                name,
                size,
                deleted: false,
                has_original,
            },
        );
    }

    if backup_dir.is_dir() {
        for entry in fs::read_dir(&backup_dir).map_err(|e| e.to_string())? {
            let entry = entry.map_err(|e| e.to_string())?;
            let path = entry.path();
            if !path.is_file() {
                continue;
            }
            let name = path
                .file_name()
                .and_then(|n| n.to_str())
                .unwrap_or_default()
                .to_string();
            if name.is_empty() || name.starts_with('.') || !is_safe_path_segment(&name) {
                continue;
            }
            if by_name.contains_key(&name) {
                // Live entry already decided has_original via content compare.
                continue;
            }
            let size = entry.metadata().map(|m| m.len()).unwrap_or(0);
            by_name.insert(
                name.clone(),
                ListFileInfo {
                    name,
                    size,
                    deleted: true,
                    has_original: true,
                },
            );
        }
    }

    Ok(by_name.into_values().collect())
}

fn backup_list_original(lists: &Path, name: &str, source: &Path) -> Result<(), String> {
    let backup_dir = lists.join(LISTS_ORIGINAL_DIR);
    let backup_path = backup_dir.join(name);
    if backup_path.exists() {
        return Ok(());
    }
    fs::create_dir_all(&backup_dir).map_err(|e| e.to_string())?;
    fs::copy(source, &backup_path).map_err(|e| e.to_string())?;
    Ok(())
}

fn resolve_list_original_path(lists: &Path, name: &str) -> Result<PathBuf, String> {
    if !is_safe_path_segment(name) {
        return Err("error.library.listFileInvalid".into());
    }
    let lists_canon = lists
        .canonicalize()
        .map_err(|_| "error.library.listsNotFound".to_string())?;
    let backup_dir = lists.join(LISTS_ORIGINAL_DIR);
    let backup_canon = backup_dir
        .canonicalize()
        .map_err(|_| "error.library.listOriginalNotFound".to_string())?;
    if !backup_canon.starts_with(&lists_canon) {
        return Err("error.library.listFileInvalid".into());
    }
    let backup_path = backup_dir.join(name);
    let file_canon = backup_path
        .canonicalize()
        .map_err(|_| "error.library.listOriginalNotFound".to_string())?;
    if !file_canon.starts_with(&backup_canon) || !file_canon.is_file() {
        return Err("error.library.listOriginalNotFound".into());
    }
    Ok(file_canon)
}

#[tauri::command]
pub fn list_version_list_files(
    tag: String,
    state: State<AppState>,
) -> Result<Vec<ListFileInfo>, String> {
    let base = library_path_from_state(&state)?;
    let root = versions_dir(&base).join(&tag);
    let _ = ensure_user_lists(&root);
    let lists = resolve_version_lists_dir(&base, &tag)?;
    list_files_in_lists_dir(&lists)
}

#[tauri::command]
pub fn read_version_list_file(
    tag: String,
    name: String,
    state: State<AppState>,
) -> Result<String, String> {
    let base = library_path_from_state(&state)?;
    let path = resolve_managed_list_path(&base, &tag, &name)?;
    fs::read_to_string(path).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn write_version_list_file(
    tag: String,
    name: String,
    content: String,
    state: State<AppState>,
) -> Result<(), String> {
    let base = library_path_from_state(&state)?;
    let path = resolve_managed_list_path(&base, &tag, &name)?;
    let lists = resolve_version_lists_dir(&base, &tag)?;
    backup_list_original(&lists, &name, &path)?;
    fs::write(path, content).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn delete_version_list_file(
    tag: String,
    name: String,
    state: State<AppState>,
) -> Result<(), String> {
    let base = library_path_from_state(&state)?;
    let path = resolve_managed_list_path(&base, &tag, &name)?;
    let lists = resolve_version_lists_dir(&base, &tag)?;
    backup_list_original(&lists, &name, &path)?;
    fs::remove_file(path).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn restore_version_list_file(
    tag: String,
    name: String,
    state: State<AppState>,
) -> Result<(), String> {
    let base = library_path_from_state(&state)?;
    let lists = resolve_version_lists_dir(&base, &tag)?;
    let original = resolve_list_original_path(&lists, &name)?;
    let destination = lists.join(&name);
    // Ensure we never write outside lists/ (basename already validated).
    let lists_canon = lists
        .canonicalize()
        .map_err(|_| "error.library.listsNotFound".to_string())?;
    let dest_parent = destination
        .parent()
        .ok_or_else(|| "error.library.listFileInvalid".to_string())?
        .canonicalize()
        .map_err(|_| "error.library.listsNotFound".to_string())?;
    if dest_parent != lists_canon {
        return Err("error.library.listFileInvalid".into());
    }
    fs::copy(original, destination).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn open_directory(path: String) -> Result<(), String> {
    let mut command = std::process::Command::new("explorer");
    crate::process_win::hide_console(&mut command)
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
    fn sorts_version_tags_newest_first() {
        assert_eq!(cmp_version_tags_desc("1.9.0", "1.10.0"), std::cmp::Ordering::Greater);
        assert_eq!(cmp_version_tags_desc("1.10.0", "1.9.0"), std::cmp::Ordering::Less);
        let mut tags = ["1.8.5", "1.10.0b", "1.9.0"];
        tags.sort_by(|a, b| cmp_version_tags_desc(a, b));
        assert_eq!(tags, ["1.10.0b", "1.9.0", "1.8.5"]);
    }
    #[test]
    fn default_library_uses_config_subdir_when_ascii() {
        let path = resolve_default_library_path(Path::new(r"C:\Users\user\AppData\Roaming\Zapretyd"));
        assert_eq!(
            path,
            PathBuf::from(r"C:\Users\user\AppData\Roaming\Zapretyd\library")
        );
    }
    #[test]
    fn default_library_falls_back_for_non_ascii_config_dir() {
        let path = resolve_default_library_path(Path::new(r"C:\Users\Имя\AppData\Roaming\Zapretyd"));
        assert_eq!(path, PathBuf::from(ASCII_FALLBACK_LIBRARY));
    }
    #[test]
    fn ensure_settings_overwrites_custom_library_path() {
        let config = std::env::temp_dir().join(format!(
            "zapretyd-ensure-lib-{}",
            std::process::id()
        ));
        let _ = fs::remove_dir_all(&config);
        fs::create_dir_all(&config).unwrap();
        let mut settings = crate::types::AppSettings {
            library_path: Some(r"D:\CustomZapret".into()),
            theme: "system".into(),
            ..Default::default()
        };
        let changed = ensure_settings_library_path(&config, &mut settings).unwrap();
        assert!(changed);
        assert_eq!(
            settings.library_path.as_deref(),
            Some(config.join("library").to_str().unwrap())
        );
        assert!(config.join("library").join("versions").is_dir());
        let _ = fs::remove_dir_all(&config);
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

    fn make_version_with_lists(suffix: &str) -> (PathBuf, String) {
        let base = std::env::temp_dir().join(format!("zapretyd-lists-{suffix}-{}", std::process::id()));
        let _ = fs::remove_dir_all(&base);
        let tag = "1.10.0";
        let version = base.join("versions").join(tag);
        let lists = version.join("lists");
        fs::create_dir_all(&lists).unwrap();
        fs::write(version.join("general.bat"), "@echo off").unwrap();
        fs::write(lists.join("list-general.txt"), "example.com\n").unwrap();
        fs::write(lists.join("ipset-all.txt"), "1.1.1.1\n").unwrap();
        fs::create_dir_all(lists.join(LISTS_ORIGINAL_DIR)).unwrap();
        fs::write(
            lists.join(LISTS_ORIGINAL_DIR).join("list-general.txt"),
            "old\n",
        )
        .unwrap();
        (base, tag.to_string())
    }

    #[test]
    fn creates_missing_flowseal_user_lists() {
        let (base, tag) = make_version_with_lists("userlists");
        let root = base.join("versions").join(&tag);
        let lists = root.join("lists");
        assert!(!lists.join("list-general-user.txt").exists());
        ensure_user_lists(&root).unwrap();
        assert!(lists.join("list-general-user.txt").is_file());
        assert!(lists.join("list-exclude-user.txt").is_file());
        assert!(lists.join("ipset-exclude-user.txt").is_file());
        // Second call must not overwrite existing content.
        fs::write(lists.join("list-general-user.txt"), "keep-me\n").unwrap();
        ensure_user_lists(&root).unwrap();
        assert_eq!(
            fs::read_to_string(lists.join("list-general-user.txt")).unwrap(),
            "keep-me\n"
        );
        let _ = fs::remove_dir_all(&base);
    }

    #[test]
    fn rejects_list_file_path_traversal() {
        let (base, tag) = make_version_with_lists("traverse");
        let base_str = base.to_string_lossy().into_owned();
        assert!(resolve_managed_list_path(&base_str, &tag, "../general.bat").is_err());
        assert!(resolve_managed_list_path(&base_str, &tag, r"..\general.bat").is_err());
        assert!(resolve_managed_list_path(&base_str, &tag, "").is_err());
        assert!(is_safe_path_segment("list-general.txt"));
        assert!(!is_safe_path_segment(".."));
        let _ = fs::remove_dir_all(&base);
    }

    #[test]
    fn list_files_skips_original_backup_dir() {
        let (base, tag) = make_version_with_lists("list");
        let lists = resolve_version_lists_dir(&base.to_string_lossy(), &tag).unwrap();
        let files = list_files_in_lists_dir(&lists).unwrap();
        let names: Vec<_> = files.iter().map(|f| f.name.as_str()).collect();
        assert_eq!(names, vec!["ipset-all.txt", "list-general.txt"]);
        assert!(!names.iter().any(|n| n.contains(LISTS_ORIGINAL_DIR)));
        let general = files.iter().find(|f| f.name == "list-general.txt").unwrap();
        assert!(!general.deleted);
        // Backup content ("old") differs from live ("example.com"), so restore is offered.
        assert!(general.has_original);
        let ipset = files.iter().find(|f| f.name == "ipset-all.txt").unwrap();
        assert!(!ipset.deleted);
        assert!(!ipset.has_original);
        let _ = fs::remove_dir_all(&base);
    }

    #[test]
    fn backup_original_created_once() {
        let (base, tag) = make_version_with_lists("backup");
        let lists = resolve_version_lists_dir(&base.to_string_lossy(), &tag).unwrap();
        let source = lists.join("ipset-all.txt");
        let backup = lists.join(LISTS_ORIGINAL_DIR).join("ipset-all.txt");
        assert!(!backup.exists());
        backup_list_original(&lists, "ipset-all.txt", &source).unwrap();
        assert_eq!(fs::read_to_string(&backup).unwrap(), "1.1.1.1\n");
        fs::write(&source, "2.2.2.2\n").unwrap();
        backup_list_original(&lists, "ipset-all.txt", &source).unwrap();
        assert_eq!(fs::read_to_string(&backup).unwrap(), "1.1.1.1\n");
        let _ = fs::remove_dir_all(&base);
    }

    #[test]
    fn delete_keeps_backup_entry_and_restore_brings_file_back() {
        let (base, tag) = make_version_with_lists("delete");
        let lists = resolve_version_lists_dir(&base.to_string_lossy(), &tag).unwrap();
        let live = lists.join("ipset-all.txt");
        backup_list_original(&lists, "ipset-all.txt", &live).unwrap();
        fs::remove_file(&live).unwrap();

        let files = list_files_in_lists_dir(&lists).unwrap();
        let deleted = files.iter().find(|f| f.name == "ipset-all.txt").unwrap();
        assert!(deleted.deleted);
        assert!(deleted.has_original);
        assert!(!live.exists());

        let original = resolve_list_original_path(&lists, "ipset-all.txt").unwrap();
        fs::copy(&original, &live).unwrap();
        assert_eq!(fs::read_to_string(&live).unwrap(), "1.1.1.1\n");
        let restored = list_files_in_lists_dir(&lists)
            .unwrap()
            .into_iter()
            .find(|f| f.name == "ipset-all.txt")
            .unwrap();
        assert!(!restored.deleted);
        // Live matches backup after restore — no restore action needed.
        assert!(!restored.has_original);
        let _ = fs::remove_dir_all(&base);
    }

    #[test]
    fn has_original_when_live_differs_from_backup() {
        let (base, tag) = make_version_with_lists("differs");
        let lists = resolve_version_lists_dir(&base.to_string_lossy(), &tag).unwrap();
        let live = lists.join("list-general.txt");
        fs::write(&live, "changed\n").unwrap();
        let files = list_files_in_lists_dir(&lists).unwrap();
        let general = files.iter().find(|f| f.name == "list-general.txt").unwrap();
        assert!(general.has_original);
        fs::write(&live, "old\n").unwrap();
        let matched = list_files_in_lists_dir(&lists)
            .unwrap()
            .into_iter()
            .find(|f| f.name == "list-general.txt")
            .unwrap();
        assert!(!matched.has_original);
        let _ = fs::remove_dir_all(&base);
    }
}
