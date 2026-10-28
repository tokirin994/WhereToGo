<script setup lang="ts">
import AccountGate from '@personal/identity/AccountGate.vue'
import * as auth from './auth'
import {portalUrl,platform} from './appLinks'
</script>
<template><AccountGate :auth="auth" :portal-url="portalUrl" :show-portal="platform.authMode==='portal'" app-name="旅行规划"><slot/></AccountGate></template>
