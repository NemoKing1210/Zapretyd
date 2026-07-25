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

When bumping, keep these in sync with `package.json` (prefer `npm run version:patch` / `release:patch`, which syncs all of them):

- `src-tauri/tauri.conf.json` → `version`
- `src-tauri/Cargo.toml` → `package.version`
- `package-lock.json` → root `version` (and `packages[""].version`)
- HTTP user-agent `Zapretyd/X.Y` in `library.rs` / `releases.rs` when major/minor changes

Do not invent a separate versioning scheme outside `package.json`.

## Language standard

**User-facing text is localized in English and Russian:**

- UI copy lives in `src/shared/i18n/locales/en.ts` and `ru.ts`
- Backend returns stable error codes (e.g. `error.library.notConfigured`); the frontend translates them
- Locale is detected from the Windows system culture via `get_system_locale`; fallback is English (`en`)
- Users can override the language in Settings (`AppSettings.locale`: `system` | `en` | `ru`)
- Use `useTranslation()` in React components; use `getLocale()` for `Intl` formatting helpers

Documentation (`README.md`, `DEVELOPMENT.md`, `AGENTS.md`, `CLAUDE.md`) stays in English.

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
  features/             Focused UI flows
  shared/               API client, formatting helpers

src-tauri/              Rust backend
  src/
    app.rs              Settings persistence, admin checks
    error_log.rs        Daily error log files (release builds)
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

- Versions are always stored in the managed app library from `library::resolve_default_library_path` (`<app_config_dir>/library`, or `C:\Zapretyd` if that path is not ASCII-safe).
- On load, settings `libraryPath` is forced to that path (`library::ensure_settings_library_path`); custom paths are ignored.
- Each release is extracted to `<library>/versions/<tag>/`.
- Metadata is stored in `<library>/versions/<tag>/.zapretyd.json`.
- Library path validation remains ASCII-only via `library::validate_library_path` (used when resolving the default / fallback).

### Service management

- Service name: `zapret`
- Activation parses `winws.exe` arguments from a strategy `.bat`, creates the service, stores the strategy filename in registry (`zapret-discord-youtube` value), and starts the service.
- Admin rights are required for create/start/stop/delete operations. The UI surfaces this and offers relaunch-as-admin.
- Status and service controls live on the Overview page (there is no separate Service page).

### Releases

- Latest release is fetched from GitHub API: `Flowseal/zapret-discord-youtube/releases/latest`.
- Only `.zip` Windows assets are selected for download.

### Error logging

- Development: in-memory log on the Logs page (`src/shared/lib/errorLog.ts`).
- Release builds: errors are appended to daily files under `<app_config_dir>/logs/YYYY-MM-DD.log` (Rust `error_log.rs`); files older than 14 days are pruned. Open the folder from Settings.

## Development

Human contributor processes (setup, scripts, versioning, GitHub Releases) are documented in [DEVELOPMENT.md](./DEVELOPMENT.md). Summary:

```powershell
npm install
npm run tauri dev
```

Other scripts: see `DEVELOPMENT.md` or `package.json`.

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
| Bump app version        | `npm run version:patch` (also syncs Tauri/Cargo/lock/user-agent) |
| Publish GitHub release  | `npm run release:patch` (bump + commit + tag + push) → publish draft |

## Testing

- Rust: `cargo test` in `src-tauri/`
- Frontend: `npm test`
- After locale or copy changes, update tests that assert formatted output (e.g. `format.test.ts`).

## Do not

- Commit `node_modules/`, `dist/`, or `src-tauri/target/` (see `.gitignore`).
- Hardcode non-ASCII library paths in examples or defaults (except the documented `C:\Zapretyd` ASCII fallback).
- Add strategies or binaries outside the managed library path.
- Reintroduce a user-facing library folder picker.
- Introduce non-English user-facing strings.
