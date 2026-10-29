import {browserCompatibility} from '@personal/platform/build'
import { defineConfig, loadEnv } from 'vite'
import vue from '@vitejs/plugin-vue'
import { securityHeaders } from './config/securityHeaders.ts'

export default defineConfig(({mode})=>({...browserCompatibility, base:loadEnv(mode,process.cwd(),'VITE_').VITE_APP_BASE_PATH||'/',resolve:{dedupe:['vue','oidc-client-ts']}, plugins: [vue(),securityHeaders(loadEnv(mode,process.cwd(),'VITE_'))] }))
