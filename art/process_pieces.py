"""Cut piece art out of its black backgrounds.

Handles single-piece images and the labelled multi-piece sheets. For each piece:
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

# Sprite sheets: two rows of pieces, each with a name label underneath.
SHEETS = {
    "sheet_specials_1.png": [
        ["lancer", "archer", "guardian", "juggernaut", "medic", "engineer"],
        ["siege_engine", "assassin", "illusionist", "summoner", "converter", "displacer"],
    ],
    "sheet_specials_2.png": [
        ["oracle", "clone", "bomber", "anchor", "slayer"],
        ["trapper", "revenant", "warden", "harvester"],
    ],
    "sheet_specials_3.png": [
        ["mage", "switcher", "chancellor", "hopper", "magnet", "pusher"],
        ["mimic", "reaper", "bastion", "pathfinder", "sentinel", "splitter"],
    ],
}


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


def runs(mask_1d: np.ndarray, min_len: int = 6) -> list[tuple[int, int]]:
    """Contiguous True runs in a 1-D mask, as (start, end) pairs."""
    out, start = [], None
    for i, v in enumerate(mask_1d):
        if v and start is None:
            start = i
        elif not v and start is not None:
            if i - start >= min_len:
                out.append((start, i))
            start = None
    if start is not None and len(mask_1d) - start >= min_len:
        out.append((start, len(mask_1d)))
    return out


def find_banner_top(rgb: np.ndarray, fg: np.ndarray) -> int | None:
    """Top row of the dark-brown name banner at the bottom of a sheet cell."""
    r, g, b = rgb[..., 0], rgb[..., 1], rgb[..., 2]
    brown = fg & (rgb.max(axis=2) < 120) & (r > g) & (g >= b)
    width = max(fg.shape[1], 1)
    is_banner = brown.sum(axis=1) > 0.25 * width
    rows = np.nonzero(is_banner)[0]
    if len(rows) == 0:
        return None
    # Walk up from the lowest banner row while banner rows stay contiguous-ish.
    top = rows[-1]
    for y in rows[::-1]:
        if top - y > 14:
            break
        top = y
    return int(top)


def sheet_cells(img: Image.Image, n_rows: int) -> list[list[Image.Image]]:
    """Split a sheet into rows (at empty bands) and each row into piece columns,
    with the name label under each piece removed."""
    rgb = np.array(img.convert("RGB")).astype(np.int32)
    fg = rgb.max(axis=2) > 40
    h = fg.shape[0]
    # Row split: the empty band closest to the middle of the sheet.
    bands = runs(~fg.any(axis=1), 1)
    mid = min(bands, key=lambda b: abs((b[0] + b[1]) / 2 - h / 2))
    row_ranges = [(0, mid[0]), (mid[1], h)][:n_rows]
    out = []
    for y0, y1 in row_ranges:
        cols = runs(fg[y0:y1].any(axis=0))
        row = []
        for x0, x1 in cols:
            cell = fg[y0:y1, x0:x1]
            content = runs(cell.any(axis=1), 1)
            # The last block of rows is the label; everything above it is the piece.
            piece_bottom = content[-2][1] if len(content) >= 2 else content[-1][1]
            # Labels that touch the piece: find the banner by its dark-brown fill.
            banner_top = find_banner_top(rgb[y0:y1, x0:x1], cell)
            if banner_top is not None:
                piece_bottom = min(piece_bottom, banner_top - 8)
            row.append(img.crop((x0, y0, x1, y0 + piece_bottom + 1)))
        out.append(row)
    return out


def cutout(path_or_img) -> Image.Image:
    img = path_or_img if isinstance(path_or_img, Image.Image) else Image.open(path_or_img)
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
    gold = (sat > 0.68) & (r > g) & (g > b) & (lum > 125) & (r - b > 130)

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
    for sheet, names in SHEETS.items():
        cells = sheet_cells(Image.open(os.path.join(SRC, sheet)), len(names))
        for row_names, row_cells in zip(names, cells):
            if len(row_names) != len(row_cells):
                raise SystemExit(f"{sheet}: expected {len(row_names)} pieces in a row, found {len(row_cells)}")
            for name, cell in zip(row_names, row_cells):
                img = cutout(cell)
                img.save(os.path.join(OUT, f"{name}_player.png"), optimize=True)
                enemy_variant(img).save(os.path.join(OUT, f"{name}_enemy.png"), optimize=True)
                print("wrote", name)


if __name__ == "__main__":
    main()
