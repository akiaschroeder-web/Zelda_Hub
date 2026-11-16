"""Draw the Crash Pack crate spaces (TNT, Nitro, Bounce) into art/source/tiles/.
Run art/process_tiles.py afterwards to produce assets/tiles/*.png."""
import os

from PIL import Image, ImageDraw, ImageFont

OUT = os.path.join("art", "source", "tiles")
S = 480
FONT = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"


def crate(face, edge, plank):
    img = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    m = 30
    d.rounded_rectangle((m, m, S - m, S - m), radius=26, fill=face, outline=edge, width=22)
    # Corner brackets and a frame, like a crate.
    d.rectangle((m + 40, m + 40, S - m - 40, S - m - 40), outline=plank, width=10)
    for x, y in [(m, m), (S - m - 80, m), (m, S - m - 80), (S - m - 80, S - m - 80)]:
        d.rounded_rectangle((x, y, x + 80, y + 80), radius=14, fill=edge)
    return img, d


def label(d, text, size, fill, y=S // 2):
    font = ImageFont.truetype(FONT, size)
    d.text((S // 2, y), text, font=font, fill=fill, anchor="mm", stroke_width=6, stroke_fill=(40, 20, 10))


def main():
    os.makedirs(OUT, exist_ok=True)
    tnt, d = crate((214, 74, 34, 255), (110, 44, 20, 255), (240, 140, 60, 255))
    label(d, "TNT", 150, (250, 220, 90))
    tnt.save(os.path.join(OUT, "tnt.png"))

    nitro, d = crate((70, 200, 70, 255), (24, 90, 30, 255), (150, 240, 120, 255))
    label(d, "NITRO", 92, (240, 255, 220))
    nitro.save(os.path.join(OUT, "nitro.png"))

    bounce, d = crate((196, 134, 70, 255), (112, 70, 30, 255), (226, 176, 110, 255))
    # Diagonal planks and an up arrow.
    d.line((90, 90, S - 90, S - 90), fill=(150, 98, 46), width=18)
    d.polygon([(S // 2, 110), (S // 2 + 110, 250), (S // 2 + 45, 250), (S // 2 + 45, 370), (S // 2 - 45, 370), (S // 2 - 45, 250), (S // 2 - 110, 250)],
              fill=(255, 236, 120), outline=(80, 50, 20))
    bounce.save(os.path.join(OUT, "bounce_crate.png"))
    print("drew tnt, nitro, bounce_crate")


if __name__ == "__main__":
    main()
