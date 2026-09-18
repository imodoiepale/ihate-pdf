# Back-compat wrapper: install-deps now runs the pending-requirements installer.
param(
  [string]$Prefix = $(if ($env:IHATEPDF_VENDOR_ROOT) { $env:IHATEPDF_VENDOR_ROOT } else { Join-Path $env:LOCALAPPDATA "ihate-pdf" }),
  [switch]$VendorOnly,
  [switch]$DryRun
)
$pending = Join-Path $PSScriptRoot "install-pending.ps1"
& $pending -Prefix $Prefix -VendorOnly:$VendorOnly -DryRun:$DryRun
exit $LASTEXITCODE
