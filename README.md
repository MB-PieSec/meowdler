<div align="center">

<img src="docs/banner.png" alt="Meowdler banner" width="700" />

### 🐾 A soft-pawed downloader for YouTube · X · Instagram

Dressed head-to-toe in [Catppuccin](https://github.com/catppuccin/catppuccin), powered by `yt-dlp`.

![Latest release](https://img.shields.io/github/v/release/MB-PieSec/meowdler?style=flat-square&logo=github&label=release&color=cba6f7)
![Platforms](https://img.shields.io/badge/Windows-NSIS-blue?style=flat-square&color=cba6f7&logo=windows)
![Platforms 2](https://img.shields.io/badge/macOS-DMG-purple?style=flat-square&color=f5c2e7&logo=apple)
![Platforms 3](https://img.shields.io/badge/Linux-AppImage%20%2F%20deb-orange?style=flat-square&color=74c7ec&logo=linux)
![License](https://img.shields.io/badge/license-MIT-a6adc8?style=flat-square)
![Release CI](https://img.shields.io/github/actions/workflow/status/MB-PieSec/meowdler/release.yml?style=flat-square&branch=main&label=build&color=a6e3a1)

[**⬇ Download the latest release**](https://github.com/MB-PieSec/meowdler/releases/latest)

</div>

---

<div align="center">
<img src="docs/screenshot.png" alt="Meowdler in action" width="720" />
</div>

## ✨ Highlights

| 🎨  | **Four Catppuccin flavors**        | Mocha, Macchiato, Frappé, and Latte — one click away, restyled live                                             |
| --- | ---------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| 📥  | **Real download engine**           | Bundled `yt-dlp` + optional bundled ffmpeg — quality presets from _Best_ down to 360p, audio-only MP3/M4A       |
| 👁   | **Previews before you commit**     | Thumbnail, title, uploader + duration — for single videos and playlists (expanded entry by entry)               |
| 🚦  | **A Queue that behaves**           | Concurrent downloads (1–4, live-tunable), pause / resume / cancel / retry, live per-stream progress             |
| 🗂   | **History that survives restarts** | Finished items persist locally, searchable — with **Open** (system player) and **Show in folder**               |
| 🏷   | **Source tags**                    | Every row knows where it came from: YouTube / X / Instagram                                                     |
| 🌙  | **Frameless custom titlebar**      | Native-feeling window chrome with a _Check updates_ button                                                      |
| 🔄  | **Self-updating**                  | Checks GitHub on startup — click _Install_, it downloads and relaunches by itself (deb opens the releases page) |
| 🔒  | **Local-first**                    | Goes straight from the wire to your disk. No accounts, no telemetry, no cloud                                   |

<table>
  <tr>
    <td align="center">🌙<br><b>Mocha</b><br><code>#1e1e2e</code></td>
    <td align="center">🍵<br><b>Macchiato</b><br><code>#24273a</code></td>
    <td align="center">🥛<br><b>Frappé</b><br><code>#303446</code></td>
    <td align="center">☀️<br><b>Latte</b><br><code>#eff1f5</code></td>
  </tr>
</table>

## 📦 Download

Grab a build straight from [Releases](https://github.com/MB-PieSec/meowdler/releases/latest):

| Platform | File                                                                |
| -------- | ------------------------------------------------------------------- |
| Linux    | `Meowdler-<version>.AppImage` · `meowdler_<version>_amd64.deb`      |
| Windows  | `Meowdler.Setup.<version>.exe`                                      |
| macOS    | `Meowdler-<version>-arm64.dmg` · `Meowdler-<version>-arm64-mac.zip` |

Everything ships self-contained — engine, icons, update feeds. No runtime prerequisites.

> **Meowdler pokes no network endpoints of its own** — all fetching is done by
> the trusted `yt-dlp` engine directly to your output folder.

## 🍪 The one thing that needs you

Some platforms gate-keep by who's asking (Instagram basically always; YouTube
sometimes, with bot-wall errors). Meowdler's Settings → **Cookies** covers both:

- **From a browser** — the engine reads a local browser's cookie store directly
  (Brave, Chrome, Chromium, Edge, Firefox, …)
- **From a file** — a Netscape-format `cookies.txt` exported by any extension

Cookies never leave your machine; they only flow from your disk into the engine.

## 🧑‍💻 Build from source

```sh
git clone https://github.com/MB-PieSec/meowdler
cd meowdler && npm install
npm run dev        # hot-reloading dev window
npm run package    # unpacked build in dist/
npm run dist       # installers for your current OS
```

Engine placement and behavior:

- The bundled `resources/yt-dlp` ships inside every package and is resolved via
  `process.resourcesPath`; ffmpeg prefers a bundled copy, then the repo copy in
  dev, then `/usr/bin/ffmpeg`.
- Recent yt-dlp needs a **JavaScript runtime** to parse YouTube's anti-bot
  challenges. Meowdler autodetects Node across version managers (nvm,
  nvm-windows), Homebrew, and system paths, and passes it as
  `--js-runtimes node:<path>` — no environment tweaks needed.

## 🔧 Scripts

| Script                 | Description                                    |
| ---------------------- | ---------------------------------------------- |
| `npm run dev`          | Dev server + Electron with hot reload          |
| `npm start`            | Electron with the last built bundle            |
| `npm run build`        | Bundle main / preload / renderer into `out/`   |
| `npm run typecheck`    | Strict type-check, no emit                     |
| `npm run lint`         | ESLint (flat config) · `lint:fix` for auto-fix |
| `npm run format`       | Prettier write · `format:check` to verify      |
| `npm run clean`        | Remove build output                            |
| `npm run package`      | Build + unpacked app in `dist/` (no installer) |
| `npm run dist`         | Installers: AppImage/deb · dmg · nsis per OS   |
| `npm run fetch:ffmpeg` | Stage a system ffmpeg into `resources/`        |

## 🗺 Project layout

```
electron.vite.config.ts     build config for main / preload / renderer
resources/yt-dlp            bundled engine binary (copied into packages)
build/icon.*                generated app icons (png / icns / ico)
scripts/                    make-icons.py · make-banner.py · fetch-ffmpeg.sh
src/
  main/                     Electron main process (Node side)
    index.ts                window creation + app lifecycle
    ipc.ts                  typed IPC handler registration
    downloads.ts            DownloadManager: worker pool, lifecycle, ledger
    ytdlp.ts                engine resolution · probing · spawn · runtime detect
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
```

`package.json` pins `"type": "module"`; electron-vite bundles main / preload /
renderer so imports are written without extensions.

## ⚙️ Under the hood

- **Update feeds** — releases publish `latest*.yml` files; the app checks GitHub
  on startup (Install / Not-now prompt) and via the titlebar button. In-place
  self-update works for AppImage, Windows NSIS, and the macOS zip target; deb
  installs open the releases page instead.
- **Linux sandboxing** — the deb keeps the Chromium sandbox (SUID-helper
  postinst + AppArmor profile); AppImage and unpacked builds fall back to an
  unsandboxed launch so they never abort the zygote.
- App icons regenerate with `python3 scripts/make-icons.py`, the README banner
  with `python3 scripts/make-banner.py` (PIL only).

## 📜 License

MIT · Made with 🩷 by [MB-PieSec](https://github.com/MB-PieSec)
