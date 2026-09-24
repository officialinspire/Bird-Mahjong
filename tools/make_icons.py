#!/usr/bin/env python3
"""Build the app icons from the cropped bird tiles (reproducible).

Three tiles (blue jay, cardinal, chickadee) are fanned like the start screen
on a warm ivory/sky background; the favicon uses the cardinal tile alone. Tiles are drawn at or below their source
resolution (~210x270), so nothing is upscaled.

Outputs (icons/):
  icon-192.png, icon-512.png   "any" purpose, rounded square
  icon-maskable-512.png        full-bleed, artwork inside the 80% safe zone
  apple-touch-icon.png         180x180, full-bleed (iOS rounds it itself)
  favicon-32.png               32x32

Usage:  python3 tools/make_icons.py
"""

from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
TILES = ROOT / "assets" / "tiles"
OUT = ROOT / "icons"

IVORY = (251, 246, 232)
SKY = (220, 236, 246)
LEAF_DARK = (43, 93, 37)
FAN = [("09-blue-jay", -12, -0.23), ("12-black-capped-chickadee", 12, 0.23), ("10-northern-cardinal", 0, 0.0)]


def background(size: int, rounded: bool) -> Image.Image:
    """Vertical sky -> ivory gradient; optionally a rounded square with a thin rim."""
    img = Image.new("RGBA", (size, size))
    draw = ImageDraw.Draw(img)
    for y in range(size):
        t = y / (size - 1)
        colour = tuple(round(SKY[i] * (1 - t) + IVORY[i] * t) for i in range(3))
        draw.line([(0, y), (size, y)], fill=colour + (255,))
    if not rounded:
        return img
    mask = Image.new("L", (size, size), 0)
    radius = round(size * 0.22)
    ImageDraw.Draw(mask).rounded_rectangle([0, 0, size - 1, size - 1], radius=radius, fill=255)
    img.putalpha(mask)
    ImageDraw.Draw(img).rounded_rectangle(
        [1, 1, size - 2, size - 2], radius=radius, outline=LEAF_DARK + (90,), width=max(1, size // 96)
    )
    return img


def fan(size: int, scale: float, tiles=FAN) -> Image.Image:
    """The tiles, fanned, sized so the fan's height is `scale` * size."""
    layer = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    tile_h = round(size * scale * 0.82)
    for name, angle, offset in tiles:
        tile = Image.open(TILES / f"{name}.png").convert("RGBA")
        w = round(tile.width * tile_h / tile.height)
        tile = tile.resize((w, tile_h), Image.LANCZOS)
        # Soft shadow under each tile.
        shadow = Image.new("RGBA", tile.size, (47, 42, 32, 0))
        shadow.putalpha(tile.getchannel("A").point(lambda a: a * 0.28))
        for im in (shadow, tile):
            rot = im.rotate(-angle, resample=Image.BICUBIC, expand=True)
            x = round(size / 2 + offset * size * scale - rot.width / 2)
            y = round(size / 2 - rot.height / 2 + (abs(angle) * size * 0.0025))
            if im is shadow:
                layer.alpha_composite(rot, (x + max(1, size // 90), y + max(1, size // 60)))
            else:
                layer.alpha_composite(rot, (x, y))
    return layer


def icon(size: int, *, rounded: bool, scale: float, single: bool = False) -> Image.Image:
    img = background(size, rounded)
    art = fan(size, scale, [("10-northern-cardinal", 0, 0.0)] if single else FAN)
    if rounded:
        # Keep the artwork inside the rounded square.
        art.putalpha(Image.composite(art.getchannel("A"), Image.new("L", art.size, 0), img.getchannel("A")))
    img.alpha_composite(art)
    return img


def main() -> None:
    OUT.mkdir(exist_ok=True)
    icon(512, rounded=True, scale=0.66).save(OUT / "icon-512.png", optimize=True)
    icon(512, rounded=True, scale=0.66).resize((192, 192), Image.LANCZOS).save(OUT / "icon-192.png", optimize=True)
    # Maskable: full bleed; the fan must sit inside the central 80% circle.
    icon(512, rounded=False, scale=0.56).save(OUT / "icon-maskable-512.png", optimize=True)
    icon(512, rounded=False, scale=0.7).resize((180, 180), Image.LANCZOS).convert("RGB").save(OUT / "apple-touch-icon.png", optimize=True)
    # At 32px a fan is mush: one cardinal tile reads best.
    icon(512, rounded=True, scale=1.05, single=True).resize((32, 32), Image.LANCZOS).save(OUT / "favicon-32.png", optimize=True)
    for p in sorted(OUT.glob("*.png")):
        print(p.relative_to(ROOT), Image.open(p).size)


if __name__ == "__main__":
    main()
