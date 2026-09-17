; One-click NSIS extras for i hate pdf.
; Keep this file quiet: no extra pages, no option maze.
; qpdf / Poppler are not inside this installer — see README and scripts/install-deps.ps1.

!macro customInstall
  ; Write a short post-install note next to the app so it is honest about system tools.
  FileOpen $0 "$INSTDIR\PDF-ENGINE-TOOLS.txt" w
  FileWrite $0 "i hate pdf ships the desktop app only.$\r$\n"
  FileWrite $0 "It does not bundle qpdf, Poppler, Ghostscript, LibreOffice, or Tesseract.$\r$\n"
  FileWrite $0 "$\r$\n"
  FileWrite $0 "Merge / split / compress need qpdf (Apache-2.0).$\r$\n"
  FileWrite $0 "Analyze / images need Poppler (pdftotext, pdftoppm, pdfimages).$\r$\n"
  FileWrite $0 "$\r$\n"
  FileWrite $0 "One-click: run scripts\install-deps.ps1 from the GitHub repo$\r$\n"
  FileWrite $0 "https://github.com/imodoiepale/ihate-pdf$\r$\n"
  FileWrite $0 "or: winget install QPDF.QPDF$\r$\n"
  FileClose $0
!macroend
