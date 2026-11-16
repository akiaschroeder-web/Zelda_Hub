"""Ben 10 Pack sprites from art/source/ben10/, processed like the Zelda
Pack's (see process_zelda.py). Separate bits (flames, sparks) are kept."""
import glob
import os
import sys

from PIL import Image

sys.path.insert(0, os.path.dirname(__file__))
import process_zelda as z  # noqa: E402

SRC = os.path.join("art", "source", "ben10")
NAMES = [
    "ben", "heatblast", "wildmutt", "diamondhead", "xlr8", "grey_matter", "four_arms", "stinkfly", "ripjaws",
    "upgrade", "ghostfreak", "cannonbolt", "way_big", "gwen", "kevin_11", "vilgax",
]


def main():
    for name in NAMES:
        fig = z.square(Image.open(glob.glob(os.path.join(SRC, f"{name}.*"))[0]).convert("RGBA"))
        for side, color in z.OUTLINE.items():
            z.outlined(fig, color, 9).save(os.path.join(z.OUT, f"{name}_{side}.png"), optimize=True)
        print("wrote", name)


if __name__ == "__main__":
    main()
