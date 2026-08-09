#!/usr/bin/env python3
"""Normalize chroma-key FlappyMike poses and build a Phaser JSON atlas.

Run with:
  uv run --with pillow python tools/build-flappymike-atlas.py
"""

from __future__ import annotations

import json
from pathlib import Path

from PIL import Image, ImageChops, ImageFilter


ROOT = Path(__file__).resolve().parents[1]
SOURCE_ROOT = ROOT / "assets/flappymike/player/source"
FRAME_ROOT = ROOT / "assets/flappymike/player/frames"
ATLAS_ROOT = ROOT / "public/assets/flappymike/player/atlas"
FRAME_SIZE = 128
CONTENT_SIZE = 112


FRAME_PLAN = [
    ("idle_0", "idle", 0, 0, 1.00),
    ("idle_1", "idle", 0, -2, 0.99),
    ("idle_2", "idle", 0, 1, 1.00),
    ("idle_3", "idle", 0, -1, 1.01),
    ("flap_0", "flap_high", 0, 0, 1.00),
    ("flap_1", "idle", 0, 0, 1.00),
    ("flap_2", "flap_down", 0, 0, 1.00),
    ("flap_3", "idle", 0, 0, 1.00),
    ("glide_0", "idle", 0, 0, 1.00),
    ("glide_1", "idle", 0, 1, 1.00),
    ("fall_0", "fall", 0, 0, 1.00),
    ("fall_1", "fall", 1, 1, 0.99),
    ("hit_0", "hit", 0, 0, 1.00),
    ("hit_1", "hit", 1, -1, 0.98),
    ("hit_2", "hit", -1, 1, 1.00),
    ("dead_0", "dead", 0, 0, 1.00),
    ("dead_1", "dead", 1, 1, 0.99),
]


def remove_green(image: Image.Image) -> Image.Image:
    rgba = image.convert("RGBA")
    pixels = rgba.load()
    width, height = rgba.size
    alpha = Image.new("L", rgba.size, 0)
    alpha_pixels = alpha.load()

    for y in range(height):
        for x in range(width):
            red, green, blue, _ = pixels[x, y]
            green_delta = green - max(red, blue)
            if green_delta >= 90 and green >= 150:
                value = 0
            elif green_delta >= 30 and green >= 100:
                value = int(255 * (90 - green_delta) / 60)
            else:
                value = 255
            alpha_pixels[x, y] = max(0, min(255, value))

            if value < 255:
                spill = max(0, green - max(red, blue))
                pixels[x, y] = (red, max(0, green - spill), blue, 255)

    alpha = alpha.filter(ImageFilter.GaussianBlur(0.35))
    rgba.putalpha(alpha)
    return rgba


def normalize(image: Image.Image, dx: int, dy: int, scale: float) -> Image.Image:
    alpha = image.getchannel("A")
    bbox = alpha.getbbox()
    if bbox is None:
        raise ValueError("Pose has no visible pixels")
    cropped = image.crop(bbox)
    ratio = min(CONTENT_SIZE / cropped.width, CONTENT_SIZE / cropped.height) * scale
    resized = cropped.resize(
        (max(1, round(cropped.width * ratio)), max(1, round(cropped.height * ratio))),
        Image.Resampling.LANCZOS,
    )
    frame = Image.new("RGBA", (FRAME_SIZE, FRAME_SIZE), (0, 0, 0, 0))
    x = (FRAME_SIZE - resized.width) // 2 + dx
    y = (FRAME_SIZE - resized.height) // 2 + dy
    frame.alpha_composite(resized, (x, y))
    return frame


def main() -> None:
    FRAME_ROOT.mkdir(parents=True, exist_ok=True)
    ATLAS_ROOT.mkdir(parents=True, exist_ok=True)
    sources: dict[str, Image.Image] = {}
    for source_name in {entry[1] for entry in FRAME_PLAN}:
        sources[source_name] = remove_green(Image.open(SOURCE_ROOT / f"{source_name}.png"))

    columns = 4
    rows = (len(FRAME_PLAN) + columns - 1) // columns
    atlas = Image.new("RGBA", (columns * FRAME_SIZE, rows * FRAME_SIZE), (0, 0, 0, 0))
    frames: dict[str, object] = {}

    for index, (name, source_name, dx, dy, scale) in enumerate(FRAME_PLAN):
        frame = normalize(sources[source_name], dx, dy, scale)
        frame.save(FRAME_ROOT / f"{name}.png", optimize=True)
        x = (index % columns) * FRAME_SIZE
        y = (index // columns) * FRAME_SIZE
        atlas.alpha_composite(frame, (x, y))
        frames[name] = {
            "frame": {"x": x, "y": y, "w": FRAME_SIZE, "h": FRAME_SIZE},
            "rotated": False,
            "trimmed": False,
            "spriteSourceSize": {"x": 0, "y": 0, "w": FRAME_SIZE, "h": FRAME_SIZE},
            "sourceSize": {"w": FRAME_SIZE, "h": FRAME_SIZE},
        }

    atlas_path = ATLAS_ROOT / "flappymike.png"
    atlas.save(atlas_path, optimize=True)
    metadata = {
        "frames": frames,
        "meta": {
            "app": "tools/build-flappymike-atlas.py",
            "version": "1.0",
            "image": atlas_path.name,
            "format": "RGBA8888",
            "size": {"w": atlas.width, "h": atlas.height},
            "scale": "1",
        },
    }
    (ATLAS_ROOT / "flappymike.json").write_text(json.dumps(metadata, indent=2) + "\n")
    print(f"Built {len(FRAME_PLAN)} frames in {atlas_path.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
