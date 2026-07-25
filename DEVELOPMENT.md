# Development

Guide for building, testing, and releasing Zapretyd.

For AI agent conventions and architecture details, see [AGENTS.md](./AGENTS.md). End-user overview lives in [README.md](./README.md).

## Requirements

- Windows 10 or 11
- [Node.js](https://nodejs.org/) 20+
- [Rust](https://www.rust-lang.org/tools/install) toolchain (stable)
- Administrator rights when testing Windows service create/start/stop/delete

## Setup

```powershell
git clone https://github.com/NemoKing1210/Zapretyd.git
cd Zapretyd
npm install
npm run tauri dev
```

`npm run tauri dev` starts Vite and the Tauri shell together.

Library data is stored under the managed path (`<app_config_dir>\library`, or `C:\Zapretyd` when that path is not ASCII-safe). There is no folder picker.

## Daily workflow

1. Create or switch to a feature branch from `dev` (or the current default).
2. Make a focused change; match existing patterns.
3. Format and check before committing:

```powershell
npm run format
npm run lint
npm test
```

4. For Rust changes, also run:

```powershell
cd src-tauri
cargo test
cd ..
```

5. Commit and open a PR / push as usual.

## Scripts

| Command | Description |
| --- | --- |
| `npm run tauri dev` | Full app (Vite + Tauri) |
| `npm run tauri build` | Local production NSIS installer |
| `npm run dev` | Vite only (no Tauri shell) |
| `npm run build` | Typecheck + frontend production build |
| `npm test` | Frontend tests (Vitest) |
| `npm run lint` | ESLint |
| `npm run lint:fix` | ESLint with autofix |
| `npm run format` | Prettier write |
| `npm run format:check` | Prettier check |
| `npm run version:sync` | Sync all version files from `package.json` |
| `npm run version:patch` / `minor` / `major` | Bump SemVer in all version files (no git) |
| `npm run version:set -- X.Y.Z` | Set an exact version (no git) |
| `npm run release:patch` / `minor` / `major` | Bump, commit, tag, push (starts CI release) |
| `npm run release:set -- X.Y.Z` | Same for an exact version |
| `npm run release:tag` | Tag + push current `package.json` version |

Release helpers live in [`scripts/release.mjs`](./scripts/release.mjs).

## Project layout

```
src/                 React 19 + TypeScript + MUI (FSD-style)
  app/               App shell, theme, root
  pages/             Route-level screens
  widgets/           Shared layout (AppShell)
  features/          Focused UI flows
  shared/            API client, i18n, helpers
src-tauri/           Rust / Tauri 2 backend
  src/
    app.rs           Settings, admin checks
    error_log.rs     Daily error log files (release builds)
    library.rs       Install / remove / ZIP / strategies
    releases.rs      GitHub Releases API
    service.rs       Windows `zapret` service
    types.rs         Shared serde types (camelCase on the wire)
scripts/             Release / version tooling
.github/workflows/   CI (GitHub Releases)
```

Frontend talks to the backend through `src/shared/api/zapretyd.ts`. Keep TypeScript types aligned with `src-tauri/src/types.rs`.

## How the app works (dev view)

1. **Library** — upstream ZIPs extract to `<library>\versions\<tag>\` with `.zapretyd.json` metadata.
2. **Strategies** — `.bat` files inside a version; only paths under the managed library are allowed.
3. **Service** — activating a strategy parses `winws.exe` args, creates/configures the Windows `zapret` service, and starts it (needs admin).
4. **Upstream updates** — GitHub API for `Flowseal/zapret-discord-youtube` (Windows `.zip` assets only).

## Localization

- UI strings: `src/shared/i18n/locales/en.ts` and `ru.ts`
- Backend returns stable error codes (e.g. `error.library.notConfigured`); the UI translates them
- Settings `locale`: `system` | `en` | `ru`
- Do not hardcode non-English user-facing strings in code
- Docs stay in English (`README.md`, `DEVELOPMENT.md`, `AGENTS.md`, `CLAUDE.md`)

## Versioning

Source of truth: `package.json` → `version` (SemVer `MAJOR.MINOR.PATCH`).

**Bump** when finishing a user-visible change set or preparing a shippable build (features, settings, bug fixes, behavior/UI).

**Do not bump** for docs-only edits, no-user-impact refactors, dependency-only chores, or unfinished WIP.

When bumping, these must stay in sync (the npm scripts do this):

| File | Field |
| --- | --- |
| `package.json` | `version` |
| `package-lock.json` | root `version` and `packages[""].version` |
| `src-tauri/tauri.conf.json` | `version` |
| `src-tauri/Cargo.toml` | `package.version` |
| `library.rs` / `releases.rs` | HTTP user-agent `Zapretyd/X.Y` (major.minor) |

Prefer:

```powershell
npm run version:patch    # files only
# or
npm run release:patch    # files + commit + tag + push
```

## Publishing a GitHub release

Working tree must be **clean**.

### Recommended (one command)

```powershell
npm run release:patch   # 0.4.43 → 0.4.44
npm run release:minor   # → 0.5.0
npm run release:major   # → 1.0.0
npm run release:set -- 0.5.1
```

That bumps and syncs all version files, creates a commit (`chore: release vX.Y.Z`), creates annotated tag `vX.Y.Z`, and pushes branch + tag.

### Tag only (version already committed)

```powershell
npm run release:tag
```

### Manual CI trigger

**Actions → Release → Run workflow** (uses the version already in the repo).

### After CI finishes

1. Open the **draft** release on GitHub (NSIS `.exe` attached).
2. Edit release notes.
3. Click **Publish release**.

Workflow: [`.github/workflows/release.yml`](./.github/workflows/release.yml).

Triggers:

- Push of tags matching `v*`
- Manual `workflow_dispatch`

If asset upload fails with a permissions error: repo **Settings → Actions → General → Workflow permissions** → **Read and write permissions**.

The installer is currently **unsigned**. Windows SmartScreen may warn on first run.

## Local installer build

Without publishing:

```powershell
npm run tauri build
```

Artifacts land under `src-tauri/target/release/bundle/nsis/`.

## Common change map

| Task | Where |
| --- | --- |
| New settings field | `types.rs` → `app.rs` → `zapretyd.ts` → `SettingsPage.tsx` (+ i18n) |
| New UI page | `src/pages/<name>/`, wire in `App.tsx` and `AppShell.tsx` |
| Install / download | `library.rs` |
| Upstream GitHub releases | `releases.rs` |
| Service behavior | `service.rs` |
| User-visible copy | locale files; backend uses error codes |
| App version / GitHub release | `npm run version:*` / `release:*` |

## Coding conventions

1. Minimal, focused diffs; match existing patterns.
2. Format with Prettier/ESLint — do not hand-fight the formatter.
3. Library path is fixed (`managed_library_path` / `resolve_default_library_path`); no user picker.
4. Only allow strategy files inside the managed library; reject ZIP path traversal (`enclosed_name()`).
5. Do not commit `node_modules/`, `dist/`, or `src-tauri/target/`.

## Related docs

| File | Audience |
| --- | --- |
| [README.md](./README.md) | Users |
| [DEVELOPMENT.md](./DEVELOPMENT.md) | Human contributors (this file) |
| [AGENTS.md](./AGENTS.md) | AI coding agents (architecture + rules) |
| [CLAUDE.md](./CLAUDE.md) | Short pointer for Claude Code |
