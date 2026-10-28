import vue from '@vitejs/plugin-vue'
import {defineConfig} from 'vitest/config'
import {loadEnv} from 'vite'
import {securityHeaders} from '@personal/platform/build'
export default defineConfig(({mode})=>({base:loadEnv(mode,process.cwd(),'VITE_').VITE_APP_BASE_PATH||'/',plugins:[vue(),securityHeaders(loadEnv(mode,process.cwd(),'VITE_'))],resolve:{dedupe:['vue','oidc-client-ts','pinia']},server:{port:5175,strictPort:true,proxy:{'/api':'http://127.0.0.1:8080'}},test:{environment:'jsdom',clearMocks:true}}))
