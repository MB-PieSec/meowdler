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

| 🎨  | **Four Catppuccin flavors**        | Mocha, Macchiato, Frappé, and Latte — one click away, restyled live                                               |
| --- | ---------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| 📥  | **Real download engine**           | Bundled `yt-dlp` + `ffmpeg` + a JavaScript runtime — quality presets from _Best_ down to 360p, audio-only MP3/M4A |
| 👁   | **Previews before you commit**     | Thumbnail, title, uploader + duration — for single videos and playlists (expanded entry by entry)                 |
| 🚦  | **A Queue that behaves**           | Concurrent downloads (1–4, live-tunable), pause / resume / cancel / retry, live per-stream progress               |
| 🗂   | **History that survives restarts** | Finished items persist locally, searchable — with **Open** (system player) and **Show in folder**                 |
| 🏷   | **Source tags**                    | Every row knows where it came from: YouTube / X / Instagram                                                       |
| 🌙  | **Frameless custom titlebar**      | Native-feeling window chrome with a _Check updates_ button                                                        |
| 🔄  | **Self-updating**                  | Checks GitHub on startup — Windows & AppImage click-_Install_ and relaunch; deb & macOS open the releases page    |
| 🔒  | **Local-first**                    | Goes straight from the wire to your disk. No accounts, no telemetry, no cloud                                     |

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

Everything ships self-contained — engine, ffmpeg, a JavaScript runtime, icons
and update feeds. No runtime prerequisites.

> **What Meowdler talks to on the network** — media fetching happens
> exclusively through the bundled `yt-dlp` engine, straight to the platform and
> its CDNs. Meowdler's own code contacts GitHub **only**: release feeds and
> installers for update checks, and the official yt-dlp release (API + asset
> download + `SHA2-256SUMS`) when you click _Check engine updates_. Preview
> thumbnails load directly from the platform's image CDNs. No telemetry, no
> analytics, no third parties — ever.

### Platform notes

- **Linux** — the deb keeps the Chromium sandbox; AppImage and unpacked builds
  fall back to a fully unsandboxed browser (zygote **and** renderer) so they
  always start on systems without user-namespaces or an SUID helper. App
  auto-update works for AppImage; deb opens the releases page instead.
- **Windows** (x64) — the NSIS installer is unsigned, so SmartScreen shows the
  classic _"Windows protected your PC"_ prompt: choose **More info → Run
  anyway**. You can change the install folder during setup.
- **macOS** — **Apple Silicon (arm64) only**, and builds are currently
  unsigned: macOS blocks the first launch with _"cannot verify the developer"_ —
  right-click the app → **Open** (or allow it in System Settings → Privacy &
  Security). Re-installing a newer build re-triggers the same notice — the same
  right-click dance clears it each time. In-app update **checks** work, but
  macOS builds don't self-update while unsigned (Squirrel.Mac, the updater
  behind electron-updater on macOS, requires signed apps) — Meowdler opens its
  releases page instead, and installing a new build stays a manual step.

The per-installer engine table and the Windows/macOS checklist are kept in
[docs/TESTING.md](docs/TESTING.md).

</think>Now fix the outdated ffmpeg-resolution doc line and complete the project-layout list:<tool_call>edit<arg_key>newString</arg_key><arg_value>

## 🍪 The one thing that needs you

Some platforms gate-keep by who's asking (Instagram basically always; YouTube
sometimes, with bot-wall errors). Meowdler's Settings → **Cookies** covers both:

- **From a browser** — the engine reads a local browser's cookie store directly.
  Supported by the engine (`yt-dlp --cookies-from-browser`): **Brave, Chrome,
  Chromium, Edge, Firefox, Opera, Safari, Vivaldi, Whale** (Safari is macOS
  only). Meowdler does not expose yt-dlp's optional keyring/profile/container
  suffixes, so a Chromium-family browser stored in an unusual keyring may need
  the `cookies.txt` route instead
- **From a file** — a Netscape-format `cookies.txt` exported by any extension

Cookies stay on this machine and are used for exactly one thing: sent as
request headers by the engine to the platform you're downloading from — nowhere
else.

Practical notes on cookies:

- **Close the browser first** when using _From a browser_ — some browsers lock
  their cookie store while running. Meowdler's engine-hint mapping tells you
  what it can classify from the engine's stderr: locked store, browser not
  installed, unmatched/unreadable cookie source, Safari outside macOS, and the
  Windows **Chromium decryption failure** (`Failed to decrypt with DPAPI`,
  yt-dlp issue #10927 — newer Chrome also "App-Bound"-encrypts its cookie key;
  Firefox or a fresh cookies.txt are the dependable routes there).
- **macOS + Safari** — Safari's cookie file lives in a TCC-protected folder, so
  the reader may need **Full Disk Access**: System Settings → Privacy &
  Security → Full Disk Access → add Meowdler. (`Operation not permitted` or a
  "failed to load cookies" engine line means the read was blocked.)
- **Keep the file around** when using _From a file_ — files are validated up
  front (Netscape format, readable), and a cookies file that goes missing after
  being picked fails the download item with a clear message instead of silently
  downloading without cookies (yt-dlp itself proceeds _without_ cookies for
  missing/unreadable files — that's why Meowdler pre-validates). Export **while
  logged in**, or the file has nothing useful in it.

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
  `process.resourcesPath`; ffmpeg resolution is cross-platform: packaged
  `resources/ffmpeg` (`ffmpeg.exe` on Windows), the repo copy in dev, system
  locations (`/usr/bin`, `/usr/local/bin`, `/opt/homebrew/bin`), and finally
  whatever the OS PATH resolves. When ffmpeg is missing the UI labels and
  disables merge/audio presets instead of failing mid-download.
- Recent yt-dlp needs a **JavaScript runtime** to evaluate YouTube's
  anti-bot challenges. A per-platform Deno binary (yt-dlp's default runtime,
  MIT-licensed) is bundled into every installer; as fallback Meowdler also
  autodetects Node across version managers (nvm, nvm-windows), Homebrew, and
  system paths, and passes the first hit as `--js-runtimes <deno|node>:<path>`
  — no environment tweaks needed. Settings → Engine shows which runtime is
  live.

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
resources/yt-dlp            bundled engine binary (replaced per-OS by CI)
resources/ffmpeg / deno     staged by CI: stream merging + JS runtime
build/icon.*                generated app icons (png / icns / ico)
scripts/                    make-icons.py · make-banner.py · fetch-ffmpeg.sh
src/
  main/                     Electron main process (Node side)
    index.ts                window creation + app lifecycle
    ipc.ts                  typed IPC handler registration
    downloads.ts            DownloadManager: worker pool, lifecycle, ledger
    ytdlp.ts                engine resolution · probing · spawn · runtime detect
    engine-updater.ts       in-app yt-dlp updater (checksum-verified swap)
    progress.ts             pure yt-dlp --newline line parsers
    history.ts              finished-downloads persistence (atomic writes)
    settings.ts             settings.json load/save (userData)
    updater.ts              app self-update flow (electron-updater)
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
  self-update works for AppImage and Windows NSIS, with the downloadable
  SHA-512-verified by electron-updater on the way in (NSIS runs no signature
  check while the installer is unsigned). deb installs and macOS open the
  releases page instead — deb is a deliberate policy (electron-updater's
  DebUpdater would shell out to dpkg/apt with a sudo prompt), and macOS is a
  mechanical limit: Squirrel.Mac, the updater behind electron-updater there,
  requires signed builds.
- **Engine updates** — the bundled yt-dlp binary can be refreshed from
  official [yt-dlp releases](https://github.com/yt-dlp/yt-dlp/releases)
  (Settings → Engine → _Check engine updates_), verified against the
  release's SHA2-256SUMS before an atomic swap into your profile folder.
  The swap is skipped while any download is running. Update checks contact
  api.github.com / release-asset storage on GitHub only — nothing else, no
  telemetry.
- **Linux sandboxing** — the deb keeps the Chromium sandbox (SUID-helper
  postinst + AppArmor profile); AppImage and unpacked builds fall back to an
  unsandboxed launch so they never abort the zygote.
- App icons regenerate with `python3 scripts/make-icons.py`, the README banner
  with `python3 scripts/make-banner.py` (PIL only).

## ⚖️ Legal, licensing & attribution

Meowdler's own code is MIT-licensed ([LICENSE](LICENSE)), and so is the
Electron bundling. It ships third-party binaries inside every installer:

| Bundled component            | License                                         | Upstream                                                                                                                                                                                                                                                                |
| ---------------------------- | ----------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `yt-dlp` (engine)            | Unlicense                                       | [github.com/yt-dlp/yt-dlp](https://github.com/yt-dlp/yt-dlp)                                                                                                                                                                                                            |
| Deno (JS runtime for yt-dlp) | MIT                                             | [github.com/denoland/deno](https://github.com/denoland/deno)                                                                                                                                                                                                            |
| ffmpeg (bundled builds)      | LGPL-3.0 (Linux) · **GPL-3.0** (macOS, Windows) | [ffmpeg.org](https://www.ffmpeg.org) · Linux builds from [BtbN/FFmpeg-Builds](https://github.com/BtbN/FFmpeg-Builds) · macOS builds from [ffmpeg.martin-riedl.de](https://ffmpeg.martin-riedl.de) · Windows builds from [gyan.dev](https://www.gyan.dev/ffmpeg/builds/) |
| Chromium / Electron          | MIT (+Chromium licenses)                        | [electronjs.org](https://www.electronjs.org)                                                                                                                                                                                                                            |

Exact versions, license texts, and corresponding-source offers for every
bundled binary are tracked in
[THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) — the full texts ship **inside
every installer** under `third-party/`. Should you re-distribute Meowdler,
keep that file and the `LICENSES/` folder intact.

**What Meowdler is not:** it is not affiliated with, endorsed by, or connected
to YouTube, X (Twitter), Instagram/Meta, or any platform it can download from.
Downloading content from these platforms is governed by **their terms of
service** — use Meowdler only for content you have the right to save (your own
uploads, Creative-Commons/public-domain material, or content the platform
allows saving). Respect rate limits; mass/scraping use is on you.

Cookies handed to the engine stay on your machine, and Meowdler keeps them
there — but they are **your login credentials**: never use cookie files from
another machine or person.

## 📜 License

MIT · Made with 🩷 by [MB-PieSec](https://github.com/MB-PieSec)
