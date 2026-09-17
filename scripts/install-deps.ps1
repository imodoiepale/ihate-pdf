# Fetch official qpdf (Apache-2.0) and Poppler into %LOCALAPPDATA%\ihate-pdf\bin
# These tools are NOT inside the Electron installer; this script downloads them.
[CmdletBinding()]
param(
  [string]$Prefix = $(Join-Path $env:LOCALAPPDATA "ihate-pdf")
)

$ErrorActionPreference = "Stop"
$bin = Join-Path $Prefix "bin"
New-Item -ItemType Directory -Force -Path $bin | Out-Null
$headers = @{ "Accept" = "application/vnd.github+json"; "User-Agent" = "ihate-pdf-install-deps" }
if ($env:GITHUB_TOKEN) { $headers["Authorization"] = "Bearer $($env:GITHUB_TOKEN)" }
elseif ($env:GH_TOKEN) { $headers["Authorization"] = "Bearer $($env:GH_TOKEN)" }

function Get-LatestAsset {
  param([string]$Repo, [string]$Match)
  $rel = Invoke-RestMethod -Uri "https://api.github.com/repos/$Repo/releases/latest" -Headers $headers
  $asset = $rel.assets | Where-Object { $_.name -match $Match } | Select-Object -First 1
  if (-not $asset) { throw "No asset matching /$Match/ in $Repo latest release." }
  return $asset
}

function Expand-ToBin {
  param([string]$Url, [string]$Name, [string]$ExeName)
  $zip = Join-Path $env:TEMP $Name
  Write-Host "Downloading $Url"
  Invoke-WebRequest -Uri $Url -OutFile $zip -UseBasicParsing
  $stage = Join-Path $env:TEMP ("ihate-pdf-" + [guid]::NewGuid().ToString("n"))
  New-Item -ItemType Directory -Force -Path $stage | Out-Null
  Expand-Archive -Path $zip -DestinationPath $stage -Force
  $found = Get-ChildItem -Path $stage -Recurse -Filter $ExeName | Select-Object -First 1
  if (-not $found) { throw "Unzipped $Name but did not find $ExeName" }
  Get-ChildItem $found.Directory -File | ForEach-Object {
    Copy-Item $_.FullName (Join-Path $bin $_.Name) -Force
  }
  Remove-Item $stage -Recurse -Force -ErrorAction SilentlyContinue
}

# Prefer winget when it already knows the packages; fall back to official zips.
$winget = Get-Command winget -ErrorAction SilentlyContinue
if ($winget) {
  Write-Host "Trying winget QPDF.QPDF…"
  & winget install --id QPDF.QPDF -e --accept-package-agreements --accept-source-agreements --disable-interactivity 2>$null
}

if (-not (Get-Command qpdf -ErrorAction SilentlyContinue) -and -not (Test-Path (Join-Path $bin "qpdf.exe"))) {
  $qpdf = Get-LatestAsset -Repo "qpdf/qpdf" -Match "msvc64\.zip$|mingw64\.zip$"
  Expand-ToBin -Url $qpdf.browser_download_url -Name $qpdf.name -ExeName "qpdf.exe"
}

if (-not (Get-Command pdftotext -ErrorAction SilentlyContinue) -and -not (Test-Path (Join-Path $bin "pdftotext.exe"))) {
  $pop = Get-LatestAsset -Repo "oschwartz10612/poppler-windows" -Match "Release-.*\.zip$"
  Expand-ToBin -Url $pop.browser_download_url -Name $pop.name -ExeName "pdftotext.exe"
}

$userPath = [Environment]::GetEnvironmentVariable("Path", "User")
if ($userPath -notlike "*$bin*") {
  [Environment]::SetEnvironmentVariable("Path", "$bin;$userPath", "User")
  $env:Path = "$bin;$env:Path"
  Write-Host "Added $bin to your user PATH (new terminals pick this up)."
}

$py = Get-Command python -ErrorAction SilentlyContinue
if (-not $py) { $py = Get-Command python3 -ErrorAction SilentlyContinue }
if ($py) {
  $req = Join-Path $PSScriptRoot "..\resources\requirements-extract.txt"
  if (Test-Path $req) {
    Write-Host "Installing Python extract extras (PyMuPDF)…"
    & $py.Source -m pip install --user -q -r $req
  }
}

Write-Host ""
Write-Host "qpdf:      $(if (Test-Path (Join-Path $bin 'qpdf.exe')) { Join-Path $bin 'qpdf.exe' } else { (Get-Command qpdf -ErrorAction SilentlyContinue).Source })"
Write-Host "pdftotext: $(if (Test-Path (Join-Path $bin 'pdftotext.exe')) { Join-Path $bin 'pdftotext.exe' } else { (Get-Command pdftotext -ErrorAction SilentlyContinue).Source })"
Write-Host "Done. Ghostscript, LibreOffice, and Tesseract stay optional — install them separately if you need those tools."
