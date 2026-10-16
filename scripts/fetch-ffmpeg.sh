#!/usr/bin/env bash
# Optional helper: stages a system ffmpeg beside the bundled yt-dlp so the
# packaged app is self-contained. Without it, Meowdler falls back to
# /usr/bin/ffmpeg. Muxing needs the binary only (GPL build is fine to copy).
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
