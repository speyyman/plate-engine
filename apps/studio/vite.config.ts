import { fileURLToPath } from 'node:url'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// Relative base: the same build runs at https://speyyman.github.io/plate-engine/ and,
// vendored into the site, at /lab/plate-studio/.
export default defineConfig({
  base: './',
  plugins: [react()],
  resolve: {
    alias: { 'plate-engine': fileURLToPath(new URL('../../packages/plate-engine/src/index.ts', import.meta.url)) },
  },
  worker: { format: 'es' },
  build: { target: 'es2022' },
})
