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
    chunkSizeWarningLimit: 4096,
    rolldownOptions: {
      output: {
        codeSplitting: {
          minSize: 20_000,
          groups: [
            { name: 'vendor-react', test: /node_modules\/(react|react-dom|scheduler|zustand)\// },
            { name: 'vendor-antd', test: /node_modules\/(@ant-design|antd|rc-[^/]+)\// },
            { name: 'vendor-monaco', test: /node_modules\/(monaco-editor|@monaco-editor)\// },
            { name: 'vendor-mermaid', test: /node_modules\/(mermaid|katex|cytoscape|dagre|graphlib)\// },
            { name: 'vendor-markdown', test: /node_modules\/(react-markdown|react-syntax-highlighter|remark-gfm)\// },
            { name: 'vendor-charts', test: /node_modules\/(recharts|d3-)\// },
          ],
        },
      },
    },
  }
})
