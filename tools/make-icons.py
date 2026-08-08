#!/usr/bin/env python3
"""Render the PWA icon set from the self-hosted Anton webfont.

The icon is the same mark as the header wordmark and the favicon: the year
set in Anton on a solid signal-orange plate. Keeping it generated (rather
than hand-drawn) means it stays in sync if the signal colour ever moves.

    pip install pillow fonttools brotli
    python3 tools/make-icons.py

Writes icons/*.png. Only needs re-running when the mark or colours change.
"""

import io
from pathlib import Path

from fontTools.ttLib import TTFont
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "icons"
WOFF2 = ROOT / "fonts" / "anton-latin.woff2"

SIGNAL = (255, 77, 23)  # --signal
INK = (11, 11, 12)  # --signal-ink
TEXT = "26"

# (filename, size, share of the canvas the glyphs may occupy)
# Maskable icons must survive an aggressive circular crop, so their mark is
# kept inside the 80% safe zone the spec guarantees.
TARGETS = [
    ("icon-192.png", 192, 0.72),
    ("icon-512.png", 512, 0.72),
    ("icon-192-maskable.png", 192, 0.50),
    ("icon-512-maskable.png", 512, 0.50),
    ("apple-touch-icon.png", 180, 0.66),
]

SS = 4  # supersample factor — Anton has tight, flat-sided numerals


def load_ttf() -> io.BytesIO:
    """Pillow cannot read woff2, so unwrap it to a plain TTF in memory."""
    font = TTFont(WOFF2)
    font.flavor = None
    buf = io.BytesIO()
    font.save(buf)
    buf.seek(0)
    return buf


def fit_font(ttf: io.BytesIO, box: int) -> ImageFont.FreeTypeFont:
    """Largest Anton size whose "26" still fits `box` in both axes."""
    size = box
    while size > 4:
        ttf.seek(0)
        font = ImageFont.truetype(ttf, size)
        l, t, r, b = font.getbbox(TEXT)
        if r - l <= box and b - t <= box:
            return font
        size -= 2
    raise RuntimeError("could not fit the mark")


def render(path: Path, size: int, ratio: float, ttf: io.BytesIO) -> None:
    canvas = size * SS
    img = Image.new("RGB", (canvas, canvas), SIGNAL)
    draw = ImageDraw.Draw(img)

    font = fit_font(ttf, int(canvas * ratio))
    l, t, r, b = draw.textbbox((0, 0), TEXT, font=font)
    # Centre on the ink bounds, not the line box: Anton carries a lot of
    # leading above the digits and centring on that sits the mark too low.
    draw.text(((canvas - (r - l)) / 2 - l, (canvas - (b - t)) / 2 - t), TEXT, font=font, fill=INK)

    img.resize((size, size), Image.LANCZOS).save(path, optimize=True)
    print(f"wrote {path.relative_to(ROOT)} ({size}×{size})")


def main() -> None:
    OUT.mkdir(exist_ok=True)
    ttf = load_ttf()
    for name, size, ratio in TARGETS:
        render(OUT / name, size, ratio, ttf)


if __name__ == "__main__":
    main()
