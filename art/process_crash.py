"""Crash Bandicoot Pack sprites from art/source/crash/, processed like the
Zelda Pack's (see process_zelda.py). Brio's monster form has its own art."""
import glob
import os
import sys

from PIL import Image

sys.path.insert(0, os.path.dirname(__file__))
import process_zelda as z  # noqa: E402

SRC = os.path.join("art", "source", "crash")
NAMES = [
    "crash", "coco", "crunch", "aku_aku", "tawna", "cortex", "n_gin", "tiny", "dingodile",
    "ripper_roo", "uka_uka", "polar", "pura", "brio", "brio_monster", "n_tropy",
]


def main():
    for name in NAMES:
        img = Image.open(glob.glob(os.path.join(SRC, f"{name}.*"))[0]).convert("RGBA")
        # Keep only the figure (drops faint stray marks such as watermarks).
        arr = __import__("numpy").array(img)
        keep = z.main_figure(arr[..., 3] > 40)
        arr[..., 3] = arr[..., 3] * keep
        fig = z.square(Image.fromarray(arr, "RGBA"))
        for side, color in z.OUTLINE.items():
            z.outlined(fig, color, 9).save(os.path.join(z.OUT, f"{name}_{side}.png"), optimize=True)
        print("wrote", name)


if __name__ == "__main__":
    main()
