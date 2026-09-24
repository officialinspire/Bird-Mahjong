#!/usr/bin/env python3
"""Crop the 5x4 bird tile sheet into individual tile assets.

The tiles in bird-mahjong-tiles.jpg are hand-placed: rows and columns drift by
several pixels and every tile has a slightly different size, so equal-sized
grid crops would clip some tiles and include neighbours in others. Instead this
script measures the actual boundaries:

1. Threshold the sheet: tile faces/rims are bright, the background is near-black
   (with a faint glow that stays below the threshold).
2. Project the mask onto each axis and find the dark gutters between the
   4 rows (globally) and then between the 5 columns *within each row band*.
3. Inside each coarse cell, find the tight bounding box of the tile, ignoring
   stray bright specks by requiring a minimum run coverage.
4. Build an alpha channel by flood-filling the dark background inward from the
   crop edges, so the rounded tile corners come out transparent.

Outputs (all regenerated on every run; the source JPG is only read):
  assets/tiles/NN-<id>.png   one RGBA PNG per tile (NN = 01..20, row-major)
  assets/tiles-sm/NN-<id>.webp  small (120px wide) copies for decoration/UI
  assets/tiles-md/NN-<id>.webp  full-resolution WebP copies for the zoomed board
  assets/contact-sheet.png   labelled overview of every crop
  data/crops.json            measured crop boxes, for auditing/regression

Usage:  python3 tools/crop_tiles.py        (from the repo root)
Requires: Pillow >= 10.1, numpy  (see tools/requirements.txt)
"""

from __future__ import annotations

import json
from collections import deque
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = Path(__file__).resolve().parent.parent
SOURCE = ROOT / "bird-mahjong-tiles.jpg"
MAPPING = ROOT / "data" / "tiles.json"
TILE_DIR = ROOT / "assets" / "tiles"
SMALL_DIR = ROOT / "assets" / "tiles-sm"
SMALL_WIDTH = 120
MEDIUM_DIR = ROOT / "assets" / "tiles-md"
CONTACT_SHEET = ROOT / "assets" / "contact-sheet.png"
CROPS_JSON = ROOT / "data" / "crops.json"

ROWS, COLS = 4, 5
TILE_THRESHOLD = 90      # max(R,G,B) above this counts as tile (glow peaks ~86)
BG_THRESHOLD = 45        # flood fill treats max(R,G,B) <= this as background
MIN_COVERAGE = 0.25      # fraction of a line that must be tile to count
PAD = 2                  # px of breathing room around each tight box
LOOKAHEAD = 3            # lines to look past a faint seam when growing a box


def runs(profile: np.ndarray, min_value: float) -> list[tuple[int, int]]:
    """Return [start, end) spans where profile >= min_value."""
    on = profile >= min_value
    spans, start = [], None
    for i, v in enumerate(on):
        if v and start is None:
            start = i
        elif not v and start is not None:
            spans.append((start, i))
            start = None
    if start is not None:
        spans.append((start, len(on)))
    return spans


def split_bands(profile: np.ndarray, count: int, length: int) -> list[tuple[int, int]]:
    """Find `count` bands of tiles, splitting at the middle of each gutter."""
    spans = runs(profile, MIN_COVERAGE * length)
    # Merge fragments separated by tiny gaps (e.g. dark artwork inside a tile).
    merged: list[list[int]] = []
    for s, e in spans:
        if merged and s - merged[-1][1] < 3:
            merged[-1][1] = e
        else:
            merged.append([s, e])
    merged = [m for m in merged if m[1] - m[0] > 50]
    if len(merged) != count:
        raise SystemExit(f"expected {count} bands, found {len(merged)}: {merged}")
    bounds = []
    for i, (s, e) in enumerate(merged):
        lo = 0 if i == 0 else (merged[i - 1][1] + s) // 2
        hi = len(profile) if i == count - 1 else (e + merged[i + 1][0]) // 2
        bounds.append((lo, hi))
    return bounds


def tight_box(mask: np.ndarray) -> tuple[int, int, int, int]:
    """Tight (left, top, right, bottom) of the tile inside a cell mask."""
    h, w = mask.shape
    rows = runs(mask.sum(1).astype(float), MIN_COVERAGE * w)
    cols = runs(mask.sum(0).astype(float), MIN_COVERAGE * h)
    # The tile is the longest bright run on each axis.
    top, bottom = max(rows, key=lambda r: r[1] - r[0])
    left, right = max(cols, key=lambda c: c[1] - c[0])
    # Rounded corners and the soft bottom rim fall below MIN_COVERAGE; extend
    # outward while tile pixels remain within the next LOOKAHEAD lines (so a
    # 1-2px faint seam in the rim doesn't stop the expansion early).
    def more(lines) -> bool:
        return any(line.any() for line in lines)

    while top > 0 and more(mask[max(top - LOOKAHEAD, 0):top, left:right]):
        top -= 1
    while bottom < h and more(mask[bottom:bottom + LOOKAHEAD, left:right]):
        bottom += 1
    while left > 0 and more(mask[top:bottom, max(left - LOOKAHEAD, 0):left].T):
        left -= 1
    while right < w and more(mask[top:bottom, right:right + LOOKAHEAD].T):
        right += 1
    return left, top, right, bottom


def background_alpha(rgb: np.ndarray) -> np.ndarray:
    """Alpha mask: 0 where dark background is reachable from the crop border."""
    h, w, _ = rgb.shape
    dark = rgb.max(2) <= BG_THRESHOLD
    seen = np.zeros((h, w), bool)
    q: deque[tuple[int, int]] = deque()
    for x in range(w):
        for y in (0, h - 1):
            if dark[y, x] and not seen[y, x]:
                seen[y, x] = True
                q.append((y, x))
    for y in range(h):
        for x in (0, w - 1):
            if dark[y, x] and not seen[y, x]:
                seen[y, x] = True
                q.append((y, x))
    while q:
        y, x = q.popleft()
        for ny, nx in ((y - 1, x), (y + 1, x), (y, x - 1), (y, x + 1)):
            if 0 <= ny < h and 0 <= nx < w and dark[ny, nx] and not seen[ny, nx]:
                seen[ny, nx] = True
                q.append((ny, nx))
    alpha = np.where(seen, 0, 255).astype(np.uint8)
    # Soften the 1px edge so the rounded corners aren't jagged.
    img = Image.fromarray(alpha)
    return np.asarray(img.filter(ImageFilter.GaussianBlur(0.6)))


def font(size: int) -> ImageFont.ImageFont:
    return ImageFont.load_default(size=size)


def main() -> None:
    sheet = Image.open(SOURCE).convert("RGB")
    pixels = np.asarray(sheet)
    mask = pixels.max(2) > TILE_THRESHOLD
    H, W = mask.shape

    tiles = json.loads(MAPPING.read_text())["tiles"]
    by_pos = {(t["row"], t["col"]): t for t in tiles}
    if len(by_pos) != ROWS * COLS:
        raise SystemExit("data/tiles.json must map every row/col exactly once")

    for directory, pattern in ((TILE_DIR, "*.png"), (SMALL_DIR, "*.webp"), (MEDIUM_DIR, "*.webp")):
        directory.mkdir(parents=True, exist_ok=True)
        for old in directory.glob(pattern):
            old.unlink()

    boxes = []
    row_bands = split_bands(mask.sum(1).astype(float), ROWS, W)
    for r, (y0, y1) in enumerate(row_bands, start=1):
        band = mask[y0:y1]
        col_bands = split_bands(band.sum(0).astype(float), COLS, y1 - y0)
        for c, (x0, x1) in enumerate(col_bands, start=1):
            l, t, rt, b = tight_box(mask[y0:y1, x0:x1])
            box = (
                max(x0 + l - PAD, 0),
                max(y0 + t - PAD, 0),
                min(x0 + rt + PAD, W),
                min(y0 + b + PAD, H),
            )
            info = by_pos[(r, c)]
            index = (r - 1) * COLS + c
            crop = pixels[box[1]:box[3], box[0]:box[2]]
            rgba = np.dstack([crop, background_alpha(crop)])
            filename = f"{index:02d}-{info['id']}.png"
            tile = Image.fromarray(rgba, "RGBA")
            tile.save(TILE_DIR / filename, optimize=True)
            small_name = filename.replace(".png", ".webp")
            small_h = round(tile.height * SMALL_WIDTH / tile.width)
            small = tile.resize((SMALL_WIDTH, small_h), Image.LANCZOS)
            small.save(SMALL_DIR / small_name, "WEBP", quality=82, method=6)
            tile.save(MEDIUM_DIR / small_name, "WEBP", quality=82, method=6)
            boxes.append({
                "index": index, "id": info["id"], "name": info["name"],
                "row": r, "col": c, "file": f"assets/tiles/{filename}",
                "small": f"assets/tiles-sm/{small_name}",
                "medium": f"assets/tiles-md/{small_name}",
                "box": {"x": box[0], "y": box[1],
                        "width": box[2] - box[0], "height": box[3] - box[1]},
            })

    CROPS_JSON.write_text(json.dumps({"source": SOURCE.name, "tiles": boxes}, indent=2) + "\n")
    build_contact_sheet(boxes)

    widths = [b["box"]["width"] for b in boxes]
    heights = [b["box"]["height"] for b in boxes]
    print(f"cropped {len(boxes)} tiles; width {min(widths)}-{max(widths)}px, "
          f"height {min(heights)}-{max(heights)}px")


def build_contact_sheet(boxes: list[dict]) -> None:
    cell_w, cell_h, label_h, gap = 240, 280, 46, 16
    width = COLS * cell_w + (COLS + 1) * gap
    height = ROWS * (cell_h + label_h) + (ROWS + 1) * gap
    out = Image.new("RGB", (width, height), (32, 30, 28))
    draw = ImageDraw.Draw(out)
    f_name, f_meta = font(16), font(12)
    for b in boxes:
        tile = Image.open(ROOT / b["file"])
        tile.thumbnail((cell_w, cell_h))
        cx = gap + (b["col"] - 1) * (cell_w + gap)
        cy = gap + (b["row"] - 1) * (cell_h + label_h + gap)
        out.paste(tile, (cx + (cell_w - tile.width) // 2, cy + (cell_h - tile.height) // 2), tile)
        draw.text((cx + cell_w / 2, cy + cell_h + 4), f"{b['index']:02d}  {b['name']}",
                  font=f_name, fill=(245, 235, 210), anchor="ma")
        draw.text((cx + cell_w / 2, cy + cell_h + 26),
                  f"{b['id']}  r{b['row']}c{b['col']}  {b['box']['width']}x{b['box']['height']}",
                  font=f_meta, fill=(170, 160, 140), anchor="ma")
    out.save(CONTACT_SHEET, optimize=True)


if __name__ == "__main__":
    main()
