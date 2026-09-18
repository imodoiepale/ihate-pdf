# i hate pdf — install only missing PDF engine tools (idempotent, non-interactive).
# Detects: qpdf, poppler (pdftotext/pdfinfo/pdftoppm/pdfimages), python3, pymupdf,
# pdfplumber, pypdf, ghostscript, img2pdf, tesseract, libreoffice, zip.
#
# Official qpdf (Apache-2.0) and Poppler Windows builds download into
# %LOCALAPPDATA%\ihate-pdf\bin — the app prepends this to PATH (no terminal restart).
[CmdletBinding()]
param(
  [string]$Prefix = $(if ($env:IHATEPDF_VENDOR_ROOT) { $env:IHATEPDF_VENDOR_ROOT } else { Join-Path $env:LOCALAPPDATA "ihate-pdf" }),
  [switch]$VendorOnly,
  [switch]$DryRun
)

$ErrorActionPreference = "Continue"
$bin = if ($env:IHATEPDF_VENDOR_BIN) { $env:IHATEPDF_VENDOR_BIN } else { Join-Path $Prefix "bin" }
New-Item -ItemType Directory -Force -Path $bin | Out-Null
$headers = @{ "Accept" = "application/vnd.github+json"; "User-Agent" = "ihate-pdf-install-pending" }
if ($env:GITHUB_TOKEN) { $headers["Authorization"] = "Bearer $($env:GITHUB_TOKEN)" }
elseif ($env:GH_TOKEN) { $headers["Authorization"] = "Bearer $($env:GH_TOKEN)" }

$installed = New-Object System.Collections.Generic.List[string]
$skipped = New-Object System.Collections.Generic.List[string]
$failed = New-Object System.Collections.Generic.List[string]

function Resolve-Cmd {
  param([string[]]$Names)
  foreach ($n in $Names) {
    $cmd = Get-Command $n -ErrorAction SilentlyContinue
    if ($cmd) { return $cmd.Source }
    $candidate = Join-Path $bin ($n)
    if (Test-Path $candidate) { return $candidate }
    $exe = Join-Path $bin ($n + ".exe")
    if (Test-Path $exe) { return $exe }
  }
  return $null
}

function Test-PyMod {
  param([string]$Mod)
  $py = Resolve-Cmd @("python", "python3", "py")
  if (-not $py) { return $false }
  & $py -c "import $Mod" 2>$null
  return ($LASTEXITCODE -eq 0)
}

function Get-LatestAsset {
  param([string]$Repo, [string]$Match)
  $rel = Invoke-RestMethod -Uri "https://api.github.com/repos/$Repo/releases/latest" -Headers $headers
  $asset = $rel.assets | Where-Object { $_.name -match $Match } | Select-Object -First 1
  if (-not $asset) { throw "No asset matching /$Match/ in $Repo latest release." }
  return $asset
}

function Expand-ToBin {
  param([string]$Url, [string]$Name, [string[]]$ExeNames)
  $zip = Join-Path $env:TEMP $Name
  Write-Host "Downloading $Url"
  Invoke-WebRequest -Uri $Url -OutFile $zip -UseBasicParsing
  $stage = Join-Path $env:TEMP ("ihate-pdf-" + [guid]::NewGuid().ToString("n"))
  New-Item -ItemType Directory -Force -Path $stage | Out-Null
  Expand-Archive -Path $zip -DestinationPath $stage -Force
  $copied = $false
  foreach ($exe in $ExeNames) {
    $found = Get-ChildItem -Path $stage -Recurse -Filter $exe | Select-Object -First 1
    if (-not $found) { continue }
    Get-ChildItem $found.Directory -File | ForEach-Object {
      Copy-Item $_.FullName (Join-Path $bin $_.Name) -Force
    }
    $copied = $true
  }
  Remove-Item $stage -Recurse -Force -ErrorAction SilentlyContinue
  if (-not $copied) { throw "Unzipped $Name but did not find $($ExeNames -join ', ')" }
}

function Install-WingetId {
  param([string]$Id)
  $winget = Get-Command winget -ErrorAction SilentlyContinue
  if (-not $winget) { return $false }
  if ($DryRun) { Write-Host "  would winget install $Id"; return $true }
  & winget install --id $Id -e --accept-package-agreements --accept-source-agreements --disable-interactivity
  return ($LASTEXITCODE -eq 0 -or $LASTEXITCODE -eq -1978335189)
}

function Install-ChocoId {
  param([string]$Id)
  $choco = Get-Command choco -ErrorAction SilentlyContinue
  if (-not $choco) { return $false }
  if ($DryRun) { Write-Host "  would choco install $Id"; return $true }
  & choco install $Id -y --no-progress
  return ($LASTEXITCODE -eq 0)
}

Write-Host "i hate pdf — pending tools"
Write-Host "vendor dir: $bin"
Write-Host ("mode: " + $(if ($VendorOnly) { "vendor-only" } else { "full" }))
Write-Host ""

$need = @{
  qpdf        = -not (Resolve-Cmd @("qpdf"))
  pdftotext   = -not (Resolve-Cmd @("pdftotext"))
  pdfinfo     = -not (Resolve-Cmd @("pdfinfo"))
  pdftoppm    = -not (Resolve-Cmd @("pdftoppm"))
  pdfimages   = -not (Resolve-Cmd @("pdfimages"))
  python      = -not (Resolve-Cmd @("python", "python3", "py"))
  gs          = -not (Resolve-Cmd @("gswin64c", "gswin32c", "gs"))
  img2pdf     = -not ((Resolve-Cmd @("img2pdf")) -or (Test-PyMod "img2pdf"))
  tesseract   = -not (Resolve-Cmd @("tesseract"))
  soffice     = -not (Resolve-Cmd @("soffice"))
  zip         = -not (Resolve-Cmd @("zip"))
  pymupdf     = -not (Test-PyMod "fitz")
  pdfplumber  = -not (Test-PyMod "pdfplumber")
  pypdf       = -not (Test-PyMod "pypdf")
}

if (-not $VendorOnly) {
  if ($need.qpdf) {
    if (Install-WingetId "QPDF.QPDF") { $installed.Add("qpdf (winget)") } elseif (Install-ChocoId "qpdf") { $installed.Add("qpdf (choco)") }
  }
  if ($need.python) {
    if (Install-WingetId "Python.Python.3.12") { $installed.Add("python (winget)") } elseif (Install-ChocoId "python") { $installed.Add("python (choco)") }
  }
  if ($need.gs) {
    if (Install-WingetId "ArtifexSoftware.GhostScript") { $installed.Add("ghostscript (winget)") } elseif (Install-ChocoId "ghostscript") { $installed.Add("ghostscript (choco)") }
  }
  if ($need.tesseract) {
    if (Install-WingetId "UB-Mannheim.TesseractOCR") { $installed.Add("tesseract (winget)") } elseif (Install-ChocoId "tesseract") { $installed.Add("tesseract (choco)") }
  }
  if ($need.soffice) {
    if (Install-WingetId "TheDocumentFoundation.LibreOffice") { $installed.Add("libreoffice (winget)") } elseif (Install-ChocoId "libreoffice-fresh") { $installed.Add("libreoffice (choco)") }
  }
}

# Refresh
$need.qpdf = -not (Resolve-Cmd @("qpdf"))
$need.pdftotext = -not (Resolve-Cmd @("pdftotext"))
$need.python = -not (Resolve-Cmd @("python", "python3", "py"))

if ($need.qpdf) {
  try {
    if ($DryRun) { Write-Host "  would vendor qpdf" } else {
      $qpdf = Get-LatestAsset -Repo "qpdf/qpdf" -Match "msvc64\.zip$|mingw64\.zip$"
      Expand-ToBin -Url $qpdf.browser_download_url -Name $qpdf.name -ExeNames @("qpdf.exe")
    }
    $installed.Add("qpdf (vendor)")
  } catch {
    $failed.Add("qpdf")
    Write-Host "  failed: qpdf — $($_.Exception.Message)"
  }
} else {
  $skipped.Add("qpdf")
  Write-Host "  skipped:   qpdf"
}

$needPoppler = -not ((Resolve-Cmd @("pdftotext")) -and (Resolve-Cmd @("pdfinfo")) -and (Resolve-Cmd @("pdftoppm")) -and (Resolve-Cmd @("pdfimages")))
if ($needPoppler) {
  try {
    if ($DryRun) { Write-Host "  would vendor poppler" } else {
      $pop = Get-LatestAsset -Repo "oschwartz10612/poppler-windows" -Match "Release-.*\.zip$"
      Expand-ToBin -Url $pop.browser_download_url -Name $pop.name -ExeNames @("pdftotext.exe", "pdfinfo.exe", "pdftoppm.exe", "pdfimages.exe")
    }
    $installed.Add("poppler (vendor)")
  } catch {
    $failed.Add("poppler")
    Write-Host "  failed: poppler — $($_.Exception.Message)"
  }
} else {
  $skipped.Add("poppler")
  Write-Host "  skipped:   poppler"
}

if (Resolve-Cmd @("python", "python3", "py")) { $skipped.Add("python3"); Write-Host "  skipped:   python3" }
elseif ($VendorOnly) { $failed.Add("python3") }
else { $failed.Add("python3") }

$userPath = [Environment]::GetEnvironmentVariable("Path", "User")
if ($userPath -notlike "*$bin*") {
  [Environment]::SetEnvironmentVariable("Path", "$bin;$userPath", "User")
  Write-Host "Added $bin to your user PATH (the app also prepends this at launch)."
}
$env:Path = "$bin;$env:Path"

$py = Resolve-Cmd @("python", "python3", "py")
$req = Join-Path $PSScriptRoot "..\resources\requirements-extract.txt"
if (-not (Test-Path $req)) { $req = Join-Path $PSScriptRoot "..\requirements-extract.txt" }
if ($py) {
  $needPy = -not ((Test-PyMod "fitz") -and (Test-PyMod "pdfplumber") -and (Test-PyMod "pypdf"))
  $needImg = -not ((Resolve-Cmd @("img2pdf")) -or (Test-PyMod "img2pdf"))
  if ($needPy -or $needImg) {
    Write-Host "Python extract extras (PyMuPDF, pdfplumber, pypdf)…"
    $pipArgs = @("-m", "pip", "install", "--user")
    if (Test-Path $req) { $pipArgs += @("-r", $req) } else { $pipArgs += @("pymupdf", "pdfplumber", "pypdf") }
    if ($needImg) { $pipArgs += "img2pdf" }
    if (-not $DryRun) { & $py @pipArgs }
    if (Test-PyMod "fitz") { $installed.Add("pymupdf") } else { $failed.Add("pymupdf") }
    if (Test-PyMod "pdfplumber") { $installed.Add("pdfplumber") } else { $failed.Add("pdfplumber") }
    if (Test-PyMod "pypdf") { $installed.Add("pypdf") } else { $failed.Add("pypdf") }
    if ((Resolve-Cmd @("img2pdf")) -or (Test-PyMod "img2pdf")) { $installed.Add("img2pdf") }
  } else {
    $skipped.Add("pymupdf"); $skipped.Add("pdfplumber"); $skipped.Add("pypdf")
  }
}

foreach ($pair in @(
    @{ n = "ghostscript"; ok = [bool](Resolve-Cmd @("gswin64c", "gswin32c", "gs")) },
    @{ n = "tesseract"; ok = [bool](Resolve-Cmd @("tesseract")) },
    @{ n = "libreoffice"; ok = [bool](Resolve-Cmd @("soffice")) },
    @{ n = "zip"; ok = [bool](Resolve-Cmd @("zip")) }
  )) {
  if ($pair.ok) { $skipped.Add($pair.n); Write-Host "  skipped:   $($pair.n)" }
  elseif ($VendorOnly) { $skipped.Add("$($pair.n) (optional, vendor-only)") }
  else { $failed.Add($pair.n); Write-Host "  failed:    $($pair.n)" }
}

Write-Host ""
Write-Host "--- report ---"
Write-Host ("installed: " + $(if ($installed.Count) { $installed -join " " } else { "(none)" }))
Write-Host ("skipped:   " + $(if ($skipped.Count) { $skipped -join " " } else { "(none)" }))
Write-Host ("failed:    " + $(if ($failed.Count) { $failed -join " " } else { "(none)" }))
Write-Host "vendor:    $bin"
Write-Host "qpdf:      $(Resolve-Cmd @('qpdf'))"
Write-Host "pdftotext: $(Resolve-Cmd @('pdftotext'))"
Write-Host "python:    $(Resolve-Cmd @('python','python3','py'))"
Write-Host "Done."

$qpdfOk = [bool](Resolve-Cmd @("qpdf"))
$parseOk = [bool]((Resolve-Cmd @("pdftotext")) -or (Test-PyMod "fitz"))
if ($qpdfOk -and $parseOk) { exit 0 }
if ($failed.Count -gt 0) { exit 1 }
exit 0
