#!/usr/bin/env node
/**
 * Prove extraResources lists every install script, and that packaged lookup
 * prefers process.resourcesPath/scripts (what the EXE ships) over repo scripts/.
 */
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const root = join(dirname(fileURLToPath(import.meta.url)), '..')

function fail(msg) {
  throw new Error(msg)
}

const needed = [
  'install-pending.ps1',
  'install-pending.sh',
  'install-deps.ps1',
  'install-deps.sh',
  'install.ps1',
  'install.sh'
]

const yml = readFileSync(join(root, 'electron-builder.yml'), 'utf8')
const extra = yml.split('extraResources:')[1]?.split('\npublish:')[0] || ''
for (const name of needed) {
  const src = join(root, 'scripts', name)
  if (!existsSync(src)) fail(`source missing scripts/${name}`)
  if (!extra.includes(`from: scripts/${name}`)) fail(`electron-builder.yml extraResources missing from: scripts/${name}`)
  if (!extra.includes(`to: scripts/${name}`)) fail(`electron-builder.yml extraResources missing to: scripts/${name}`)
}

if (/oneClick:\s*false/.test(yml)) fail('NSIS must stay oneClick')
if (!/oneClick:\s*true/.test(yml)) fail('NSIS oneClick: true required')
if (!/productName:\s*i hate pdf/.test(yml)) fail('electron-builder.yml productName must be i hate pdf')
if (!/shortcutName:\s*i hate pdf/.test(yml)) fail('NSIS shortcutName must be i hate pdf')
if (/i Love PDF|LovePDF Studio/.test(yml)) fail('electron-builder.yml must not ship Love branding')
if (!extra.includes('from: build/icon.ico')) fail('extraResources must include icon.ico for BrowserWindow')
if (!extra.includes('from: build/icon.png')) fail('extraResources must include icon.png')

const brand = readFileSync(join(root, 'src/shared/brand.ts'), 'utf8')
if (!brand.includes("WORDMARK_REST = ' hate pdf'")) fail('WORDMARK_REST must be “ hate pdf”')
if (!brand.includes('WORDMARK_LEAD') || !brand.includes('PRODUCT_NAME')) fail('brand.ts must export PRODUCT_NAME')
if (/i Love PDF|LovePDF Studio/.test(brand)) fail('src/shared/brand.ts must not contain Love branding')

const wordmark = readFileSync(join(root, 'src/renderer/src/components/Wordmark.tsx'), 'utf8')
if (/Love PDF/.test(wordmark)) fail('Wordmark must not say Love PDF')
if (!wordmark.includes('WORDMARK_REST') && !wordmark.includes(' hate pdf')) {
  fail('Wordmark must render “ hate pdf”')
}

const html = readFileSync(join(root, 'src/renderer/index.html'), 'utf8')
if (!html.includes('i hate pdf')) fail('index.html title must be i hate pdf')
if (!html.includes('favicon')) fail('index.html must link a favicon')

const tauri = readFileSync(join(root, 'scripts/prepare-tauri.mjs'), 'utf8')
for (const name of needed) {
  if (!tauri.includes(`'${name}'`)) fail(`prepare-tauri.mjs does not stage ${name}`)
}

const settings = readFileSync(join(root, 'src/renderer/src/pages/SettingsPage.tsx'), 'utf8')
if (!settings.includes('Install PDF tools')) fail('Settings UI missing Install PDF tools')
if (!settings.includes('PDF tools')) fail('Settings missing PDF tools tab')

const installMain = readFileSync(join(root, 'src/main/install-tools.ts'), 'utf8')
if (!installMain.includes('windowsHide: true')) fail('spawn must hide the PowerShell window')
if (!installMain.includes('installInvocation')) fail('install-tools must use installInvocation')

let buildSync
try {
  buildSync = require('esbuild').buildSync
} catch {
  try {
    buildSync = require('vite/node_modules/esbuild').buildSync
  } catch {
    fail('esbuild is required to compile src/main/script-paths.ts for this test')
  }
}

const work = mkdtempSync(join(tmpdir(), 'ihate-pdf-scripts-'))
const outfile = join(work, 'script-paths.cjs')
buildSync({
  entryPoints: [join(root, 'src/main/script-paths.ts')],
  bundle: true,
  platform: 'node',
  format: 'cjs',
  outfile
})
const { scriptFileCandidates, installInvocation, BUNDLED_INSTALL_SCRIPTS, installScriptName } = require(outfile)

if (JSON.stringify([...BUNDLED_INSTALL_SCRIPTS].sort()) !== JSON.stringify([...needed].sort())) {
  fail(`BUNDLED_INSTALL_SCRIPTS mismatch: ${BUNDLED_INSTALL_SCRIPTS}`)
}

const packagedRoot = join(work, 'i hate pdf')
const resourcesPath = join(packagedRoot, 'resources')
const packedScripts = join(resourcesPath, 'scripts')
mkdirSync(packedScripts, { recursive: true })
writeFileSync(join(resourcesPath, 'app.asar'), 'asar-stub')
for (const name of needed) {
  cpSync(join(root, 'scripts', name), join(packedScripts, name))
}

const decoyCwd = join(work, 'source-checkout')
mkdirSync(join(decoyCwd, 'scripts'), { recursive: true })
writeFileSync(join(decoyCwd, 'scripts', 'install-pending.ps1'), '# decoy from repo path — must not win when packaged\n')

const winName = installScriptName('win32')
const unixName = installScriptName('linux')
if (winName !== 'install-pending.ps1') fail(`win script ${winName}`)
if (unixName !== 'install-pending.sh') fail(`unix script ${unixName}`)

const packedWin = join(packedScripts, winName)
const cands = scriptFileCandidates({
  name: winName,
  resourcesPath,
  cwd: decoyCwd,
  packaged: true,
  appPath: join(resourcesPath, 'app.asar')
})
if (cands[0] !== packedWin) {
  fail(`packaged first candidate should be extraResources path\n  got: ${cands[0]}\n  want: ${packedWin}`)
}
if (
  cands.includes(join(decoyCwd, 'scripts', winName)) &&
  cands.indexOf(join(decoyCwd, 'scripts', winName)) < cands.indexOf(packedWin)
) {
  fail('packaged lookup must not prefer cwd/scripts over resources/scripts')
}
if (!existsSync(cands[0])) fail(`packaged script missing at ${cands[0]}`)

const inv = installInvocation({
  platform: 'win32',
  script: cands[0],
  vendorOnly: true,
  systemRoot: 'C:\\Windows'
})
if (!inv.command.endsWith('powershell.exe')) fail(`expected powershell.exe, got ${inv.command}`)
if (!inv.command.includes('WindowsPowerShell')) fail(`expected System32 WindowsPowerShell path, got ${inv.command}`)
const argv = inv.argv.join(' ')
if (!argv.includes('-NoProfile') || !argv.includes('-ExecutionPolicy') || !argv.includes('Bypass') || !argv.includes('-File')) {
  fail(`Windows argv missing silent -File flags: ${argv}`)
}
if (inv.argv[inv.argv.indexOf('-File') + 1] !== packedWin) {
  fail(`-File must be the bundled extraResources path, got ${inv.argv}`)
}
if (!inv.argv.includes('-VendorOnly')) fail('default install must pass -VendorOnly, not -Full')
if (inv.argv.includes('-Full')) fail('default must not pass -Full')

const fullInv = installInvocation({ platform: 'win32', script: packedWin, vendorOnly: false, systemRoot: 'C:\\Windows' })
if (!fullInv.argv.includes('-Full')) fail('--full should pass -Full')

const shPath = join(packedScripts, unixName)
const shInv = installInvocation({ platform: 'linux', script: shPath, vendorOnly: true })
if (shInv.command !== 'bash') fail(`unix command ${shInv.command}`)
if (shInv.argv[0] !== shPath) fail(`bash should -c file ${shInv.argv}`)
if (!shInv.argv.includes('--vendor-only')) fail('unix default must be --vendor-only')

const devCands = scriptFileCandidates({
  name: unixName,
  resourcesPath: '/not/packaged',
  cwd: root,
  packaged: false
})
const repoSh = join(root, 'scripts', unixName)
if (devCands[0] !== repoSh) fail(`dev lookup should prefer repo scripts/, got ${devCands[0]}`)

const ci = readFileSync(join(root, '.github/workflows/release.yml'), 'utf8')
if (!ci.includes('dist:win')) fail('release.yml should still pack Windows via dist:win (electron-builder.yml extraResources)')

rmSync(work, { recursive: true, force: true })
console.log('packaged scripts: extraResources lists all install .ps1/.sh')
console.log(`UI/main would call: ${inv.command} ${inv.argv.join(' ')}`)
console.log('brand: i hate pdf')
console.log('packaged scripts: ok')
