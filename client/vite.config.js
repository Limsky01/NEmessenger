import { defineConfig } from 'vite'
import path from 'path'
import tailwind from 'tailwindcss'
import autoprefixer from 'autoprefixer'

export default defineConfig({
  root: '.',
  base: './',
  build: { outDir: 'dist', emptyOutDir: true },
  resolve: { alias: { '@': path.resolve(__dirname, 'src') } },
  css: { postcss: { plugins: [tailwind(), autoprefixer()] } }
})
