import { app, BrowserWindow, shell } from 'electron'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { startApiServer } from './api'
import { extraPath, refreshToolPath } from './run'
import { PRODUCT_NAME } from '@shared/brand'
import { RENDERER_PORT } from '@shared/types'

refreshToolPath()
process.env.PATH = extraPath()

app.setName(PRODUCT_NAME)
app.commandLine.appendSwitch('no-sandbox')
app.commandLine.appendSwitch('disable-gpu-sandbox')
app.commandLine.appendSwitch('disable-dev-shm-usage')

const API_ONLY = process.argv.includes('--api-only')

function appIcon(): string | undefined {
  const packedDir = process.resourcesPath || ''
  const packedIco = join(packedDir, 'icon.ico')
  const packedPng = join(packedDir, 'icon.png')
  if (app.isPackaged) {
    if (process.platform === 'win32' && existsSync(packedIco)) return packedIco
    if (existsSync(packedPng)) return packedPng
    if (existsSync(packedIco)) return packedIco
  }
  const devIco = join(__dirname, '../../build/icon.ico')
  const devPng = join(__dirname, '../../build/icon.png')
  if (process.platform === 'win32' && existsSync(devIco)) return devIco
  if (existsSync(devPng)) return devPng
  return existsSync(devIco) ? devIco : undefined
}

async function createWindow(): Promise<void> {
  const icon = appIcon()
  const win = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 760,
    minHeight: 600,
    backgroundColor: '#ffffff',
    title: PRODUCT_NAME,
    ...(icon ? { icon } : {}),
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  })

  win.webContents.setWindowOpenHandler((details) => {
    void shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (process.env.ELECTRON_RENDERER_URL) {
    await win.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    await win.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

async function boot(): Promise<void> {
  await startApiServer()
  if (API_ONLY) {
    console.log(`${PRODUCT_NAME} API on http://127.0.0.1:43128 (renderer http://127.0.0.1:${RENDERER_PORT})`)
    return
  }
  await createWindow()
}

app.whenReady().then(() => boot()).catch((err) => {
  console.error(err)
  process.exit(1)
})
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) void createWindow()
})
