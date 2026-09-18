; One-click NSIS extras for i hate pdf.
; Keep this file quiet: no extra pages, no option maze.

!macro customInstall
  FileOpen $0 "$INSTDIR\PDF-ENGINE-TOOLS.txt" w
  FileWrite $0 "i hate pdf looks for qpdf and Poppler in:$\r$\n"
  FileWrite $0 "  1) bundled resources\bin\win-x64$\r$\n"
  FileWrite $0 "  2) %LOCALAPPDATA%\ihate-pdf\bin$\r$\n"
  FileWrite $0 "  3) PATH$\r$\n"
  FileWrite $0 "$\r$\n"
  FileWrite $0 "If a tool is missing, run scripts\install-pending.ps1$\r$\n"
  FileWrite $0 "(or Settings → Install missing tools).$\r$\n"
  FileWrite $0 "https://github.com/imodoiepale/ihate-pdf$\r$\n"
  FileClose $0
!macroend
