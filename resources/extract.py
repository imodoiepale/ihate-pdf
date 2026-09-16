#!/usr/bin/env python3
"""Disk-backed PDF analysis: fast text+layout parse, tables, chunks, local extractors.

Priority order (never faked):
  1. PyMuPDF — typically well under 2 s (often tens of milliseconds) for born-digital PDFs
  2. Microsoft MarkItDown — ~2 s markdown for modest files (optional)
  3. Poppler pdftotext -layout — page-windowed, works on huge files
  4. pdfplumber / PyMuPDF tables
  5. Tesseract OCR for scans with almost no text layer
  6. Docling / Extractous / Marker if the user installed them (detected, not bundled)

Huge files: pages are extracted in windows and written to disk. The process never
holds a whole 1 TB PDF in memory.
"""
from __future__ import annotations

import argparse
import json
import os
import re
import shutil
import subprocess
import sys
import time
from pathlib import Path
from typing import Any

CHUNK_CHARS = 3500
PAGE_WINDOW = 40
DEFAULT_PAGE_CAP = 200
OCR_PAGE_CAP = 12
TABLE_PAGE_CAP = 30
MARKITDOWN_PAGES = 60
MARKITDOWN_BYTES = 40 * 1024 * 1024
PYMUPDF_HUGE_BYTES = 400 * 1024 * 1024


def which(name: str) -> str | None:
    return shutil.which(name)


def run(cmd: list[str], timeout: int = 120) -> str:
    p = subprocess.run(cmd, capture_output=True, text=True, timeout=timeout)
    if p.returncode != 0:
        err = (p.stderr or p.stdout or "").strip()
        raise RuntimeError(f"{' '.join(cmd[:3])} failed: {err[:800]}")
    return p.stdout


def try_import(name: str) -> bool:
    try:
        __import__(name)
        return True
    except Exception:
        return False


def page_count(pdf: str) -> int:
    if try_import("pymupdf"):
        try:
            import pymupdf

            doc = pymupdf.open(pdf)
            n = doc.page_count
            doc.close()
            if n:
                return int(n)
        except Exception:
            pass
    info = which("pdfinfo")
    if info:
        try:
            out = run([info, pdf], timeout=60)
            for line in out.splitlines():
                if line.lower().startswith("pages:"):
                    return int(line.split(":", 1)[1].strip())
        except Exception:
            pass
    qpdf = which("qpdf")
    if qpdf:
        out = run([qpdf, "--show-npages", pdf], timeout=60)
        return int(out.strip() or "0")
    raise RuntimeError("Neither PyMuPDF, pdfinfo, nor qpdf is available. Install pymupdf or poppler-utils and qpdf.")


def parse_pages(spec: str | None, n: int, entire: bool) -> tuple[list[int], bool]:
    truncated = False
    if spec:
        pages: set[int] = set()
        for part in re.split(r"[,\s]+", spec.strip()):
            if not part:
                continue
            m = re.match(r"^(\d+)\s*-\s*(\d+)$", part)
            if m:
                a, b = int(m.group(1)), int(m.group(2))
                if a > b:
                    a, b = b, a
                for i in range(a, b + 1):
                    if 1 <= i <= n:
                        pages.add(i)
            elif part.isdigit():
                i = int(part)
                if 1 <= i <= n:
                    pages.add(i)
            else:
                raise RuntimeError(f"Invalid page range: {part}")
        return sorted(pages), False
    if entire or n <= DEFAULT_PAGE_CAP:
        return list(range(1, n + 1)), False
    head = list(range(1, min(150, n) + 1))
    tail_start = max(min(150, n) + 1, n - 49)
    tail = [i for i in range(tail_start, n + 1) if i not in head]
    truncated = True
    return head + tail, truncated


def write_json(path: Path, data: Any) -> None:
    path.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")


def detect_engines() -> dict[str, Any]:
    mods: dict[str, bool] = {}
    for m in (
        "pymupdf",
        "markitdown",
        "pdfplumber",
        "pypdf",
        "docling",
        "extractous",
        "unstructured",
        "camelot",
        "marker",
        "magic_pdf",
    ):
        mods[m] = try_import(m)
    if try_import("mineru"):
        mods["mineru"] = True
    else:
        mods["mineru"] = bool(mods.get("magic_pdf"))
    if mods.get("pymupdf"):
        default = "pymupdf"
    elif mods.get("markitdown"):
        default = "markitdown"
    elif which("pdftotext"):
        default = "pdftotext"
    else:
        default = "none"
    return {
        "pdftotext": bool(which("pdftotext")),
        "pdfimages": bool(which("pdfimages")),
        "tesseract": bool(which("tesseract")),
        "pdfinfo": bool(which("pdfinfo")),
        "ocrmypdf": bool(which("ocrmypdf")),
        **mods,
        "defaultParser": default,
    }


def pdftotext_window(pdf: str, first: int, last: int) -> str:
    bin_ = which("pdftotext")
    if not bin_:
        raise RuntimeError("pdftotext is not installed. Linux: sudo apt install poppler-utils")
    return run([bin_, "-layout", "-f", str(first), "-l", str(last), pdf, "-"], timeout=180)


def ocr_page(pdf: str, page: int, tmp: Path, lang: str) -> str:
    pdftoppm = which("pdftoppm")
    tess = which("tesseract")
    if not pdftoppm or not tess:
        return ""
    prefix = tmp / f"ocr-{page}"
    run([pdftoppm, "-f", str(page), "-l", str(page), "-r", "200", "-png", pdf, str(prefix)], timeout=120)
    imgs = sorted(prefix.parent.glob(f"{prefix.name}*.png"))
    if not imgs:
        return ""
    try:
        return run([tess, str(imgs[0]), "stdout", "-l", lang], timeout=120)
    except Exception:
        return ""


def try_markitdown(pdf: str) -> str | None:
    try:
        from markitdown import MarkItDown
    except Exception:
        return None
    try:
        md = MarkItDown()
        result = md.convert(pdf)
        text = (result.text_content or "").strip()
        return text or None
    except Exception:
        return None


def try_pymupdf(pdf: str, pages: list[int]) -> tuple[dict[int, str], list[dict[str, Any]]] | None:
    try:
        import pymupdf
    except Exception:
        return None
    page_map: dict[int, str] = {}
    tables: list[dict[str, Any]] = []
    want = set(pages)
    try:
        doc = pymupdf.open(pdf)
        for i in range(doc.page_count):
            pno = i + 1
            if pno not in want:
                continue
            page = doc[i]
            try:
                text = page.get_text("text") or ""
            except Exception:
                text = ""
            page_map[pno] = text.replace("\x00", "")
            if len(tables) < 80:
                try:
                    finder = page.find_tables()
                    extracted = finder.tables if finder is not None else []
                    for ti, tab in enumerate(extracted):
                        try:
                            rows = tab.extract()
                        except Exception:
                            continue
                        if rows:
                            tables.append({"page": pno, "index": ti, "rows": rows, "engine": "pymupdf"})
                except Exception:
                    pass
        doc.close()
        return page_map, tables
    except Exception:
        return None


def try_pdfplumber_tables(pdf: str, pages: list[int]) -> list[dict[str, Any]]:
    try:
        import pdfplumber
    except Exception:
        return []
    out: list[dict[str, Any]] = []
    want = set(pages[:TABLE_PAGE_CAP])
    try:
        with pdfplumber.open(pdf) as doc:
            for i, page in enumerate(doc.pages, start=1):
                if i not in want:
                    continue
                try:
                    tables = page.extract_tables() or []
                except Exception:
                    tables = []
                for ti, table in enumerate(tables):
                    if not table:
                        continue
                    out.append({"page": i, "index": ti, "rows": table, "engine": "pdfplumber"})
                if i > max(want):
                    break
    except Exception:
        return out
    return out


def pdftotext_pages(pdf: str, pages: list[int]) -> dict[int, str]:
    page_map: dict[int, str] = {}
    if not which("pdftotext"):
        return page_map
    i = 0
    while i < len(pages):
        window = pages[i : i + PAGE_WINDOW]
        first, last = window[0], window[-1]
        if window == list(range(first, last + 1)):
            raw = pdftotext_window(pdf, first, last)
            parts = raw.split("\f")
            for offset, text in enumerate(parts):
                pno = first + offset
                if pno in window:
                    page_map[pno] = text.replace("\x00", "")
        else:
            for pno in window:
                page_map[pno] = pdftotext_window(pdf, pno, pno).replace("\f", "").replace("\x00", "")
        i += PAGE_WINDOW
    return page_map


def chunk_pages(page_map: dict[int, str], dest: Path) -> list[dict[str, Any]]:
    dest.mkdir(parents=True, exist_ok=True)
    chunks: list[dict[str, Any]] = []
    buf = ""
    buf_pages: list[int] = []
    idx = 0

    def flush() -> None:
        nonlocal buf, buf_pages, idx
        if not buf.strip():
            buf = ""
            buf_pages = []
            return
        name = f"{idx:05d}.txt"
        (dest / name).write_text(buf, encoding="utf-8")
        preview = re.sub(r"\s+", " ", buf).strip()[:240]
        chunks.append(
            {
                "id": idx,
                "file": name,
                "pages": [buf_pages[0], buf_pages[-1]] if buf_pages else [0, 0],
                "chars": len(buf),
                "preview": preview,
            }
        )
        idx += 1
        buf = ""
        buf_pages = []

    for p in sorted(page_map):
        text = page_map[p].rstrip() + "\n\n"
        if buf and len(buf) + len(text) > CHUNK_CHARS:
            flush()
        if len(text) > CHUNK_CHARS * 2:
            parts = re.split(r"\n{2,}", text)
            for part in parts:
                piece = part.strip() + "\n\n"
                if buf and len(buf) + len(piece) > CHUNK_CHARS:
                    flush()
                buf += piece
                buf_pages.append(p)
                if len(buf) > CHUNK_CHARS:
                    flush()
            continue
        buf += text
        buf_pages.append(p)
    flush()
    return chunks


def cmd_parse(args: argparse.Namespace) -> None:
    t0 = time.time()
    pdf = args.inp
    out = Path(args.out_dir)
    out.mkdir(parents=True, exist_ok=True)
    pages_dir = out / "pages"
    chunks_dir = out / "chunks"
    pages_dir.mkdir(exist_ok=True)
    n = page_count(pdf)
    size = os.path.getsize(pdf)
    pages, truncated = parse_pages(args.pages, n, bool(args.entire))
    if not pages:
        raise RuntimeError("No pages to parse")

    page_map: dict[int, str] = {}
    tables: list[dict[str, Any]] = []
    used_ocr = False
    md_text = None
    parser = "none"
    engine_choice = args.engine or "auto"

    want_pymupdf = engine_choice in ("auto", "pymupdf")
    huge = size > PYMUPDF_HUGE_BYTES
    if want_pymupdf and not huge:
        got = try_pymupdf(pdf, pages)
        if got:
            page_map, tables = got
            parser = "pymupdf"

    if engine_choice == "pdftotext" or (not page_map and engine_choice in ("auto", "pdftotext", "markitdown")):
        if which("pdftotext"):
            page_map = pdftotext_pages(pdf, pages)
            if page_map:
                parser = "pdftotext" if parser == "none" else parser
        elif not page_map:
            raise RuntimeError(
                "No text extractor available. Install PyMuPDF (`pip install pymupdf`) or poppler-utils."
            )

    if (
        not args.pages
        and not truncated
        and n <= MARKITDOWN_PAGES
        and size <= MARKITDOWN_BYTES
        and (engine_choice == "markitdown" or (engine_choice == "auto" and parser in ("none", "pdftotext")))
    ):
        md_text = try_markitdown(pdf)
        if md_text and parser in ("none", "pdftotext"):
            parser = "markitdown"

    if not page_map:
        raise RuntimeError("Could not extract any page text. The PDF may be encrypted or empty.")

    emptyish = sum(1 for p in pages if len(re.sub(r"\s+", "", page_map.get(p, ""))) < 40)
    if emptyish >= max(1, int(len(pages) * 0.7)) and which("tesseract") and which("pdftoppm"):
        used_ocr = True
        parser = parser + "+ocr" if parser not in ("none", "pdftotext") else "tesseract"
        tmp = out / "ocr-tmp"
        tmp.mkdir(exist_ok=True)
        for pno in pages[:OCR_PAGE_CAP]:
            text = ocr_page(pdf, pno, tmp, args.lang or "eng")
            if text.strip():
                page_map[pno] = text
        shutil.rmtree(tmp, ignore_errors=True)

    for pno, text in page_map.items():
        (pages_dir / f"{pno:05d}.txt").write_text(text, encoding="utf-8")

    layout_parts = []
    layout_bytes = 0
    layout_cap = 8 * 1024 * 1024
    for pno in pages:
        block = f"\n\n----- page {pno} -----\n{page_map.get(pno, '')}"
        b = len(block.encode("utf-8"))
        if layout_bytes + b > layout_cap:
            layout_parts.append("\n\n[truncated: remaining pages live under pages/]")
            break
        layout_parts.append(block)
        layout_bytes += b
    (out / "layout.txt").write_text("".join(layout_parts).strip() + "\n", encoding="utf-8")

    if md_text:
        (out / "markdown.md").write_text(md_text.strip() + "\n", encoding="utf-8")
    else:
        lines = []
        for pno in pages:
            lines.append(f"\n## Page {pno}\n")
            for line in page_map.get(pno, "").splitlines():
                s = line.rstrip()
                if s.isupper() and 3 < len(s.strip()) < 80:
                    lines.append(f"### {s.title()}")
                else:
                    lines.append(s)
        (out / "markdown.md").write_text("\n".join(lines).strip() + "\n", encoding="utf-8")

    if engine_choice != "pdftotext" and len(tables) < 2:
        extra = try_pdfplumber_tables(pdf, pages)
        if extra:
            tables = tables + extra
    write_json(out / "tables.json", {"tables": tables, "count": len(tables)})

    chunks = chunk_pages(page_map, chunks_dir)
    write_json(out / "index.json", {"chunks": chunks, "chunkCount": len(chunks)})

    preview = (md_text or "".join(layout_parts))[:4000]
    elapsed_ms = int((time.time() - t0) * 1000)
    meta = {
        "engine": parser,
        "pagesTotal": n,
        "pagesParsed": pages,
        "pageCountParsed": len(pages),
        "truncated": truncated,
        "usedOcr": used_ocr,
        "tables": len(tables),
        "chunks": len(chunks),
        "bytes": size,
        "elapsedMs": elapsed_ms,
        "markitdown": bool(md_text),
        "preview": preview[:1500],
        "source": pdf,
    }
    write_json(out / "meta.json", meta)
    print(json.dumps(meta, ensure_ascii=False))


DATE_RE = re.compile(
    r"\b("
    r"\d{4}-\d{2}-\d{2}"
    r"|\d{1,2}[/-]\d{1,2}[/-]\d{2,4}"
    r"|\d{1,2}\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+\d{2,4}"
    r"|(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+\d{1,2},?\s+\d{4}"
    r")\b",
    re.I,
)
DATETIME_RE = re.compile(r"(\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2})")
MONEY_RE = re.compile(
    r"(?<![\w.])(?:KES|KSh|Ksh|USD|EUR|GBP|\$)?\s*"
    r"(-?\(?\d{1,3}(?:,\d{3})+(?:\.\d{2})?|-?\(?\d+\.\d{2})\)?"
    r"(?![\w.])"
)
ACCOUNT_RE = re.compile(
    r"(?:account|acct\.?|a/c)\s*(?:number|no\.?|#)?\s*[:#]?\s*([0-9X*]{4,22})",
    re.I,
)
IBAN_RE = re.compile(r"\b([A-Z]{2}\d{2}[A-Z0-9]{10,30})\b")
INVOICE_NO_RE = re.compile(
    r"(?:invoice|receipt|bill)\s*(?:number|no\.?|#)\s*[:#]?\s*([A-Z0-9][-A-Z0-9/]{1,24})",
    re.I,
)
TOTAL_RE = re.compile(r"\b(?:grand\s+)?(?:total|amount\s+due|balance\s+due)\b[:\s]*\$?([\d,]+\.\d{2})", re.I)
SUBTOTAL_RE = re.compile(r"\bsub[- ]?total\b[:\s]*\$?([\d,]+\.\d{2})", re.I)
TAX_RE = re.compile(r"\b(?:tax|vat|gst)\b[:\s]*\$?([\d,]+\.\d{2})", re.I)
OPEN_RE = re.compile(r"\bopening\s+balance\b[:\s]*\$?([\d,]+\.?\d{0,2})", re.I)
CLOSE_RE = re.compile(r"\bclosing\s+balance\b[:\s]*\$?([\d,]+\.?\d{0,2})", re.I)
MPESA_RECEIPT_RE = re.compile(r"\b([A-Z][A-Z0-9]{9})\b")
MSISDN_RE = re.compile(r"\b(?:254\d{9}|0[17]\d{8})\b")
EMAIL_RE = re.compile(r"\b[A-Z0-9._%+\-]+@[A-Z0-9.\-]+\.[A-Z]{2,}\b", re.I)
URL_RE = re.compile(r"https?://[^\s)>\"]+", re.I)
PHONE_RE = re.compile(r"\b(?:\+?254|0)[17]\d{8}\b|\+\d{10,15}")
KRA_PIN_RE = re.compile(r"\b[AP]\d{9}[A-Z]\b")
KV_RE = re.compile(r"^.{0,4}([A-Za-z][A-Za-z0-9 ./%#-]{1,40}?)\s*[:\-]\s*(.+)$")


def money(s: str | None) -> float | None:
    if not s:
        return None
    raw = str(s).strip()
    if not raw or raw in {".", "-", "--"}:
        return None
    neg = raw.startswith("(") or raw.startswith("-") or raw.endswith(")")
    n = re.sub(r"[^\d.]", "", raw)
    if not n:
        return None
    try:
        v = float(n)
        return -v if neg and v > 0 else v
    except ValueError:
        return None


def load_layout(parsed: Path) -> str:
    p = parsed / "layout.txt"
    if p.exists():
        return p.read_text(encoding="utf-8", errors="replace")
    parts = []
    for f in sorted((parsed / "pages").glob("*.txt")):
        parts.append(f.read_text(encoding="utf-8", errors="replace"))
        if sum(len(x) for x in parts) > 8_000_000:
            break
    return "\n".join(parts)


def load_tables(parsed: Path) -> list[list[str]]:
    p = parsed / "tables.json"
    if not p.exists():
        return []
    try:
        data = json.loads(p.read_text(encoding="utf-8"))
    except Exception:
        return []
    rows: list[list[str]] = []
    for t in data.get("tables") or []:
        for row in t.get("rows") or []:
            rows.append([("" if c is None else str(c)).strip() for c in row])
    return rows


def first_match(rx: re.Pattern[str], text: str) -> str | None:
    m = rx.search(text)
    if not m:
        return None
    if m.lastindex:
        return m.group(1).strip()
    return m.group(0).strip()


def source_name(parsed: Path) -> str:
    meta_path = parsed / "meta.json"
    if meta_path.exists():
        try:
            source = json.loads(meta_path.read_text(encoding="utf-8")).get("source") or ""
            if source:
                return Path(source).name
        except Exception:
            pass
    return parsed.name


def looks_like_mpesa(text: str) -> bool:
    head = text[:8000]
    if re.search(r"\bm-?pesa\b|\bsafaricom\b", head, re.I):
        return True
    if re.search(r"\bpaid\s+in\b", head, re.I) and re.search(r"\bwithdrawn\b", head, re.I) and MPESA_RECEIPT_RE.search(head):
        return True
    return False


def detect_currency(text: str) -> str | None:
    head = text[:4000]
    if re.search(r"\bKES\b|\bKSh\b|\bKsh\b", head):
        return "KES"
    if "$" in head or re.search(r"\bUSD\b", head):
        return "USD"
    if re.search(r"\bEUR\b|€", head):
        return "EUR"
    if re.search(r"\bGBP\b|£", head):
        return "GBP"
    return None


def is_header_row(cells: list[str]) -> bool:
    joined = " ".join(cells).lower()
    return bool(
        re.search(
            r"date|description|particulars|debit|credit|balance|paid in|withdrawn|receipt|details|amount",
            joined,
        )
        and not DATE_RE.search(joined)
        and not DATETIME_RE.search(joined)
    )


def txn_from_cells(cells: list[str]) -> dict[str, Any] | None:
    cells = [c for c in cells]
    if is_header_row(cells):
        return None
    joined = " ".join(c for c in cells if c)
    dm = DATETIME_RE.search(joined) or DATE_RE.search(joined)
    amounts = [money(x) for x in MONEY_RE.findall(joined)]
    amounts = [a for a in amounts if a is not None]
    if not dm or not amounts:
        return None
    desc_parts = []
    for c in cells:
        if not c:
            continue
        if DATE_RE.fullmatch(c) or DATETIME_RE.fullmatch(c) or MONEY_RE.fullmatch(c.replace(" ", "")):
            continue
        if re.fullmatch(r"[\d,.()$-]+", c):
            continue
        if MPESA_RECEIPT_RE.fullmatch(c):
            continue
        desc_parts.append(c)
    debit = credit = amt = bal = None
    if len(amounts) >= 3:
        debit, credit, bal = amounts[0], amounts[1], amounts[-1]
        amt = (credit or 0) - (debit or 0)
    elif len(amounts) == 2:
        amt, bal = amounts[0], amounts[1]
        if amt < 0:
            debit = abs(amt)
        else:
            credit = amt
    else:
        amt = amounts[0]
        if amt < 0:
            debit = abs(amt)
        else:
            credit = amt
    receipt = None
    rec = MPESA_RECEIPT_RE.search(joined)
    if rec:
        receipt = rec.group(1)
    return {
        "date": dm.group(1),
        "description": " ".join(desc_parts).strip() or joined,
        "debit": debit,
        "credit": credit,
        "amount": amt,
        "balance": bal,
        "receipt": receipt,
        "raw": joined,
    }


def txn_from_line(line: str) -> dict[str, Any] | None:
    s = line.strip()
    if not s or s.startswith("----- page"):
        return None
    if re.search(r"opening|closing|balance brought|page\s+\d|statement period", s, re.I) and len(MONEY_RE.findall(s)) <= 1:
        if not (DATETIME_RE.search(s) and MPESA_RECEIPT_RE.search(s)):
            return None
    dm = DATETIME_RE.search(s) or DATE_RE.search(s)
    amounts = [money(x) for x in MONEY_RE.findall(s)]
    amounts = [a for a in amounts if a is not None]
    if not dm or not amounts:
        return None
    desc = DATETIME_RE.sub("", s)
    desc = DATE_RE.sub("", desc)
    desc = MONEY_RE.sub("", desc)
    desc = MPESA_RECEIPT_RE.sub("", desc, count=1)
    desc = re.sub(r"\s{2,}", " ", desc).strip(" -|\t")
    amt = amounts[0]
    bal = amounts[-1] if len(amounts) > 1 else None
    debit = credit = None
    if len(amounts) >= 3:
        debit, credit, bal = amounts[0], amounts[1], amounts[-1]
        amt = (credit or 0) - (debit or 0)
    elif len(amounts) == 2:
        first, last = amounts[0], amounts[1]
        amt, bal = first, last
        if first > last:
            debit = first
            credit = None
        else:
            credit = first
            debit = None
    else:
        if amt < 0:
            debit = abs(amt)
        else:
            credit = amt
    receipt = None
    rec = MPESA_RECEIPT_RE.search(s)
    if rec:
        receipt = rec.group(1)
    return {
        "date": dm.group(1),
        "description": desc or s,
        "debit": debit,
        "credit": credit,
        "amount": amt,
        "balance": bal,
        "receipt": receipt,
        "raw": s,
    }


def dedupe_txns(txns: list[dict[str, Any]]) -> list[dict[str, Any]]:
    seen: set[str] = set()
    uniq = []
    for t in txns:
        key = f"{t.get('date')}|{t.get('receipt') or ''}|{t.get('description')}|{t.get('amount')}|{t.get('balance')}"
        if key in seen:
            continue
        seen.add(key)
        uniq.append(t)
    return uniq


def collect_ledger(text: str, tables: list[list[str]]) -> list[dict[str, Any]]:
    txns: list[dict[str, Any]] = []
    for row in tables:
        item = txn_from_cells(row)
        if item:
            txns.append(item)
    if len(txns) < 2:
        for line in text.splitlines():
            item = txn_from_line(line)
            if item:
                txns.append(item)
    return dedupe_txns(txns)


def classify_mpesa_details(details: str) -> str:
    d = details.lower()
    if "fuliza" in d:
        return "fuliza"
    if "airtime" in d:
        return "airtime"
    if "pay bill" in d or "paybill" in d:
        return "paybill"
    if "merchant" in d or "buy goods" in d or "till" in d:
        return "buy_goods"
    if "withdraw" in d or "agent" in d:
        return "withdrawal"
    if "customer transfer" in d or "received from" in d or "sent to" in d or "send money" in d:
        return "send_money"
    if "charge" in d or "fee" in d:
        return "charge"
    if "deposit" in d:
        return "deposit"
    return "other"


def parse_mpesa_line(line: str) -> dict[str, Any] | None:
    s = line.strip()
    if not s or s.startswith("----- page"):
        return None
    rec = MPESA_RECEIPT_RE.search(s)
    dt = DATETIME_RE.search(s) or DATE_RE.search(s)
    if not rec or not dt:
        return None
    if rec.start() > 8:
        return None
    amounts = [money(x) for x in MONEY_RE.findall(s)]
    amounts = [a for a in amounts if a is not None]
    if not amounts:
        return None
    rest = s[dt.end() :].strip()
    rest = MPESA_RECEIPT_RE.sub("", rest, count=1)
    status_m = re.search(r"\b(Completed|Failed|Pending|Cancelled)\b", rest, re.I)
    status = status_m.group(1) if status_m else None
    details = rest
    if status_m:
        details = rest[: status_m.start()].strip()
    details = MONEY_RE.sub("", details)
    details = re.sub(r"\s{2,}", " ", details).strip(" -|\t")
    paid_in = withdrawn = balance = None
    if len(amounts) >= 3:
        paid_in, withdrawn, balance = amounts[0], amounts[1], amounts[2]
    elif len(amounts) == 2:
        # paid in OR withdrawn, plus balance — infer from keywords
        if re.search(r"withdraw|charge|pay bill|merchant|buy goods|airtime|sent to|transfer of funds", details, re.I):
            withdrawn, balance = amounts[0], amounts[1]
        else:
            paid_in, balance = amounts[0], amounts[1]
    else:
        balance = amounts[0]
    phone = None
    pm = MSISDN_RE.search(s)
    if pm:
        phone = pm.group(0)
    return {
        "receipt": rec.group(1),
        "date": dt.group(1),
        "details": details or s,
        "status": status or "Completed",
        "paid_in": paid_in,
        "withdrawn": withdrawn,
        "balance": balance,
        "counterparty_phone": phone,
        "type": classify_mpesa_details(details or s),
        "raw": s,
    }


def extract_mpesa_doc(text: str, tables: list[list[str]], file_name: str) -> dict[str, Any]:
    rows: list[dict[str, Any]] = []
    for row in tables:
        joined = " ".join(c for c in row if c)
        item = parse_mpesa_line(joined)
        if item:
            rows.append(item)
        else:
            # table cells: receipt, time, details, status, paid in, withdrawn, balance
            cells = [c for c in row]
            if len(cells) >= 5 and MPESA_RECEIPT_RE.search(" ".join(cells[:2] or [])):
                rec = MPESA_RECEIPT_RE.search(" ".join(cells))
                dt = DATETIME_RE.search(" ".join(cells)) or DATE_RE.search(" ".join(cells))
                amounts = [money(c) for c in cells]
                amounts = [a for a in amounts if a is not None]
                if rec and dt and amounts:
                    details = " ".join(
                        c
                        for c in cells
                        if c
                        and not MPESA_RECEIPT_RE.fullmatch(c)
                        and not DATE_RE.fullmatch(c)
                        and not DATETIME_RE.fullmatch(c)
                        and money(c) is None
                        and not re.fullmatch(r"Completed|Failed|Pending", c, re.I)
                    )
                    paid_in = withdrawn = balance = None
                    if len(amounts) >= 3:
                        paid_in, withdrawn, balance = amounts[0], amounts[1], amounts[-1]
                    elif len(amounts) == 2:
                        withdrawn, balance = None, amounts[-1]
                        if classify_mpesa_details(details) in {"withdrawal", "paybill", "buy_goods", "airtime", "charge"}:
                            withdrawn = amounts[0]
                        else:
                            paid_in = amounts[0]
                    phone_m = MSISDN_RE.search(details)
                    rows.append(
                        {
                            "receipt": rec.group(1),
                            "date": dt.group(1),
                            "details": details,
                            "status": "Completed",
                            "paid_in": paid_in,
                            "withdrawn": withdrawn,
                            "balance": balance,
                            "counterparty_phone": phone_m.group(0) if phone_m else None,
                            "type": classify_mpesa_details(details),
                            "raw": joined,
                        }
                    )
    if len(rows) < 2:
        for line in text.splitlines():
            item = parse_mpesa_line(line)
            if item:
                rows.append(item)
    seen: set[str] = set()
    uniq = []
    for r in rows:
        key = f"{r.get('receipt')}|{r.get('date')}|{r.get('paid_in')}|{r.get('withdrawn')}|{r.get('balance')}"
        if key in seen:
            continue
        seen.add(key)
        uniq.append(r)

    name = None
    nm = re.search(r"(?:customer\s+name|account\s+holder)\s*[:\-]\s*(.+)", text, re.I)
    if nm:
        name = nm.group(1).strip()[:120]
    email = first_match(EMAIL_RE, text)
    msisdn = None
    mm = re.search(r"(?:mobile|msisdn|phone)\s*(?:number|no\.?)?\s*[:\-]\s*(\+?\d{9,15})", text, re.I)
    if mm:
        msisdn = mm.group(1)
    else:
        msisdn = first_match(MSISDN_RE, text[:4000])
    period_start = period_end = None
    per = re.search(
        r"(?:statement\s+period|period)\s*[:.]?\s*(%s)\s*(?:to|-|–)\s*(%s)" % (DATE_RE.pattern, DATE_RE.pattern),
        text,
        re.I,
    )
    if per:
        period_start, period_end = per.group(1), per.group(2)
        # DATE_RE.pattern already contains a capture; prefer inner date text.
        if per.lastindex and per.lastindex >= 2:
            period_start, period_end = per.group(1), per.group(2)

    paid = sum(r["paid_in"] or 0 for r in uniq)
    withdrawn = sum(r["withdrawn"] or 0 for r in uniq)
    transactions = []
    for r in uniq:
        debit = r.get("withdrawn")
        credit = r.get("paid_in")
        amt = (credit or 0) - (debit or 0)
        transactions.append(
            {
                "date": r.get("date"),
                "description": r.get("details"),
                "debit": debit,
                "credit": credit,
                "amount": amt,
                "balance": r.get("balance"),
                "receipt": r.get("receipt"),
                "status": r.get("status"),
                "type": r.get("type"),
                "counterparty_phone": r.get("counterparty_phone"),
            }
        )
    return {
        "file": file_name,
        "statement_kind": "mpesa",
        "institution": "Safaricom M-PESA",
        "account_name": name,
        "account_number": msisdn,
        "msisdn": msisdn,
        "email": email,
        "routing_number": None,
        "iban": None,
        "period_start": period_start,
        "period_end": period_end,
        "opening_balance": None,
        "closing_balance": uniq[-1].get("balance") if uniq else None,
        "currency": detect_currency(text) or "KES",
        "paid_in_total": paid,
        "withdrawn_total": withdrawn,
        "transactions": transactions,
        "mpesa_rows": uniq,
    }


def extract_bank_doc(text: str, tables: list[list[str]], file_name: str) -> dict[str, Any]:
    if looks_like_mpesa(text):
        return extract_mpesa_doc(text, tables, file_name)
    uniq = collect_ledger(text, tables)
    header = text[:2500]
    doc: dict[str, Any] = {
        "file": file_name,
        "statement_kind": "bank",
        "institution": None,
        "account_name": None,
        "account_number": first_match(ACCOUNT_RE, text),
        "routing_number": first_match(re.compile(r"\brouting\s*(?:number|no\.?|#)?\s*[:#]?\s*(\d{9})\b", re.I), text),
        "iban": first_match(IBAN_RE, text),
        "period_start": None,
        "period_end": None,
        "opening_balance": money(first_match(OPEN_RE, text) or ""),
        "closing_balance": money(first_match(CLOSE_RE, text) or ""),
        "currency": detect_currency(text) or ("USD" if "$" in header else None),
        "transactions": [
            {k: t[k] for k in ("date", "description", "debit", "credit", "amount", "balance") if k in t} for t in uniq
        ],
    }
    per = re.search(
        r"(?:statement\s+period|period)\s*[:.]?\s*(%s)\s*(?:to|-|–)\s*(%s)" % (DATE_RE.pattern, DATE_RE.pattern),
        text,
        re.I,
    )
    if per:
        doc["period_start"] = per.group(1)
        doc["period_end"] = per.group(2)
    lines = [ln.strip() for ln in text.splitlines() if ln.strip() and not ln.startswith("----- page")]
    if lines:
        doc["institution"] = lines[0][:120]
    holder = re.search(r"(?:account\s+name|account\s+holder|customer\s+name)\s*[:\-]\s*(.+)", text, re.I)
    if holder:
        doc["account_name"] = holder.group(1).strip()[:120]
    return doc


def cmd_extract_bank(args: argparse.Namespace) -> None:
    parsed = Path(args.parsed_dir)
    text = load_layout(parsed)
    tables = load_tables(parsed)
    doc = extract_bank_doc(text, tables, source_name(parsed))
    write_json(Path(args.out), doc)
    print(
        json.dumps(
            {
                "ok": True,
                "kind": doc.get("statement_kind"),
                "transactions": len(doc.get("transactions") or []),
                "account": doc.get("account_number"),
            }
        )
    )


def cmd_extract_mpesa(args: argparse.Namespace) -> None:
    parsed = Path(args.parsed_dir)
    text = load_layout(parsed)
    tables = load_tables(parsed)
    doc = extract_mpesa_doc(text, tables, source_name(parsed))
    write_json(Path(args.out), doc)
    print(json.dumps({"ok": True, "transactions": len(doc.get("transactions") or []), "msisdn": doc.get("msisdn")}))


def cmd_extract_invoice(args: argparse.Namespace) -> None:
    parsed = Path(args.parsed_dir)
    text = load_layout(parsed)
    tables = load_tables(parsed)
    source = source_name(parsed)

    items: list[dict[str, Any]] = []
    for row in tables:
        cells = [c for c in row if c]
        if len(cells) < 2:
            continue
        joined = " ".join(cells).lower()
        if re.search(r"description|qty|quantity|unit|amount|item", joined) and not MONEY_RE.search(" ".join(cells)):
            continue
        amounts = [money(x) for x in MONEY_RE.findall(" ".join(cells))]
        amounts = [a for a in amounts if a is not None]
        if not amounts:
            continue
        qty = None
        for c in cells:
            if re.fullmatch(r"\d+(?:\.0+)?", c):
                qty = float(c)
                break
        desc = " ".join(
            c
            for c in cells
            if not re.fullmatch(r"[\d,.$-]+", c) and not MONEY_RE.fullmatch(c.replace(" ", ""))
        )
        if re.search(r"subtotal|tax|total|balance", desc, re.I):
            continue
        items.append(
            {
                "description": desc or " ".join(cells),
                "qty": qty,
                "unit_price": amounts[0] if len(amounts) > 1 else None,
                "amount": amounts[-1],
            }
        )

    if not items:
        for line in text.splitlines():
            s = line.strip()
            amounts = [money(x) for x in MONEY_RE.findall(s)]
            amounts = [a for a in amounts if a is not None]
            if len(amounts) < 1:
                continue
            if not re.search(r"\s{2,}", s) and len(amounts) < 2:
                continue
            if re.search(r"subtotal|tax|total|amount due|balance", s, re.I):
                continue
            desc = MONEY_RE.sub("", s)
            desc = re.sub(r"\s{2,}", " ", desc).strip()
            if len(desc) < 3:
                continue
            qty_m = re.search(r"\b(\d+(?:\.\d+)?)\b", desc)
            items.append(
                {
                    "description": desc,
                    "qty": float(qty_m.group(1)) if qty_m else None,
                    "unit_price": amounts[0] if len(amounts) > 1 else None,
                    "amount": amounts[-1],
                }
            )

    lines = [ln.strip() for ln in text.splitlines() if ln.strip() and not ln.startswith("----- page")]
    vendor = None
    for ln in lines[:8]:
        if re.search(r"invoice|receipt|statement|bill to|page\s+\d", ln, re.I):
            continue
        vendor = ln
        break

    kind = "receipt" if re.search(r"\breceipt\b", text[:1500], re.I) and not re.search(r"\binvoice\b", text[:800], re.I) else "invoice"
    doc = {
        "file": source,
        "doc_type": kind,
        "vendor": vendor,
        "vendor_address": None,
        "customer": None,
        "invoice_number": first_match(INVOICE_NO_RE, text),
        "invoice_date": None,
        "due_date": None,
        "currency": detect_currency(text) or ("USD" if "$" in text[:2000] else None),
        "subtotal": money(first_match(SUBTOTAL_RE, text) or ""),
        "tax": money(first_match(TAX_RE, text) or ""),
        "total": money(first_match(TOTAL_RE, text) or ""),
        "line_items": items[:200],
    }
    dm = re.search(r"(?:invoice\s+date|date|issued)\s*[:.]?\s*(%s)" % DATE_RE.pattern, text, re.I)
    if dm:
        doc["invoice_date"] = dm.group(1)
    elif DATE_RE.search(text):
        doc["invoice_date"] = DATE_RE.search(text).group(1)
    due = re.search(r"(?:due\s+date|payment\s+due)\s*[:.]?\s*(%s)" % DATE_RE.pattern, text, re.I)
    if due:
        doc["due_date"] = due.group(1)
    bill = re.search(r"(?:bill\s+to|sold\s+to|customer)\s*[:.]?\s*(.+)", text, re.I)
    if bill:
        doc["customer"] = bill.group(1).strip()[:120]

    write_json(Path(args.out), doc)
    print(json.dumps({"ok": True, "type": kind, "invoice_number": doc["invoice_number"], "items": len(items)}))


def slug_key(label: str) -> str:
    s = re.sub(r"[^a-z0-9]+", "_", label.lower()).strip("_")
    return s[:48] or "field"


def extract_entities(text: str, query: str = "") -> dict[str, Any]:
    emails = sorted(set(EMAIL_RE.findall(text)))
    phones = sorted(set(PHONE_RE.findall(text) + MSISDN_RE.findall(text)))
    urls = sorted(set(URL_RE.findall(text)))[:40]
    dates = []
    for m in DATE_RE.finditer(text):
        dates.append(m.group(1))
        if len(dates) >= 40:
            break
    amounts = []
    for m in MONEY_RE.finditer(text):
        v = money(m.group(0))
        if v is not None:
            amounts.append({"raw": m.group(0).strip(), "value": v})
        if len(amounts) >= 80:
            break
    ibans = sorted(set(IBAN_RE.findall(text)))
    pins = sorted(set(KRA_PIN_RE.findall(text)))
    receipts = sorted(set(MPESA_RECEIPT_RE.findall(text)))[:80]
    kvs: dict[str, str] = {}
    for line in text.splitlines():
        m = KV_RE.match(line.strip())
        if not m:
            continue
        label, value = m.group(1).strip(), m.group(2).strip()
        if len(value) < 1 or len(value) > 200:
            continue
        if re.search(r"page \d", label, re.I):
            continue
        kvs[slug_key(label)] = value[:200]
        if len(kvs) >= 80:
            break
    terms = [t for t in re.findall(r"[a-z0-9]{3,}", query.lower())] if query else []
    matched_lines: list[str] = []
    if terms:
        for line in text.splitlines():
            blob = line.lower()
            if sum(1 for t in terms if t in blob) >= max(1, min(2, len(terms))):
                s = line.strip()
                if s and not s.startswith("----- page"):
                    matched_lines.append(s)
            if len(matched_lines) >= 40:
                break
    return {
        "emails": emails[:40],
        "phones": phones[:40],
        "urls": urls,
        "dates": list(dict.fromkeys(dates)),
        "amounts": amounts[:80],
        "ibans": ibans,
        "kra_pins": pins,
        "mpesa_receipts": receipts,
        "fields": kvs,
        "matched_lines": matched_lines,
    }


def fill_schema(schema: Any, entities: dict[str, Any], text: str) -> Any:
    if isinstance(schema, dict):
        out: dict[str, Any] = {}
        for k, v in schema.items():
            key = slug_key(str(k))
            if isinstance(v, (dict, list)):
                out[k] = fill_schema(v, entities, text)
                continue
            fields: dict[str, str] = entities.get("fields") or {}
            if key in fields:
                out[k] = fields[key]
                continue
            # fuzzy label in text
            rx = re.compile(rf"{re.escape(str(k).replace('_', ' '))}\s*[:\-]\s*(.+)", re.I)
            m = rx.search(text)
            if m:
                out[k] = m.group(1).strip()[:200]
            elif v not in ("", None, "string", "number", "null"):
                out[k] = v
            else:
                out[k] = None
        return out
    if isinstance(schema, list):
        if not schema:
            return []
        sample = schema[0]
        if isinstance(sample, dict):
            # one-shot fill from first matching table-ish lines is handled by LLM; locally return entities as rows
            return [fill_schema(sample, entities, text)]
        return schema
    return schema


def cmd_extract_anything(args: argparse.Namespace) -> None:
    parsed = Path(args.parsed_dir)
    text = load_layout(parsed)
    tables = load_tables(parsed)
    query = getattr(args, "query", "") or ""
    schema_raw = ""
    if getattr(args, "schema", None) and Path(args.schema).exists():
        schema_raw = Path(args.schema).read_text(encoding="utf-8")
    schema_obj: Any = None
    if schema_raw.strip():
        try:
            schema_obj = json.loads(schema_raw)
        except Exception:
            schema_obj = {"instruction": schema_raw.strip()}
    entities = extract_entities(text, query)
    filled = fill_schema(schema_obj, entities, text) if schema_obj is not None else None
    kind = "generic"
    if looks_like_mpesa(text):
        kind = "mpesa"
    elif re.search(r"\binvoice\b|\breceipt\b", text[:2000], re.I):
        kind = "invoice"
    elif re.search(r"\bstatement\b|\bopening balance\b", text[:2500], re.I):
        kind = "bank"
    doc = {
        "file": source_name(parsed),
        "detected_kind": kind,
        "query": query or None,
        "schema_applied": bool(schema_obj),
        "fields": filled if filled is not None else entities.get("fields"),
        "entities": entities,
        "table_row_count": len(tables),
        "sample_tables": tables[:8],
        "mpesa": extract_mpesa_doc(text, tables, source_name(parsed)) if kind == "mpesa" else None,
        "preview": re.sub(r"\s+", " ", text).strip()[:1500],
    }
    write_json(Path(args.out), doc)
    print(
        json.dumps(
            {
                "ok": True,
                "kind": kind,
                "emails": len(entities["emails"]),
                "fields": len(doc["fields"] or {}) if isinstance(doc["fields"], dict) else 0,
            }
        )
    )


def tokenize(q: str) -> list[str]:
    return [t for t in re.findall(r"[a-z0-9]{2,}", q.lower()) if t not in {"the", "and", "for", "pdf", "with", "that", "this"}]


def cmd_retrieve(args: argparse.Namespace) -> None:
    parsed = Path(args.parsed_dir)
    index_path = parsed / "index.json"
    if not index_path.exists():
        raise RuntimeError("No index.json — parse the PDF first")
    index = json.loads(index_path.read_text(encoding="utf-8"))
    terms = tokenize(args.query)
    if not terms:
        raise RuntimeError("Query is empty")
    scored: list[tuple[float, dict[str, Any], str]] = []
    chunks_dir = parsed / "chunks"
    for ch in index.get("chunks") or []:
        path = chunks_dir / ch["file"]
        if not path.exists():
            continue
        preview = (ch.get("preview") or "").lower()
        pre_score = sum(preview.count(t) for t in terms)
        text = None
        if pre_score > 0 or len(index.get("chunks") or []) <= 400:
            text = path.read_text(encoding="utf-8", errors="replace")
            blob = text.lower()
            score = 0.0
            for t in terms:
                c = blob.count(t)
                if c:
                    score += 1.0 + min(c, 8) * 0.25
            q = args.query.lower().strip()
            if len(q) > 4 and q in blob:
                score += 5
        else:
            score = float(pre_score)
            text = ch.get("preview") or ""
        if score > 0:
            scored.append((score, ch, text or ""))
    scored.sort(key=lambda x: x[0], reverse=True)
    topk = max(1, min(int(args.topk), 16))
    hits = []
    for score, ch, text in scored[:topk]:
        hits.append(
            {
                "id": ch.get("id"),
                "pages": ch.get("pages"),
                "score": round(score, 3),
                "file": ch.get("file"),
                "text": text[:2500],
            }
        )
    result = {"query": args.query, "hits": hits, "searched": len(index.get("chunks") or [])}
    write_json(Path(args.out), result)
    print(json.dumps({"ok": True, "hits": len(hits)}))


def cmd_summarize_local(args: argparse.Namespace) -> None:
    parsed = Path(args.parsed_dir)
    md = (parsed / "markdown.md").read_text(encoding="utf-8", errors="replace") if (parsed / "markdown.md").exists() else load_layout(parsed)
    headings = [ln.strip("# ").strip() for ln in md.splitlines() if ln.startswith("#") or (ln.isupper() and 4 < len(ln) < 80)]
    sentences = re.split(r"(?<=[.!?])\s+", re.sub(r"\s+", " ", md))
    picked = []
    for s in sentences:
        if 40 < len(s) < 280:
            picked.append(s.strip())
        if len(picked) >= 12:
            break
    lines = ["# Summary (local extractive)", ""]
    if headings:
        lines += ["## Outline", ""] + [f"- {h}" for h in headings[:20]] + [""]
    lines += ["## Key sentences", ""] + [f"- {s}" for s in picked[:12]]
    Path(args.out).write_text("\n".join(lines).strip() + "\n", encoding="utf-8")
    print(json.dumps({"ok": True, "headings": len(headings), "sentences": len(picked)}))


def cmd_forms_list(args: argparse.Namespace) -> None:
    try:
        from pypdf import PdfReader
    except Exception as exc:
        raise RuntimeError("pypdf is not installed. pip install pypdf") from exc
    reader = PdfReader(args.inp)
    fields = reader.get_fields() or {}
    out = []
    for name, spec in fields.items():
        val = spec.get("/V")
        if hasattr(val, "get_object"):
            val = str(val.get_object())
        out.append(
            {
                "name": name,
                "value": None if val is None else str(val),
                "type": str(spec.get("/FT") or ""),
                "flags": spec.get("/Ff"),
            }
        )
    write_json(Path(args.out), {"fields": out, "count": len(out), "encrypted": bool(reader.is_encrypted)})
    print(json.dumps({"ok": True, "count": len(out)}))


def cmd_forms_fill(args: argparse.Namespace) -> None:
    try:
        from pypdf import PdfReader, PdfWriter
    except Exception as exc:
        raise RuntimeError("pypdf is not installed. pip install pypdf") from exc
    values = json.loads(Path(args.values).read_text(encoding="utf-8"))
    if not isinstance(values, dict):
        raise RuntimeError("values JSON must be an object of fieldName -> value")
    reader = PdfReader(args.inp)
    writer = PdfWriter()
    writer.append(reader)
    if reader.get_fields():
        for page in writer.pages:
            try:
                writer.update_page_form_field_values(page, values)
            except Exception:
                pass
    if args.flatten:
        for page in writer.pages:
            try:
                page.transfer_rotation_to_content()
            except Exception:
                pass
        try:
            writer._root_object.pop("/AcroForm", None)  # noqa: SLF001 — flatten by dropping form dict
        except Exception:
            pass
    with open(args.out, "wb") as f:
        writer.write(f)
    print(json.dumps({"ok": True, "filled": list(values.keys())[:50]}))


def cmd_engines(_: argparse.Namespace) -> None:
    print(json.dumps(detect_engines()))


def main() -> None:
    p = argparse.ArgumentParser(prog="extract.py")
    sub = p.add_subparsers(dest="cmd", required=True)

    s = sub.add_parser("parse")
    s.add_argument("--inp", required=True)
    s.add_argument("--out-dir", required=True)
    s.add_argument("--pages", default="")
    s.add_argument("--entire", action="store_true")
    s.add_argument("--engine", default="auto", choices=["auto", "pymupdf", "markitdown", "pdftotext", "docling"])
    s.add_argument("--lang", default="eng")

    s = sub.add_parser("extract-bank")
    s.add_argument("--parsed-dir", required=True)
    s.add_argument("--out", required=True)

    s = sub.add_parser("extract-mpesa")
    s.add_argument("--parsed-dir", required=True)
    s.add_argument("--out", required=True)

    s = sub.add_parser("extract-invoice")
    s.add_argument("--parsed-dir", required=True)
    s.add_argument("--out", required=True)

    s = sub.add_parser("extract-anything")
    s.add_argument("--parsed-dir", required=True)
    s.add_argument("--out", required=True)
    s.add_argument("--query", default="")
    s.add_argument("--schema", default="")

    s = sub.add_parser("retrieve")
    s.add_argument("--parsed-dir", required=True)
    s.add_argument("--query", required=True)
    s.add_argument("--out", required=True)
    s.add_argument("--topk", default="8")

    s = sub.add_parser("summarize-local")
    s.add_argument("--parsed-dir", required=True)
    s.add_argument("--out", required=True)

    s = sub.add_parser("forms-list")
    s.add_argument("--inp", required=True)
    s.add_argument("--out", required=True)

    s = sub.add_parser("forms-fill")
    s.add_argument("--inp", required=True)
    s.add_argument("--out", required=True)
    s.add_argument("--values", required=True)
    s.add_argument("--flatten", action="store_true")

    sub.add_parser("engines")

    args = p.parse_args()
    {
        "parse": cmd_parse,
        "extract-bank": cmd_extract_bank,
        "extract-mpesa": cmd_extract_mpesa,
        "extract-invoice": cmd_extract_invoice,
        "extract-anything": cmd_extract_anything,
        "retrieve": cmd_retrieve,
        "summarize-local": cmd_summarize_local,
        "forms-list": cmd_forms_list,
        "forms-fill": cmd_forms_fill,
        "engines": cmd_engines,
    }[args.cmd](args)


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:  # noqa: BLE001
        print(str(exc), file=sys.stderr)
        sys.exit(1)
