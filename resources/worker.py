#!/usr/bin/env python3
"""Small disk-backed helpers: stamps, crop boxes, OCR page merge, blank pages."""
from __future__ import annotations

import argparse
import json
import os
import sys
import tempfile


def mm_to_pt(mm: float) -> float:
    return mm * 72.0 / 25.4


def stamp_text(args: argparse.Namespace) -> None:
    from reportlab.pdfgen import canvas
    from reportlab.lib.colors import Color

    w, h = float(args.width), float(args.height)
    c = canvas.Canvas(args.out, pagesize=(w, h))
    opacity = max(0.05, min(1.0, float(args.opacity)))
    size = float(args.font_size)
    text = args.text or ""
    c.saveState()
    c.setFillColor(Color(0.2, 0.2, 0.2, alpha=opacity))
    c.setFont("Helvetica", size)

    pos = args.position
    margin = mm_to_pt(float(args.margin_mm))
    if pos in ("center", "diagonal") or args.rotation == "diagonal":
        c.translate(w / 2, h / 2)
        rot = 45 if args.rotation == "diagonal" else float(args.rotation or 0)
        c.rotate(rot)
        c.drawCentredString(0, 0, text)
    elif pos == "top":
        c.drawCentredString(w / 2, h - margin - size, text)
    elif pos == "bottom":
        c.drawCentredString(w / 2, margin, text)
    elif pos == "header-left":
        c.drawString(margin, h - margin - size, text)
    elif pos == "header-right":
        c.drawRightString(w - margin, h - margin - size, text)
    elif pos == "bottom-left":
        c.drawString(margin, margin, text)
    elif pos == "bottom-right":
        c.drawRightString(w - margin, margin, text)
    elif pos == "top-center":
        c.drawCentredString(w / 2, h - margin - size, text)
    elif pos == "top-right":
        c.drawRightString(w - margin, h - margin - size, text)
    elif pos == "bottom-center":
        c.drawCentredString(w / 2, margin, text)
    else:
        c.translate(w / 2, h / 2)
        c.drawCentredString(0, 0, text)
    c.restoreState()
    c.save()


def stamp_pages(args: argparse.Namespace) -> None:
    from reportlab.pdfgen import canvas

    w, h = float(args.width), float(args.height)
    start = int(args.start)
    count = int(args.count)
    total = int(args.total)
    fmt = args.format
    pos = args.position
    margin = mm_to_pt(float(args.margin_mm))
    size = float(args.font_size)
    c = canvas.Canvas(args.out, pagesize=(w, h))
    for i in range(count):
        n = start + i
        if fmt == "page-n":
            label = f"Page {n}"
        elif fmt == "n-of-N":
            label = f"{n} / {total}"
        else:
            label = str(n)
        c.setFont("Helvetica", size)
        c.setFillGray(0.15)
        if pos == "bottom-right":
            c.drawRightString(w - margin, margin, label)
        elif pos == "bottom-left":
            c.drawString(margin, margin, label)
        elif pos == "top-center":
            c.drawCentredString(w / 2, h - margin - size, label)
        elif pos == "top-right":
            c.drawRightString(w - margin, h - margin - size, label)
        else:
            c.drawCentredString(w / 2, margin, label)
        c.showPage()
    c.save()


def crop(args: argparse.Namespace) -> None:
    import pikepdf

    top = mm_to_pt(float(args.top))
    right = mm_to_pt(float(args.right))
    bottom = mm_to_pt(float(args.bottom))
    left = mm_to_pt(float(args.left))
    with pikepdf.open(args.inp) as pdf:
        for page in pdf.pages:
            box = page.mediabox
            llx, lly, urx, ury = (float(box[0]), float(box[1]), float(box[2]), float(box[3]))
            new_box = [llx + left, lly + bottom, urx - right, ury - top]
            if new_box[2] - new_box[0] < 10 or new_box[3] - new_box[1] < 10:
                raise SystemExit("Crop too aggressive — remaining page would be smaller than 10pt")
            page.cropbox = new_box
            page.trimbox = new_box
        pdf.save(args.out)


def blank_page(args: argparse.Namespace) -> None:
    from reportlab.pdfgen import canvas

    c = canvas.Canvas(args.out, pagesize=(float(args.width), float(args.height)))
    c.setFillColorRGB(1, 1, 1)
    c.rect(0, 0, float(args.width), float(args.height), fill=1, stroke=0)
    c.save()


def image_stamp(args: argparse.Namespace) -> None:
    from reportlab.pdfgen import canvas
    from reportlab.lib.utils import ImageReader

    w, h = float(args.width), float(args.height)
    c = canvas.Canvas(args.out, pagesize=(w, h))
    img = ImageReader(args.image)
    iw, ih = img.getSize()
    scale = float(args.scale)
    dw, dh = iw * scale, ih * scale
    margin = mm_to_pt(12)
    pos = args.position
    if pos == "bottom-left":
        x, y = margin, margin
    elif pos == "center":
        x, y = (w - dw) / 2, (h - dh) / 2
    else:
        x, y = w - dw - margin, margin
    c.drawImage(img, x, y, dw, dh, mask="auto")
    c.save()


def text_to_markdown(args: argparse.Namespace) -> None:
    with open(args.inp, "r", encoding="utf-8", errors="replace") as f:
        raw = f.read()
    lines = raw.splitlines()
    out = []
    for line in lines:
        s = line.rstrip()
        if not s:
            out.append("")
            continue
        if s.isupper() and 3 < len(s) < 80:
            out.append(f"## {s.title()}")
        else:
            out.append(s)
    with open(args.out, "w", encoding="utf-8") as f:
        f.write("\n".join(out).strip() + "\n")


def main() -> None:
    p = argparse.ArgumentParser()
    sub = p.add_subparsers(dest="cmd", required=True)

    s = sub.add_parser("stamp-text")
    s.add_argument("--out", required=True)
    s.add_argument("--text", required=True)
    s.add_argument("--width", required=True)
    s.add_argument("--height", required=True)
    s.add_argument("--font-size", default="48")
    s.add_argument("--opacity", default="0.25")
    s.add_argument("--rotation", default="diagonal")
    s.add_argument("--position", default="center")
    s.add_argument("--margin-mm", default="12")

    s = sub.add_parser("stamp-pages")
    s.add_argument("--out", required=True)
    s.add_argument("--width", required=True)
    s.add_argument("--height", required=True)
    s.add_argument("--start", required=True)
    s.add_argument("--count", required=True)
    s.add_argument("--total", required=True)
    s.add_argument("--format", default="n")
    s.add_argument("--position", default="bottom-center")
    s.add_argument("--font-size", default="11")
    s.add_argument("--margin-mm", default="12")

    s = sub.add_parser("crop")
    s.add_argument("--inp", required=True)
    s.add_argument("--out", required=True)
    s.add_argument("--top", default="0")
    s.add_argument("--right", default="0")
    s.add_argument("--bottom", default="0")
    s.add_argument("--left", default="0")

    s = sub.add_parser("blank")
    s.add_argument("--out", required=True)
    s.add_argument("--width", required=True)
    s.add_argument("--height", required=True)

    s = sub.add_parser("image-stamp")
    s.add_argument("--out", required=True)
    s.add_argument("--image", required=True)
    s.add_argument("--width", required=True)
    s.add_argument("--height", required=True)
    s.add_argument("--position", default="bottom-right")
    s.add_argument("--scale", default="0.35")

    s = sub.add_parser("md")
    s.add_argument("--inp", required=True)
    s.add_argument("--out", required=True)

    args = p.parse_args()
    {
        "stamp-text": stamp_text,
        "stamp-pages": stamp_pages,
        "crop": crop,
        "blank": blank_page,
        "image-stamp": image_stamp,
        "md": text_to_markdown,
    }[args.cmd](args)


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:  # noqa: BLE001
        print(str(exc), file=sys.stderr)
        sys.exit(1)
