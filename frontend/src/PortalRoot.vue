<script setup lang="ts">
import { defineAsyncComponent, onMounted } from 'vue'
import AuthGate from './AuthGate.vue'
import { initializeAuth } from './auth'
const travel = /^\/travel(?:\/|$)/.test(window.location.pathname)
const system = /^\/system(?:\/|$)/.test(window.location.pathname)
const account = /^\/account(?:\/|$)/.test(window.location.pathname)
const callback = /^\/auth\//.test(window.location.pathname)
const requiresAccount=travel||system||account||callback
onMounted(()=>{if(!requiresAccount)void initializeAuth()})
const Page = defineAsyncComponent(() => travel ? import('./TravelApplication.vue') : system ? import('./ApiManagement.vue') : account ? import('./AccountCenter.vue') : import('./PersonalPortal.vue'))
document.title = travel ? 'WhereToGo · 旅行规划' : system ? 'API 管理 · 个人门户' : account ? '账号与服务 · 我的空间' : '个人门户 · 我的应用'
</script>
<template><AuthGate v-if="requiresAccount"><Page v-if="!callback" /></AuthGate><Page v-else /></template>
