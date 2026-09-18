import { resolve } from 'node:path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

/** Renderer-only Vite (no Electron). Used by `npm run dev:web`, Tauri, and the :43127 preview. */
export default defineConfig({
  root: 'src/renderer',
  base: './',
  server: {
    host: '127.0.0.1',
    port: 43127,
    strictPort: true
  },
  preview: {
    host: '127.0.0.1',
    port: 43127,
    strictPort: true
  },
  resolve: {
    alias: {
      '@': resolve('src/renderer/src'),
      '@shared': resolve('src/shared')
    }
  },
  plugins: [react()]
})
