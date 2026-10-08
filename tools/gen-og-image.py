#!/usr/bin/env python3
"""Generate the Open Graph share cards used by the 1999.fan docs site.

Every page falls back to one of these two images when it has no cover of its
own, which is what makes links posted to QQ groups, Bilibili or Discord render
a preview at all.

The fonts are Windows-specific (Microsoft YaHei) because that is where the
cards were generated; rerun this script on another platform after pointing
FONT_REGULAR / FONT_BOLD at a font that covers the glyphs you need.

Usage: python tools/gen-og-image.py
"""

from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent.parent
LOGO = ROOT / "docs/.vuepress/public/images/m9a-logo_512x512.png"
IMAGES = ROOT / "docs/.vuepress/public/images"

FONT_REGULAR = "C:/Windows/Fonts/msyh.ttc"
FONT_BOLD = "C:/Windows/Fonts/msyhbd.ttc"

WIDTH, HEIGHT = 1200, 630
BACKGROUND = (244, 237, 221)
PANEL = (255, 255, 255)
PANEL_BORDER = (227, 217, 196)
INK = (34, 48, 63)
MUTED = (108, 122, 136)
ACCENT = (77, 127, 168)

# Left column stops here so the text never runs under the logo card.
TEXT_WIDTH = 570

CARDS = [
    ("og-zh.png", "《重返未来：1999》自动化小助手", "官方文档 · 1999.fan"),
    ("og-en.png", "Automation assistant for Reverse: 1999", "Documentation · 1999.fan"),
]


def fit(draw, text, path, start, minimum=22):
    """Largest font size at or below `start` that keeps `text` inside TEXT_WIDTH."""
    size = start
    while size > minimum:
        font = ImageFont.truetype(path, size)
        if draw.textlength(text, font=font) <= TEXT_WIDTH:
            return font
        size -= 2
    return ImageFont.truetype(path, minimum)


def build(filename, tagline, footer):
    canvas = Image.new("RGB", (WIDTH, HEIGHT), BACKGROUND)
    draw = ImageDraw.Draw(canvas)

    # The logo sits in a white card so the character's cream robe keeps its edge
    # against the cream background.
    draw.rounded_rectangle((720, 105, 1140, 525), radius=36, fill=PANEL, outline=PANEL_BORDER, width=3)

    with Image.open(LOGO) as logo:
        size = 340
        art = logo.convert("RGBA").resize((size, size), Image.LANCZOS)

    canvas.paste(art, (930 - size // 2, 315 - size // 2), art)

    draw.text((90, 140), "M9A", font=ImageFont.truetype(FONT_BOLD, 132), fill=INK)
    draw.rounded_rectangle((92, 310, 92 + 132, 318), radius=4, fill=ACCENT)
    draw.text((90, 360), tagline, font=fit(draw, tagline, FONT_REGULAR, 38), fill=INK)
    draw.text((90, 470), footer, font=fit(draw, footer, FONT_REGULAR, 30), fill=MUTED)

    canvas.save(IMAGES / filename, optimize=True)
    print(f"wrote {filename}")


if __name__ == "__main__":
    IMAGES.mkdir(parents=True, exist_ok=True)
    for card in CARDS:
        build(*card)
