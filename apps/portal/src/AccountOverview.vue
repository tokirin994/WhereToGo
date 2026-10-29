<script setup lang="ts">
import {ArrowRight,ArrowUpRight,BookOpen,Cloud,Compass,KeyRound,LayoutGrid,MapPin,Monitor,Moon,ShieldCheck,Sun,UserRound} from '@lucide/vue'
import {platform} from './appLinks'
type State='loading'|'error'|'ready'
defineProps<{sessionCount:number;providerCount:number;cloudConfigured:boolean;identityState:State;providerState:State;ledgerState:State;theme:string}>()
const emit=defineEmits<{navigate:[tab:string];provider:[id:string];theme:[value:'system'|'light'|'dark']}>()
const themes=[{id:'light',name:'浅色',icon:Sun},{id:'dark',name:'夜间',icon:Moon},{id:'system',name:'跟随系统',icon:Monitor}] as const
const launch=platform.launchUrl
</script>
<template>
 <div class="account-overview">
  <section class="account-section account-applications" aria-labelledby="account-apps-heading">
   <div class="account-overview-heading"><div><span class="account-eyebrow">YOUR APPLICATIONS</span><h2 id="account-apps-heading">从这里，打开你的应用</h2><p>同一个账号，独立的数据空间。登录状态自动衔接。</p></div><span class="account-total-apps">{{ platform.applications.length }} 个应用</span></div>
   <div class="account-app-grid"><article v-for="app in platform.applications" :key="app.id" class="account-app" :class="'account-app-'+app.kind"><header><span class="account-app-symbol"><Compass v-if="app.kind==='travel'" :size="25"/><BookOpen v-else-if="app.kind==='ledger'" :size="25"/><LayoutGrid v-else :size="25"/></span><span><small>{{ app.label }}</small><h3>{{ app.name }}</h3></span></header><p>{{ app.description }}</p><ul><li v-for="feature in app.features" :key="feature">{{ feature }}</li></ul><a class="account-app-launch" :href="launch(app.id)">打开{{ app.kind==='travel'?'旅行规划':app.kind==='ledger'?'日常记账':app.name }}<ArrowRight :size="17"/></a></article></div>
   <div v-if="!platform.applications.length" class="account-empty">暂无已启用的应用，请联系部署管理员。</div>
  </section>
  <div class="account-summary-grid">
   <button type="button" @click="emit('navigate','security')"><span class="account-summary-icon"><ShieldCheck :size="19"/></span><span><small>登录设备</small><b>{{ identityState==='loading'?'读取中…':identityState==='error'?'查看状态':sessionCount+' 台设备' }}</b></span><ArrowUpRight :size="14"/></button>
   <button type="button" @click="emit('navigate','providers')"><span class="account-summary-icon"><KeyRound :size="19"/></span><span><small>AI / 地图服务</small><b>{{ providerState==='loading'?'读取中…':providerState==='error'?'连接异常':providerCount+' 项已配置' }}</b></span><ArrowUpRight :size="14"/></button>
   <button type="button" @click="emit('navigate','ledger')"><span class="account-summary-icon"><Cloud :size="19"/></span><span><small>坚果云备份</small><b>{{ ledgerState==='loading'?'读取中…':ledgerState==='error'?'连接异常':cloudConfigured?'已配置':'尚未配置' }}</b></span><ArrowUpRight :size="14"/></button>
  </div>
  <section class="account-section account-quick-settings" aria-labelledby="account-quick-heading"><div class="account-overview-heading"><div><h2 id="account-quick-heading">按你的习惯，设置空间</h2><p>完善资料，或连接你自己的服务。</p></div></div><div class="account-quick-grid"><button type="button" @click="emit('navigate','profile')"><UserRound :size="19"/><span><b>资料与邮箱</b><small>称呼、绑定邮箱与账号信息</small></span><ArrowUpRight :size="14"/></button><button type="button" @click="emit('provider','deepseek')"><KeyRound :size="19"/><span><b>连接 AI 服务</b><small>DeepSeek、GLM、GPT 或 Claude</small></span><ArrowUpRight :size="14"/></button><button type="button" @click="emit('provider','amap')"><MapPin :size="19"/><span><b>配置地图搜索</b><small>管理个人高德 Web 服务 Key</small></span><ArrowUpRight :size="14"/></button><button type="button" @click="emit('navigate','ledger')"><Cloud :size="19"/><span><b>记账云备份</b><small>与记账应用共用坚果云配置</small></span><ArrowUpRight :size="14"/></button></div></section>
  <section class="account-section account-appearance"><div><h3>门户外观</h3><p>选择舒服的配色，保存在当前浏览器。</p></div><div class="account-theme-options"><button v-for="option in themes" :key="option.id" type="button" :aria-pressed="theme===option.id" @click="emit('theme',option.id)"><component :is="option.icon" :size="16"/>{{ option.name }}</button></div></section>
 </div>
</template>
