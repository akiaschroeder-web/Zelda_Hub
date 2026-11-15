"""Special-space images (art/source/tiles/) -> assets/tiles/*.png.

Each is trimmed to its content and centred on a transparent square. The
Dash Panel art points up; the board rotates it to face the panel's direction.
"""
import glob
import os

from PIL import Image

SRC = os.path.join("art", "source", "tiles")
OUT = os.path.join("assets", "tiles")
SIZE = 160


def main():
    os.makedirs(OUT, exist_ok=True)
    for path in sorted(glob.glob(os.path.join(SRC, "*.*"))):
        name = os.path.splitext(os.path.basename(path))[0]
        img = Image.open(path).convert("RGBA")
        alpha = img.getchannel("A").point(lambda v: 255 if v > 24 else 0)
        img = img.crop(alpha.getbbox())
        side = max(img.size)
        canvas = Image.new("RGBA", (side, side), (0, 0, 0, 0))
        canvas.paste(img, ((side - img.width) // 2, (side - img.height) // 2), img)
        canvas.resize((SIZE, SIZE), Image.LANCZOS).save(os.path.join(OUT, f"{name}.png"), optimize=True)
        print("wrote", name)


if __name__ == "__main__":
    main()
