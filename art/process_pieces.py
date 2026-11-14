"""Cut the single-piece source images out of their black backgrounds.

Produces, for each traditional piece:
  assets/pieces/<name>_player.png  - original ivory/gold art
  assets/pieces/<name>_enemy.png   - recoloured obsidian/crimson variant

Run from the repo root:  python3 -I art/process_pieces.py
"""
from collections import deque
import os

import numpy as np
from PIL import Image

SRC = os.path.join("art", "source")
OUT = os.path.join("assets", "pieces")
SIZE = 256
PIECES = ["pawn", "knight", "bishop", "rook", "queen", "king"]


def background_mask(rgb: np.ndarray, alpha: np.ndarray | None) -> np.ndarray:
    """Flood-fill near-black pixels connected to the image border."""
    h, w, _ = rgb.shape
    dark = rgb.max(axis=2) < 40
    if alpha is not None:
        dark |= alpha < 20
    bg = np.zeros((h, w), dtype=bool)
    q = deque()
    for x in range(w):
        q.extend([(0, x), (h - 1, x)])
    for y in range(h):
        q.extend([(y, 0), (y, w - 1)])
    while q:
        y, x = q.popleft()
        if y < 0 or x < 0 or y >= h or x >= w or bg[y, x] or not dark[y, x]:
            continue
        bg[y, x] = True
        q.extend([(y + 1, x), (y - 1, x), (y, x + 1), (y, x - 1)])
    return bg


def cutout(path: str) -> Image.Image:
    img = Image.open(path)
    has_alpha = img.mode == "RGBA"
    arr = np.array(img.convert("RGBA"))
    rgb = arr[:, :, :3].astype(np.int32)
    bg = background_mask(rgb, arr[:, :, 3] if has_alpha else None)
    arr[:, :, 3] = np.where(bg, 0, 255).astype(np.uint8)
    out = Image.fromarray(arr, "RGBA")
    bbox = out.getbbox()
    out = out.crop(bbox)
    # pad to square, keep the base on the bottom edge
    side = max(out.size)
    canvas = Image.new("RGBA", (side, side), (0, 0, 0, 0))
    canvas.paste(out, ((side - out.width) // 2, side - out.height))
    return canvas.resize((SIZE, SIZE), Image.LANCZOS)


def enemy_variant(img: Image.Image) -> Image.Image:
    """Ivory body -> dark obsidian; gold trim -> crimson-gold."""
    arr = np.array(img).astype(np.float32)
    r, g, b, a = arr[..., 0], arr[..., 1], arr[..., 2], arr[..., 3]
    mx = np.maximum(np.maximum(r, g), b)
    mn = np.minimum(np.minimum(r, g), b)
    sat = np.where(mx > 0, (mx - mn) / np.maximum(mx, 1), 0)
    lum = 0.299 * r + 0.587 * g + 0.114 * b
    gold = (sat > 0.5) & (r > g) & (g > b) & (lum > 120) & (r - b > 100)

    t = (lum / 255.0) ** 1.3
    body = np.stack([22 + 88 * t, 20 + 74 * t, 30 + 100 * t], axis=-1)
    trim = np.stack([120 + 135 * t, 30 + 60 * t, 40 + 40 * t], axis=-1)
    rgb = np.where(gold[..., None], trim, body)
    out = np.concatenate([np.clip(rgb, 0, 255), a[..., None]], axis=-1)
    return Image.fromarray(out.astype(np.uint8), "RGBA")


def main() -> None:
    os.makedirs(OUT, exist_ok=True)
    for name in PIECES:
        img = cutout(os.path.join(SRC, f"{name}.png"))
        img.save(os.path.join(OUT, f"{name}_player.png"), optimize=True)
        enemy_variant(img).save(os.path.join(OUT, f"{name}_enemy.png"), optimize=True)
        print("wrote", name)


if __name__ == "__main__":
    main()
