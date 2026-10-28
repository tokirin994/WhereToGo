<script setup lang="ts">
import {onUnmounted} from 'vue'
import {asyncPage} from '@personal/platform/async-page'
import AuthGate from './AuthGate.vue'
const TravelApplication=asyncPage(()=>import('./TravelApplication.vue'),'旅行规划')
import {identity} from './auth'
const callback=/\/auth\//.test(window.location.pathname)
document.title='WhereToGo · 旅行规划'
onUnmounted(()=>identity.dispose())
</script>
<template><AuthGate><TravelApplication v-if="!callback"/></AuthGate></template>
