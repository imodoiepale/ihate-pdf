#!/usr/bin/env node
/**
 * Copy Tauri bundle outputs to dist-tauri/ with stable names:
 * ihate-pdf-<version>-tauri-<os>-<arch>.<ext>
 */
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = dirname(fileURLToPath(new URL('../package.json', import.meta.url)))
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
const version = pkg.version || '1.1.0'
const bundle = join(root, 'src-tauri', 'target', 'release', 'bundle')
const out = join(root, 'dist-tauri')
mkdirSync(out, { recursive: true })

function walk(dir, acc = []) {
  if (!existsSync(dir)) return acc
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    const st = statSync(p)
    if (st.isDirectory()) walk(p, acc)
    else acc.push(p)
  }
  return acc
}

function classify(file) {
  const base = file.replace(/\\/g, '/')
  const lower = base.toLowerCase()
  if (lower.endsWith('.blockmap')) return null
  if (lower.includes('/nsis/') && lower.endsWith('.exe')) return `ihate-pdf-${version}-tauri-win-x64-setup.exe`
  if (lower.includes('/msi/') && lower.endsWith('.msi')) return `ihate-pdf-${version}-tauri-win-x64.msi`
  if (lower.endsWith('.dmg')) {
    const arch = lower.includes('aarch64') || lower.includes('arm64') ? 'arm64' : lower.includes('x64') || lower.includes('x86_64') ? 'x64' : 'mac'
    return `ihate-pdf-${version}-tauri-mac-${arch}.dmg`
  }
  if (lower.endsWith('.appimage')) return `ihate-pdf-${version}-tauri-linux-x86_64.AppImage`
  if (lower.endsWith('.deb')) return `ihate-pdf-${version}-tauri-linux-amd64.deb`
  if (lower.endsWith('.rpm')) return `ihate-pdf-${version}-tauri-linux-x86_64.rpm`
  return null
}

const files = walk(bundle)
let n = 0
for (const file of files) {
  const name = classify(file)
  if (!name) continue
  const dest = join(out, name)
  cpSync(file, dest)
  console.log(`${file} → ${dest}`)
  n += 1
}
if (!n) {
  console.error(`No Tauri bundles found under ${bundle}`)
  process.exit(1)
}
