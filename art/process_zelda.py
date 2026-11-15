"""Turn the Zelda Pack character art (art/source/zelda/) into board sprites.

The art keeps its colours on both sides; a soft outline in the side's colour
(cream for the player, crimson for the enemy) tells them apart. Ganondorf's
red smoke is removed, and Ganon (his 3x3 Phase 3 form) reuses his art with a
darker, redder cast.
"""
import glob
import os

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

SRC = os.path.join("art", "source", "zelda")
OUT = os.path.join("assets", "pieces")
SIZE = 256
WORK = 768  # work at 3x, then downscale
OUTLINE = {"player": (242, 228, 196), "enemy": (200, 40, 56)}


def load(name: str) -> Image.Image:
    path = glob.glob(os.path.join(SRC, f"{name}.*"))[0]
    img = Image.open(path)
    if "A" not in img.getbands():
        img = remove_flat_background(img.convert("RGB"))
    img = img.convert("RGBA")
    if name == "ganondorf":
        # The smoke above his raised hand is semi-transparent; his body is solid.
        arr = np.array(img)
        h, w = arr.shape[:2]
        region = np.zeros((h, w), bool)
        region[: int(h * 0.36), : int(w * 0.52)] = True
        arr[..., 3] = np.where(region & (arr[..., 3] < 235), 0, arr[..., 3])
        # Stray sparks are small blobs not joined to his body: keep only the main figure.
        arr[..., 3] = np.where(main_figure(arr[..., 3] > 0), arr[..., 3], 0)
        img = Image.fromarray(arr, "RGBA")
    return img


def remove_flat_background(rgb: Image.Image) -> Image.Image:
    """For art without transparency (e.g. a baked-in checkerboard): flood-fill the light,
    colourless background inward from the edges and make it transparent."""
    arr = np.array(rgb).astype(np.int32)
    mx, mn = arr.max(axis=2), arr.min(axis=2)
    light = (mn > 205) & (mx - mn < 18)
    mask = Image.fromarray((light * 255).astype(np.uint8)).copy()  # floodfill needs its own buffer
    w, h = mask.size
    for x in range(0, w, 3):
        for y in (0, h - 1):
            if mask.getpixel((x, y)) == 255:
                ImageDraw.floodfill(mask, (x, y), 128)
    for y in range(0, h, 3):
        for x in (0, w - 1):
            if mask.getpixel((x, y)) == 255:
                ImageDraw.floodfill(mask, (x, y), 128)
    bg = np.array(mask) == 128
    alpha = Image.fromarray(np.where(bg, 0, 255).astype(np.uint8)).filter(ImageFilter.MinFilter(3)).filter(ImageFilter.GaussianBlur(1))
    out = rgb.convert("RGBA")
    out.putalpha(alpha)
    return out


def main_figure(mask: np.ndarray, scale: int = 4) -> np.ndarray:
    """Mask of the largest connected blob (found on a downscaled copy, then grown back)."""
    small = np.array(Image.fromarray(mask.astype(np.uint8) * 255).resize((mask.shape[1] // scale, mask.shape[0] // scale))) > 0
    h, w = small.shape
    seen = np.zeros_like(small, bool)
    best: list = []
    for y0, x0 in zip(*np.nonzero(small)):
        if seen[y0, x0]:
            continue
        stack, comp = [(y0, x0)], []
        seen[y0, x0] = True
        while stack:
            y, x = stack.pop()
            comp.append((y, x))
            for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                ny, nx = y + dy, x + dx
                if 0 <= ny < h and 0 <= nx < w and small[ny, nx] and not seen[ny, nx]:
                    seen[ny, nx] = True
                    stack.append((ny, nx))
        if len(comp) > len(best):
            best = comp
    keep = np.zeros_like(small, bool)
    ys, xs = zip(*best)
    keep[list(ys), list(xs)] = True
    grown = Image.fromarray(keep.astype(np.uint8) * 255).filter(ImageFilter.MaxFilter(3)).resize((mask.shape[1], mask.shape[0]))
    return np.array(grown) > 0


def square(img: Image.Image) -> Image.Image:
    """Trim to the figure, then centre it on a square with its feet on the bottom edge."""
    alpha = img.getchannel("A").point(lambda v: 255 if v > 24 else 0)
    img = img.crop(alpha.getbbox())
    side = max(img.size)
    pad = int(side * 0.06)  # room for the outline
    canvas = Image.new("RGBA", (side + 2 * pad, side + 2 * pad), (0, 0, 0, 0))
    canvas.paste(img, ((canvas.width - img.width) // 2, canvas.height - img.height - pad), img)
    return canvas.resize((WORK, WORK), Image.LANCZOS)


def outlined(fig: Image.Image, color: tuple) -> Image.Image:
    alpha = fig.getchannel("A")
    ring = alpha.point(lambda v: 255 if v > 40 else 0).filter(ImageFilter.MaxFilter(13)).filter(ImageFilter.GaussianBlur(2))
    base = Image.new("RGBA", fig.size, color + (0,))
    base.putalpha(ring)
    base.alpha_composite(fig)
    return base.resize((SIZE, SIZE), Image.LANCZOS)


def demon(fig: Image.Image) -> Image.Image:
    arr = np.array(fig).astype(np.float32)
    arr[..., 0] = np.clip(arr[..., 0] * 1.15 + 25, 0, 255)
    arr[..., 1] *= 0.6
    arr[..., 2] *= 0.6
    return Image.fromarray(arr.astype(np.uint8), "RGBA")


def main():
    names = [
        "link", "zelda", "midna", "goron", "zora", "redead", "like_like", "darknut", "skulltula", "ganondorf",
        "malon", "epona", "deku_scrub", "lizalfos", "stalfos",
    ]
    for name in names:
        fig = square(load(name))
        variants = {name: fig, **({"ganon": demon(fig)} if name == "ganondorf" else {})}
        for out_name, art in variants.items():
            for side, color in OUTLINE.items():
                outlined(art, color).save(os.path.join(OUT, f"{out_name}_{side}.png"), optimize=True)
        print("wrote", name)


if __name__ == "__main__":
    main()
