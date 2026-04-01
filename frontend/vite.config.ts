import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
  ],
  server: {
    port: 3000,
    proxy: {
      // Forward all /api requests to the Node proxy (or uvicorn on 8000).
      // Because Vite proxies server-side, the browser sees same-origin
      // requests — no CORS headers needed at all.
      '/api': {
        target: process.env.VITE_PROXY_TARGET ?? 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
})
