use crate::{
    app::{get_system_locale, relaunch_as_admin, AppState},
    library::{list_versions_at, open_directory},
    service::{get_service_status, stop_service},
};
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use tauri::{
    image::Image,
    menu::{Menu, MenuItem, PredefinedMenuItem, Submenu},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle, Manager, Runtime,
};

const TRAY_ID: &str = "main";
const APP_VERSION: &str = env!("CARGO_PKG_VERSION");
/// While the context menu may be open, skip `set_menu` — replacing it dismisses the popup.
static MENU_HOLD_UNTIL_MS: AtomicU64 = AtomicU64::new(0);

fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

fn hold_menu_rebuild(seconds: u64) {
    MENU_HOLD_UNTIL_MS.store(now_ms().saturating_add(seconds.saturating_mul(1000)), Ordering::Relaxed);
}

fn menu_rebuild_held() -> bool {
    now_ms() < MENU_HOLD_UNTIL_MS.load(Ordering::Relaxed)
}

struct TrayStrings {
    service_running: &'static str,
    service_stopped: &'static str,
    strategy: &'static str,
    active_version: &'static str,
    none: &'static str,
    details: &'static str,
    zapret: &'static str,
    winws: &'static str,
    windivert: &'static str,
    admin: &'static str,
    running: &'static str,
    stopped: &'static str,
    inactive: &'static str,
    admin_granted: &'static str,
    admin_missing: &'static str,
    update_available: &'static str,
    up_to_date: &'static str,
    update_unknown: &'static str,
    installed: &'static str,
    library: &'static str,
    library_not_configured: &'static str,
    show: &'static str,
    stop_service: &'static str,
    relaunch_admin: &'static str,
    open_library: &'static str,
    quit: &'static str,
}

fn strings_en() -> TrayStrings {
    TrayStrings {
        service_running: "Service: Running",
        service_stopped: "Service: Stopped",
        strategy: "Strategy",
        active_version: "Active version",
        none: "—",
        details: "Details",
        zapret: "zapret",
        winws: "winws",
        windivert: "WinDivert",
        admin: "Admin",
        running: "Running",
        stopped: "Stopped",
        inactive: "Inactive",
        admin_granted: "Granted",
        admin_missing: "Missing",
        update_available: "Update: {tag} available",
        up_to_date: "Update: Up to date",
        update_unknown: "Update: Unknown",
        installed: "Installed: {n} versions",
        library: "Library",
        library_not_configured: "Library: Not configured",
        show: "Show Zapretyd",
        stop_service: "Stop service",
        relaunch_admin: "Relaunch as administrator",
        open_library: "Open library folder",
        quit: "Quit",
    }
}

fn strings_ru() -> TrayStrings {
    TrayStrings {
        service_running: "Служба: Работает",
        service_stopped: "Служба: Остановлена",
        strategy: "Стратегия",
        active_version: "Активная версия",
        none: "—",
        details: "Подробности",
        zapret: "zapret",
        winws: "winws",
        windivert: "WinDivert",
        admin: "Админ",
        running: "Работает",
        stopped: "Остановлена",
        inactive: "Неактивен",
        admin_granted: "Получены",
        admin_missing: "Нет",
        update_available: "Обновление: {tag} доступно",
        up_to_date: "Обновление: Актуальная версия",
        update_unknown: "Обновление: Неизвестно",
        installed: "Установлено: {n} версий",
        library: "Библиотека",
        library_not_configured: "Библиотека: Не настроена",
        show: "Показать Zapretyd",
        stop_service: "Остановить службу",
        relaunch_admin: "Перезапустить от администратора",
        open_library: "Открыть папку библиотеки",
        quit: "Выход",
    }
}

fn resolve_locale<R: Runtime>(app: &AppHandle<R>) -> TrayStrings {
    let locale = app
        .try_state::<AppState>()
        .and_then(|state| state.settings.lock().ok().map(|s| s.locale.clone()))
        .unwrap_or_else(|| "system".into());
    let code = if locale == "system" {
        get_system_locale()
    } else {
        locale
    };
    if code.to_ascii_lowercase().starts_with("ru") {
        strings_ru()
    } else {
        strings_en()
    }
}

fn truncate_path(path: &str, max: usize) -> String {
    if path.chars().count() <= max {
        return path.to_string();
    }
    let keep = max.saturating_sub(1);
    let mut truncated: String = path.chars().take(keep).collect();
    truncated.push('…');
    truncated
}

fn show_main_window<R: Runtime>(app: &AppHandle<R>) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.unminimize();
        let _ = window.set_focus();
    }
}

fn build_menu<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<Menu<R>> {
    let t = resolve_locale(app);
    let status = get_service_status();
    let running = status.service_running && status.winws_running;

    let (library_path, cached_latest) = app
        .try_state::<AppState>()
        .and_then(|state| {
            state
                .settings
                .lock()
                .ok()
                .map(|s| (s.library_path.clone(), s.cached_latest_tag.clone()))
        })
        .unwrap_or((None, None));

    let versions = library_path
        .as_deref()
        .map(list_versions_at)
        .transpose()
        .ok()
        .flatten()
        .unwrap_or_default();
    let active_tag = versions
        .iter()
        .find(|v| v.is_active)
        .map(|v| v.tag.as_str())
        .unwrap_or(t.none);
    let installed_count = versions.len();

    let update_text = match &cached_latest {
        Some(tag) if versions.iter().any(|v| v.tag == *tag) => t.up_to_date.to_string(),
        Some(tag) => t.update_available.replace("{tag}", tag),
        None => t.update_unknown.to_string(),
    };

    let service_text = if running {
        t.service_running
    } else {
        t.service_stopped
    };
    let strategy_name = status.active_strategy.as_deref().unwrap_or(t.none);
    let library_text = match &library_path {
        Some(path) => format!("{}: {}", t.library, truncate_path(path, 42)),
        None => t.library_not_configured.to_string(),
    };

    let header = MenuItem::with_id(
        app,
        "header",
        format!("Zapretyd v{APP_VERSION}"),
        false,
        None::<&str>,
    )?;
    let service_item = MenuItem::with_id(app, "info_service", service_text, false, None::<&str>)?;
    let strategy_item = MenuItem::with_id(
        app,
        "info_strategy",
        format!("{}: {strategy_name}", t.strategy),
        false,
        None::<&str>,
    )?;
    let version_item = MenuItem::with_id(
        app,
        "info_version",
        format!("{}: {active_tag}", t.active_version),
        false,
        None::<&str>,
    )?;

    let detail_zapret = MenuItem::with_id(
        app,
        "detail_zapret",
        format!(
            "{}: {}",
            t.zapret,
            if status.service_running {
                t.running
            } else {
                t.stopped
            }
        ),
        false,
        None::<&str>,
    )?;
    let detail_winws = MenuItem::with_id(
        app,
        "detail_winws",
        format!(
            "{}: {}",
            t.winws,
            if status.winws_running {
                t.running
            } else {
                t.stopped
            }
        ),
        false,
        None::<&str>,
    )?;
    let detail_windivert = MenuItem::with_id(
        app,
        "detail_windivert",
        format!(
            "{}: {}",
            t.windivert,
            if status.windivert_running {
                t.running
            } else {
                t.inactive
            }
        ),
        false,
        None::<&str>,
    )?;
    let detail_admin = MenuItem::with_id(
        app,
        "detail_admin",
        format!(
            "{}: {}",
            t.admin,
            if status.is_admin {
                t.admin_granted
            } else {
                t.admin_missing
            }
        ),
        false,
        None::<&str>,
    )?;
    let details = Submenu::with_id_and_items(
        app,
        "details",
        t.details,
        true,
        &[
            &detail_zapret,
            &detail_winws,
            &detail_windivert,
            &detail_admin,
        ],
    )?;

    let update_item = MenuItem::with_id(app, "info_update", update_text, false, None::<&str>)?;
    let installed_item = MenuItem::with_id(
        app,
        "info_installed",
        t.installed.replace("{n}", &installed_count.to_string()),
        false,
        None::<&str>,
    )?;
    let library_item = MenuItem::with_id(app, "info_library", library_text, false, None::<&str>)?;

    let show_item = MenuItem::with_id(app, "show", t.show, true, None::<&str>)?;
    let quit_item = MenuItem::with_id(app, "quit", t.quit, true, None::<&str>)?;

    let sep1 = PredefinedMenuItem::separator(app)?;
    let sep2 = PredefinedMenuItem::separator(app)?;
    let sep3 = PredefinedMenuItem::separator(app)?;
    let sep4 = PredefinedMenuItem::separator(app)?;

    let menu = Menu::with_items(
        app,
        &[
            &header,
            &sep1,
            &service_item,
            &strategy_item,
            &version_item,
            &sep2,
            &details,
            &sep3,
            &update_item,
            &installed_item,
            &library_item,
            &sep4,
            &show_item,
        ],
    )?;

    if running && status.is_admin {
        let stop_item = MenuItem::with_id(app, "stop", t.stop_service, true, None::<&str>)?;
        menu.append(&stop_item)?;
    }
    if !status.is_admin {
        let relaunch_item =
            MenuItem::with_id(app, "relaunch_admin", t.relaunch_admin, true, None::<&str>)?;
        menu.append(&relaunch_item)?;
    }
    if library_path.is_some() {
        let open_item = MenuItem::with_id(app, "open_library", t.open_library, true, None::<&str>)?;
        menu.append(&open_item)?;
    }

    let sep5 = PredefinedMenuItem::separator(app)?;
    menu.append(&sep5)?;
    menu.append(&quit_item)?;

    Ok(menu)
}

fn tooltip_text<R: Runtime>(app: &AppHandle<R>) -> String {
    let t = resolve_locale(app);
    let status = get_service_status();
    let running = status.service_running && status.winws_running;
    let state = if running { t.running } else { t.stopped };
    format!("Zapretyd — {state}")
}

pub fn rebuild_menu<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<()> {
    let Some(tray) = app.tray_by_id(TRAY_ID) else {
        return Ok(());
    };
    let menu = build_menu(app)?;
    tray.set_menu(Some(menu))?;
    tray.set_tooltip(Some(tooltip_text(app)))?;
    Ok(())
}

fn refresh_tray_idle<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<()> {
    let Some(tray) = app.tray_by_id(TRAY_ID) else {
        return Ok(());
    };
    // Updating tooltip is safe while the menu is open; replacing the menu is not.
    if menu_rebuild_held() {
        tray.set_tooltip(Some(tooltip_text(app)))?;
        return Ok(());
    }
    rebuild_menu(app)
}

pub fn init_tray<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<()> {
    let menu = build_menu(app)?;
    let tooltip = tooltip_text(app);
    let icon = match app.default_window_icon() {
        Some(icon) => icon.clone(),
        None => Image::from_bytes(include_bytes!("../icons/32x32.png"))?,
    };

    TrayIconBuilder::with_id(TRAY_ID)
        .icon(icon)
        .tooltip(&tooltip)
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id.as_ref() {
            "show" => show_main_window(app),
            "stop" => {
                let _ = stop_service();
                let _ = rebuild_menu(app);
            }
            "relaunch_admin" => {
                let _ = relaunch_as_admin();
            }
            "open_library" => {
                if let Some(path) = app.try_state::<AppState>().and_then(|state| {
                    state
                        .settings
                        .lock()
                        .ok()
                        .and_then(|s| s.library_path.clone())
                }) {
                    let _ = open_directory(path);
                }
            }
            "quit" => app.exit(0),
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            let app = tray.app_handle();
            match event {
                TrayIconEvent::Click {
                    button: MouseButton::Right,
                    button_state: MouseButtonState::Down,
                    ..
                } => {
                    // Keep the existing menu; set_menu here would close the popup.
                    hold_menu_rebuild(30);
                }
                TrayIconEvent::Click {
                    button: MouseButton::Left,
                    button_state: MouseButtonState::Up,
                    ..
                } => {
                    show_main_window(app);
                }
                _ => {}
            }
        })
        .build(app)?;

    let refresh = app.clone();
    std::thread::spawn(move || loop {
        std::thread::sleep(Duration::from_secs(5));
        let _ = refresh_tray_idle(&refresh);
    });

    Ok(())
}
