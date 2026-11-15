"""Placeholder sprites for the Zelda Content Pack until real art arrives.

Each piece is a simple chess-style token (base, body and a lettered disc)
in the same ivory / dark-violet palette as the main set. Replace the PNGs in
assets/pieces/ with real art at any time; file names stay the same.
"""
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

OUT = Path(__file__).resolve().parent.parent / "assets" / "pieces"
FONT = "/usr/share/fonts/truetype/dejavu/DejaVuSerif-Bold.ttf"
SIZE = 256

PALETTE = {
    "player": {"fill": (226, 196, 160), "shade": (196, 164, 128), "edge": (110, 82, 56), "text": (90, 62, 40)},
    "enemy": {"fill": (88, 72, 108), "shade": (60, 50, 78), "edge": (24, 20, 32), "text": (226, 214, 240)},
}

# type -> (label, accent colour drawn as a ring on the disc)
PIECES = {
    "link": ("Li", (70, 160, 80)),
    "zelda": ("Ze", (230, 200, 90)),
    "midna": ("Mi", (60, 150, 160)),
    "goron": ("Go", (170, 110, 60)),
    "zora": ("Zo", (80, 140, 220)),
    "redead": ("Re", (140, 120, 100)),
    "like_like": ("LL", (200, 120, 150)),
    "darknut": ("Dk", (110, 110, 130)),
    "skulltula": ("Sk", (200, 180, 120)),
    "ganondorf": ("Gd", (190, 60, 50)),
    "ganon": ("GN", (190, 60, 50)),
}


def token(label: str, accent: tuple, side: str, big: bool) -> Image.Image:
    c = PALETTE[side]
    im = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    w = 6
    # Base plinth and body.
    d.rounded_rectangle((40, 196, 216, 240), radius=14, fill=c["shade"], outline=c["edge"], width=w)
    d.polygon([(78, 200), (178, 200), (158, 120), (98, 120)], fill=c["fill"], outline=c["edge"])
    d.line([(78, 200), (98, 120)], fill=c["edge"], width=w)
    d.line([(178, 200), (158, 120)], fill=c["edge"], width=w)
    # Head disc with an accent ring and the label.
    r = 78 if big else 70
    cx, cy = 128, 92
    d.ellipse((cx - r, cy - r, cx + r, cy + r), fill=c["fill"], outline=c["edge"], width=w)
    d.ellipse((cx - r + 12, cy - r + 12, cx + r - 12, cy + r - 12), outline=accent, width=8)
    font = ImageFont.truetype(FONT, 58 if len(label) == 2 else 70)
    d.text((cx, cy + 2), label, font=font, fill=c["text"], anchor="mm")
    return im


def main():
    for t, (label, accent) in PIECES.items():
        for side in ("player", "enemy"):
            token(label, accent, side, t in ("ganondorf", "ganon")).save(OUT / f"{t}_{side}.png")
    print(f"wrote {len(PIECES) * 2} sprites to {OUT}")


if __name__ == "__main__":
    main()
