#!/usr/bin/env bash
# Install PDF engine tools used by i hate pdf. Does not claim they live inside the Electron app.
# Required for merge/split/compress: qpdf (Apache-2.0)
# Required for analyze/images: Poppler (pdftotext, pdftoppm, pdfimages)
# Optional: ghostscript, libreoffice, tesseract-ocr, python3 + PyMuPDF
set -euo pipefail

have() { command -v "$1" >/dev/null 2>&1; }

install_python_extract() {
  if have python3; then
    echo "Python extract extras (PyMuPDF, pdfplumber)…"
    python3 -m pip install --user -q -r "$(cd "$(dirname "$0")/.." && pwd)/resources/requirements-extract.txt" \
      || echo "pip install skipped (venv or pip missing). Analyze still works with Poppler pdftotext."
  fi
}

if have apt-get && have sudo; then
  sudo apt-get update
  sudo apt-get install -y qpdf poppler-utils python3 python3-pip
  echo "Optional (convert / OCR / PDF/A): sudo apt-get install -y ghostscript libreoffice-nogui tesseract-ocr python3-img2pdf imagemagick"
elif have dnf && have sudo; then
  sudo dnf install -y qpdf poppler-utils python3 python3-pip
  echo "Optional: sudo dnf install -y ghostscript libreoffice tesseract"
elif have pacman && have sudo; then
  sudo pacman -Sy --needed --noconfirm qpdf poppler python python-pip
elif have brew; then
  brew install qpdf poppler python
  echo "Optional: brew install ghostscript tesseract imagemagick"
  echo "LibreOffice: https://www.libreoffice.org/"
elif [[ "$(uname -s)" == Darwin* ]]; then
  echo "Install Homebrew from https://brew.sh then re-run this script (brew install qpdf poppler)." >&2
  exit 1
else
  echo "No known package manager. Install qpdf and poppler-utils from your distro, then re-run." >&2
  exit 1
fi

install_python_extract

echo
echo "qpdf:      $(command -v qpdf || echo MISSING)"
echo "pdftotext: $(command -v pdftotext || echo MISSING)"
echo "python3:   $(command -v python3 || echo MISSING)"
echo "Done."
