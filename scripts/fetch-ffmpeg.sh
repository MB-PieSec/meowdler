#!/usr/bin/env bash
# Dev-only helper: stages your system ffmpeg beside the bundled yt-dlp for
# local development (`npm run dist` on this machine). Release CI does NOT use
# this — it downloads statically linked builds (BtbN LGPL on Linux, static
# martin-riedl.de Apple Silicon macOS build, gyan.dev essentials on Windows)
# pinned and checksum-verified, because a distro ffmpeg is dynamically linked
# and would not run on a user's machine — it can even shadow a working
# system ffmpeg, since the app only checks for the file's existence.
set -euo pipefail
cd "$(dirname "$0")/.."

source=""
for candidate in /usr/bin/ffmpeg /usr/local/bin/ffmpeg "$(command -v ffmpeg || true)"; do
  if [ -n "$candidate" ] && [ -x "$candidate" ]; then
    source="$candidate"
    break
  fi
done

if [ -z "$source" ]; then
  echo "No ffmpeg found on this system — leaving resources/ffmpeg absent." >&2
  exit 0
fi

cp -f "$source" resources/ffmpeg
echo "Staged $(ffmpeg -version 2>/dev/null | head -n1 | cut -d' ' -f1-3) -> resources/ffmpeg"
