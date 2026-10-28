<script setup lang="ts">
import {onErrorCaptured,onMounted,onUnmounted,ref} from 'vue'
import PageState from './PageState.vue'
withDefaults(defineProps<{appName?:string;portalUrl?:string}>(),{appName:'个人空间',portalUrl:'/'})
const failed=ref(false)
// Never render raw exception messages: they can include private API responses.
onErrorCaptured(()=>{failed.value=true;return false})
function preloadFailed(event:Event){event.preventDefault();failed.value=true}
onMounted(()=>window.addEventListener('vite:preloadError',preloadFailed))
onUnmounted(()=>window.removeEventListener('vite:preloadError',preloadFailed))
</script>
<template><PageState v-if="failed" kind="error" :app-name="appName" :portal-url="portalUrl"/><slot v-else/></template>
