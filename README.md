# Zapretyd

A Windows desktop manager for [Flowseal/zapret-discord-youtube](https://github.com/Flowseal/zapret-discord-youtube) releases.

Zapretyd downloads official GitHub releases, keeps each version in an isolated folder, and helps you activate a strategy as the Windows `zapret` service — without manually editing batch files or service entries.

## Features

- **Release management** — check for updates, download, and install the latest zapret ZIP from GitHub
- **Version library** — store multiple releases side by side in the app library folder
- **Overview** — see service, WinDivert, and `winws.exe` status, then pick a strategy and create, start, stop, or remove the `zapret` Windows service
- **Safe paths** — the library uses an ASCII-safe folder under the app data directory (or `C:\Zapretyd` as a fallback)

## Requirements

- Windows 10 or 11
- [Node.js](https://nodejs.org/) 20+
- [Rust](https://www.rust-lang.org/tools/install) (for Tauri)
- **Administrator rights** — required to create, start, stop, or remove the Windows service

## Getting started

```powershell
git clone <repository-url>
cd Zapretyd
npm install
npm run tauri dev
```

Versions are stored automatically under the app library folder (`<app_config_dir>\library`, or `C:\Zapretyd` when that path is not ASCII-safe). There is no folder picker on first launch.

## Scripts

| Command               | Description                         |
| --------------------- | ----------------------------------- |
| `npm run tauri dev`   | Run the app in development mode     |
| `npm run tauri build` | Build a production installer (NSIS) |
| `npm run dev`         | Start Vite dev server only          |
| `npm run build`       | Typecheck and build the frontend    |
| `npm test`            | Run frontend tests                  |
| `npm run lint`        | Lint the frontend with ESLint       |
| `npm run format`      | Format the project with Prettier    |

## How it works

1. **Library** — releases are extracted to `<app_library>\versions\<tag>\`
2. **Strategies** — each version ships with `.bat` strategy files; Zapretyd lists them per version
3. **Overview** — when you activate a strategy, Zapretyd parses `winws.exe` arguments from the batch file, registers the `zapret` service, and starts it
4. **Updates** — the app queries GitHub Releases for `Flowseal/zapret-discord-youtube` and can auto-check once per day while open

## Project structure

```
src/           React + TypeScript frontend (MUI)
src-tauri/     Rust backend (Tauri commands, Windows service logic)
```

See [AGENTS.md](./AGENTS.md) for architecture details and contributor guidance for AI agents.

## Notes

- Zapretyd does not bundle zapret — it only downloads from the upstream GitHub project.
- If the service fails to start, verify WinDivert is installed and the selected strategy is valid.
- Restart Zapretyd as administrator before managing the Windows service.
- UI language follows the Windows system locale (English or Russian). English is used as fallback.

## License

Zapretyd is licensed under the [MIT License](./LICENSE).

Downloaded [zapret-discord-youtube](https://github.com/Flowseal/zapret-discord-youtube) releases remain under their upstream license terms; Zapretyd does not relicense that software.
