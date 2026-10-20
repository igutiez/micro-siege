import { defineConfig } from 'vite'

export default defineConfig({
  base: './',
  server: { host: '127.0.0.1', port: 5276, strictPort: true },
  preview: { host: '127.0.0.1', port: 5277, strictPort: true },
  build: { target: 'es2020', assetsInlineLimit: 0 },
})
