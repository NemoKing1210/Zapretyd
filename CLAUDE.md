# CLAUDE.md

Instructions for Claude Code when working in the Zapretyd repository.

For the full shared agent guide (architecture, common tasks, do-not list), read and follow [AGENTS.md](./AGENTS.md). For human development processes (setup, scripts, releases), see [DEVELOPMENT.md](./DEVELOPMENT.md). Keep these docs consistent when project conventions change.

## What this project is

Windows desktop app (Tauri 2) that manages [Flowseal/zapret-discord-youtube](https://github.com/Flowseal/zapret-discord-youtube) releases and the Windows `zapret` service. It does **not** ship zapret binaries — it downloads official GitHub ZIP releases into a library folder.

## Commands

```powershell
npm install
npm run tauri dev      # full app
npm run dev            # Vite only
npm run build          # tsc + Vite production build
npm test               # Vitest
npm run lint           # ESLint
npm run lint:fix      # ESLint autofix
npm run format         # Prettier
npm run tauri build    # NSIS installer
npm run release:patch  # bump + tag + push (GitHub Release draft)
```

Rust tests: `cargo test` in `src-tauri/`.

Requires Windows 10/11, Node.js 20+, Rust. Admin rights for service create/start/stop/delete.

## Layout

- `src/` — React 19 + TypeScript + MUI (FSD-style: `app`, `pages`, `widgets`, `features`, `shared`)
- `src-tauri/` — Rust backend (`app`, `error_log`, `library`, `releases`, `service`, `types`)
- Tauri commands ↔ frontend via `src/shared/api/zapretyd.ts`
- Keep TS types in sync with `src-tauri/src/types.rs` (serde `camelCase`)

## Versioning

Source of truth: `package.json` → `version` (SemVer). Prefer `npm run version:patch` / `npm run release:patch` (see `scripts/release.mjs`).

**Bump** when finishing a user-visible change set or preparing a release (features, settings, bug fixes, behavior/UI changes).

**Do not bump** for docs-only, no-user-impact refactors, dependency-only chores, or unfinished WIP.

When bumping, sync:

- `src-tauri/tauri.conf.json` → `version`
- `src-tauri/Cargo.toml` → `package.version`
- `package-lock.json` → root `version` and `packages[""].version`

Also update HTTP user-agent strings (`Zapretyd/X.Y`) in `library.rs` / `releases.rs` if the minor/major changes.

## i18n

- UI: English + Russian in `src/shared/i18n/locales/en.ts` and `ru.ts`
- Backend returns stable error codes (`error.library.notConfigured`); frontend translates
- Settings: `locale` = `system` | `en` | `ru`
- Docs (`README.md`, `DEVELOPMENT.md`, `AGENTS.md`, `CLAUDE.md`) stay in English
- Do not hardcode non-English user-facing strings in code; put copy in locale files

## Coding rules

1. Minimal, focused diffs; match existing patterns.
2. Format with Prettier/ESLint — do not hand-fight the formatter.
3. Library path is fixed to `library::managed_library_path` / `resolve_default_library_path` (ASCII-safe; no user picker).
4. Only allow strategy files inside the managed library; reject ZIP path traversal (`enclosed_name()`).
5. New settings: `types.rs` → `app.rs` → `zapretyd.ts` → `SettingsPage.tsx` (+ i18n keys).
6. Do not commit `node_modules/`, `dist/`, or `src-tauri/target/`.
