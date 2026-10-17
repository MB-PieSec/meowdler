# Changelog

## 0.2.8 (2026-10-17)

Board hardening pass: every external claim re-verified against actual code, CI,
and released artifacts; problems found were fixed before this item list.

- **ffmpeg actually bundled, pinned + checksum-verified** — Linux AppImage/deb
  and macOS installers previously shipped whatever ffmpeg sat next to the build
  (a distro Linux build missing libraries on user machines; a Homebrew-linked
  macOS copy). Every installer now carries a static build matched to its OS,
  downloaded from pinned URLs with vendor-published checksums (BtbN LGPL on
  Linux, martin-riedl Apple-Silicon on macOS, gyan essentials on Windows),
  plus a static-linking check and smoke tests in CI.
- **License texts ship in the installers** — `THIRD_PARTY_NOTICES.md` with
  pinned versions and corresponding-source offers, plus full license texts
  under `third-party/` in every package.
- **Cookies accuracy** — LibreWolf removed from the browser list (the engine
  never supported it); stale/unsupported browser values migrate to off-mode;
  browser-mode cards with no browser fail loud; engine hints now classify
  Windows Chromium decryption failures (DPAPI / App-Bound), Safari outside
  macOS, and permission-blocked reads (macOS: Full Disk Access guidance).
- **Updater honesty** — macOS no longer offers in-place updates while builds
  are unsigned (electron-updater hands off to Squirrel.Mac, which requires
  signed apps); macOS users get the releases page like deb installs. The
  README now documents exactly which formats self-update and why.
- **Hardening** — `settings.json` writes became atomic (crash-safe, matching
  the history ledger); the engine-updater helpers gained unit tests.
- **Tests** — 61 → 75 unit tests.

## 0.2.7

Fixes and hardening release.

- **Fixed: blank/transparent window on Linux AppImage and unpacked builds** —
  the renderer sandbox is now disabled only on those layouts (like 0.2.6);
  the deb (SUID helper), Windows, and macOS keep the fully sandboxed renderer.
- **Fixed: empty window in all packaged builds** — the sandboxed preload is
  emitted as a real `.cjs` entry, so the `"type": "module"` package definition
  no longer breaks it in packaged installs (dev mode was unaffected).
- **Self-contained engine stack** — a per-platform Deno binary (yt-dlp's
  JavaScript runtime) ships in every installer, with autodetected Node as
  fallback for X.com posts.
- **Cookies hardening** — app-level cookie file validation, locked-store /
  not-installed error messages, and per-item cookie checks at download time.
- **In-app engine updates** — Settings → Engine can refresh yt-dlp, verified
  against the release's `SHA2-256SUMS`, with an atomic swap.
- **Tests** — 61 unit tests (progress parsing, argument construction, spawn
  safety gating, settings/history validators) run via `npm test`.

For earlier releases, see the Git tags.
