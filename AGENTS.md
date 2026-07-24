# AGENTS.md

Guidance for AI coding agents working in the Zapretyd repository.

## Project overview

Zapretyd is a Windows desktop app built with **Tauri 2**. It manages local installations of [Flowseal/zapret-discord-youtube](https://github.com/Flowseal/zapret-discord-youtube) releases and configures the Windows `zapret` service with a selected strategy (`.bat` file).

The app does **not** ship zapret binaries. It downloads official GitHub release ZIPs into a user-chosen library folder and helps install, switch, start, and stop the Windows service.

## Versioning

App version is maintained in `package.json` (`version` field). Use SemVer (`MAJOR.MINOR.PATCH`).

**Bump the version when finishing a change set that users would notice or that should ship as a distinct build**, including:

- New features or settings (e.g. language picker, default library path)
- User-facing bug fixes or behavior changes
- UI/copy changes that alter how the app works
- Preparing a release / installer build

**Do not bump** for docs-only edits, internal refactors with no user impact, dependency housekeeping alone, or unfinished WIP on a feature branch.

When bumping, keep these in sync with `package.json`:

- `src-tauri/tauri.conf.json` → `version`
- `src-tauri/Cargo.toml` → `package.version`
- `package-lock.json` → root `version` (and `packages[""].version`)

Do not invent a separate versioning scheme outside `package.json`.

## Language standard

**User-facing text is localized in English and Russian:**

- UI copy lives in `src/shared/i18n/locales/en.ts` and `ru.ts`
- Backend returns stable error codes (e.g. `error.library.notConfigured`); the frontend translates them
- Locale is detected from the Windows system culture via `get_system_locale`; fallback is English (`en`)
- Users can override the language in Settings (`AppSettings.locale`: `system` | `en` | `ru`)
- Use `useTranslation()` in React components; use `getLocale()` for `Intl` formatting helpers

Documentation (`README.md`, `AGENTS.md`, `CLAUDE.md`) stays in English.

## Tech stack

| Layer         | Stack                                       |
| ------------- | ------------------------------------------- |
| Desktop shell | Tauri 2 (Rust)                              |
| Frontend      | React 19, TypeScript, Vite                  |
| UI            | MUI 7, Emotion                              |
| Tests         | Vitest (frontend), Rust `#[test]` (backend) |

## Repository layout

```
src/                    React frontend (Feature-Sliced Design–style folders)
  app/                  App shell, theme, root component
  pages/                Route-level screens (overview, versions, settings)
  widgets/              Shared layout (AppShell)
  features/             Focused UI flows (library path dialog)
  shared/               API client, formatting helpers

src-tauri/              Rust backend
  src/
    app.rs              Settings persistence, admin checks
    library.rs          Version install/remove, ZIP extraction, strategies
    releases.rs         GitHub Releases API
    service.rs          Windows service management (sc, reg, tasklist)
    types.rs            Shared Rust types
```

## Architecture notes

### Frontend ↔ backend bridge

- Tauri commands are wrapped in `src/shared/api/zapretyd.ts`.
- Prefer adding new backend commands in Rust and exposing them through this API module.
- Keep TypeScript types in sync with Rust `types.rs` (serde camelCase on the wire).

### Library model

- User picks a **library path** stored in app config (`settings.json` under the Tauri config dir).
- Each release is extracted to `<library>/versions/<tag>/`.
- Metadata is stored in `<library>/versions/<tag>/.zapretyd.json`.
- Library paths must be ASCII-only (no Cyrillic or special characters) — enforced in `library::validate_library_path`.
- Users may skip picking a folder and use the built-in path from `library::resolve_default_library_path` (`<app_config_dir>/library`, or `C:\Zapretyd` if that path is not ASCII-safe).

### Service management

- Service name: `zapret`
- Activation parses `winws.exe` arguments from a strategy `.bat`, creates the service, stores the strategy filename in registry (`zapret-discord-youtube` value), and starts the service.
- Admin rights are required for create/start/stop/delete operations. The UI surfaces this and offers relaunch-as-admin.
- Status and service controls live on the Overview page (there is no separate Service page).

### Releases

- Latest release is fetched from GitHub API: `Flowseal/zapret-discord-youtube/releases/latest`.
- Only `.zip` Windows assets are selected for download.

## Development

```powershell
npm install
npm run tauri dev
```

Other scripts:

```powershell
npm run dev          # Vite only (no Tauri shell)
npm run build        # Typecheck + frontend production build
npm test             # Vitest
npm run lint         # ESLint
npm run format       # Prettier
npm run tauri build  # Production installer (NSIS)
```

### Requirements

- Windows 10/11
- Node.js 20+
- Rust toolchain (for Tauri)
- Administrator privileges when testing service management

## Coding conventions

1. **Minimal scope** — small, focused diffs; match existing patterns.
2. **English everywhere** — no Russian (or other) UI/error strings.
3. **Security** — only allow strategy files inside the managed library; reject path traversal in ZIP extraction (`enclosed_name()`).
4. **Windows commands** — service logic uses `sc`, `reg`, `tasklist`, `explorer`; keep error messages actionable.
5. **Formatting** — use Prettier (`npm run format`) and ESLint (`npm run lint` / `npm run lint:fix`). Do not hand-format against the Prettier config.

## Common tasks

| Task                    | Where to change                                              |
| ----------------------- | ------------------------------------------------------------ |
| New settings field      | `types.rs`, `app.rs`, `zapretyd.ts`, `SettingsPage.tsx`      |
| New UI page             | `src/pages/<name>/`, wire in `App.tsx` and `AppShell.tsx`    |
| Install/download logic  | `library.rs`                                                 |
| GitHub release handling | `releases.rs`                                                |
| Service behavior        | `service.rs`                                                 |
| User-visible errors     | Rust `Err("...")` strings and React UI copy                  |
| Bump app version        | `package.json`, then sync `tauri.conf.json` and `Cargo.toml` |

## Testing

- Rust: `cargo test` in `src-tauri/`
- Frontend: `npm test`
- After locale or copy changes, update tests that assert formatted output (e.g. `format.test.ts`).

## Do not

- Commit `node_modules/`, `dist/`, or `src-tauri/target/` (see `.gitignore`).
- Hardcode non-ASCII library paths in examples or defaults.
- Add strategies or binaries outside the managed library path.
- Introduce non-English user-facing strings.
