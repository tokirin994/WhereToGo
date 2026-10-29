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
// Keep each import in its own loader. A conditional expression inside one
// loader can cause the production preloader to retain only the last view's CSS.
const LoginPage=asyncPage(()=>import('./LoginEntry.vue'),'统一登录')
const SystemPage=asyncPage(()=>import('./ApiManagement.vue'),'服务管理')
const AccountPage=asyncPage(()=>import('./AccountCenter.vue'),'账号中心')
const HomePage=asyncPage(()=>import('./PersonalPortal.vue'),'个人空间')
const Page=login?LoginPage:system?SystemPage:account?AccountPage:HomePage
// Safari restores this document from bfcache with its JS heap intact. Keep the
// identity listeners alive for persisted pages; pageshow revalidates the session.
window.addEventListener('pagehide',event=>{if(!event.persisted)identity.dispose()})
document.title = system ? 'API 管理 · 个人门户' : account ? '账号与服务 · 我的空间' : login ? '统一登录 · 我的空间' : '个人门户 · 我的应用'
</script>
<template><AuthGate v-if="requiresAccount"><Page v-if="!callback" /></AuthGate><Page v-else /></template>
