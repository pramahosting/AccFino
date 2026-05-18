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
      '/api': {
        target:       'http://127.0.0.1:8001',
        changeOrigin: true,
        rewrite:      path => path.replace(/^\/api/, ''),
        timeout:      60000,
        proxyTimeout: 60000,
      }
    }
  }
})
