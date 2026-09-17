#!/usr/bin/env python3
"""Rasterize the red-i / document brand into electron-builder icon sizes."""

from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = Path(__file__).resolve().parents[1]
BUILD = ROOT / "build"
ICONS = BUILD / "icons"
RED = (229, 50, 45, 255)  # #e5322d
DARK = (28, 28, 36, 255)  # #1c1c24
WHITE = (255, 255, 255, 255)
FONT = Path("/usr/share/fonts/truetype/macos/Inter-Bold.ttf")


def rounded_mask(size: int, radius: int) -> Image.Image:
    mask = Image.new("L", (size, size), 0)
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, size - 1, size - 1), radius=radius, fill=255)
    return mask


def draw_document(draw: ImageDraw.ImageDraw, size: int) -> None:
    """White page with a folded corner and red text lines (inverted brand glyph)."""
    doc_w = size * 0.42
    doc_h = size * 0.54
    x0 = (size - doc_w) / 2
    y0 = (size - doc_h) / 2 + size * 0.02
    x1 = x0 + doc_w
    y1 = y0 + doc_h
    fold = doc_w * 0.34
    radius = size * 0.045

    draw.rounded_rectangle((x0, y0, x1, y1), radius=radius, fill=WHITE)

    # Cut a folded corner from the top-right (shows the red field through).
    fold_pts = [(x1 - fold, y0), (x1 + 1, y0), (x1 + 1, y0 + fold)]
    draw.polygon(fold_pts, fill=RED)
    # Fold flap
    flap = [
        (x1 - fold, y0),
        (x1 - fold, y0 + fold * 0.92),
        (x1, y0 + fold),
    ]
    draw.polygon(flap, fill=(255, 255, 255, 210))

    line_h = max(size * 0.028, 2)
    gap = size * 0.055
    lx0 = x0 + doc_w * 0.16
    lx1 = x1 - doc_w * 0.16
    ly = y0 + doc_h * 0.42
    for i, width_frac in enumerate((1.0, 1.0, 0.62)):
        y = ly + i * gap
        x_end = lx0 + (lx1 - lx0) * width_frac
        draw.rounded_rectangle((lx0, y, x_end, y + line_h), radius=line_h / 2, fill=RED)


def draw_mark(size: int) -> Image.Image:
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    overlay = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(overlay)
    radius = int(size * 0.22)
    draw.rounded_rectangle((0, 0, size - 1, size - 1), radius=radius, fill=RED)
    draw_document(draw, size)

    # Small white "i" in the lower-left of the tile — the red-i wordmark, inverted.
    if FONT.exists():
        font = ImageFont.truetype(str(FONT), size=int(size * 0.16))
        draw.text((size * 0.10, size * 0.72), "i", font=font, fill=WHITE)

    shadow = overlay.split()[-1].filter(ImageFilter.GaussianBlur(radius=size * 0.012))
    img.paste((0, 0, 0, 40), mask=shadow)
    img = Image.alpha_composite(img, overlay)
    return img


def down(img: Image.Image, size: int) -> Image.Image:
    return img.resize((size, size), Image.Resampling.LANCZOS)


def save_ico(master: Image.Image, dest: Path) -> None:
    sizes = [16, 24, 32, 48, 64, 128, 256]
    images = [down(master, s) for s in sizes]
    images[-1].save(dest, format="ICO", sizes=[(s, s) for s in sizes], append_images=images[:-1])


def main() -> None:
    BUILD.mkdir(parents=True, exist_ok=True)
    ICONS.mkdir(parents=True, exist_ok=True)
    master = draw_mark(1024)
    master.save(BUILD / "icon.png", "PNG")
    for s in (16, 24, 32, 48, 64, 128, 256, 512, 1024):
        down(master, s).save(ICONS / f"{s}x{s}.png", "PNG")
    save_ico(master, BUILD / "icon.ico")
    print(f"wrote {BUILD / 'icon.png'} and {BUILD / 'icon.ico'}")


if __name__ == "__main__":
    main()
