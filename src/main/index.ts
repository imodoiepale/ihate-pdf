import { app, BrowserWindow, shell } from 'electron'
import { join } from 'node:path'
import { startApiServer } from './api'
import { extraPath } from './run'
import { RENDERER_PORT } from '@shared/types'

process.env.PATH = extraPath()

app.commandLine.appendSwitch('no-sandbox')
app.commandLine.appendSwitch('disable-gpu-sandbox')
app.commandLine.appendSwitch('disable-dev-shm-usage')

const API_ONLY = process.argv.includes('--api-only')

async function createWindow(): Promise<void> {
  const win = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 760,
    minHeight: 600,
    backgroundColor: '#ffffff',
    title: 'IHATE PDF',
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
    console.log(`IHATE PDF API on http://127.0.0.1:43128 (renderer http://127.0.0.1:${RENDERER_PORT})`)
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
