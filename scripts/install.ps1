# Download the latest Windows NSIS installer from GitHub Releases and run it (one-click).
# Usage: powershell -ExecutionPolicy Bypass -File scripts/install.ps1
[CmdletBinding()]
param(
  [string]$Repo = $(if ($env:IHATEPDF_REPO) { $env:IHATEPDF_REPO } else { "imodoiepale/ihate-pdf" }),
  [switch]$Portable,
  [switch]$InstallTools
)

$ErrorActionPreference = "Stop"
$api = "https://api.github.com/repos/$Repo/releases/latest"
$headers = @{ "Accept" = "application/vnd.github+json"; "User-Agent" = "ihate-pdf-install" }
if ($env:GITHUB_TOKEN) { $headers["Authorization"] = "Bearer $($env:GITHUB_TOKEN)" }
elseif ($env:GH_TOKEN) { $headers["Authorization"] = "Bearer $($env:GH_TOKEN)" }

try {
  $rel = Invoke-RestMethod -Uri $api -Headers $headers
} catch {
  Write-Error "No GitHub Release at $api. Build on Windows with npm run dist:win or open https://github.com/$Repo/releases"
}

$needle = if ($Portable) { "portable.exe" } else { "setup.exe" }
$asset = $rel.assets | Where-Object { $_.name -match [regex]::Escape($needle) } | Select-Object -First 1
if (-not $asset) {
  $asset = $rel.assets | Where-Object { $_.name -like "*.exe" } | Select-Object -First 1
}
if (-not $asset) {
  Write-Error "Latest release has no Windows .exe. See https://github.com/$Repo/releases"
}

$destDir = Join-Path $env:TEMP "ihate-pdf-setup"
New-Item -ItemType Directory -Force -Path $destDir | Out-Null
$dest = Join-Path $destDir $asset.name
Write-Host "Downloading $($asset.browser_download_url)"
Invoke-WebRequest -Uri $asset.browser_download_url -OutFile $dest -UseBasicParsing

if ($Portable) {
  $bin = Join-Path $env:LOCALAPPDATA "ihate-pdf"
  New-Item -ItemType Directory -Force -Path $bin | Out-Null
  $exe = Join-Path $bin "ihate-pdf-portable.exe"
  Copy-Item $dest $exe -Force
  Write-Host "Portable exe: $exe"
  Start-Process $exe
} else {
  Write-Host "Starting one-click NSIS installer…"
  $p = Start-Process -FilePath $dest -ArgumentList "/S" -Wait -PassThru
  if ($p.ExitCode -ne 0) {
    Write-Host "Silent install returned $($p.ExitCode); opening the installer UI."
    Start-Process -FilePath $dest -Wait
  }
}

if ($InstallTools) {
  $deps = Join-Path $PSScriptRoot "install-pending.ps1"
  if (Test-Path $deps) {
    Write-Host "Downloading qpdf / Poppler into %LOCALAPPDATA%\ihate-pdf\bin…"
    & $deps
  }
} else {
  Write-Host "Done. First launch downloads qpdf + Poppler in the background."
}
