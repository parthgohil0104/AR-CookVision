import path from 'node:path'
import { fileURLToPath } from 'node:url'
import basicSsl from '@vitejs/plugin-basic-ssl'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// https://vite.dev/config/
export default defineConfig({
  resolve: {
    alias: [
      {
        find: /^three$/,
        replacement: path.resolve(__dirname, 'src/ar/three-compat.js'),
      },
    ],
  },
  optimizeDeps: {
    exclude: ['mind-ar'],
  },
  plugins: [
    react(),
    basicSsl(),
  ],
  server: {
    https: true,
    host: true,
    port: 5173,
  },
})
