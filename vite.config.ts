import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  base: './',
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:5000',
        changeOrigin: true,
        configure: (proxy) => {
          proxy.on('error', (err: any) => {
            if (err?.code !== 'ECONNREFUSED') {
              console.warn('[vite] http proxy error:', err?.message || err)
            }
          })
        },
      },
      '/realtime': {
        target: 'ws://127.0.0.1:5000',
        ws: true,
        configure: (proxy) => {
          proxy.on('error', (err: any) => {
            if (err?.code !== 'ECONNREFUSED') {
              console.warn('[vite] ws proxy error:', err?.message || err)
            }
          })
        },
      },
    },
  },
  test: {
    environment: 'node',
    fileParallelism: false,
    include: [
      'src/**/*.test.ts',
      'server/tests/sandboxAuth.test.ts',
      'server/tests/notificationLifecycle.test.ts',
      'server/tests/pricingEngine.test.ts',
      'server/tests/rideWorkflowLifecycle.test.ts',
      'server/tests/sosEmergencyWorkflow.test.ts'
    ],
    exclude: ['server/tests/e2e.test.ts', 'tests/**', 'node_modules/**'],
  },
})
