# NOTICE

**i hate pdf** application source is licensed under the MIT License. See [LICENSE](LICENSE).

This file lists third-party software that **i hate pdf** uses, vendors on first run, or may call as optional tools. Those components remain under their own licenses. Names of other products and companies belong to their owners.

Last updated: 21 September 2026.

---

## qpdf

- Project: [qpdf](https://github.com/qpdf/qpdf)
- License: Apache License 2.0
- Use: merge, split, rotate, organize, compress (lossless path), repair
- Distribution: official binaries may be bundled under `resources/bin/` and/or downloaded on first run into the user vendor directory (`%LOCALAPPDATA%\ihate-pdf\bin` on Windows; `~/.local/share/ihate-pdf/bin` on Linux; `~/Library/Application Support/ihate-pdf/bin` on macOS)

---

## Poppler

- Project: [Poppler](https://poppler.freedesktop.org/) (`pdftotext`, `pdfinfo`, `pdftoppm`, `pdfimages`)
- License: GNU GPL (GPL-2.0-or-later)
- Use: text extraction and raster helpers, especially for large files
- Distribution: **separate binaries**, not compiled into the MIT-licensed application. This project does not ship Poppler inside `resources/bin`. First run (and **Settings → PDF tools → Install PDF tools**, which runs the bundled `install-pending.ps1` / `install-pending.sh`) downloads Poppler into the user vendor directory above.

---

## Electron

- Project: [Electron](https://github.com/electron/electron)
- License: MIT License
- Use: Windows / macOS / Linux desktop shell
- Notes: Electron redistributes Chromium and Node.js under their own notices. See Electron’s `LICENSE` and `LICENSES.chromium.html` in an Electron install.

A Tauri shell is also available; Tauri is Apache-2.0 / MIT.

---

## Extract and parse libraries

Optional Python packages (see `resources/requirements-extract.txt`). Installed by the user or the optional tool installer, not statically linked into the MIT app binary.

| Package | Typical license | Role |
| --- | --- | --- |
| [PyMuPDF](https://github.com/pymupdf/PyMuPDF) | AGPL-3.0 | Default local parse / Analyze PDF |
| [MarkItDown](https://github.com/microsoft/markitdown) | MIT | Markdown conversion |
| [pdfplumber](https://github.com/jsvine/pdfplumber) | MIT | Bank / M-PESA tables |
| [pypdf](https://github.com/py-pdf/pypdf) | BSD-3-Clause | PDF form fields |

Other optional extract-related tools you may install yourself (not bundled with the MIT app by default) include Extractous, Tesseract (Apache-2.0), OCRmyPDF, and similar libraries listed in the README parser table. Use each project’s license file for the copy that you install.

---

## Other optional CLIs

These are not required for the default vendor-only first-run path (qpdf + Poppler):

| Tool | Typical license | Role |
| --- | --- | --- |
| Ghostscript | AGPL | Lossy compress, PDF/A rewrite |
| LibreOffice | MPL-2.0 | Office ↔ PDF |
| img2pdf | LGPL-3.0 | Images / scans → PDF |
| Tesseract | Apache-2.0 | OCR |

---

## Application UI libraries

The desktop UI uses React and related npm packages (MIT and other licenses as declared in each package). See `package.json` / `package-lock.json` for versions.
