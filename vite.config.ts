import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  build: {
    rollupOptions: {
      input: {
        main: path.resolve(__dirname, 'index.html'),
      },
    },
  },
  server: {
    host: true,
    allowedHosts: true,
    proxy: {
      '/ws': { target: 'ws://localhost:8765', ws: true },
      '/api': { target: 'http://localhost:8765' },
      '/dev': { target: 'http://localhost:8765' },
      '/genre': { target: 'http://localhost:8765' },
      '/renders': { target: 'http://localhost:8765' },
      // Audio CDN proxy — forwards `/audio-cdn/<path>` to the R2 bucket so
      // non-localhost playgroup origins (player[1-4].local:5173) get a
      // same-origin response. cdn.slabgorb.com does not serve an
      // Access-Control-Allow-Origin header today; the proxy hides the
      // cross-origin fetch from the browser. See src/audio/cdnProxy.ts.
      '/audio-cdn': {
        target: 'https://cdn.slabgorb.com',
        changeOrigin: true,
        rewrite: (path: string) => path.replace(/^\/audio-cdn/, ''),
      },
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './src/test-setup.ts',
    css: true,
  },
})
