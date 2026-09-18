import { chmodSync, cpSync, createWriteStream, existsSync, lstatSync, mkdirSync, readdirSync, readlinkSync, symlinkSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { homedir, tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { resourceFile, userVendorBinDir, userVendorLibDir, vendorPlatformKey } from './resources'
import { refreshToolPath, whichSync } from './run'

async function download(url: string, dest: string): Promise<void> {
  const headers: Record<string, string> = { 'User-Agent': 'ihate-pdf-vendor' }
  const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN
  if (token) headers.Authorization = `Bearer ${token}`
  const res = await fetch(url, { headers })
  if (!res.ok || !res.body) throw new Error(`download ${url} failed: ${res.status}`)
  mkdirSync(dirname(dest), { recursive: true })
  await pipeline(Readable.fromWeb(res.body as never), createWriteStream(dest))
}

async function githubLatestAsset(repo: string, match: RegExp): Promise<{ name: string; url: string }> {
  const headers: Record<string, string> = {
    Accept: 'application/vnd.github+json',
    'User-Agent': 'ihate-pdf-vendor'
  }
  const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN
  if (token) headers.Authorization = `Bearer ${token}`
  const res = await fetch(`https://api.github.com/repos/${repo}/releases/latest`, { headers })
  if (!res.ok) throw new Error(`GitHub ${repo} latest release: ${res.status}`)
  const rel = (await res.json()) as { assets?: Array<{ name: string; browser_download_url: string }> }
  const asset = (rel.assets || []).find((a) => match.test(a.name))
  if (!asset) throw new Error(`No ${repo} asset matching ${match}`)
  return { name: asset.name, url: asset.browser_download_url }
}

function extractZip(zip: string, dest: string): void {
  mkdirSync(dest, { recursive: true })
  if (process.platform === 'win32') {
    const ps = spawnSync(
      'powershell',
      [
        '-NoProfile',
        '-Command',
        `Expand-Archive -LiteralPath ${JSON.stringify(zip)} -DestinationPath ${JSON.stringify(dest)} -Force`
      ],
      { encoding: 'utf8' }
    )
    if (ps.status !== 0) throw new Error(ps.stderr || ps.stdout || 'Expand-Archive failed')
    return
  }
  const unzip = spawnSync('unzip', ['-o', '-q', zip, '-d', dest], { encoding: 'utf8' })
  if (unzip.status !== 0) {
    const py = spawnSync(
      'python3',
      ['-c', 'import sys,zipfile; zipfile.ZipFile(sys.argv[1]).extractall(sys.argv[2])', zip, dest],
      { encoding: 'utf8' }
    )
    if (py.status !== 0) throw new Error(unzip.stderr || py.stderr || 'unzip failed')
  }
}

function copyFoundBins(stage: string, names: string[]): string[] {
  const bin = userVendorBinDir()
  const lib = userVendorLibDir()
  mkdirSync(bin, { recursive: true })
  mkdirSync(lib, { recursive: true })
  const copied: string[] = []
  const walk = (dir: string, depth = 0): void => {
    if (depth > 8) return
    let entries: string[] = []
    try {
      entries = readdirSync(dir)
    } catch {
      return
    }
    for (const name of entries) {
      const p = join(dir, name)
      let st
      try {
        st = lstatSync(p)
      } catch {
        continue
      }
      if (st.isDirectory()) {
        if (name === 'bin' || name === 'lib' || name === 'Library' || depth < 5) walk(p, depth + 1)
        continue
      }
      const base = name.replace(/\.exe$/i, '')
      if (names.includes(base) || names.includes(name)) {
        const dest = join(bin, name)
        cpSync(p, dest)
        copied.push(dest)
        if (process.platform !== 'win32') {
          try {
            chmodSync(dest, 0o755)
          } catch {
            /* ignore */
          }
        }
        continue
      }
      if (/\.(so|dylib)(\.|$)/i.test(name) || /\.dll$/i.test(name)) {
        const dest = join(lib, name)
        if (st.isSymbolicLink()) {
          try {
            symlinkSync(readlinkSync(p), dest)
          } catch {
            cpSync(p, dest)
          }
        } else {
          cpSync(p, dest)
        }
      }
    }
  }
  walk(stage)
  return copied
}

async function vendorQpdf(): Promise<void> {
  if (whichSync('qpdf')) return
  const plat = vendorPlatformKey()
  let match = /bin-linux-x86_64\.zip$/
  if (plat.startsWith('win')) match = /msvc64\.zip$|mingw64\.zip$/
  else if (plat.startsWith('mac')) {
    throw new Error('qpdf macOS builds come from Homebrew (brew install qpdf).')
  } else if (plat === 'linux-arm64') {
    throw new Error('No official qpdf linux-arm64 zip; install with the system package manager.')
  }
  const asset = await githubLatestAsset('qpdf/qpdf', match)
  const scratch = join(tmpdir(), `ihate-pdf-qpdf-${Date.now()}`)
  mkdirSync(scratch, { recursive: true })
  const zip = join(scratch, asset.name)
  await download(asset.url, zip)
  const stage = join(scratch, 'ex')
  extractZip(zip, stage)
  copyFoundBins(stage, ['qpdf', 'fix-qdf', 'zlib-flate'])
  const libSrc = join(stage, 'lib')
  if (existsSync(libSrc)) {
    mkdirSync(userVendorLibDir(), { recursive: true })
    for (const name of readdirSync(libSrc)) {
      cpSync(join(libSrc, name), join(userVendorLibDir(), name))
    }
  }
}

async function vendorPopplerWindows(): Promise<void> {
  if (whichSync('pdftotext')) return
  if (process.platform !== 'win32') return
  const asset = await githubLatestAsset('oschwartz10612/poppler-windows', /Release-.*\.zip$/)
  const scratch = join(tmpdir(), `ihate-pdf-poppler-${Date.now()}`)
  mkdirSync(scratch, { recursive: true })
  const zip = join(scratch, asset.name)
  await download(asset.url, zip)
  const stage = join(scratch, 'ex')
  extractZip(zip, stage)
  copyFoundBins(stage, ['pdftotext', 'pdfinfo', 'pdftoppm', 'pdfimages', 'pdftocairo'])
}

/**
 * Download Apache-2.0 qpdf (and Windows Poppler) into the user vendor dir.
 * GPL Poppler on Unix is installed by the pending script (apt/brew extract), not shipped in extraResources.
 */
export async function ensureVendorTools(): Promise<{ skipped: boolean; message: string }> {
  refreshToolPath()
  const haveQpdf = Boolean(whichSync('qpdf'))
  const havePoppler = Boolean(whichSync('pdftotext'))
  if (haveQpdf && havePoppler) {
    return { skipped: true, message: 'qpdf and pdftotext already on PATH / vendor dir' }
  }
  const notes: string[] = []
  try {
    if (!whichSync('qpdf')) {
      await vendorQpdf()
      notes.push('qpdf vendor download')
    }
  } catch (e) {
    notes.push(`qpdf vendor skipped: ${e instanceof Error ? e.message : String(e)}`)
  }
  try {
    if (!whichSync('pdftotext') && process.platform === 'win32') {
      await vendorPopplerWindows()
      notes.push('poppler vendor download')
    }
  } catch (e) {
    notes.push(`poppler vendor skipped: ${e instanceof Error ? e.message : String(e)}`)
  }
  refreshToolPath()
  return {
    skipped: false,
    message: notes.join('; ') || 'vendor ensure finished'
  }
}

export function requirementsExtractPath(): string {
  return resourceFile('requirements-extract.txt')
}

export function vendorHomeHint(): string {
  return userVendorBinDir().replace(homedir(), '~')
}
