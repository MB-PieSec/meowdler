#!/usr/bin/env python3
"""Generates Meowdler's app icons: a mauve tile with a dark cat silhouette.

Outputs:
  build/icon.png    512x512 PNG (Linux / general)
  build/icon.icns   macOS bundle (128/256/512 PNG entries)
  build/icon.ico    Windows bundle (16..256)
Pure PIL — no system rasterizer needed. Deterministic output.
"""

from pathlib import Path
import math
import struct

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
BUILD = ROOT / "build"
BUILD.mkdir(exist_ok=True)

TILE = "#cba6f7"  # Catppuccin Mocha mauve (accent)
CAT = "#11111b"   # Catppuccin Mocha crust (silhouette)
EYE = "#a6e3a1"   # green (acplays against mauve)
NOSE = "#f5c2e7"  # pink

SIZE = 1024  # master; downscaled per target


def rounded(d: ImageDraw.ImageDraw, radius: int) -> None:
    d.rounded_rectangle((0, 0, SIZE, SIZE), radius=radius, fill=TILE)


def cat(d: ImageDraw.ImageDraw) -> None:
    cx, cy, r = SIZE // 2, int(SIZE * 0.58), int(SIZE * 0.30)

    # ears (triangles) slightly taller than the head circle
    for side in (-1, 1):
        ex = cx + side * int(r * 0.62)
        d.polygon(
            [
                (ex - side * int(r * 0.36), cy - int(r * 0.78)),
                (ex + side * int(r * 0.10), cy - int(r * 0.34)),
                (ex - side * int(r * 0.62), cy - int(r * 0.05)),
            ],
            fill=CAT,
        )

    # head
    d.ellipse((cx - r, cy - r, cx + r, cy + r), fill=CAT)

    # eyes
    for side in (-1, 1):
        ex, ey = cx + side * int(r * 0.42), cy - int(r * 0.12)
        er = int(r * 0.10)
        d.ellipse((ex - er, ey - er, ex + er, ey + er + er // 2), fill=EYE)

    # nose + whiskers
    nose_w, nose_h = int(r * 0.16), int(r * 0.11)
    ny = cy + int(r * 0.22)
    d.polygon(
        [
            (cx - nose_w // 2, ny),
            (cx + nose_w // 2, ny),
            (cx, ny + nose_h),
        ],
        fill=NOSE,
    )
    wlength = int(r * 0.52)
    for side in (-1, 1):
        for ang, lift in ((0.21, 0.05), (0.35, -0.02), (0.49, 0.09)):
            x0, y0 = cx + side * int(r * 0.22), cy + int(r * 0.30)
            x1 = cx + side * (int(r * 0.22) + int(wlength * math.cos(ang * 3)))
            y1 = y0 + int(wlength * math.sin(ang * 3) * 0.9) + int(r * lift)
            d.line((x0, y0, x1, y1), fill=NOSE, width=max(6, int(r * 0.03)))


def master() -> Image.Image:
    """Tile + silhouette clipped to the rounded rect."""
    tile = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    ImageDraw.Draw(tile).rounded_rectangle((0, 0, SIZE, SIZE), radius=SIZE // 5, fill=TILE)

    cat_layer = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    cat(ImageDraw.Draw(cat_layer))

    tile_mask = Image.new("L", (SIZE, SIZE), 0)
    ImageDraw.Draw(tile_mask).rounded_rectangle((0, 0, SIZE, SIZE), radius=SIZE // 5, fill=255)

    # Only the cat's own opaque pixels, also clipped to the rounded tile.
    from PIL import ImageChops

    cat_mask = ImageChops.multiply(cat_layer.split()[3], tile_mask)
    tile.paste(cat_layer, (0, 0), cat_mask)
    return tile


img = master()

# sanity: not empty
bbox = img.getbbox()
assert bbox, "icon master came out empty"

for px in (512, 256, 128):
    img.resize((px, px), Image.LANCZOS).save(BUILD / "icon.png" if px == 512 else BUILD / f"icon_{px}.png")

# windows ico with common sizes
ico_sizes = [(16, 16), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)]
imgs = [img.resize(s, Image.LANCZOS) for s in ico_sizes]
img.save(BUILD / "icon.ico", sizes=ico_sizes, append_images=imgs)


# macOS icns: container with PNG entries (ic07=128, ic08=256, ic09=512)
from io import BytesIO


def icns_entry(tag: bytes, png: bytes) -> bytes:
    return tag + struct.pack(">I", len(png) + 8) + png


data = b""
for tag, px in ((b"ic07", 128), (b"ic08", 256), (b"ic09", 512)):
    png = img.resize((px, px), Image.LANCZOS)
    buf = BytesIO()
    png.save(buf, format="PNG")
    data += icns_entry(tag, buf.getvalue())
HEADER = struct.pack(">4sI", b"icns", len(data) + 8)
(BUILD / "icon.icns").write_bytes(HEADER + data)

print("icons written:", *(p.name for p in sorted(BUILD.glob("icon*"))))
