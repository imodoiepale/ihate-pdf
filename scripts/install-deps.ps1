# Back-compat wrapper: install-deps now runs the pending-requirements installer.
# Default is vendor-only. Pass -Full for LibreOffice/tesseract/ghostscript.
param(
  [string]$Prefix = $(if ($env:IHATEPDF_VENDOR_ROOT) { $env:IHATEPDF_VENDOR_ROOT } else { Join-Path $env:LOCALAPPDATA "ihate-pdf" }),
  [switch]$VendorOnly,
  [switch]$Full,
  [switch]$DryRun
)
$pending = Join-Path $PSScriptRoot "install-pending.ps1"
& $pending -Prefix $Prefix -VendorOnly:$VendorOnly -Full:$Full -DryRun:$DryRun
exit $LASTEXITCODE
