"""Sonic Pack sprites from art/source/sonic/, processed like the Zelda Pack's
(see process_zelda.py). Pieces with no source art yet get a lettered token."""
import glob
import os
import sys

from PIL import Image, ImageDraw, ImageFont

sys.path.insert(0, os.path.dirname(__file__))
import process_zelda as z  # noqa: E402

SRC = os.path.join("art", "source", "sonic")
NAMES = [
    "sonic", "tails", "knuckles", "amy", "shadow", "rouge", "silver", "blaze",
    "eggman", "metal_sonic", "motobug", "buzz_bomber", "crabmeat", "chaos", "death_egg",
    # Emerald transformations
    "super_sonic", "super_shadow", "super_silver", "burning_blaze", "hyper_sonic",
]
PLACEHOLDER_LABELS = {"amy": "Am"}


def placeholder(label: str) -> Image.Image:
    """A simple token for a piece whose art hasn't arrived yet."""
    img = Image.new("RGBA", (z.WORK, z.WORK), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    m = z.WORK // 8
    d.ellipse((m, m, z.WORK - m, z.WORK - m), fill=(236, 120, 170, 255), outline=(90, 30, 60, 255), width=12)
    font = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSerif-Bold.ttf", z.WORK // 3)
    d.text((z.WORK // 2, z.WORK // 2), label, font=font, fill=(255, 255, 255, 255), anchor="mm")
    return img


def main():
    for name in NAMES:
        found = glob.glob(os.path.join(SRC, f"{name}.*"))
        if found:
            img = Image.open(found[0])
            if "A" not in img.getbands():
                img = z.remove_flat_background(img.convert("RGB"))
            fig = z.square(img.convert("RGBA"))
        else:
            fig = placeholder(PLACEHOLDER_LABELS.get(name, name[:2].title()))
        for side, color in z.OUTLINE.items():
            z.outlined(fig, color).save(os.path.join(z.OUT, f"{name}_{side}.png"), optimize=True)
        print("wrote", name, "" if found else "(placeholder)")


if __name__ == "__main__":
    main()
