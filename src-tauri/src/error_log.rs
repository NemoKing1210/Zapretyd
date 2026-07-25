use crate::app::AppState;
use chrono::{Local, NaiveDate};
use serde::Deserialize;
use std::{
    fs::{self, OpenOptions},
    io::Write,
    path::{Path, PathBuf},
    sync::{Mutex, OnceLock},
};
use tauri::State;

const MAX_FIELD_CHARS: usize = 8_192;
const RETAIN_DAYS: i64 = 14;
const LOGS_DIR_NAME: &str = "logs";

static WRITE_LOCK: Mutex<()> = Mutex::new(());

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ErrorLogInput {
    pub message: String,
    #[serde(default)]
    pub raw: String,
    #[serde(default)]
    pub source: String,
    /// Unix epoch milliseconds from the frontend (optional).
    pub at: Option<i64>,
}

pub fn logs_dir(config_dir: &Path) -> PathBuf {
    config_dir.join(LOGS_DIR_NAME)
}

fn ensure_logs_dir(config_dir: &Path) -> Result<PathBuf, String> {
    let dir = logs_dir(config_dir);
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir)
}

fn truncate(value: &str) -> String {
    if value.chars().count() <= MAX_FIELD_CHARS {
        return value.to_string();
    }
    let trimmed: String = value.chars().take(MAX_FIELD_CHARS).collect();
    format!("{trimmed}…[truncated]")
}

fn day_file_name(day: NaiveDate) -> String {
    format!("{day}.log")
}

fn format_entry(entry: &ErrorLogInput) -> String {
    let stamp = entry
        .at
        .and_then(|ms| chrono::DateTime::from_timestamp_millis(ms))
        .map(|dt| dt.with_timezone(&Local).format("%Y-%m-%dT%H:%M:%S%.3f%:z").to_string())
        .unwrap_or_else(|| Local::now().format("%Y-%m-%dT%H:%M:%S%.3f%:z").to_string());

    let source = truncate(if entry.source.is_empty() {
        "app"
    } else {
        &entry.source
    });
    let message = truncate(&entry.message);
    let raw = truncate(if entry.raw.is_empty() {
        &entry.message
    } else {
        &entry.raw
    });

    let mut out = format!("========== [{stamp}] ==========\nsource: {source}\n");
    if raw == message {
        out.push_str(&format!("message: {message}\n\n"));
    } else if raw.contains("code:") || raw.contains("detail:") {
        // Frontend already structured the body (code / message / detail / stack).
        out.push_str(&raw);
        if !raw.ends_with('\n') {
            out.push('\n');
        }
        out.push('\n');
    } else {
        out.push_str(&format!("message: {message}\nraw:\n{raw}\n\n"));
    }
    out
}

fn append_to_day_file(dir: &Path, text: &str) -> Result<(), String> {
    let path = dir.join(day_file_name(Local::now().date_naive()));
    let _guard = WRITE_LOCK.lock().unwrap_or_else(|e| e.into_inner());
    let mut file = OpenOptions::new()
        .create(true)
        .append(true)
        .open(&path)
        .map_err(|e| e.to_string())?;
    file.write_all(text.as_bytes()).map_err(|e| e.to_string())
}

fn prune_old_logs(dir: &Path) {
    static LAST_PRUNE: OnceLock<Mutex<Option<NaiveDate>>> = OnceLock::new();
    let today = Local::now().date_naive();
    let cell = LAST_PRUNE.get_or_init(|| Mutex::new(None));
    {
        let mut last = cell.lock().unwrap_or_else(|e| e.into_inner());
        if *last == Some(today) {
            return;
        }
        *last = Some(today);
    }

    let cutoff = today - chrono::Duration::days(RETAIN_DAYS);
    let Ok(entries) = fs::read_dir(dir) else {
        return;
    };
    for entry in entries.flatten() {
        let path = entry.path();
        if path.extension().and_then(|e| e.to_str()) != Some("log") {
            continue;
        }
        let Some(stem) = path.file_stem().and_then(|s| s.to_str()) else {
            continue;
        };
        let Ok(day) = NaiveDate::parse_from_str(stem, "%Y-%m-%d") else {
            continue;
        };
        if day < cutoff {
            let _ = fs::remove_file(path);
        }
    }
}

pub fn append_entries(config_dir: &Path, entries: &[ErrorLogInput]) -> Result<(), String> {
    if entries.is_empty() {
        return Ok(());
    }
    let dir = ensure_logs_dir(config_dir)?;
    prune_old_logs(&dir);

    let mut buf = String::with_capacity(entries.len() * 128);
    for entry in entries {
        buf.push_str(&format_entry(entry));
    }
    append_to_day_file(&dir, &buf)
}

pub fn append_text(config_dir: &Path, source: &str, message: &str, raw: &str) -> Result<(), String> {
    append_entries(
        config_dir,
        &[ErrorLogInput {
            message: message.to_string(),
            raw: raw.to_string(),
            source: source.to_string(),
            at: None,
        }],
    )
}

/// Install a panic hook that writes to the daily log in release builds.
pub fn install_panic_hook(config_dir: PathBuf) {
    if cfg!(debug_assertions) {
        return;
    }
    let previous = std::panic::take_hook();
    std::panic::set_hook(Box::new(move |info| {
        let location = info
            .location()
            .map(|l| format!("{}:{}:{}", l.file(), l.line(), l.column()))
            .unwrap_or_else(|| "unknown".into());
        let payload = if let Some(s) = info.payload().downcast_ref::<&str>() {
            (*s).to_string()
        } else if let Some(s) = info.payload().downcast_ref::<String>() {
            s.clone()
        } else {
            "box payload".into()
        };
        let message = format!("panic at {location}: {payload}");
        let _ = append_text(&config_dir, "rust.panic", &message, &message);
        previous(info);
    }));
}

#[tauri::command]
pub fn append_error_logs(
    entries: Vec<ErrorLogInput>,
    state: State<'_, AppState>,
) -> Result<(), String> {
    append_entries(&state.config_dir, &entries)
}

#[tauri::command]
pub fn get_logs_dir(state: State<'_, AppState>) -> Result<String, String> {
    let dir = ensure_logs_dir(&state.config_dir)?;
    Ok(dir.to_string_lossy().into_owned())
}

#[tauri::command]
pub fn open_logs_directory(state: State<'_, AppState>) -> Result<(), String> {
    let dir = ensure_logs_dir(&state.config_dir)?;
    crate::library::open_directory(dir.to_string_lossy().into_owned())
}

pub fn clear_logs(config_dir: &Path) -> Result<(), String> {
    let dir = ensure_logs_dir(config_dir)?;
    let _guard = WRITE_LOCK.lock().unwrap_or_else(|e| e.into_inner());
    let entries = fs::read_dir(&dir).map_err(|e| e.to_string())?;
    for entry in entries.flatten() {
        let path = entry.path();
        if path.extension().and_then(|e| e.to_str()) != Some("log") {
            continue;
        }
        fs::remove_file(&path).map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
pub fn clear_error_logs(state: State<'_, AppState>) -> Result<(), String> {
    clear_logs(&state.config_dir)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::{SystemTime, UNIX_EPOCH};

    #[test]
    fn day_file_uses_iso_date() {
        let day = NaiveDate::from_ymd_opt(2026, 7, 25).unwrap();
        assert_eq!(day_file_name(day), "2026-07-25.log");
    }

    #[test]
    fn truncate_long_fields() {
        let long = "x".repeat(MAX_FIELD_CHARS + 10);
        let out = truncate(&long);
        assert!(out.ends_with("…[truncated]"));
        assert_eq!(out.chars().count(), MAX_FIELD_CHARS + "…[truncated]".chars().count());
    }

    #[test]
    fn append_writes_daily_file() {
        let stamp = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let dir = std::env::temp_dir().join(format!("zapretyd-error-log-{stamp}"));
        fs::create_dir_all(&dir).unwrap();

        append_entries(
            &dir,
            &[ErrorLogInput {
                message: "boom".into(),
                raw: "stack".into(),
                source: "test".into(),
                at: Some(1_721_880_000_000),
            }],
        )
        .unwrap();

        let logs = logs_dir(&dir);
        let files: Vec<_> = fs::read_dir(&logs)
            .unwrap()
            .filter_map(|e| e.ok())
            .map(|e| e.path())
            .collect();
        assert_eq!(files.len(), 1);
        let content = fs::read_to_string(&files[0]).unwrap();
        assert!(content.contains("source: test"));
        assert!(content.contains("boom"));
        assert!(content.contains("stack"));

        clear_logs(&dir).unwrap();
        let remaining: Vec<_> = fs::read_dir(&logs)
            .unwrap()
            .filter_map(|e| e.ok())
            .filter(|e| e.path().extension().and_then(|ext| ext.to_str()) == Some("log"))
            .collect();
        assert!(remaining.is_empty());

        let _ = fs::remove_dir_all(&dir);
    }
}
