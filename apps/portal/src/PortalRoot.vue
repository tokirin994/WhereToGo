<script setup lang="ts">
import { onMounted } from 'vue'
import {asyncPage} from '@personal/platform/async-page'
import AuthGate from './AuthGate.vue'
import { initializeAuth,identity } from './auth'
import {travelUrl} from './appLinks'
const legacyTravel = /^\/travel(?:\/|$)/.test(window.location.pathname)
if(legacyTravel)window.location.replace(travelUrl+window.location.search+window.location.hash)
const system = /^\/system(?:\/|$)/.test(window.location.pathname)
const account = /^\/account(?:\/|$)/.test(window.location.pathname)
const callback = /^\/auth\//.test(window.location.pathname)
const login = /^\/login(?:\/|$)/.test(window.location.pathname)
const requiresAccount=system||account||callback
onMounted(()=>{if(!requiresAccount)void initializeAuth()})
const Page = asyncPage(() => login ? import('./LoginEntry.vue') : system ? import('./ApiManagement.vue') : account ? import('./AccountCenter.vue') : import('./PersonalPortal.vue'),account?'账号中心':'个人空间')
window.addEventListener('pagehide',()=>identity.dispose(),{once:true})
document.title = system ? 'API 管理 · 个人门户' : account ? '账号与服务 · 我的空间' : login ? '统一登录 · 我的空间' : '个人门户 · 我的应用'
</script>
<template><AuthGate v-if="requiresAccount"><Page v-if="!callback" /></AuthGate><Page v-else /></template>
