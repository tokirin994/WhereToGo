import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vitest/config'
import { loadEnv } from 'vite'
import { securityHeaders } from './config/securityHeaders.ts'

// https://vite.dev/config/
export default defineConfig(({mode})=>({
  plugins: [vue(),securityHeaders(loadEnv(mode,process.cwd(),'VITE_'))],
  server: {
    proxy: { '/api': 'http://127.0.0.1:8080' },
  },
  test: {
    environment: 'jsdom',
    clearMocks: true,
  },
}))
