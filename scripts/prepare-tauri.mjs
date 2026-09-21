#!/usr/bin/env node
/**
 * Stage engine JS, Python workers, and a platform Node runtime for the Tauri bundle.
 */
import { chmodSync, cpSync, existsSync, mkdirSync, rmSync, createWriteStream } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const root = dirname(fileURLToPath(new URL('../package.json', import.meta.url)))
const destRoot = join(root, 'src-tauri', 'resources')
const engineSrc = join(root, 'out', 'engine', 'index.cjs')
const nodeVersion = (process.env.IHATEPDF_NODE_VERSION || process.versions.node || '22.14.0').replace(/^v/, '')

function stageDir(name) {
  const dir = join(destRoot, name)
  mkdirSync(dir, { recursive: true })
  return dir
}

async function download(url, dest) {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`download ${url} failed: ${res.status}`)
  await pipeline(Readable.fromWeb(res.body), createWriteStream(dest))
}

function nodeSpec() {
  const arch = process.env.IHATEPDF_NODE_ARCH || process.arch
  const platform = process.env.IHATEPDF_NODE_PLATFORM || process.platform
  if (platform === 'win32') {
    const a = arch === 'arm64' ? 'arm64' : 'x64'
    return {
      url: `https://nodejs.org/dist/v${nodeVersion}/node-v${nodeVersion}-win-${a}.zip`,
      archive: 'zip',
      binRel: 'node.exe',
      destName: 'node.exe'
    }
  }
  if (platform === 'darwin') {
    const a = arch === 'x64' ? 'x64' : 'arm64'
    return {
      url: `https://nodejs.org/dist/v${nodeVersion}/node-v${nodeVersion}-darwin-${a}.tar.gz`,
      archive: 'tar.gz',
      binRel: join('bin', 'node'),
      destName: 'node'
    }
  }
  const a = arch === 'arm64' ? 'arm64' : 'x64'
  return {
    url: `https://nodejs.org/dist/v${nodeVersion}/node-v${nodeVersion}-linux-${a}.tar.xz`,
    archive: 'tar.xz',
    binRel: join('bin', 'node'),
    destName: 'node'
  }
}

async function stageNode() {
  const skip = process.argv.includes('--skip-node')
  const nodeDir = stageDir('node')
  const spec = nodeSpec()
  const destBin = join(nodeDir, spec.destName)
  if (skip) {
    console.log('skipping node runtime download')
    return
  }
  if (existsSync(destBin) && !process.argv.includes('--refresh-node')) {
    console.log(`node runtime already at ${destBin}`)
    return
  }
  const scratch = join(tmpdir(), `ihate-pdf-node-${Date.now()}`)
  mkdirSync(scratch, { recursive: true })
  const archivePath = join(scratch, `node.${spec.archive}`)
  console.log(`downloading ${spec.url}`)
  await download(spec.url, archivePath)
  const extractDir = join(scratch, 'extract')
  mkdirSync(extractDir, { recursive: true })
  if (spec.archive === 'zip') {
    const unzip = spawnSync('tar', ['-xf', archivePath, '-C', extractDir], { stdio: 'inherit' })
    if (unzip.status !== 0) throw new Error('failed to unzip node')
  } else {
    const tar = spawnSync('tar', ['-xf', archivePath, '-C', extractDir, '--strip-components=1'], {
      stdio: 'inherit'
    })
    if (tar.status !== 0) throw new Error('failed to extract node')
  }
  let found = join(extractDir, spec.binRel)
  if (!existsSync(found)) {
    // zip extracts into node-vX-win-x64/node.exe
    const inner = spawnSync('bash', ['-lc', `find ${JSON.stringify(extractDir)} -name ${JSON.stringify(spec.destName)} | head -n 1`], {
      encoding: 'utf8'
    })
    found = (inner.stdout || '').trim()
  }
  if (!found || !existsSync(found)) throw new Error(`node binary not found after extract (${spec.binRel})`)
  mkdirSync(nodeDir, { recursive: true })
  cpSync(found, destBin)
  if (process.platform !== 'win32') chmodSync(destBin, 0o755)
  rmSync(scratch, { recursive: true, force: true })
  console.log(`staged node runtime → ${destBin}`)
}

function stageEngine() {
  if (!existsSync(engineSrc)) {
    throw new Error(`missing ${engineSrc} — run npm run build:engine first`)
  }
  const dir = stageDir('engine')
  cpSync(engineSrc, join(dir, 'index.cjs'))
  console.log('staged engine JS')
}

function stagePdfTools() {
  const dir = stageDir('pdf-tools')
  for (const name of ['worker.py', 'extract.py', 'requirements-extract.txt']) {
    cpSync(join(root, 'resources', name), join(dir, name))
  }
  const binSrc = join(root, 'resources', 'bin')
  if (existsSync(binSrc)) cpSync(binSrc, join(dir, 'bin'), { recursive: true })
  const mcpSrc = join(root, 'mcp')
  if (existsSync(mcpSrc)) cpSync(mcpSrc, join(dir, 'mcp'), { recursive: true })
  const scriptsDir = join(dir, 'scripts')
  mkdirSync(scriptsDir, { recursive: true })
  for (const name of [
    'install-pending.sh',
    'install-pending.ps1',
    'install-deps.sh',
    'install-deps.ps1',
    'install.sh',
    'install.ps1'
  ]) {
    const src = join(root, 'scripts', name)
    if (existsSync(src)) cpSync(src, join(scriptsDir, name))
  }
  console.log('staged pdf-tools (python workers + pending installer)')
}

async function main() {
  mkdirSync(destRoot, { recursive: true })
  stageEngine()
  stagePdfTools()
  await stageNode()
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
