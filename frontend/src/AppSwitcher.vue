<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'
import { ArrowUpRight, BookOpen, Compass, House, LayoutGrid } from '@lucide/vue'
import { portalUrl, smartLedgerUrl, travelUrl } from './appLinks'
defineProps<{ current: 'portal' | 'travel' }>()
const menu=ref<HTMLDetailsElement|null>(null)
function outside(event:PointerEvent){if(menu.value&&event.target instanceof Node&&!menu.value.contains(event.target))menu.value.open=false}
function close(){if(menu.value){menu.value.open=false;menu.value.querySelector('summary')?.focus()}}
onMounted(()=>window.addEventListener('pointerdown',outside))
onUnmounted(()=>window.removeEventListener('pointerdown',outside))
</script>
<template>
  <details ref="menu" class="application-switcher" @keydown.esc.stop.prevent="close">
    <summary aria-label="切换应用"><LayoutGrid :size="17"/><span>应用</span></summary>
    <nav aria-label="应用切换"><small>我的应用</small><a href="/account/"><i><House :size="18"/></i><span><b>账号与服务</b><small>统一账号、密码与会话管理</small></span><ArrowUpRight :size="14"/></a><a :href="portalUrl" :aria-current="current==='portal'?'page':undefined"><i><House :size="18"/></i><span><b>个人门户</b><small>返回应用首页</small></span><ArrowUpRight :size="14"/></a><a :href="travelUrl" :aria-current="current==='travel'?'page':undefined"><i><Compass :size="18"/></i><span><b>WhereToGo</b><small>地点收藏与旅行规划</small></span><ArrowUpRight :size="14"/></a><a :href="smartLedgerUrl"><i><BookOpen :size="18"/></i><span><b>SmartLedger</b><small>账本、流水与截图识别</small></span><ArrowUpRight :size="14"/></a></nav>
  </details>
</template>
<style scoped>
.application-switcher{position:relative;flex:none;color:var(--ink,#26352d);}.application-switcher summary{display:flex;align-items:center;justify-content:center;gap:7px;min-height:36px;padding:8px 11px;border:1px solid var(--border,#e9ece8);border-radius:10px;background:var(--panel,#fff);font-size:12px;font-weight:600;cursor:pointer;list-style:none;}.application-switcher summary::-webkit-details-marker{display:none;}.application-switcher summary::marker{content:'';}.application-switcher[open] summary{color:var(--accent,#346e53);}.application-switcher nav{position:absolute;right:0;top:calc(100% + 10px);z-index:40;width:264px;padding:10px;border:1px solid var(--border,#e9ece8);border-radius:17px;background:var(--panel,#fff);box-shadow:0 14px 45px #13223822;}.application-switcher nav>small{display:block;padding:7px 9px 10px;color:var(--muted,#87928c);font-size:10px;letter-spacing:1px;}.application-switcher a{display:flex;align-items:center;gap:11px;padding:11px 9px;border-radius:11px;text-decoration:none;color:inherit;}.application-switcher a:hover,.application-switcher a[aria-current=page]{background:color-mix(in srgb,var(--accent,#346e53) 9%,var(--panel,#fff));}.application-switcher a>i{display:grid;place-items:center;flex:none;width:35px;height:35px;border-radius:10px;background:color-mix(in srgb,var(--accent,#346e53) 10%,var(--panel,#fff));color:var(--accent,#346e53);}.application-switcher a>span{display:flex;flex:1;flex-direction:column;gap:5px;}.application-switcher a b{font-size:12px;font-weight:650;}.application-switcher a small{color:var(--muted,#87928c);font-size:10px;}.application-switcher a>svg{color:var(--muted,#87928c);}.application-switcher summary:focus-visible,.application-switcher a:focus-visible{outline:2px solid var(--accent,#346e53);outline-offset:3px;}
@media(max-width:390px){.application-switcher summary{padding:8px;}.application-switcher summary>span{display:none;}}
</style>
