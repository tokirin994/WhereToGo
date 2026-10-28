<script setup lang="ts">
import AccountGate from '@personal/identity/AccountGate.vue'
import * as auth from './auth'
import {portalUrl} from './appLinks'
</script>
<template><AccountGate :auth="auth" :portal-url="portalUrl" app-name="个人空间"><slot/></AccountGate></template>
