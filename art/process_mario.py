"""Super Mario Pack sprites from art/source/mario/, processed like the Zelda
Pack's (see process_zelda.py)."""
import glob
import os
import sys

from PIL import Image

sys.path.insert(0, os.path.dirname(__file__))
import process_zelda as z  # noqa: E402

SRC = os.path.join("art", "source", "mario")
NAMES = [
    "mario", "luigi", "peach", "daisy", "yoshi", "toad", "toadette", "wario", "waluigi", "rosalina",
    "goomba", "koopa", "boo", "hammer_bro", "bowser",
]


def main():
    for name in NAMES:
        img = Image.open(glob.glob(os.path.join(SRC, f"{name}.*"))[0]).convert("RGBA")
        fig = z.square(img)
        for side, color in z.OUTLINE.items():
            z.outlined(fig, color, 9).save(os.path.join(z.OUT, f"{name}_{side}.png"), optimize=True)
        print("wrote", name)


if __name__ == "__main__":
    main()
