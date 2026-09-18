/**
 * Node-only engine entry used by the Tauri shell (and `npm run engine`).
 * Serves the same HTTP API as the Electron main process on 127.0.0.1:43128.
 */
import { startApiServer } from './api'
import { extraPath, refreshToolPath } from './run'

process.title = 'ihate-pdf-engine'
refreshToolPath()
process.env.PATH = extraPath()

startApiServer().catch((err) => {
  console.error(err)
  process.exit(1)
})
