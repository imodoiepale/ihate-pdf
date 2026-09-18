# Vendor CLI binaries for i hate pdf

Layout (optional bundled Apache-2.0 **qpdf** only — do not commit GPL Poppler here):

```
resources/bin/
  img2pdf                 # tiny MIT wrapper: python3 -m img2pdf
  linux-x64/bin/qpdf
  linux-x64/lib/libqpdf.so*
  win-x64/qpdf.exe
  mac-arm64/bin/qpdf
  mac-x64/bin/qpdf
```

qpdf official zips use `bin/` + `lib/` with `RUNPATH=$ORIGIN/../lib`. Keep that layout so the binary runs without extra env.

**Poppler** (`pdftotext`, `pdfinfo`, `pdftoppm`, `pdfimages`) is GPL. This MIT app does not ship those binaries in extraResources. `scripts/install-pending.sh` / `.ps1` download them on first run into the user vendor dir:

- Linux: `~/.local/share/ihate-pdf/bin`
- Windows: `%LOCALAPPDATA%\ihate-pdf\bin`
- macOS: `~/Library/Application Support/ihate-pdf/bin`

The engine prepends: bundled `resources/bin/{platform}` → vendor dir → system PATH.
