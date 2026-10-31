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
    {
      name: 'diagnostic-logger',
      configureServer(server) {
        server.middlewares.use('/api/diag-log', (req, res) => {
          let body = ''
          req.on('data', (chunk) => {
            body += chunk
          })
          req.on('end', () => {
            try {
              const data = JSON.parse(body)
              console.log('[DEVICE_DIAGNOSTIC]', JSON.stringify(data))
            } catch {
              console.log('[DEVICE_LOG_RAW]', body)
            }
            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify({ ok: true }))
          })
        })
      },
    },
  ],
  server: {
    https: true,
    host: '0.0.0.0',
    port: 5173,
    strictPort: true,
    cors: true,
    allowedHosts: true,
  },
})
