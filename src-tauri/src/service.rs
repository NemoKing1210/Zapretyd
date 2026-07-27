use crate::{
    app::{administrator, AppState},
    process_win::{decode_console_bytes, hide_console},
    types::{ServiceStatus, StrategyInfo},
};
use std::{
    fs,
    path::Path,
    process::Command,
    sync::{Mutex, OnceLock},
    time::{Duration, Instant},
};
use tauri::State;

/// Shared by UI poll and tray tooltip so concurrent callers reuse one probe.
const STATUS_CACHE_TTL: Duration = Duration::from_millis(1500);

struct StatusCache {
    value: Option<(Instant, ServiceStatus)>,
}

fn status_cache() -> &'static Mutex<StatusCache> {
    static CACHE: OnceLock<Mutex<StatusCache>> = OnceLock::new();
    CACHE.get_or_init(|| Mutex::new(StatusCache { value: None }))
}

/// Drop cached status after create/start/stop/remove so the next read is fresh.
pub fn invalidate_service_status_cache() {
    if let Ok(mut cache) = status_cache().lock() {
        cache.value = None;
    }
}

/// Win32 `ERROR_SERVICE_DOES_NOT_EXIST`.
const SERVICE_MISSING: i32 = 1060;

fn output(program: &str, args: &[&str]) -> String {
    let mut command = Command::new(program);
    hide_console(&mut command)
        .args(args)
        .output()
        .map(|o| decode_console_bytes(&o.stdout))
        .unwrap_or_default()
}

/// Run a Windows helper (`sc`, `reg`, …) and return a multi-line diagnostic on failure.
fn run_command(program: &str, args: &[&str]) -> Result<(), String> {
    let cmdline = std::iter::once(program)
        .chain(args.iter().copied())
        .collect::<Vec<_>>()
        .join(" ");
    let mut command = Command::new(program);
    let output = hide_console(&mut command)
        .args(args)
        .output()
        .map_err(|e| format!("{cmdline}\nfailed to spawn: {e}"))?;

    if output.status.success() {
        return Ok(());
    }

    let exit = output
        .status
        .code()
        .map(|c| c.to_string())
        .unwrap_or_else(|| "terminated".into());
    let stdout = decode_console_bytes(&output.stdout);
    let stderr = decode_console_bytes(&output.stderr);
    let mut detail = format!("{cmdline}\nexit={exit}");
    let stdout = stdout.trim();
    let stderr = stderr.trim();
    if !stdout.is_empty() {
        detail.push_str("\nstdout:\n");
        detail.push_str(stdout);
    }
    if !stderr.is_empty() {
        detail.push_str("\nstderr:\n");
        detail.push_str(stderr);
    }
    Err(detail)
}

fn require_command(code: &str, program: &str, args: &[&str]) -> Result<(), String> {
    run_command(program, args).map_err(|detail| format!("{code}|{detail}"))
}

fn service_missing_detail(detail: &str) -> bool {
    detail
        .lines()
        .any(|line| {
            let line = line.trim();
            line == format!("exit={SERVICE_MISSING}")
                || line.contains("FAILED 1060")
                || line.contains("1060:")
        })
}

/// Stop/delete succeed when the service is already gone.
fn require_service_command(code: &str, args: &[&str]) -> Result<(), String> {
    match run_command("sc", args) {
        Ok(()) => Ok(()),
        Err(detail) if service_missing_detail(&detail) => Ok(()),
        Err(detail) => Err(format!("{code}|{detail}")),
    }
}

pub fn active_strategy_name() -> Result<Option<String>, String> {
    Ok(reg_service_value("zapret-discord-youtube"))
}

/// Version tag written on activate, or inferred from the service `ImagePath`.
pub fn active_version_tag(library_base: &str) -> Option<String> {
    if let Some(tag) = reg_service_value("zapret-discord-youtube-version") {
        return Some(tag);
    }
    let image = reg_service_value("ImagePath")?;
    version_tag_from_image_path(&image, library_base)
}

fn reg_service_value(name: &str) -> Option<String> {
    let result = output(
        "reg",
        &[
            "query",
            r"HKLM\System\CurrentControlSet\Services\zapret",
            "/v",
            name,
        ],
    );
    result.lines().find_map(|line| {
        let value = if let Some(v) = line.split("REG_SZ").nth(1) {
            v
        } else if let Some(v) = line.split("REG_EXPAND_SZ").nth(1) {
            v
        } else {
            return None;
        };
        let value = value.trim().trim_matches('"');
        (!value.is_empty()).then(|| value.to_string())
    })
}

/// Extract `<tag>` from `...\versions\<tag>\...` inside the service ImagePath.
pub(crate) fn version_tag_from_image_path(image_path: &str, library_base: &str) -> Option<String> {
    let normalized = image_path.replace('/', "\\");
    let marker = "\\versions\\";
    let lower = normalized.to_ascii_lowercase();
    let base_lower = library_base.replace('/', "\\").to_ascii_lowercase();
    // Prefer a path under the managed library when present.
    let search_in = if !base_lower.is_empty() && lower.contains(&base_lower) {
        &normalized[lower.find(&base_lower)?..]
    } else {
        normalized.as_str()
    };
    let search_lower = search_in.to_ascii_lowercase();
    let idx = search_lower.find(marker)?;
    let after = &search_in[idx + marker.len()..];
    let tag = after.split(['\\', '/']).next()?.trim();
    (!tag.is_empty()).then(|| tag.to_string())
}
/// Whether a Windows service is registered. Uses `sc` exit code — localized
/// messages say `Ошибка: 1060:` instead of English `FAILED 1060`.
fn service_installed(name: &str) -> bool {
    let mut command = Command::new("sc");
    hide_console(&mut command)
        .args(["query", name])
        .output()
        .map(|o| o.status.success())
        .unwrap_or(false)
}

fn service_running(name: &str) -> bool {
    output("sc", &["query", name]).contains("RUNNING")
}

/// PID from `sc queryex` (0 means the service has no process).
fn service_pid(name: &str) -> Option<u32> {
    for line in output("sc", &["queryex", name]).lines() {
        let line = line.trim();
        let Some((key, value)) = line.split_once(':') else {
            continue;
        };
        if !key.trim().eq_ignore_ascii_case("pid") {
            continue;
        }
        let pid = value.trim().parse::<u32>().ok()?;
        return (pid > 0).then_some(pid);
    }
    None
}

fn process_running(name: &str) -> bool {
    output("tasklist", &["/FI", &format!("IMAGENAME eq {name}")])
        .to_ascii_lowercase()
        .contains(&name.to_ascii_lowercase())
}

fn probe_service_status() -> ServiceStatus {
    let exists = service_installed("zapret");
    let zapret_running = service_running("zapret");
    // Prefer tasklist; fall back to service PID — Session 0 processes are sometimes missed.
    let winws_running = process_running("winws.exe") || service_pid("zapret").is_some();
    ServiceStatus {
        is_admin: administrator(),
        service_exists: exists,
        service_running: zapret_running,
        windivert_running: service_running("WinDivert") || service_running("WinDivert14"),
        winws_running,
        active_strategy: active_strategy_name().ok().flatten(),
        message_code: if exists {
            "service.detected".into()
        } else {
            "service.notInstalled".into()
        },
    }
}

#[tauri::command]
pub fn get_service_status() -> ServiceStatus {
    let now = Instant::now();
    if let Ok(cache) = status_cache().lock() {
        if let Some((at, ref status)) = &cache.value {
            if now.duration_since(*at) < STATUS_CACHE_TTL {
                return status.clone();
            }
        }
    }
    let status = probe_service_status();
    if let Ok(mut cache) = status_cache().lock() {
        cache.value = Some((Instant::now(), status.clone()));
    }
    status
}
fn require_admin() -> Result<(), String> {
    if administrator() {
        Ok(())
    } else {
        Err("error.service.adminRequired".into())
    }
}
fn managed_strategy(path: &str, state: &AppState) -> Result<(), String> {
    let base = crate::library::managed_library_path(&state.config_dir)?;
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

/// Like Flowseal `set "BIN=%~dp0bin\"` — trailing slash so `%BIN%winws.exe` joins correctly.
fn dir_with_slash(path: &Path) -> String {
    let mut s = path.to_string_lossy().into_owned();
    if !s.ends_with(['\\', '/']) {
        s.push('\\');
    }
    s
}

/// Defaults match `service.bat` `:game_switch_status` when the filter is off.
fn resolve_game_filters(root: &Path) -> (String, String, String) {
    let flag = root.join("utils").join("game_filter.enabled");
    let mode = fs::read_to_string(flag)
        .ok()
        .and_then(|s| s.lines().next().map(|l| l.trim().to_ascii_lowercase()));
    match mode.as_deref() {
        Some("all") => (
            "1024-65535".into(),
            "1024-65535".into(),
            "1024-65535".into(),
        ),
        Some("tcp") => ("1024-65535".into(), "1024-65535".into(), "12".into()),
        Some("udp") => ("1024-65535".into(), "12".into(), "1024-65535".into()),
        _ => ("12".into(), "12".into(), "12".into()),
    }
}

/// Escape `"` as `\"` so args survive inside `sc … binPath= "…"`.
fn escape_quotes_for_sc(args: &str) -> String {
    args.replace('"', r#"\""#)
}

/// Build the Flowseal-style `sc create` line (not yet passed through `cmd`).
fn sc_create_cmdline(binary: &Path, args: &str) -> String {
    let args = escape_quotes_for_sc(args);
    format!(
        r#"sc create zapret binPath= "\"{bin}\" {args}" DisplayName= "zapret" start= auto"#,
        bin = binary.display(),
        args = args,
    )
}

/// Run `cmd.exe /d /c <script>` without Rust re-quoting `script`.
///
/// `.arg(script)` would escape embedded `\"` for CreateProcess; `sc` then sees a
/// broken `binPath=` and exits 1639 with its usage text. `raw_arg` keeps the
/// same bytes a `.bat` would pass to `cmd`.
fn run_cmd_script(script: &str) -> Result<(), String> {
    use std::os::windows::process::CommandExt;

    let display = format!("cmd.exe /d /c {script}");
    let mut command = Command::new("cmd.exe");
    let output = hide_console(&mut command)
        .arg("/d")
        .arg("/c")
        .raw_arg(script)
        .output()
        .map_err(|e| format!("{display}\nfailed to spawn: {e}"))?;

    if output.status.success() {
        return Ok(());
    }

    let exit = output
        .status
        .code()
        .map(|c| c.to_string())
        .unwrap_or_else(|| "terminated".into());
    let stdout = decode_console_bytes(&output.stdout);
    let stderr = decode_console_bytes(&output.stderr);
    let mut detail = format!("{display}\nexit={exit}");
    let stdout = stdout.trim();
    let stderr = stderr.trim();
    if !stdout.is_empty() {
        detail.push_str("\nstdout:\n");
        detail.push_str(stdout);
    }
    if !stderr.is_empty() {
        detail.push_str("\nstderr:\n");
        detail.push_str(stderr);
    }
    Err(detail)
}

fn parse_winws_args(strategy: &Path) -> Result<String, String> {
    let content = fs::read_to_string(strategy).map_err(|e| e.to_string())?;
    let mut command = String::new();
    let mut capture = false;
    for raw in content.lines() {
        let line = raw.trim();
        if line.to_ascii_lowercase().contains("winws.exe") {
            capture = true;
            // Bats use `start … "%BIN%winws.exe" --args` — drop the closing quote after exe.
            let after = line
                .split_once("winws.exe")
                .map(|(_, r)| r)
                .unwrap_or("")
                .trim()
                .trim_start_matches('"')
                .trim()
                .trim_end_matches('^')
                .trim();
            if !after.is_empty() {
                command.push_str(after);
                command.push(' ');
            }
            if !line.ends_with('^') {
                break;
            }
        } else if capture {
            command.push_str(line.trim_end_matches('^').trim());
            command.push(' ');
            if !line.ends_with('^') {
                break;
            }
        }
    }
    if command.trim().is_empty() {
        return Err("error.service.winwsNotInStrategy".into());
    }
    let root = strategy
        .parent()
        .ok_or_else(|| "error.service.invalidStrategyPath".to_string())?;
    let bin = dir_with_slash(&root.join("bin"));
    let lists = dir_with_slash(&root.join("lists"));
    let (game, game_tcp, game_udp) = resolve_game_filters(root);
    Ok(command
        .replace("%BIN%", &bin)
        .replace("%LISTS%", &lists)
        .replace("%GameFilterTCP%", &game_tcp)
        .replace("%GameFilterUDP%", &game_udp)
        .replace("%GameFilter%", &game)
        .replace('^', "")
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" "))
}

/// Match Flowseal `service.bat`:
/// `sc create zapret binPath= "\"%BIN_PATH%winws.exe\" !ARGS!" DisplayName= "zapret" start= auto`
fn create_zapret_service(binary: &Path, args: &str) -> Result<(), String> {
    // Must go through cmd with raw_arg — see `run_cmd_script`.
    run_cmd_script(&sc_create_cmdline(binary, args))
        .map_err(|detail| format!("error.service.createFailed|{detail}"))
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
    // Strategies reference *-user.txt lists that Flowseal creates via load_user_lists.
    crate::library::ensure_user_lists(root)?;
    let args = parse_winws_args(file)?;
    prepare_service_replace();
    create_zapret_service(&binary, &args)?;
    let filename = file
        .file_name()
        .and_then(|n| n.to_str())
        .ok_or("error.service.invalidFileName".to_string())?;
    require_command(
        "error.service.saveStrategyFailed",
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
    )?;
    require_command(
        "error.service.saveStrategyFailed",
        "reg",
        &[
            "add",
            r"HKLM\System\CurrentControlSet\Services\zapret",
            "/v",
            "zapret-discord-youtube-version",
            "/t",
            "REG_SZ",
            "/d",
            &strategy.version,
            "/f",
        ],
    )?;
    require_command("error.service.startFailed", "sc", &["start", "zapret"])?;
    wait_until_service_running()?;
    invalidate_service_status_cache();
    Ok(())
}

fn wait_until_service_running() -> Result<(), String> {
    // `sc start` can succeed while winws immediately exits (missing lists, WinDivert conflict).
    std::thread::sleep(std::time::Duration::from_millis(1200));
    if service_running("zapret") {
        return Ok(());
    }
    let detail = output("sc", &["query", "zapret"]);
    Err(format!(
        "error.service.startFailed|Service exited right after start.\n{detail}"
    ))
}

/// Start an already-installed zapret service without recreating it.
#[tauri::command]
pub fn start_service(state: State<AppState>) -> Result<(), String> {
    require_admin()?;
    if !service_installed("zapret") {
        return Err("error.service.notInstalled".into());
    }
    if service_running("zapret") {
        return Ok(());
    }
    if let Ok(base) = crate::library::managed_library_path(&state.config_dir) {
        if let Some(tag) = active_version_tag(&base) {
            let root = std::path::Path::new(&base).join("versions").join(tag);
            let _ = crate::library::ensure_user_lists(&root);
        }
    }
    require_command("error.service.startFailed", "sc", &["start", "zapret"])?;
    wait_until_service_running()?;
    invalidate_service_status_cache();
    Ok(())
}

/// Match Flowseal install/remove: clear zapret, orphan winws, and leftover WinDivert.
fn prepare_service_replace() {
    let _ = run_command("sc", &["stop", "zapret"]);
    let _ = run_command("sc", &["delete", "zapret"]);
    let _ = run_command("taskkill", &["/IM", "winws.exe", "/F"]);
    clear_windivert();
}

fn clear_windivert() {
    let _ = run_command("sc", &["stop", "WinDivert"]);
    let _ = run_command("sc", &["delete", "WinDivert"]);
    let _ = run_command("sc", &["stop", "WinDivert14"]);
    let _ = run_command("sc", &["delete", "WinDivert14"]);
}

#[tauri::command]
pub fn stop_service() -> Result<(), String> {
    require_admin()?;
    require_service_command("error.service.stopFailed", &["stop", "zapret"])?;
    invalidate_service_status_cache();
    Ok(())
}

#[tauri::command]
pub fn remove_service() -> Result<(), String> {
    require_admin()?;
    let _ = run_command("sc", &["stop", "zapret"]);
    require_service_command("error.service.removeFailed", &["delete", "zapret"])?;
    let _ = run_command("taskkill", &["/IM", "winws.exe", "/F"]);
    clear_windivert();
    invalidate_service_status_cache();
    Ok(())
}
#[cfg(test)]
mod tests {
    use super::*;
    use std::time::{SystemTime, UNIX_EPOCH};

    fn temp_dir(name: &str) -> std::path::PathBuf {
        let stamp = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let dir = std::env::temp_dir().join(format!("zapretyd-{name}-{stamp}"));
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn parses_embedded_command() {
        let dir = temp_dir("parse-simple");
        let file = dir.join("strategy.bat");
        fs::write(
            &file,
            "@echo off\n%BIN%winws.exe --wf-tcp=80,443 ^\n --hostlist=%LISTS%list.txt",
        )
        .unwrap();
        let args = parse_winws_args(&file).unwrap();
        assert!(args.contains("--wf-tcp=80,443"));
        assert!(args.contains(r"\lists\list.txt"), "got: {args}");
        assert!(!args.contains("listslist"));
        let _ = fs::remove_dir_all(dir);
    }

    #[test]
    fn parses_flowseal_start_line_with_quotes_and_filters() {
        let dir = temp_dir("parse-flowseal");
        let file = dir.join("general.bat");
        fs::write(
            &file,
            r#"@echo off
set "BIN=%~dp0bin\"
set "LISTS=%~dp0lists\"
start "zapret: test" /min "%BIN%winws.exe" --wf-tcp=80,443,%GameFilterTCP% --wf-udp=443,%GameFilterUDP% ^
--hostlist="%LISTS%list-general.txt" --dpi-desync-fake-quic="%BIN%quic.bin" --new ^
--filter-tcp=%GameFilterTCP%
"#,
        )
        .unwrap();
        let args = parse_winws_args(&file).unwrap();
        assert!(!args.contains("winws.exe\""));
        assert!(!args.starts_with('"'), "leftover quote: {args}");
        assert!(args.contains(r"\lists\list-general.txt"), "got: {args}");
        assert!(args.contains(r"\bin\quic.bin"), "got: {args}");
        assert!(!args.contains("listslist"));
        assert!(!args.contains("binquic"));
        assert!(args.contains("--wf-tcp=80,443,12"));
        assert!(args.contains("--wf-udp=443,12"));
        assert!(args.contains("--filter-tcp=12"));
        assert!(!args.contains("%GameFilter"));
        let _ = fs::remove_dir_all(dir);
    }

    #[test]
    fn game_filter_all_mode() {
        let dir = temp_dir("game-all");
        fs::create_dir_all(dir.join("utils")).unwrap();
        fs::write(dir.join("utils").join("game_filter.enabled"), "all\n").unwrap();
        let file = dir.join("s.bat");
        fs::write(&file, r#"start "x" /min "%BIN%winws.exe" --filter-tcp=%GameFilterTCP%"#).unwrap();
        let args = parse_winws_args(&file).unwrap();
        assert!(args.contains("--filter-tcp=1024-65535"));
        let _ = fs::remove_dir_all(dir);
    }

    #[test]
    fn escape_quotes_for_sc_binpath() {
        assert_eq!(
            escape_quotes_for_sc(r#"--hostlist="C:\lists\a.txt""#),
            r#"--hostlist=\"C:\lists\a.txt\""#
        );
    }

    #[test]
    fn sc_create_cmdline_matches_flowseal_quoting() {
        let bin = Path::new(r"C:\Zapretyd\library\versions\1.10.0\bin\winws.exe");
        let line = sc_create_cmdline(bin, r#"--hostlist="C:\lists\a.txt" --new"#);
        assert_eq!(
            line,
            r#"sc create zapret binPath= "\"C:\Zapretyd\library\versions\1.10.0\bin\winws.exe\" --hostlist=\"C:\lists\a.txt\" --new" DisplayName= "zapret" start= auto"#
        );
    }

    #[test]
    fn run_command_reports_missing_program() {
        let err = run_command("zapretyd-missing-helper-exe", &["arg"]).unwrap_err();
        assert!(err.contains("zapretyd-missing-helper-exe"));
        assert!(err.contains("failed to spawn") || err.contains("exit="));
    }

    #[test]
    fn detects_missing_service_exit() {
        assert!(service_missing_detail(
            "sc delete zapret\nexit=1060\nstdout:\n[SC] OpenService FAILED 1060:"
        ));
        assert!(service_missing_detail(
            "sc query zapret\nexit=1060\nstdout:\n[SC] EnumQueryServicesStatus:OpenService: Ошибка: 1060:"
        ));
        assert!(!service_missing_detail(
            "sc delete zapret\nexit=5\nstdout:\nAccess is denied."
        ));
    }

    #[test]
    fn parses_service_pid_lines() {
        // Mirror `sc queryex` key/value shape used by `service_pid`.
        let sample = "TYPE               : 10  WIN32_OWN_PROCESS\nSTATE              : 4  RUNNING\nPID                : 4242\nFLAGS              :";
        let pid = sample.lines().find_map(|line| {
            let line = line.trim();
            let (key, value) = line.split_once(':')?;
            if !key.trim().eq_ignore_ascii_case("pid") {
                return None;
            }
            let pid = value.trim().parse::<u32>().ok()?;
            (pid > 0).then_some(pid)
        });
        assert_eq!(pid, Some(4242));
    }

    #[test]
    fn extracts_version_tag_from_image_path() {
        let image = r#""C:\Users\nemok\AppData\Roaming\Zapretyd\library\versions\1.10.0\bin\winws.exe" --wf-tcp=80"#;
        let base = r"C:\Users\nemok\AppData\Roaming\Zapretyd\library";
        assert_eq!(
            version_tag_from_image_path(image, base).as_deref(),
            Some("1.10.0")
        );
        assert_eq!(
            version_tag_from_image_path(
                r"C:\Zapretyd\library\versions\1.9.9c\bin\winws.exe --x",
                r"C:\Zapretyd\library"
            )
            .as_deref(),
            Some("1.9.9c")
        );
    }
}
