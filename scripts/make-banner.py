"""Generates docs/banner.png — the README hero, Catppuccin Mocha."""

from PIL import Image, ImageDraw, ImageFilter, ImageFont

W, H = 1400, 380
BG, SURF = "#1e1e2e", "#181825"
MAUVE, PINK, SAPPHIRE = "#cba6f7", "#f5c2e7", "#74c7ec"
TEXT, SUB, BORDER = "#cdd6f4", "#a6adc8", "#313244"

BOLD = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"
REG = "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"


def paw(draw: ImageDraw.ImageDraw, cx: float, cy: float, r: float, color: str) -> None:
    """One stylized paw: main pad plus three toe beans."""
    draw.ellipse((cx - r, cy - r * 0.85, cx + r, cy + r * 1.15), fill=color)
    for tx, ty in ((-1.05, -1.25), (0.0, -1.45), (1.05, -1.25)):
        tr = r * 0.34
        draw.ellipse(
            (cx + tx * r - tr, cy + ty * r - tr, cx + tx * r + tr, cy + ty * r + tr),
            fill=color,
        )


img = Image.new("RGB", (W, H), BG)
glow = Image.new("RGB", (W, H), BG)
gd = ImageDraw.Draw(glow)
gd.ellipse((140, -170, 900, 470), fill="#3b2f52")
gd.ellipse((780, 30, 1200, 340), fill="#2b3a52")
img = Image.blend(img, glow.filter(ImageFilter.GaussianBlur(110)), 0.5)
d = ImageDraw.Draw(img)
d.rounded_rectangle((56, 44, W - 56, H - 44), 28, fill=SURF, outline=BORDER, width=2)

bold90 = ImageFont.truetype(BOLD, 92)
reg30 = ImageFont.truetype(REG, 30)
reg32 = ImageFont.truetype(REG, 32)

title = "Meowdler"
icon_x = 190
tw = d.textlength(title, font=bold90)
tx = icon_x + 130 + (W - icon_x - 130 - tw - 160) / 2
d.text((tx, 118), title, font=bold90, fill=TEXT)
d.text((tx + 6, 224), "YouTube · X · Instagram", font=reg32, fill=PINK)
d.text(
    ((W - d.textlength("purr-fectly themed downloads", font=reg30)) / 2, 292),
    "purr-fectly themed downloads",
    font=reg30,
    fill=SUB,
)

# Big app-logo paw in mauve behind a rounded software paw-print box
d.rounded_rectangle((150, 130, 306, 286), 40, fill=MAUVE)
paw(d, 228, 214, 34, SURF)

# Scattered small paw prints walking across the card
for cx, cy, r, col in (
    (360, 84, 12, SAPPHIRE),
    (1240, 318, 12, MAUVE),
    (1330, 120, 10, PINK),
    (1180, 66, 8, SAPPHIRE),
    (90, 330, 10, PINK),
):
    layer = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    paw(ImageDraw.Draw(layer), cx, cy, r, col)
    img = Image.alpha_composite(img.convert("RGBA"), layer).convert("RGB")

img.save("docs/banner.png")
print("docs/banner.png written", img.size)
