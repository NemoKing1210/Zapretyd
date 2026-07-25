//! Windows helpers for spawning child processes without flashing a console.

use std::process::Command;

/// `CREATE_NO_WINDOW` — hide console windows for GUI subsystem apps.
#[cfg(windows)]
const CREATE_NO_WINDOW: u32 = 0x0800_0000;

/// Apply flags so `sc` / `reg` / `tasklist` / similar tools do not flash a console in release.
pub fn hide_console(command: &mut Command) -> &mut Command {
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        command.creation_flags(CREATE_NO_WINDOW);
    }
    command
}

/// Decode stdout/stderr from classic Windows console tools (`sc`, `reg`, `tasklist`).
///
/// Those programs emit text in the OEM code page (e.g. CP866 on Russian Windows),
/// not UTF-8 — decoding as UTF-8 produces mojibake in logs.
pub fn decode_console_bytes(bytes: &[u8]) -> String {
    if bytes.is_empty() {
        return String::new();
    }

    #[cfg(windows)]
    {
        use windows::Win32::Globalization::{MultiByteToWideChar, CP_OEMCP};

        unsafe {
            let needed = MultiByteToWideChar(CP_OEMCP, Default::default(), bytes, None);
            if needed > 0 {
                let mut wide = vec![0u16; needed as usize];
                let written =
                    MultiByteToWideChar(CP_OEMCP, Default::default(), bytes, Some(&mut wide));
                if written > 0 {
                    return String::from_utf16_lossy(&wide[..written as usize]);
                }
            }
        }
    }

    String::from_utf8_lossy(bytes).into_owned()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn decode_empty() {
        assert_eq!(decode_console_bytes(b""), "");
    }

    #[test]
    fn decode_ascii() {
        assert_eq!(decode_console_bytes(b"FAILED 1060"), "FAILED 1060");
    }
}
