<script setup lang="ts">
import {onMounted,ref} from 'vue'
import type {createWebAuth} from './vueSession'
import AccountWelcome from './AccountWelcome.vue'
const props=withDefaults(defineProps<{auth:ReturnType<typeof createWebAuth>;portalUrl:string;appName?:string;showPortal?:boolean}>(),{showPortal:true})
const {authError,authAction,currentUser,initializeAuth,localMockAuth,registrationEnabled,register,signIn}=props.auth
const loading=ref(true)
function reconnect(){window.location.reload()}
onMounted(async()=>{await initializeAuth();loading.value=false})
</script>
<template><slot v-if="currentUser"/><AccountWelcome v-else :portal-url="portalUrl" :app-name="appName" :show-portal="showPortal" :loading="loading||!!authAction" :auth-error="authError" :local-mock-auth="localMockAuth" :registration-enabled="registrationEnabled" @sign-in="localMockAuth?reconnect():signIn()" @register="register()"/></template>
