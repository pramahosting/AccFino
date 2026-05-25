import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    hmr: {
      timeout:  60000,   // prevent HMR dying during slow navigation
      overlay:  false,   // don't show overlay errors — use error boundary instead
    },
    proxy: {
      // /api/* → FastAPI :8001 (strips /api prefix, matches existing behaviour)
      '/api': {
        target:       'http://127.0.0.1:8001',
        changeOrigin: true,
        rewrite:      path => path.replace(/^\/api/, ''),
        timeout:      60000,
        proxyTimeout: 60000,
      },

      // Marketing page is served by Vite directly from public/index-marketing.html
      // No proxy needed — Vite serves public/ files natively at their path.
    }
  }
})