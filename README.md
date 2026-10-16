# Meowdler

Catppuccin-themed desktop downloader for **YouTube**, **X (Twitter)**, and **Instagram**.

Node.js + TypeScript (ESM), Electron, React, and a wrapped `yt-dlp` engine.

## Requirements

- Node.js >= 22 + npm — for building/development
- **End users installing a release need nothing preinstalled** — the yt-dlp
  engine and (optionally) ffmpeg are bundled inside the installers. When
  running from source, system ffmpeg is used for stream merging/audio
  extraction if no bundled copy is staged (`npm run fetch:ffmpeg`).
- A display service for the Electron window (`npm run dev`)

## Getting started

```sh
npm install
npm run dev        # launch the app in dev mode with hot reload
```

## Scripts

| Script                 | Description                                    |
| ---------------------- | ---------------------------------------------- |
| `npm run dev`          | Run dev server + Electron with hot reload      |
| `npm start`            | Run Electron with the last built bundle        |
| `npm run build`        | Bundle main / preload / renderer into `out/`   |
| `npm run typecheck`    | Strict type-check, no emit                     |
| `npm run lint`         | ESLint (flat config)                           |
| `npm run lint:fix`     | ESLint with auto-fix                           |
| `npm run format`       | Prettier write                                 |
| `npm run format:check` | Prettier check                                 |
| `npm run clean`        | Remove build output                            |
| `npm run package`      | Build + unpacked app in `dist/` (no installer) |
| `npm run dist`         | Installers: AppImage/deb · dmg · nsis per OS   |
| `npm run fetch:ffmpeg` | Stage a system ffmpeg into `resources/`        |

## Layout

```
electron.vite.config.ts     build config for main / preload / renderer
resources/yt-dlp            bundled engine binary (copied into packages)
build/icon.*                generated app icons (png / icns / ico)
scripts/                    make-icons.py · fetch-ffmpeg.sh
src/
  main/                     Electron main process (Node side)
    index.ts                window creation + app lifecycle
    ipc.ts                  typed IPC handler registration
    downloads.ts            DownloadManager: worker pool, lifecycle, ledger
    ytdlp.ts                engine binary resolution · flat probe · spawn
    progress.ts             pure yt-dlp --newline line parsers
    history.ts              finished-downloads persistence (atomic writes)
    settings.ts             settings.json load/save (userData)
  preload/
    index.ts                contextBridge API (`window.meowdler`)
    window.d.ts             global type declaration of the bridged API
  renderer/
    views.tsx               all live views + shared MediaFormCard
    hooks/useDownloads.tsx  renderer download state (IPC upserts)
    components/ui.tsx       Button/Entry/ProgressBar/Chip widgets
    theme/flavors.css       Catppuccin palettes as CSS variables
  shared/
    downloads.ts            DownloadItem contract + history parser
    settings.ts             AppSettings schema + validators
    ipc.ts                  IPC channel names + payload types
build/                      icon assets shipped with packages
out/                        build output (generated)
```

## Module resolution

`package.json` sets `"type": "module"`; `tsconfig.json` uses `module`/`moduleResolution`
`ESNext`/`bundler`. Renderer and main/preload code are bundled by electron-vite, so
imports are written without extensions.

## Roadmap

- [x] Phase 0 — skeleton, toolchain, typed IPC, Mocha-dark window
- [x] Phase 1 — theme system (Mocha/Macchiato/Frappé/Latte + switcher), frameless custom titlebar, widget kit, view routing
- [x] Phase 2 — download engine core: bundled yt-dlp, probing, queue + worker pool, pause/resume/cancel/retry, live progress over IPC
- [x] Phase 3 — YouTube view: thumbnail preview, quality presets (best→360p, MP3/M4A), playlist expansion
- [x] Phase 4 — X (Twitter) view: tweet URL preview, presets, multi-video post expansion
- [x] Phase 5 — Instagram view: posts/Reels, cookie login (file or browser), friendly auth errors
- [x] Phase 6 — queue/history polish: finished downloads persist across restarts, searchable history, queue filters
- [x] Phase 7 — settings depth: custom download folder, live concurrency (1–4), engine version display
- [x] Phase 8 — packaging: electron-builder (asar), bundled yt-dlp in resources, AppImage/deb/dmg/nsis targets, generated icons

## Building distributables

```bash
npm run package       # out/ + dist/<platform>-unpacked (fast, no installers)
npm run dist          # installers: AppImage + deb (linux) / dmg (mac) / nsis (win)
npm run fetch:ffmpeg  # optional: stage a system ffmpeg into resources/ so installs are self-contained
```

- The bundled engine (`resources/yt-dlp`) ships inside the package and is found
  via `process.resourcesPath` at runtime; ffmpeg resolution prefers a bundled
  copy, then the repo copy in dev, then `/usr/bin/ffmpeg`.
- App icons are generated with `python3 scripts/make-icons.py` (PIL only).
- `homepage`/`repository` point at https://github.com/MB-PieSec/meowdler — the
  deb metadata validates them now.
- Releases publish `latest*.yml` update feeds, so the app checks GitHub on
  startup (Install / Not-now prompt) and via the titlebar button. In-place
  updates work for AppImage, Windows NSIS, and the macOS zip target; deb
  installs open the releases page instead.
- On Linux the Chromium sandbox is kept where the install layout supports it
  (deb ships a SUID-helper postinst + AppArmor profile); AppImage and unpacked
  builds fall back to an unsandboxed launch so they never abort the zygote.
