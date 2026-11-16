"""Metroid Pack sprites from art/source/metroid/, processed like the Zelda
Pack's (see process_zelda.py). Soft drop shadows are removed."""
import glob
import os
import sys

import numpy as np
from PIL import Image

sys.path.insert(0, os.path.dirname(__file__))
import process_zelda as z  # noqa: E402

SRC = os.path.join("art", "source", "metroid")
NAMES = ["samus", "zero_suit", "metroid", "space_pirate", "chozo_soldier", "emmi", "ridley", "mother_brain"]


def main():
    for name in NAMES:
        img = Image.open(glob.glob(os.path.join(SRC, f"{name}.*"))[0]).convert("RGBA")
        arr = np.array(img)
        # Drop translucent shadows, then keep only the main figure.
        arr[..., 3] = np.where(arr[..., 3] < 150, 0, arr[..., 3])
        arr[..., 3] = np.where(z.main_figure(arr[..., 3] > 0), arr[..., 3], 0)
        fig = z.square(Image.fromarray(arr, "RGBA"))
        for side, color in z.OUTLINE.items():
            z.outlined(fig, color, 9).save(os.path.join(z.OUT, f"{name}_{side}.png"), optimize=True)
        print("wrote", name)


if __name__ == "__main__":
    main()
