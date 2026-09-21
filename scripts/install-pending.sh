#!/usr/bin/env bash
# i hate pdf — install missing PDF engine tools (idempotent, non-interactive).
# Default is vendor-only: official qpdf zip + Poppler into the user vendor dir.
# Pass --full to also apt/dnf/pacman/brew LibreOffice, Tesseract, Ghostscript, Python extras.
#
# Portable Apache-2.0 qpdf (and Linux Poppler via apt-get download) land in:
#   Linux:  ~/.local/share/ihate-pdf/{bin,lib}
#   macOS:  ~/Library/Application Support/ihate-pdf/{bin,lib}
#
# Usage:
#   ./scripts/install-pending.sh              # vendor-only (qpdf + poppler)
#   ./scripts/install-pending.sh --vendor-only
#   ./scripts/install-pending.sh --full       # optional desktop CLIs via the package manager
set -u

VENDOR_ONLY=1
DRY_RUN=0
for arg in "$@"; do
  case "$arg" in
    --vendor-only|-VendorOnly) VENDOR_ONLY=1 ;;
    --full) VENDOR_ONLY=0 ;;
    --dry-run) DRY_RUN=1 ;;
    -h|--help)
      echo "Usage: $0 [--vendor-only] [--full] [--dry-run]"
      echo "  Default: vendor-only (qpdf zip + Poppler). --full also installs LibreOffice/tesseract/ghostscript."
      exit 0
      ;;
  esac
done

export DEBIAN_FRONTEND=noninteractive
umask 022

OS="$(uname -s)"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

if [[ -n "${IHATEPDF_VENDOR_ROOT:-}" ]]; then
  VENDOR_ROOT="$IHATEPDF_VENDOR_ROOT"
elif [[ "$OS" == Darwin* ]]; then
  VENDOR_ROOT="$HOME/Library/Application Support/ihate-pdf"
else
  VENDOR_ROOT="$HOME/.local/share/ihate-pdf"
fi
VENDOR_BIN="${IHATEPDF_VENDOR_BIN:-$VENDOR_ROOT/bin}"
VENDOR_LIB="${IHATEPDF_VENDOR_LIB:-$VENDOR_ROOT/lib}"
LEGACY_BIN="$HOME/.ihate-pdf/bin"
LOCAL_BIN="$HOME/.local/bin"

mkdir -p "$VENDOR_BIN" "$VENDOR_LIB" "$LEGACY_BIN" "$LOCAL_BIN"

REQ=""
for candidate in \
  "$ROOT/resources/requirements-extract.txt" \
  "$SCRIPT_DIR/../resources/requirements-extract.txt" \
  "$SCRIPT_DIR/../requirements-extract.txt" \
  "$VENDOR_ROOT/requirements-extract.txt"
do
  if [[ -f "$candidate" ]]; then
    REQ="$candidate"
    break
  fi
done

INSTALLED=()
SKIPPED=()
FAILED=()

have_cmd() { command -v "$1" >/dev/null 2>&1; }

bin_ok() {
  local name="$1"
  local p
  p="$(command -v "$name" 2>/dev/null || true)"
  [[ -n "$p" && -x "$p" ]] && return 0
  [[ -x "$VENDOR_BIN/$name" ]] && return 0
  [[ -x "$LEGACY_BIN/$name" ]] && return 0
  [[ -x "$LOCAL_BIN/$name" ]] && return 0
  return 1
}

py() {
  if have_cmd python3; then echo python3
  elif have_cmd python; then echo python
  else echo python3
  fi
}

py_mod() {
  local mod="$1"
  local exe
  exe="$(py)"
  have_cmd "$exe" || return 1
  "$exe" -c "import $mod" >/dev/null 2>&1
}

note_installed() { INSTALLED+=("$1"); echo "  installed: $1"; }
note_skipped() { SKIPPED+=("$1"); echo "  skipped:   $1 (already present)"; }
note_failed() { FAILED+=("$1"); echo "  failed:    $1${2:+ — $2}" >&2; }

run_sudo() {
  if [[ "$(id -u)" -eq 0 ]]; then
    env DEBIAN_FRONTEND=noninteractive "$@"
    return $?
  fi
  have_cmd sudo || return 1
  if sudo -n true >/dev/null 2>&1; then
    sudo -n env DEBIAN_FRONTEND=noninteractive "$@"
    return $?
  fi
  if [[ -t 0 && "$VENDOR_ONLY" -eq 0 ]]; then
    sudo env DEBIAN_FRONTEND=noninteractive "$@"
    return $?
  fi
  return 1
}

link_vendor() {
  local src="$1"
  local base
  base="$(basename "$src")"
  [[ -e "$src" ]] || return 0
  ln -sfn "$src" "$LEGACY_BIN/$base" 2>/dev/null || cp -f "$src" "$LEGACY_BIN/$base" 2>/dev/null || true
  ln -sfn "$src" "$LOCAL_BIN/$base" 2>/dev/null || true
}

chmod_tree() {
  find "$VENDOR_BIN" -maxdepth 1 -type f -exec chmod a+x {} + 2>/dev/null || true
}

extract_zip() {
  local zip="$1" dest="$2"
  mkdir -p "$dest"
  if have_cmd unzip; then
    unzip -o -q "$zip" -d "$dest"
  else
    "$(py)" - "$zip" "$dest" <<'PY'
import sys, zipfile
zipfile.ZipFile(sys.argv[1]).extractall(sys.argv[2])
PY
  fi
}

github_asset() {
  local repo="$1" match="$2"
  local auth=()
  if [[ -n "${GITHUB_TOKEN:-}${GH_TOKEN:-}" ]]; then
    auth=(-H "Authorization: Bearer ${GITHUB_TOKEN:-$GH_TOKEN}")
  fi
  curl -fsSL "${auth[@]}" -H 'Accept: application/vnd.github+json' -H 'User-Agent: ihate-pdf-install-pending' \
    "https://api.github.com/repos/${repo}/releases/latest" | "$(py)" -c "
import json, re, sys
rel = json.load(sys.stdin)
pat = re.compile(sys.argv[1])
for a in rel.get('assets') or []:
    if pat.search(a.get('name') or ''):
        print(a['browser_download_url'])
        print(a['name'])
        sys.exit(0)
sys.exit(1)
" "$match"
}

copy_qpdf_layout() {
  local stage="$1"
  # Official zip is bin/qpdf + lib/libqpdf.so* with RUNPATH \$ORIGIN/../lib
  if [[ -d "$stage/bin" ]]; then
    cp -a "$stage/bin/." "$VENDOR_BIN/"
  fi
  if [[ -d "$stage/lib" ]]; then
    cp -a "$stage/lib/." "$VENDOR_LIB/"
  fi
  local found
  found="$(find "$stage" -type f -name qpdf 2>/dev/null | head -n 1 || true)"
  if [[ -n "$found" && ! -x "$VENDOR_BIN/qpdf" ]]; then
    cp -f "$found" "$VENDOR_BIN/qpdf"
    local libdir
    libdir="$(cd "$(dirname "$found")/../lib" 2>/dev/null && pwd || true)"
    if [[ -d "$libdir" ]]; then
      cp -a "$libdir/." "$VENDOR_LIB/"
    fi
  fi
  chmod_tree
  if [[ -x "$VENDOR_BIN/qpdf" ]]; then
    link_vendor "$VENDOR_BIN/qpdf"
    ln -sfn "$VENDOR_LIB" "$HOME/.ihate-pdf/lib" 2>/dev/null || true
    return 0
  fi
  return 1
}

vendor_qpdf() {
  if bin_ok qpdf; then
    note_skipped "qpdf"
    return 0
  fi
  [[ "$DRY_RUN" -eq 1 ]] && { echo "  would vendor qpdf"; return 0; }
  echo "Downloading official qpdf (Apache-2.0) into $VENDOR_BIN …"
  local arch match url name tmp
  arch="$(uname -m)"
  case "$OS-$arch" in
    Linux-x86_64|Linux-amd64) match='bin-linux-x86_64\\.zip$' ;;
    MINGW*|MSYS*|CYGWIN*|Windows*) match='msvc64\\.zip$|mingw64\\.zip$' ;;
    Darwin*)
      note_failed "qpdf" "no official mac zip; use brew install qpdf"
      return 1
      ;;
    *)
      note_failed "qpdf" "no official portable build for $OS $arch"
      return 1
      ;;
  esac
  have_cmd curl || { note_failed "qpdf" "curl is required to download vendor builds"; return 1; }
  tmp="$(mktemp -d)"
  url=""
  name=""
  if out="$(github_asset qpdf/qpdf "$match" 2>/dev/null)"; then
    url="$(printf '%s\n' "$out" | sed -n '1p')"
    name="$(printf '%s\n' "$out" | sed -n '2p')"
  elif [[ "$match" == *linux-x86_64* ]]; then
    name="qpdf-12.4.1-bin-linux-x86_64.zip"
    url="https://github.com/qpdf/qpdf/releases/download/v12.4.1/$name"
  else
    rm -rf "$tmp"
    note_failed "qpdf" "GitHub release asset not found"
    return 1
  fi
  if ! curl -fL --retry 3 -o "$tmp/$name" "$url"; then
    rm -rf "$tmp"
    note_failed "qpdf" "download failed"
    return 1
  fi
  extract_zip "$tmp/$name" "$tmp/ex"
  if copy_qpdf_layout "$tmp/ex"; then
    note_installed "qpdf (vendor $VENDOR_BIN/qpdf)"
    rm -rf "$tmp"
    return 0
  fi
  rm -rf "$tmp"
  note_failed "qpdf" "unpacked but qpdf binary missing"
  return 1
}

poppler_bins_ok() {
  bin_ok pdftotext && bin_ok pdfinfo && bin_ok pdftoppm && bin_ok pdfimages
}

copy_poppler_from_prefix() {
  local prefix="$1"
  local n
  mkdir -p "$VENDOR_BIN" "$VENDOR_LIB"
  for n in pdftotext pdfinfo pdftoppm pdfimages pdftocairo pdfunite pdftops; do
    if [[ -x "$prefix/usr/bin/$n" ]]; then
      cp -f "$prefix/usr/bin/$n" "$VENDOR_BIN/$n"
      chmod a+x "$VENDOR_BIN/$n"
      link_vendor "$VENDOR_BIN/$n"
    elif [[ -x "$prefix/bin/$n" ]]; then
      cp -f "$prefix/bin/$n" "$VENDOR_BIN/$n"
      chmod a+x "$VENDOR_BIN/$n"
      link_vendor "$VENDOR_BIN/$n"
    fi
  done
  find "$prefix" -type f \( -name 'libpoppler.so*' -o -name 'libpoppler-cpp.so*' -o -name 'libpoppler*.dylib' \) \
    -exec cp -a {} "$VENDOR_LIB/" \; 2>/dev/null || true
  find "$prefix" -type l \( -name 'libpoppler.so*' -o -name 'libpoppler-cpp.so*' \) \
    -exec cp -a {} "$VENDOR_LIB/" \; 2>/dev/null || true
  poppler_bins_ok
}

vendor_poppler_linux() {
  if poppler_bins_ok; then
    note_skipped "poppler"
    return 0
  fi
  [[ "$DRY_RUN" -eq 1 ]] && { echo "  would vendor poppler"; return 0; }
  echo "Fetching Poppler (GPL) into user vendor dir (not bundled in the app)…"
  local tmp pkg
  tmp="$(mktemp -d)"
  if have_cmd apt-get; then
    (
      cd "$tmp"
      apt-get download poppler-utils >/dev/null 2>&1 || true
      # Pull the SONAME library package listed as a dependency when possible.
      dep="$(apt-cache depends poppler-utils 2>/dev/null | awk '/Depends: libpoppler/{print $2; exit}')"
      if [[ -n "$dep" ]]; then
        apt-get download "$dep" >/dev/null 2>&1 || true
      fi
      shopt -s nullglob
      for pkg in ./*.deb; do
        have_cmd dpkg-deb && dpkg-deb -x "$pkg" "$tmp/root"
      done
    )
    if copy_poppler_from_prefix "$tmp/root"; then
      note_installed "poppler (vendor $VENDOR_BIN)"
      rm -rf "$tmp"
      return 0
    fi
  fi
  if have_cmd dnf; then
    (
      cd "$tmp"
      dnf download --destdir "$tmp" poppler-utils poppler  >/dev/null 2>&1 || true
      shopt -s nullglob
      for pkg in ./*.rpm; do
        mkdir -p "$tmp/root"
        if have_cmd rpm2cpio && have_cmd cpio; then
          rpm2cpio "$pkg" | (cd "$tmp/root" && cpio -idm >/dev/null 2>&1)
        fi
      done
    )
    if copy_poppler_from_prefix "$tmp/root"; then
      note_installed "poppler (vendor $VENDOR_BIN)"
      rm -rf "$tmp"
      return 0
    fi
  fi
  rm -rf "$tmp"
  note_failed "poppler" "could not extract a portable Poppler; install poppler-utils via apt/dnf/pacman/brew"
  return 1
}

PM=""
if have_cmd apt-get; then PM=apt
elif have_cmd dnf; then PM=dnf
elif have_cmd pacman; then PM=pacman
elif have_cmd brew; then PM=brew
fi

APT_UPDATED=0
pkg_install() {
  local pkgs=("$@")
  [[ ${#pkgs[@]} -eq 0 ]] && return 0
  [[ "$DRY_RUN" -eq 1 ]] && { echo "  would install packages: ${pkgs[*]}"; return 0; }
  case "$PM" in
    apt)
      if [[ "$APT_UPDATED" -eq 0 ]]; then
        run_sudo apt-get update -y || true
        APT_UPDATED=1
      fi
      run_sudo apt-get install -y "${pkgs[@]}"
      ;;
    dnf) run_sudo dnf install -y "${pkgs[@]}" ;;
    pacman) run_sudo pacman -Sy --needed --noconfirm "${pkgs[@]}" ;;
    brew) brew install "${pkgs[@]}" ;;
    *) return 1 ;;
  esac
}

# --- detect missing ---
NEED_QPDF=0
NEED_POPPLER=0
NEED_PYTHON=0
NEED_GS=0
NEED_IMG2PDF=0
NEED_TESSERACT=0
NEED_SOFFICE=0
NEED_ZIP=0
NEED_PYMUPDF=0
NEED_PDFPLUMBER=0
NEED_PYPDF=0

bin_ok qpdf || NEED_QPDF=1
poppler_bins_ok || NEED_POPPLER=1
bin_ok python3 || bin_ok python || NEED_PYTHON=1
bin_ok gs || NEED_GS=1
bin_ok img2pdf || NEED_IMG2PDF=1
bin_ok tesseract || NEED_TESSERACT=1
bin_ok soffice || bin_ok libreoffice || NEED_SOFFICE=1
bin_ok zip || NEED_ZIP=1
if bin_ok python3 || bin_ok python; then
  py_mod fitz || NEED_PYMUPDF=1
  py_mod pdfplumber || NEED_PDFPLUMBER=1
  py_mod pypdf || NEED_PYPDF=1
else
  NEED_PYMUPDF=1
  NEED_PDFPLUMBER=1
  NEED_PYPDF=1
fi

echo "i hate pdf — pending tools"
echo "vendor dir: $VENDOR_BIN"
echo "mode: $([[ "$VENDOR_ONLY" -eq 1 ]] && echo vendor-only || echo full)"
echo

# --- package-manager pass (skipped in --vendor-only except python if totally missing) ---
PKGS=()
if [[ "$VENDOR_ONLY" -eq 0 ]]; then
  case "$PM" in
    apt)
      [[ "$NEED_QPDF" -eq 1 ]] && PKGS+=(qpdf)
      [[ "$NEED_POPPLER" -eq 1 ]] && PKGS+=(poppler-utils)
      [[ "$NEED_PYTHON" -eq 1 ]] && PKGS+=(python3 python3-pip python3-venv)
      if [[ "$NEED_PYTHON" -eq 0 ]] && ! "$(py)" -m pip --version >/dev/null 2>&1; then
        PKGS+=(python3-pip)
      fi
      [[ "$NEED_GS" -eq 1 ]] && PKGS+=(ghostscript)
      [[ "$NEED_IMG2PDF" -eq 1 ]] && PKGS+=(python3-img2pdf)
      [[ "$NEED_TESSERACT" -eq 1 ]] && PKGS+=(tesseract-ocr)
      [[ "$NEED_SOFFICE" -eq 1 ]] && PKGS+=(libreoffice-nogui)
      [[ "$NEED_ZIP" -eq 1 ]] && PKGS+=(zip)
      ;;
    dnf)
      [[ "$NEED_QPDF" -eq 1 ]] && PKGS+=(qpdf)
      [[ "$NEED_POPPLER" -eq 1 ]] && PKGS+=(poppler-utils)
      [[ "$NEED_PYTHON" -eq 1 ]] && PKGS+=(python3 python3-pip)
      [[ "$NEED_GS" -eq 1 ]] && PKGS+=(ghostscript)
      [[ "$NEED_TESSERACT" -eq 1 ]] && PKGS+=(tesseract)
      [[ "$NEED_SOFFICE" -eq 1 ]] && PKGS+=(libreoffice)
      [[ "$NEED_ZIP" -eq 1 ]] && PKGS+=(zip)
      ;;
    pacman)
      [[ "$NEED_QPDF" -eq 1 ]] && PKGS+=(qpdf)
      [[ "$NEED_POPPLER" -eq 1 ]] && PKGS+=(poppler)
      [[ "$NEED_PYTHON" -eq 1 ]] && PKGS+=(python python-pip)
      [[ "$NEED_GS" -eq 1 ]] && PKGS+=(ghostscript)
      [[ "$NEED_TESSERACT" -eq 1 ]] && PKGS+=(tesseract)
      [[ "$NEED_SOFFICE" -eq 1 ]] && PKGS+=(libreoffice-fresh)
      [[ "$NEED_ZIP" -eq 1 ]] && PKGS+=(zip)
      ;;
    brew)
      [[ "$NEED_QPDF" -eq 1 ]] && PKGS+=(qpdf)
      [[ "$NEED_POPPLER" -eq 1 ]] && PKGS+=(poppler)
      [[ "$NEED_PYTHON" -eq 1 ]] && PKGS+=(python)
      [[ "$NEED_GS" -eq 1 ]] && PKGS+=(ghostscript)
      [[ "$NEED_IMG2PDF" -eq 1 ]] && PKGS+=(img2pdf)
      [[ "$NEED_TESSERACT" -eq 1 ]] && PKGS+=(tesseract)
      [[ "$NEED_ZIP" -eq 1 ]] && PKGS+=(zip)
      ;;
  esac

  if [[ ${#PKGS[@]} -gt 0 ]]; then
    echo "Package manager ($PM) installing: ${PKGS[*]}"
    if pkg_install "${PKGS[@]}"; then
      for p in "${PKGS[@]}"; do note_installed "$p (pkg)"; done
    else
      echo "Package manager install failed or sudo not available — falling back to vendor downloads."
      for p in "${PKGS[@]}"; do note_failed "$p (pkg)"; done
    fi
  fi
  if [[ "$NEED_SOFFICE" -eq 1 && "$PM" == brew ]]; then
    echo "LibreOffice is not a Homebrew formula here; install from https://www.libreoffice.org/"
  fi
fi

# Refresh detection after pkg install
bin_ok qpdf && NEED_QPDF=0
poppler_bins_ok && NEED_POPPLER=0
if bin_ok python3 || bin_ok python; then NEED_PYTHON=0; fi
bin_ok gs && NEED_GS=0
bin_ok img2pdf && NEED_IMG2PDF=0
bin_ok tesseract && NEED_TESSERACT=0
if bin_ok soffice || bin_ok libreoffice; then NEED_SOFFICE=0; fi
bin_ok zip && NEED_ZIP=0

# --- vendor fallbacks (no sudo) ---
if [[ "$NEED_QPDF" -eq 1 ]]; then
  vendor_qpdf || true
else
  [[ " ${INSTALLED[*]} " == *" qpdf"* ]] || note_skipped "qpdf"
fi

if [[ "$NEED_POPPLER" -eq 1 ]]; then
  if [[ "$OS" == Darwin* ]]; then
    if [[ "$PM" == brew && "$VENDOR_ONLY" -eq 1 ]]; then
      if brew install poppler; then
        note_installed "poppler (brew)"
      else
        note_failed "poppler" "brew install poppler failed"
      fi
    else
      note_failed "poppler" "install with: brew install poppler"
    fi
  else
    vendor_poppler_linux || true
  fi
else
  note_skipped "poppler"
fi

# python3 (optional unless --full)
if bin_ok python3 || bin_ok python; then
  note_skipped "python3"
elif [[ "$VENDOR_ONLY" -eq 1 ]]; then
  note_skipped "python3 (optional, vendor-only)"
else
  note_failed "python3" "install Python 3 from python.org or your package manager"
fi

# pip extras
install_pip_req() {
  local exe
  exe="$(py)"
  have_cmd "$exe" || return 1
  local args=(-m pip install --user)
  if [[ -n "$REQ" ]]; then
    args+=(-r "$REQ")
  else
    args+=(pymupdf pdfplumber pypdf)
  fi
  if [[ "$NEED_IMG2PDF" -eq 1 ]]; then
    args+=(img2pdf)
  fi
  export PYTHONUSERBASE="${PYTHONUSERBASE:-$VENDOR_ROOT}"
  if "$exe" "${args[@]}" 2>/tmp/ihate-pdf-pip.err; then
    return 0
  fi
  if "$exe" "${args[@]}" --break-system-packages 2>/tmp/ihate-pdf-pip.err; then
    return 0
  fi
  return 1
}

if [[ "$VENDOR_ONLY" -eq 0 ]] && [[ "$DRY_RUN" -eq 0 ]] && (bin_ok python3 || bin_ok python); then
  NEED_PY=0
  py_mod fitz || NEED_PY=1
  py_mod pdfplumber || NEED_PY=1
  py_mod pypdf || NEED_PY=1
  [[ "$NEED_IMG2PDF" -eq 1 ]] && NEED_PY=1
  if [[ "$NEED_PY" -eq 1 ]]; then
    echo "Python extract extras (PyMuPDF, pdfplumber, pypdf${NEED_IMG2PDF:+, img2pdf})…"
    if install_pip_req; then
      if py_mod fitz; then note_installed "pymupdf"; else note_failed "pymupdf" "pip reported success but import fitz failed"; fi
      if py_mod pdfplumber; then note_installed "pdfplumber"; else note_failed "pdfplumber"; fi
      if py_mod pypdf; then note_installed "pypdf"; else note_failed "pypdf"; fi
      if bin_ok img2pdf || py_mod img2pdf; then note_installed "img2pdf"; fi
    else
      note_failed "python-extras" "$(tr '\n' ' ' </tmp/ihate-pdf-pip.err 2>/dev/null | cut -c1-200)"
    fi
  else
    note_skipped "pymupdf"
    note_skipped "pdfplumber"
    note_skipped "pypdf"
  fi
elif [[ "$VENDOR_ONLY" -eq 1 ]]; then
  echo "  skipped:   python extras (optional, vendor-only)"
fi

if bin_ok gs; then note_skipped "ghostscript"
elif [[ "$VENDOR_ONLY" -eq 1 ]]; then note_skipped "ghostscript (optional, vendor-only)"
else note_failed "ghostscript" "sudo apt install ghostscript"
fi
if bin_ok tesseract; then note_skipped "tesseract"
elif [[ "$VENDOR_ONLY" -eq 1 ]]; then note_skipped "tesseract (optional, vendor-only)"
else note_failed "tesseract" "sudo apt install tesseract-ocr"
fi
if bin_ok soffice || bin_ok libreoffice; then note_skipped "libreoffice"
elif [[ "$VENDOR_ONLY" -eq 1 ]]; then note_skipped "libreoffice (optional, vendor-only)"
else note_failed "libreoffice" "sudo apt install libreoffice"
fi
if bin_ok zip; then note_skipped "zip"
elif [[ "$VENDOR_ONLY" -eq 1 ]]; then note_skipped "zip (optional, vendor-only)"
else note_failed "zip" "sudo apt install zip"
fi
if bin_ok img2pdf || py_mod img2pdf; then
  [[ " ${INSTALLED[*]-} " == *" img2pdf"* ]] || note_skipped "img2pdf"
fi

# Prepend vendor bin for this process (and print export for the parent)
export PATH="$VENDOR_BIN:$LEGACY_BIN:$LOCAL_BIN:$PATH"
export LD_LIBRARY_PATH="$VENDOR_LIB:${LD_LIBRARY_PATH:-}"
if [[ "$OS" == Darwin* ]]; then
  export DYLD_LIBRARY_PATH="$VENDOR_LIB:${DYLD_LIBRARY_PATH:-}"
fi

echo
echo "--- report ---"
echo "installed: ${INSTALLED[*]:-(none)}"
echo "skipped:   ${SKIPPED[*]:-(none)}"
echo "failed:    ${FAILED[*]:-(none)}"
echo "vendor:    $VENDOR_BIN"
echo "qpdf:      $(command -v qpdf 2>/dev/null || echo MISSING)"
echo "pdftotext: $(command -v pdftotext 2>/dev/null || echo MISSING)"
echo "python3:   $(command -v python3 2>/dev/null || echo MISSING)"
echo "Done."

if [[ ${#FAILED[@]} -gt 0 ]]; then
  # Still succeed if core merge/analyze tools are present.
  if bin_ok qpdf && (poppler_bins_ok || py_mod fitz); then
    exit 0
  fi
  exit 1
fi
exit 0
