<script setup lang="ts">
import {ref} from 'vue'
import {useDetailsPopover} from './popover'
const menu=ref<HTMLDetailsElement|null>(null),panel=ref<HTMLElement|null>(null)
const {style,toggled,close}=useDetailsPopover(menu,panel)
</script>
<template>
  <details ref="menu" @toggle="toggled" @keydown.esc.stop.prevent="close()">
    <slot name="trigger"/>
    <div ref="panel" :style="style"><slot/></div>
  </details>
</template>
<style scoped>
details{position:relative;}
details>div{box-sizing:border-box;max-width:calc(100vw - 24px);overflow:auto;overscroll-behavior:contain;}
</style>
