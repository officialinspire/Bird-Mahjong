#!/usr/bin/env python3
"""Sanity-check the crops produced by tools/crop_tiles.py.

Checks, per tile:
  * the file exists and matches the box size recorded in data/crops.json
  * the 1px ring just outside the box in the source JPG is dark background
    (i.e. the crop did not clip the tile), where the ring is inside the image
  * the crop's own outer edge is mostly background (no neighbour bleeding in)
  * alpha is transparent at the rounded corners and opaque at the centre
And globally: 20 unique ids matching data/tiles.json, no overlapping boxes.

Usage:  python3 tools/verify_crops.py   (exit code 1 on failure)
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
TILE_THRESHOLD = 90


def main() -> int:
    crops = json.loads((ROOT / "data" / "crops.json").read_text())["tiles"]
    names = json.loads((ROOT / "data" / "tiles.json").read_text())["tiles"]
    src = np.asarray(Image.open(ROOT / "bird-mahjong-tiles.jpg").convert("RGB"))
    bright = src.max(2) > TILE_THRESHOLD
    H, W = bright.shape
    errors: list[str] = []

    if len(crops) != 20 or len({c["id"] for c in crops}) != 20:
        errors.append("expected 20 unique tiles")
    if {c["id"] for c in crops} != {n["id"] for n in names}:
        errors.append("crops.json ids do not match tiles.json ids")

    for c in crops:
        b = c["box"]
        x0, y0, x1, y1 = b["x"], b["y"], b["x"] + b["width"], b["y"] + b["height"]
        label = f"{c['index']:02d} {c['id']}"
        path = ROOT / c["file"]
        if not path.exists():
            errors.append(f"{label}: missing {c['file']}")
            continue
        img = Image.open(path)
        if img.size != (b["width"], b["height"]) or img.mode != "RGBA":
            errors.append(f"{label}: size/mode {img.size} {img.mode} != box")

        # Ring just outside the crop must not contain tile pixels.
        ring = []
        if y0 > 0: ring.append(bright[y0 - 1, x0:x1])
        if y1 < H: ring.append(bright[y1, x0:x1])
        if x0 > 0: ring.append(bright[y0:y1, x0 - 1])
        if x1 < W: ring.append(bright[y0:y1, x1])
        outside = sum(int(r.sum()) for r in ring)
        if outside > 3:
            errors.append(f"{label}: {outside} tile pixels just outside box (clipped?)")

        # Crop edge should be mostly background: tile sits inside with padding.
        edge = np.concatenate([bright[y0, x0:x1], bright[y1 - 1, x0:x1],
                               bright[y0:y1, x0], bright[y0:y1, x1 - 1]])
        if edge.mean() > 0.15:
            errors.append(f"{label}: crop edge {edge.mean():.0%} bright (too tight or bleeding)")

        a = np.asarray(img)[:, :, 3]
        h, w = a.shape
        if a[0, 0] > 32 or a[0, -1] > 32 or a[-1, 0] > 32 or a[-1, -1] > 32:
            errors.append(f"{label}: corners not transparent")
        if a[h // 4: 3 * h // 4, w // 4: 3 * w // 4].min() < 255:
            errors.append(f"{label}: tile face has transparent holes")
        opaque = (a > 128).mean()
        if not 0.85 < opaque < 0.995:
            errors.append(f"{label}: opaque fraction {opaque:.3f} out of range")

    for i, p in enumerate(crops):
        for q in crops[i + 1:]:
            pb, qb = p["box"], q["box"]
            if (pb["x"] < qb["x"] + qb["width"] and qb["x"] < pb["x"] + pb["width"]
                    and pb["y"] < qb["y"] + qb["height"] and qb["y"] < pb["y"] + pb["height"]):
                errors.append(f"boxes overlap: {p['id']} / {q['id']}")

    for e in errors:
        print("FAIL", e)
    if not errors:
        print(f"OK: {len(crops)} tiles verified")
    return 1 if errors else 0


if __name__ == "__main__":
    sys.exit(main())
