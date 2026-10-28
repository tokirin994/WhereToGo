<script setup lang="ts">
import {onUnmounted} from 'vue'
import AuthGate from './AuthGate.vue'
import TravelApplication from './TravelApplication.vue'
import {identity} from './auth'
const callback=/\/auth\//.test(window.location.pathname)
document.title='WhereToGo · 旅行规划'
onUnmounted(()=>identity.dispose())
</script>
<template><AuthGate><TravelApplication v-if="!callback"/></AuthGate></template>
