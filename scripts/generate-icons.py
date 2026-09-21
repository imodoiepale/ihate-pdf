#!/usr/bin/env python3
"""Rasterize the i hate pdf mark: red tile, white document, distinctive lowercase i.

Not a heart motif. Wordmark is red i + dark “ hate pdf”.

Writes:
  build/icon.png (1024), build/icon.ico, build/icon.icns, build/icons/*.png
  docs/brand/icon-1024.png
  src/renderer/public/icon.png, favicon.ico, favicon-32.png
  src-tauri/icons/... (Electron + Tauri + store + iOS + Android densities)
"""

from __future__ import annotations

import shutil
import struct
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = Path(__file__).resolve().parents[1]
BUILD = ROOT / "build"
ICONS = BUILD / "icons"
TAURI = ROOT / "src-tauri" / "icons"
PUBLIC = ROOT / "src" / "renderer" / "public"
DOCS_BRAND = ROOT / "docs" / "brand"
RED = (229, 50, 45, 255)  # #e5322d
WHITE = (255, 255, 255, 255)
FONT = Path("/usr/share/fonts/truetype/macos/Inter-Bold.ttf")
MASTER = 1024


def _font(size: int) -> ImageFont.FreeTypeFont | ImageFont.ImageFont:
    if FONT.exists():
        return ImageFont.truetype(str(FONT), size=size)
    return ImageFont.load_default()


def draw_document(draw: ImageDraw.ImageDraw, size: int) -> None:
    doc_w = size * 0.42
    doc_h = size * 0.54
    x0 = (size - doc_w) / 2
    y0 = (size - doc_h) / 2 + size * 0.02
    x1 = x0 + doc_w
    y1 = y0 + doc_h
    fold = doc_w * 0.34
    radius = size * 0.045

    draw.rounded_rectangle((x0, y0, x1, y1), radius=radius, fill=WHITE)

    fold_pts = [(x1 - fold, y0), (x1 + 1, y0), (x1 + 1, y0 + fold)]
    draw.polygon(fold_pts, fill=RED)
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
    for width_frac in (1.0, 1.0, 0.62):
        y = ly
        ly = ly + gap
        x_end = lx0 + (lx1 - lx0) * width_frac
        draw.rounded_rectangle((lx0, y, x_end, y + line_h), radius=line_h / 2, fill=RED)


def draw_mark(size: int, *, include_i: bool | None = None) -> Image.Image:
    if include_i is None:
        include_i = size >= 48
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    overlay = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(overlay)
    radius = int(size * 0.22)
    draw.rounded_rectangle((0, 0, size - 1, size - 1), radius=radius, fill=RED)
    draw_document(draw, size)

    if include_i:
        font = _font(int(size * 0.16))
        draw.text((size * 0.10, size * 0.72), "i", font=font, fill=WHITE)

    if size >= 128:
        shadow = overlay.split()[-1].filter(ImageFilter.GaussianBlur(radius=max(size * 0.012, 1)))
        img.paste((0, 0, 0, 40), mask=shadow)
    img = Image.alpha_composite(img, overlay)
    return img


def down(img: Image.Image, size: int, *, include_i: bool | None = None) -> Image.Image:
    if size < 48:
        return draw_mark(size, include_i=False)
    if include_i is False:
        return draw_mark(size, include_i=False).resize((size, size), Image.Resampling.LANCZOS) if size != MASTER else draw_mark(size, include_i=False)
    return img.resize((size, size), Image.Resampling.LANCZOS)


def save_ico(master: Image.Image, dest: Path) -> None:
    sizes = [16, 24, 32, 48, 64, 128, 256]
    images = [down(master, s) for s in sizes]
    images[-1].save(dest, format="ICO", sizes=[(s, s) for s in sizes], append_images=images[:-1])


def save_icns(master: Image.Image, dest: Path) -> None:
    """PNG-in-ICNS (modern macOS). Types from Apple Icon Image format."""
    # type -> pixel size
    table = {
        b"icp4": 16,
        b"icp5": 32,
        b"icp6": 64,
        b"ic07": 128,
        b"ic08": 256,
        b"ic09": 512,
        b"ic10": 1024,
        b"ic11": 32,   # 16@2x
        b"ic12": 64,   # 32@2x
        b"ic13": 256,  # 128@2x
        b"ic14": 512,  # 256@2x
    }
    from io import BytesIO

    chunks: list[bytes] = []
    for type_code, px in table.items():
        bio = BytesIO()
        down(master, px).save(bio, format="PNG")
        data = bio.getvalue()
        chunks.append(type_code + struct.pack(">I", 8 + len(data)) + data)
    body = b"".join(chunks)
    dest.write_bytes(b"icns" + struct.pack(">I", 8 + len(body)) + body)


def save_png(img: Image.Image, path: Path, size: int) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    down(img, size).save(path, "PNG")


def main() -> None:
    BUILD.mkdir(parents=True, exist_ok=True)
    ICONS.mkdir(parents=True, exist_ok=True)
    PUBLIC.mkdir(parents=True, exist_ok=True)
    DOCS_BRAND.mkdir(parents=True, exist_ok=True)
    TAURI.mkdir(parents=True, exist_ok=True)

    master = draw_mark(MASTER)
    master.save(BUILD / "icon.png", "PNG")
    master.save(DOCS_BRAND / "icon-1024.png", "PNG")

    for s in (16, 24, 32, 48, 64, 128, 256, 512, 1024):
        down(master, s).save(ICONS / f"{s}x{s}.png", "PNG")

    save_ico(master, BUILD / "icon.ico")
    save_icns(master, BUILD / "icon.icns")

    # Renderer favicon / PWA-style mark
    down(master, 256).save(PUBLIC / "icon.png", "PNG")
    down(master, 32).save(PUBLIC / "favicon-32.png", "PNG")
    save_ico(master, PUBLIC / "favicon.ico")

    # Tauri / sidecar
    save_png(master, TAURI / "32x32.png", 32)
    save_png(master, TAURI / "64x64.png", 64)
    save_png(master, TAURI / "128x128.png", 128)
    save_png(master, TAURI / "128x128@2x.png", 256)
    down(master, 512).save(TAURI / "icon.png", "PNG")
    shutil.copy2(BUILD / "icon.ico", TAURI / "icon.ico")
    shutil.copy2(BUILD / "icon.icns", TAURI / "icon.icns")

    store = {
        "Square30x30Logo.png": 30,
        "Square44x44Logo.png": 44,
        "Square71x71Logo.png": 71,
        "Square89x89Logo.png": 89,
        "Square107x107Logo.png": 107,
        "Square142x142Logo.png": 142,
        "Square150x150Logo.png": 150,
        "Square284x284Logo.png": 284,
        "Square310x310Logo.png": 310,
        "StoreLogo.png": 50,
    }
    for name, size in store.items():
        save_png(master, TAURI / name, size)

    ios = TAURI / "ios"
    ios.mkdir(parents=True, exist_ok=True)
    ios_map = {
        "AppIcon-20x20@1x.png": 20,
        "AppIcon-20x20@2x.png": 40,
        "AppIcon-20x20@2x-1.png": 40,
        "AppIcon-20x20@3x.png": 60,
        "AppIcon-29x29@1x.png": 29,
        "AppIcon-29x29@2x.png": 58,
        "AppIcon-29x29@2x-1.png": 58,
        "AppIcon-29x29@3x.png": 87,
        "AppIcon-40x40@1x.png": 40,
        "AppIcon-40x40@2x.png": 80,
        "AppIcon-40x40@2x-1.png": 80,
        "AppIcon-40x40@3x.png": 120,
        "AppIcon-60x60@2x.png": 120,
        "AppIcon-60x60@3x.png": 180,
        "AppIcon-76x76@1x.png": 76,
        "AppIcon-76x76@2x.png": 152,
        "AppIcon-83.5x83.5@2x.png": 167,
        "AppIcon-512@2x.png": 1024,
    }
    for name, size in ios_map.items():
        save_png(master, ios / name, size)

    android = {
        "mipmap-mdpi": 48,
        "mipmap-hdpi": 72,
        "mipmap-xhdpi": 96,
        "mipmap-xxhdpi": 144,
        "mipmap-xxxhdpi": 192,
    }
    for folder, size in android.items():
        d = TAURI / "android" / folder
        d.mkdir(parents=True, exist_ok=True)
        save_png(master, d / "ic_launcher.png", size)
        save_png(master, d / "ic_launcher_round.png", size)
        # Adaptive foreground: document + i on transparent (system draws the red plate).
        fg = Image.new("RGBA", (size, size), (0, 0, 0, 0))
        mark = draw_mark(size)
        fg.alpha_composite(mark)
        fg.save(d / "ic_launcher_foreground.png", "PNG")

    print(f"wrote {BUILD / 'icon.png'}, {BUILD / 'icon.ico'}, {BUILD / 'icon.icns'}")
    print(f"wrote {PUBLIC / 'icon.png'} and {TAURI / 'icon.icns'}")


if __name__ == "__main__":
    main()
