<script setup lang="ts">
import AppSwitcher from '@personal/platform/AppSwitcher.vue'
defineProps<{current:string}>()
</script>
<template><AppSwitcher :current="current"/></template>
