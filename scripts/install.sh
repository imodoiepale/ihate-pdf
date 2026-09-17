#!/usr/bin/env bash
# Download the latest i hate pdf GitHub Release for this OS and install it.
# Linux: AppImage → ~/.local/bin/ihate-pdf
# macOS: opens the DMG (drag to Applications)
# Windows: use scripts/install.ps1
set -euo pipefail

REPO="${IHATEPDF_REPO:-imodoiepale/ihate-pdf}"
API="https://api.github.com/repos/${REPO}/releases/latest"
PREFIX="${IHATEPDF_PREFIX:-$HOME/.local}"
BIN_DIR="${PREFIX}/bin"

need() {
  command -v "$1" >/dev/null 2>&1 || {
    echo "Need $1 on PATH." >&2
    exit 1
  }
}

need curl
need uname

os="$(uname -s)"
case "$os" in
  Linux*) pattern='AppImage' ;;
  Darwin*) pattern='dmg' ;;
  MINGW*|MSYS*|CYGWIN*)
    echo "On Windows run: powershell -ExecutionPolicy Bypass -File scripts/install.ps1" >&2
    exit 1
    ;;
  *)
    echo "Unsupported OS: $os" >&2
    exit 1
    ;;
esac

auth=()
if [[ -n "${GITHUB_TOKEN:-}${GH_TOKEN:-}" ]]; then
  auth=(-H "Authorization: Bearer ${GITHUB_TOKEN:-$GH_TOKEN}")
fi

json="$(curl -fsSL "${auth[@]}" -H 'Accept: application/vnd.github+json' "$API" || true)"
if [[ -z "$json" || "$json" == *"Not Found"* || "$json" == *"Bad credentials"* ]]; then
  echo "No GitHub Release found at $API" >&2
  echo "Build locally: npm run dist" >&2
  echo "Or open https://github.com/${REPO}/releases" >&2
  exit 1
fi

url="$(printf '%s' "$json" | python3 -c "
import json, sys, re
rel = json.load(sys.stdin)
pat = sys.argv[1].lower()
assets = rel.get('assets') or []
for a in assets:
    name = (a.get('name') or '').lower()
    if pat in name:
        print(a['browser_download_url'])
        sys.exit(0)
print('', end='')
" "$pattern")"

if [[ -z "$url" ]]; then
  echo "Latest release has no *$pattern asset." >&2
  echo "See https://github.com/${REPO}/releases" >&2
  exit 1
fi

tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
file="$tmp/$(basename "${url%%\?*}")"
echo "Downloading $url"
curl -fL --progress-bar -o "$file" "$url"

if [[ "$os" == Darwin* ]]; then
  keep="$HOME/Downloads/$(basename "$file")"
  cp "$file" "$keep"
  echo "Opening DMG. Drag “i hate pdf” into Applications."
  echo "Copied to $keep"
  open "$keep"
  exit 0
fi

mkdir -p "$BIN_DIR"
dest="$BIN_DIR/ihate-pdf"
install -m 0755 "$file" "$dest"
echo "Installed AppImage to $dest"
echo "Run: ihate-pdf"
if [[ ":$PATH:" != *":$BIN_DIR:"* ]]; then
  echo "Add $BIN_DIR to PATH if the command is not found."
fi
echo
echo "PDF engines (qpdf, Poppler) are NOT inside this AppImage."
echo "Install them with: $(cd "$(dirname "$0")" && pwd)/install-deps.sh"
