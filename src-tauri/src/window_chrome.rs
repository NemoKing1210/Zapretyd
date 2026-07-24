#[cfg(windows)]
use raw_window_handle::{HasWindowHandle, RawWindowHandle};
use tauri::{AppHandle, Manager, Theme};

const DARK_BG: (u8, u8, u8) = (0x1C, 0x1F, 0x26);
const LIGHT_BG: (u8, u8, u8) = (0xFF, 0xFF, 0xFF);

#[cfg(windows)]
fn hwnd_of(window: &tauri::WebviewWindow) -> Option<windows::Win32::Foundation::HWND> {
    use windows::Win32::Foundation::HWND;

    let handle = window.window_handle().ok()?;
    let RawWindowHandle::Win32(win32) = handle.as_raw() else {
        return None;
    };
    Some(HWND(win32.hwnd.get() as *mut std::ffi::c_void))
}

/// Match the native Windows title bar to the sidebar paper color.
#[cfg(windows)]
fn set_caption_color(window: &tauri::WebviewWindow, rgb: (u8, u8, u8)) {
    use windows::Win32::Graphics::Dwm::{
        DwmSetWindowAttribute, DWMWA_BORDER_COLOR, DWMWA_CAPTION_COLOR,
    };

    let Some(hwnd) = hwnd_of(window) else {
        return;
    };
    // COLORREF: 0x00BBGGRR
    let color: u32 = u32::from(rgb.2) << 16 | u32::from(rgb.1) << 8 | u32::from(rgb.0);
    unsafe {
        let _ = DwmSetWindowAttribute(
            hwnd,
            DWMWA_CAPTION_COLOR,
            &color as *const u32 as *const _,
            std::mem::size_of_val(&color) as u32,
        );
        let _ = DwmSetWindowAttribute(
            hwnd,
            DWMWA_BORDER_COLOR,
            &color as *const u32 as *const _,
            std::mem::size_of_val(&color) as u32,
        );
    }
}

#[cfg(not(windows))]
fn set_caption_color(_window: &tauri::WebviewWindow, _rgb: (u8, u8, u8)) {}

/// Keep caption title empty and show the bundled app icon.
fn apply_caption_branding(app: &AppHandle, window: &tauri::WebviewWindow) {
    use tauri::image::Image;

    let _ = window.set_title("");

    #[cfg(windows)]
    if let Some(hwnd) = hwnd_of(window) {
        use windows::core::PCWSTR;
        use windows::Win32::UI::WindowsAndMessaging::SetWindowTextW;
        unsafe {
            let _ = SetWindowTextW(hwnd, PCWSTR::from_raw([0u16].as_ptr()));
        }
    }

    if let Some(icon) = app.default_window_icon() {
        let _ = window.set_icon(icon.clone());
        return;
    }

    // Fallback when bundle icons are not embedded yet (e.g. mid-dev rebuild).
    if let Ok(icon) = Image::from_bytes(include_bytes!("../icons/32x32.png")) {
        let _ = window.set_icon(icon);
    }
}

fn apply_window_chrome(app: &AppHandle, dark: bool) {
    let Some(window) = app.get_webview_window("main") else {
        return;
    };
    let theme = if dark { Theme::Dark } else { Theme::Light };
    let _ = window.set_theme(Some(theme));
    apply_caption_branding(app, &window);
    set_caption_color(&window, if dark { DARK_BG } else { LIGHT_BG });
}

/// Called from the frontend when the resolved color scheme changes.
#[tauri::command]
pub fn sync_window_chrome(dark: bool, app: AppHandle) -> Result<(), String> {
    apply_window_chrome(&app, dark);
    Ok(())
}

pub fn init_window_chrome(app: &AppHandle) {
    let dark = app
        .get_webview_window("main")
        .and_then(|window| window.theme().ok())
        .map(|theme| theme == Theme::Dark)
        .unwrap_or(true);
    apply_window_chrome(app, dark);
}
