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
    // Deduplicate shared peer dependencies when @local/dice-lib (file-linked)
    // has its own node_modules. Without this, React and Three are instantiated
    // twice which breaks hook invariants ("Invalid hook call") and throws
    // "Multiple instances of Three.js being imported".
    dedupe: ['react', 'react-dom', 'three', '@react-three/fiber', '@react-three/drei', '@react-three/rapier'],
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
    fs: {
      // Allow serving assets from the locally-linked @local/dice-lib package
      // which lives outside this project's root directory.
      allow: ['..', path.resolve(__dirname, '../../dice-lib')],
    },
    proxy: {
      '/ws': { target: 'ws://localhost:8765', ws: true },
      '/api': { target: 'http://localhost:8765' },
      '/dev': { target: 'http://localhost:8765' },
      '/genre': { target: 'http://localhost:8765' },
      '/renders': { target: 'http://localhost:8765' },
      '/reference/api': { target: 'http://localhost:8765' },
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
