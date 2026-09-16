#!/usr/bin/env python3
"""Disk-backed PDF analysis: fast text+layout parse, tables, chunks, local extractors.

Priority order (never faked):
  1. Microsoft MarkItDown — ~2s markdown for born-digital PDFs (pdfminer, no GPU)
  2. Poppler pdftotext -layout — page-windowed, works on huge files
  3. pdfplumber tables when installed
  4. Tesseract OCR for scans with almost no text layer
  5. Docling if the user installed it (optional, heavier)

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


def which(name: str) -> str | None:
    return shutil.which(name)


def run(cmd: list[str], timeout: int = 120) -> str:
    p = subprocess.run(cmd, capture_output=True, text=True, timeout=timeout)
    if p.returncode != 0:
        err = (p.stderr or p.stdout or "").strip()
        raise RuntimeError(f"{' '.join(cmd[:3])} failed: {err[:800]}")
    return p.stdout


def page_count(pdf: str) -> int:
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
    raise RuntimeError("Neither pdfinfo nor qpdf is installed. Install poppler-utils and qpdf.")


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
    mods = {}
    for m in ("markitdown", "pdfplumber", "pypdf", "docling"):
        try:
            __import__(m)
            mods[m] = True
        except Exception:
            mods[m] = False
    return {
        "pdftotext": bool(which("pdftotext")),
        "pdfimages": bool(which("pdfimages")),
        "tesseract": bool(which("tesseract")),
        "pdfinfo": bool(which("pdfinfo")),
        **mods,
        "defaultParser": "markitdown"
        if mods.get("markitdown")
        else "pdftotext"
        if which("pdftotext")
        else "none",
    }


def pdftotext_window(pdf: str, first: int, last: int) -> str:
    bin_ = which("pdftotext")
    if not bin_:
        raise RuntimeError("pdftotext is not installed. Linux: sudo apt install poppler-utils")
    # stdout, layout, form-feed between pages
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
                    out.append({"page": i, "index": ti, "rows": table})
                if i > max(want):
                    break
    except Exception:
        return out
    return out


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
            # Oversized page: split by paragraphs so we never keep a giant string as one chunk.
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
    used_ocr = False
    md_text = None
    parser = "pdftotext"

    # Fast 2s-class path: MarkItDown on modest born-digital files.
    if (
        not args.pages
        and not truncated
        and n <= MARKITDOWN_PAGES
        and size <= MARKITDOWN_BYTES
        and (args.engine in ("auto", "markitdown"))
    ):
        md_text = try_markitdown(pdf)
        if md_text:
            parser = "markitdown"

    # Always take page-accurate layout text (streaming windows). Needed for
    # retrieval, bank/invoice line parsing, and huge-file safety.
    if not which("pdftotext"):
        raise RuntimeError("pdftotext is not installed. Linux: sudo apt install poppler-utils")

    i = 0
    while i < len(pages):
        window = pages[i : i + PAGE_WINDOW]
        first, last = window[0], window[-1]
        # Only use a contiguous pdftotext range when the window is contiguous.
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

    emptyish = sum(1 for p in pages if len(re.sub(r"\s+", "", page_map.get(p, ""))) < 40)
    if emptyish >= max(1, int(len(pages) * 0.7)) and which("tesseract") and which("pdftoppm"):
        used_ocr = True
        parser = parser + "+ocr" if parser != "pdftotext" else "tesseract"
        tmp = out / "ocr-tmp"
        tmp.mkdir(exist_ok=True)
        for pno in pages[:OCR_PAGE_CAP]:
            text = ocr_page(pdf, pno, tmp, args.lang or "eng")
            if text.strip():
                page_map[pno] = text
        shutil.rmtree(tmp, ignore_errors=True)

    for pno, text in page_map.items():
        (pages_dir / f"{pno:05d}.txt").write_text(text, encoding="utf-8")

    # Concatenated layout (capped) for local regex extractors.
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
        # Lightweight markdown from layout headings.
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

    tables: list[dict[str, Any]] = []
    if args.engine != "pdftotext":
        tables = try_pdfplumber_tables(pdf, pages)
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
    r"|(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+\d{1,2},?\s+\d{4}"
    r")\b",
    re.I,
)
MONEY_RE = re.compile(r"(?<![\w.])(-?\$?\d{1,3}(?:,\d{3})*\.\d{2}|-?\$?\d+\.\d{2})(?![\w.])")
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
OPEN_RE = re.compile(r"\bopening\s+balance\b[:\s]*\$?([\d,]+\.\d{2})", re.I)
CLOSE_RE = re.compile(r"\bclosing\s+balance\b[:\s]*\$?([\d,]+\.\d{2})", re.I)


def money(s: str | None) -> float | None:
    if not s:
        return None
    neg = s.strip().startswith("(") or s.strip().startswith("-")
    n = re.sub(r"[^\d.]", "", s)
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
    return m.group(1).strip() if m else None


def cmd_extract_bank(args: argparse.Namespace) -> None:
    parsed = Path(args.parsed_dir)
    text = load_layout(parsed)
    tables = load_tables(parsed)
    source = ""
    meta_path = parsed / "meta.json"
    if meta_path.exists():
        try:
            source = json.loads(meta_path.read_text(encoding="utf-8")).get("source") or ""
        except Exception:
            source = ""

    txns: list[dict[str, Any]] = []
    # Prefer table rows that look like transactions.
    for row in tables:
        cells = [c for c in row if c]
        if len(cells) < 2:
            continue
        joined = " ".join(cells)
        dm = DATE_RE.search(joined)
        amounts = [money(x) for x in MONEY_RE.findall(joined)]
        amounts = [a for a in amounts if a is not None]
        if not dm or not amounts:
            continue
        desc_parts = []
        for c in cells:
            if DATE_RE.fullmatch(c) or MONEY_RE.fullmatch(c.replace(" ", "")):
                continue
            if re.fullmatch(r"[\d,.$-]+", c):
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
        txns.append(
            {
                "date": dm.group(1),
                "description": " ".join(desc_parts).strip() or joined,
                "debit": debit,
                "credit": credit,
                "amount": amt,
                "balance": bal,
            }
        )

    if not txns:
        for line in text.splitlines():
            s = line.strip()
            if not s:
                continue
            dm = DATE_RE.search(s)
            amounts = [money(x) for x in MONEY_RE.findall(s)]
            amounts = [a for a in amounts if a is not None]
            if not dm or not amounts:
                continue
            if re.search(r"opening|closing|balance brought|page\s+\d", s, re.I) and len(amounts) == 1:
                continue
            desc = DATE_RE.sub("", s)
            desc = MONEY_RE.sub("", desc)
            desc = re.sub(r"\s{2,}", " ", desc).strip(" -|\t")
            amt = amounts[0]
            bal = amounts[-1] if len(amounts) > 1 else None
            debit = abs(amt) if amt < 0 else None
            credit = amt if amt > 0 and (bal is None or len(amounts) == 1 or amt != bal) else (amt if amt > 0 else None)
            if len(amounts) >= 2 and amounts[0] >= 0 and amounts[-1] >= 0 and amounts[0] != amounts[-1]:
                # date desc debit/credit balance
                if len(amounts) == 2:
                    amt = amounts[0]
                    bal = amounts[1]
                    if amt > bal:
                        debit = amt
                        credit = None
                    else:
                        credit = amt
                        debit = None
            txns.append(
                {
                    "date": dm.group(1),
                    "description": desc or s,
                    "debit": debit,
                    "credit": credit,
                    "amount": amt,
                    "balance": bal,
                }
            )

    # Dedupe near-identical lines
    seen: set[str] = set()
    uniq = []
    for t in txns:
        key = f"{t['date']}|{t['description']}|{t['amount']}|{t['balance']}"
        if key in seen:
            continue
        seen.add(key)
        uniq.append(t)

    header = text[:2500]
    doc = {
        "file": Path(source).name if source else parsed.name,
        "institution": None,
        "account_name": None,
        "account_number": first_match(ACCOUNT_RE, text),
        "routing_number": first_match(re.compile(r"\brouting\s*(?:number|no\.?|#)?\s*[:#]?\s*(\d{9})\b", re.I), text),
        "iban": first_match(IBAN_RE, text),
        "period_start": None,
        "period_end": None,
        "opening_balance": money(first_match(OPEN_RE, text) or ""),
        "closing_balance": money(first_match(CLOSE_RE, text) or ""),
        "currency": "USD" if "$" in header else None,
        "transactions": uniq,
    }
    per = re.search(
        r"(?:statement\s+period|period)\s*[:.]?\s*(%s)\s*(?:to|-|–)\s*(%s)" % (DATE_RE.pattern, DATE_RE.pattern),
        text,
        re.I,
    )
    if per:
        doc["period_start"] = per.group(1)
        doc["period_end"] = per.group(2)
    lines = [ln.strip() for ln in text.splitlines() if ln.strip()]
    if lines:
        doc["institution"] = re.sub(r"^----- page \d+ -----", "", lines[0]).strip() or (lines[1] if len(lines) > 1 else None)

    write_json(Path(args.out), doc)
    print(json.dumps({"ok": True, "transactions": len(uniq), "account": doc["account_number"]}))


def cmd_extract_invoice(args: argparse.Namespace) -> None:
    parsed = Path(args.parsed_dir)
    text = load_layout(parsed)
    tables = load_tables(parsed)
    source = ""
    meta_path = parsed / "meta.json"
    if meta_path.exists():
        try:
            source = json.loads(meta_path.read_text(encoding="utf-8")).get("source") or ""
        except Exception:
            source = ""

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
        "file": Path(source).name if source else parsed.name,
        "doc_type": kind,
        "vendor": vendor,
        "vendor_address": None,
        "customer": None,
        "invoice_number": first_match(INVOICE_NO_RE, text),
        "invoice_date": None,
        "due_date": None,
        "currency": "USD" if "$" in text[:2000] else None,
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
        # Score using preview first; read full chunk only if it looks relevant or list is short.
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
            # phrase bonus
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
    s.add_argument("--engine", default="auto", choices=["auto", "markitdown", "pdftotext", "docling"])
    s.add_argument("--lang", default="eng")

    s = sub.add_parser("extract-bank")
    s.add_argument("--parsed-dir", required=True)
    s.add_argument("--out", required=True)

    s = sub.add_parser("extract-invoice")
    s.add_argument("--parsed-dir", required=True)
    s.add_argument("--out", required=True)

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
        "extract-invoice": cmd_extract_invoice,
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
