"""Digital Duo Pack sprites (Hatsune Miku, Kasane Teto) from art/source/duo/,
processed like the Zelda Pack's (see process_zelda.py)."""
import glob
import os
import sys

from PIL import Image

sys.path.insert(0, os.path.dirname(__file__))
import process_zelda as z  # noqa: E402

SRC = os.path.join("art", "source", "duo")


def main():
    for name in ["miku", "teto"]:
        img = Image.open(glob.glob(os.path.join(SRC, f"{name}.*"))[0])
        if "A" not in img.getbands():
            img = z.remove_flat_background(img.convert("RGB"))
        fig = z.square(img.convert("RGBA"))
        for side, color in z.OUTLINE.items():
            z.outlined(fig, color, 7).save(os.path.join(z.OUT, f"{name}_{side}.png"), optimize=True)
        print("wrote", name)


if __name__ == "__main__":
    main()
