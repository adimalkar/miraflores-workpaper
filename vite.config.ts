import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// Relative base so the build runs from any static host path (GitHub Pages, S3, a file share).
export default defineConfig({
  base: './',
  plugins: [react()],
})
