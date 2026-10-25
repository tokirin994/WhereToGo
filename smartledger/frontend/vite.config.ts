import { defineConfig, loadEnv } from 'vite'
import vue from '@vitejs/plugin-vue'
import { securityHeaders } from './config/securityHeaders.ts'

export default defineConfig(({mode})=>({ plugins: [vue(),securityHeaders(loadEnv(mode,process.cwd(),'VITE_'))] }))
