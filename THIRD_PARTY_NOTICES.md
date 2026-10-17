# Third-party notices

Meowdler (`Meowdler` by MB-PieSec, MIT-licensed — see
[LICENSE](LICENSE)) bundles the following third-party binaries and documents in
every installer. Versions listed below are the pinned versions staged by CI
(`.github/workflows/release.yml`), which also verifies every download against
its vendor-published checksums. This file and the complete license texts in
[`LICENSES/`](LICENSES) ship inside every Meowdler installer under
`third-party/` (inside installers, the license texts live at
`third-party/licenses/` instead of `LICENSES/`).

## yt-dlp — 2026.08.19

- **What it is:** the download engine (a single Python/ZPack binary).
- **License:** Unlicense (public domain) — [`LICENSES/yt-dlp-LICENSE`](LICENSES/yt-dlp-LICENSE).
- **Third-party code inside it:** pyinstaller-bundled Python libraries; yt-dlp
  publishes the complete license text of each at
  [`LICENSES/yt-dlp-THIRD_PARTY_LICENSES.txt`](LICENSES/yt-dlp-THIRD_PARTY_LICENSES.txt)
  (shipped unmodified from the same release).
- **Exact source:** https://github.com/yt-dlp/yt-dlp/tree/2026.08.19 (the tag the
  shipped binary was built from).

## Deno — 2.9.7

- **What it is:** the JavaScript runtime yt-dlp uses to evaluate YouTube's
  anti-bot challenges (`--js-runtimes deno:<path>`).
- **License:** MIT — [`LICENSES/deno-LICENSE.md`](LICENSES/deno-LICENSE.md).
- **Third-party code inside it:** licensed upstream and documented by the Deno
  project: https://deno.com (see the deno repository `LICENSE.md` and docs for
  crate-level licensing).
- **Exact source:** https://github.com/denoland/deno/tree/v2.9.7.

## ffmpeg — Linux build (static, LGPL-3.0)

- **What it is:** stream merging + MP3/M4A extraction, shipped as
  `resources/ffmpeg`.
- **Build:** [BtbN/FFmpeg-Builds](https://github.com/BtbN/FFmpeg-Builds),
  auto-build `autobuild-2026-10-16-13-04`, asset
  `ffmpeg-N-127579-g5cb9fcd211-linux64-lgpl.tar.xz`, from FFmpeg source commit
  `5cb9fcd21167cf2f5a2852ea582997bbd0055521` ("avformat/mxfenc: Reject D-10
  audio with more than 8 channels") and the BtbN build scripts as of commit
  `63ac3265b078`.
- **License:** LGPL-3.0 (`--enable-version3`, no GPL-only encoders included).
  The verbatim license text from the archive ships as
  [`LICENSES/ffmpeg-linux-BtbN-LICENSE.txt`](LICENSES/ffmpeg-linux-BtbN-LICENSE.txt).
- **Corresponding source offer:**
  - FFmpeg source for the shipped build:
    https://github.com/FFmpeg/FFmpeg/commit/5cb9fcd21167cf2f5a2852ea582997bbd0055521
  - Build configuration/scripts:
    https://github.com/BtbN/FFmpeg-Builds/tree/63ac3265b078 (`buildffmpeg.sh` +
    variant configs)
- **Why LGPL here:** Meowdler only chains this binary (merges downloaded
  streams, extracts audio into MP3/M4A); the lgpl build still provides
  `libmp3lame` and the native `aac` encoder for that, without the GPL-only
  x264/x265 encoders that only passthrough-free re-encoding would need.

## ffmpeg — macOS (arm64) build (static, GPL-3.0)

- **What it is:** same role as above, shipped as `Contents/Resources/ffmpeg`
  inside the .app.
- **Build:** pinned release from
  [ffmpeg.martin-riedl.de](https://ffmpeg.martin-riedl.de) — build `9.0.2`
  (slot `1789931890_9.0.2`, the URL CI downloads from), code-signed by its
  author, built with `--enable-gpl --enable-version3` (confirmed from the
  binary's embedded configure string) and enabling x264/x265/rav1e encoders.
- **License:** GPL-3.0 — official text from the FFmpeg 9.0 release branch ships
  as [`LICENSES/ffmpeg-macos-LICENSE.txt`](LICENSES/ffmpeg-macos-LICENSE.txt).
- **Corresponding source offer:**
  - FFmpeg 9.0.2 source (what the build is from):
    https://github.com/FFmpeg/FFmpeg/tree/n9.0.2 (also
    https://ffmpeg.org/releases/ffmpeg-9.0.2.tar.gz)
  - Build configuration/scripts: the author publishes them open source at
    https://git.martin-riedl.de/ffmpeg/build-script

## ffmpeg — Windows build (static, GPL-3.0)

- **What it is:** same role as above, shipped as `resources/ffmpeg.exe`.
- **Build:** [gyan.dev](https://www.gyan.dev/ffmpeg/builds/) essentials build
  `ffmpeg-9.0.2-essentials_build` (the release-essentials download CI pins via
  their published `.sha256`).
- **License:** GPL-3.0 — the build's own license text (shipped byte-for-byte)
  is at
  [`LICENSES/ffmpeg-windows-gyan-LICENSE.txt`](LICENSES/ffmpeg-windows-gyan-LICENSE.txt).
- **Corresponding source offer:** gyan's README names the exact commit this
  build was produced from:
  https://github.com/FFmpeg/FFmpeg/commit/946fcce07b6dcd0331c8cc609192aeff5e1924f8
  ("Update for 9.0.2").

## Electron / Chromium

- **What it is:** the app platform (windowing, renderer, engine) Meowdler runs
  on.
- **License:** Electron is MIT (`Copyright (c) Electron contributors`), and its
  Chromium engine carries its own multi-license collection.
- **Texts:** electron-builder ships Electron's own files
  (`LICENSE.electron.txt` and the full `LICENSES.chromium.html`) — verified in
  the unpacked Linux build (macOS bundle check pending a real mac); our copy
  for bare checkouts is
  [`LICENSES/electron-LICENSE.txt`](LICENSES/electron-LICENSE.txt), the full
  Chromium compendium is at https://source.chromium.org or in any Electron
  release (electron/electron releases publish it as
  `LICENSES.chromium.html`).

## Why this file exists

Shipping and reinstalling GPL-3.0 and LGPL-3.0 binaries requires providing the
license text and a corresponding-source offer with the distribution. Doing it
inside the installers (not just in this repository) is what makes Meowdler's
redistribution compliant. If you redistribute Meowdler, keep this file and the
`LICENSES/` folder intact.
