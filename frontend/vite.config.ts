import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath, URL } from 'node:url'
import { i18nFallbackPlugin } from './src/vite-plugins/i18nFallbackPlugin'

export default defineConfig({
  plugins: [i18nFallbackPlugin(), react()],
  resolve: {
    alias: {
      '@compat': fileURLToPath(new URL('./src/compat', import.meta.url)),
    },
  },
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
    proxy: {
      '/api': 'http://localhost:8080'
    }
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  }
})
