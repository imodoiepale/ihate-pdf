import { resolve } from 'node:path'
import { defineConfig } from 'vite'

export default defineConfig({
  resolve: {
    alias: {
      '@shared': resolve('src/shared')
    }
  },
  build: {
    ssr: true,
    sourcemap: false,
    minify: false,
    emptyOutDir: true,
    outDir: 'out/engine',
    target: 'node22',
    rollupOptions: {
      input: resolve('src/main/engine.ts'),
      output: {
        format: 'cjs',
        entryFileNames: 'index.cjs',
        inlineDynamicImports: true
      },
      external: ['electron']
    }
  }
})
