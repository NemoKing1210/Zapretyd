use crate::{
    app::{get_system_locale, AppState},
    library::{list_versions_at, managed_library_path},
    service::get_service_status,
};
use std::time::Duration;
use tauri::{
    image::Image,
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle, Emitter, Manager, PhysicalPosition, Rect, Runtime, WebviewUrl,
    WebviewWindowBuilder,
};

const TRAY_ID: &str = "main";
const TRAY_MENU_LABEL: &str = "tray-menu";
const TRAY_MENU_WIDTH: f64 = 360.0;
const TRAY_MENU_HEIGHT: f64 = 520.0;
const TRAY_MENU_GAP: f64 = 8.0;

fn resolve_locale_code<R: Runtime>(app: &AppHandle<R>) -> String {
    let locale = app
        .try_state::<AppState>()
        .and_then(|state| state.settings.lock().ok().map(|s| s.locale.clone()))
        .unwrap_or_else(|| "system".into());
    if locale == "system" {
        get_system_locale()
    } else {
        locale
    }
}

fn is_russian<R: Runtime>(app: &AppHandle<R>) -> bool {
    resolve_locale_code(app)
        .to_ascii_lowercase()
        .starts_with("ru")
}

pub fn show_main_window_impl<R: Runtime>(app: &AppHandle<R>) {
    hide_tray_menu(app);
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.unminimize();
        let _ = window.set_focus();
    }
}

pub fn hide_tray_menu<R: Runtime>(app: &AppHandle<R>) {
    if let Some(window) = app.get_webview_window(TRAY_MENU_LABEL) {
        let _ = window.hide();
    }
}

fn tooltip_text<R: Runtime>(app: &AppHandle<R>) -> String {
    let status = get_service_status();
    let running = status.service_running && status.winws_running;
    let ru = is_russian(app);
    let state = if running {
        if ru {
            "Работает"
        } else {
            "Running"
        }
    } else if ru {
        "Остановлена"
    } else {
        "Stopped"
    };

    let library_path = app
        .try_state::<AppState>()
        .and_then(|state| managed_library_path(&state.config_dir).ok());
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
        .unwrap_or("—");
    let strategy = status.active_strategy.as_deref().unwrap_or("—");

    format!("Zapretyd — {state}\n{active_tag} · {strategy}")
}

pub fn refresh_tooltip<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<()> {
    let Some(tray) = app.tray_by_id(TRAY_ID) else {
        return Ok(());
    };
    tray.set_tooltip(Some(tooltip_text(app)))?;
    Ok(())
}

fn ensure_tray_menu_window<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<()> {
    if app.get_webview_window(TRAY_MENU_LABEL).is_some() {
        return Ok(());
    }

    let window = WebviewWindowBuilder::new(
        app,
        TRAY_MENU_LABEL,
        WebviewUrl::App("tray.html".into()),
    )
    .title("Zapretyd")
    .inner_size(TRAY_MENU_WIDTH, TRAY_MENU_HEIGHT)
    .resizable(false)
    .maximizable(false)
    .minimizable(false)
    .closable(false)
    .decorations(false)
    .transparent(true)
    .skip_taskbar(true)
    .always_on_top(true)
    .visible(false)
    .focused(false)
    // OS shadow draws a rectangular rim on transparent HWNDs; use CSS shadow instead.
    .shadow(false)
    .build()?;

    apply_tray_menu_chrome(&window);

    let handle = app.clone();
    window.on_window_event(move |event| {
        if let tauri::WindowEvent::Focused(false) = event {
            // Delay hide so a right-click on the tray icon can re-show without flicker.
            let app = handle.clone();
            std::thread::spawn(move || {
                std::thread::sleep(Duration::from_millis(180));
                if let Some(win) = app.get_webview_window(TRAY_MENU_LABEL) {
                    if !win.is_focused().unwrap_or(false) {
                        let _ = win.hide();
                    }
                }
            });
        }
    });

    Ok(())
}

#[cfg(windows)]
fn apply_tray_menu_chrome<R: Runtime>(window: &tauri::WebviewWindow<R>) {
    use raw_window_handle::{HasWindowHandle, RawWindowHandle};
    use windows::Win32::Foundation::HWND;
    use windows::Win32::Graphics::Dwm::{
        DwmSetWindowAttribute, DWMWA_BORDER_COLOR, DWMWA_COLOR_NONE,
        DWMWA_WINDOW_CORNER_PREFERENCE, DWMWCP_DONOTROUND,
    };

    let Ok(handle) = window.window_handle() else {
        return;
    };
    let RawWindowHandle::Win32(win32) = handle.as_raw() else {
        return;
    };
    let hwnd = HWND(win32.hwnd.get() as *mut std::ffi::c_void);
    // Let CSS border-radius own the shape; DWM rounding + transparent
    // corners leaves a 1px rectangular rim (especially with OS shadow).
    let corner = DWMWCP_DONOTROUND;
    let border = DWMWA_COLOR_NONE;
    unsafe {
        let _ = DwmSetWindowAttribute(
            hwnd,
            DWMWA_WINDOW_CORNER_PREFERENCE,
            &corner as *const _ as *const _,
            std::mem::size_of_val(&corner) as u32,
        );
        let _ = DwmSetWindowAttribute(
            hwnd,
            DWMWA_BORDER_COLOR,
            &border as *const _ as *const _,
            std::mem::size_of_val(&border) as u32,
        );
    }
}

#[cfg(not(windows))]
fn apply_tray_menu_chrome<R: Runtime>(_window: &tauri::WebviewWindow<R>) {}

fn clamp_to_monitor(
    x: f64,
    y: f64,
    width: f64,
    height: f64,
    monitor_pos: PhysicalPosition<i32>,
    monitor_size: tauri::PhysicalSize<u32>,
) -> (f64, f64) {
    let min_x = f64::from(monitor_pos.x);
    let min_y = f64::from(monitor_pos.y);
    let max_x = min_x + f64::from(monitor_size.width) - width;
    let max_y = min_y + f64::from(monitor_size.height) - height;
    (
        x.clamp(min_x, max_x.max(min_x)),
        y.clamp(min_y, max_y.max(min_y)),
    )
}

fn show_tray_menu_at<R: Runtime>(app: &AppHandle<R>, rect: &Rect) {
    if ensure_tray_menu_window(app).is_err() {
        return;
    }
    let Some(window) = app.get_webview_window(TRAY_MENU_LABEL) else {
        return;
    };

    let scale = window.scale_factor().unwrap_or(1.0);
    let icon_pos = rect.position.to_physical::<f64>(scale);
    let icon_size = rect.size.to_physical::<f64>(scale);

    let width = TRAY_MENU_WIDTH * scale;
    let height = TRAY_MENU_HEIGHT * scale;
    let icon_x = icon_pos.x;
    let icon_y = icon_pos.y;
    let icon_w = icon_size.width;
    let icon_h = icon_size.height;

    let mut x = icon_x + (icon_w - width) / 2.0;
    // Prefer above the tray icon (typical taskbar-bottom layout).
    let mut y = icon_y - height - TRAY_MENU_GAP;
    if y < 0.0 {
        y = icon_y + icon_h + TRAY_MENU_GAP;
    }

    if let Ok(Some(monitor)) = window.current_monitor() {
        let (cx, cy) = clamp_to_monitor(
            x,
            y,
            width,
            height,
            *monitor.position(),
            *monitor.size(),
        );
        x = cx;
        y = cy;
    }

    let _ = window.set_size(tauri::LogicalSize::new(TRAY_MENU_WIDTH, TRAY_MENU_HEIGHT));
    let _ = window.set_position(PhysicalPosition::new(x, y));
    let _ = window.show();
    let _ = window.set_focus();
    let _ = window.emit("tray-menu-opened", ());
}

#[tauri::command]
pub fn show_main_window(app: AppHandle) {
    show_main_window_impl(&app);
}

#[tauri::command]
pub fn quit_app(app: AppHandle) {
    app.exit(0);
}

#[tauri::command]
pub fn hide_tray_menu_cmd(app: AppHandle) {
    hide_tray_menu(&app);
}

pub fn init_tray<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<()> {
    ensure_tray_menu_window(app)?;

    let tooltip = tooltip_text(app);
    let icon = match app.default_window_icon() {
        Some(icon) => icon.clone(),
        None => Image::from_bytes(include_bytes!("../icons/32x32.png"))?,
    };

    TrayIconBuilder::with_id(TRAY_ID)
        .icon(icon)
        .tooltip(&tooltip)
        .show_menu_on_left_click(false)
        .on_tray_icon_event(|tray, event| {
            let app = tray.app_handle();
            match event {
                TrayIconEvent::Click {
                    button: MouseButton::Right,
                    button_state: MouseButtonState::Up,
                    rect,
                    ..
                } => {
                    show_tray_menu_at(app, &rect);
                }
                TrayIconEvent::Click {
                    button: MouseButton::Left,
                    button_state: MouseButtonState::Up,
                    ..
                } => {
                    show_main_window_impl(app);
                }
                _ => {}
            }
        })
        .build(app)?;

    let refresh = app.clone();
    std::thread::spawn(move || loop {
        std::thread::sleep(Duration::from_secs(5));
        let _ = refresh_tooltip(&refresh);
    });

    Ok(())
}
