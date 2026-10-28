<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { ArrowRight, ArrowUpRight, BookOpen, Camera, Check, Compass, LayoutGrid, MapPin, Monitor, Moon, Route, Sun, Wallet } from '@lucide/vue'
import AppSwitcher from './AppSwitcher.vue'
import { platform,smartLedgerUrl } from './appLinks'
import { authAction, authError, currentUser, initializeAuth, registrationEnabled, register, signIn, signOut } from './auth'
import './portal.css'
type Theme='system'|'light'|'dark'
function savedTheme():Theme {try {const value=localStorage.getItem('personal-portal-theme');return value==='dark'||value==='light'?value:'system'}catch{return 'system'}}
const theme=ref<Theme>(savedTheme())
const welcome=ref(new URLSearchParams(window.location.search).get('welcome')==='1')
function dismissWelcome(){welcome.value=false;const url=new URL(window.location.href);url.searchParams.delete('welcome');window.history.replaceState({},'',url.pathname+url.search+url.hash)}
watch(theme,value=>{try{localStorage.setItem('personal-portal-theme',value)}catch{/* The current theme still works when storage is unavailable. */}})
const date=new Date()
const dateLabel=new Intl.DateTimeFormat('zh-CN',{timeZone:'Asia/Hong_Kong',month:'long',day:'numeric',weekday:'long'}).format(date)
const hour=Number(new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Hong_Kong',hour:'2-digit',hourCycle:'h23'}).format(date))
const greeting=computed(()=>hour<6?'夜深了':hour<12?'上午好':hour<18?'下午好':'晚上好')
const accountLabel=computed(()=>String(currentUser.value?.profile.name||currentUser.value?.profile.preferred_username||'我的账号'))
function openApplication(event:MouseEvent,name:string){
  if(authAction.value){event.preventDefault();return}
  if(currentUser.value||event.ctrlKey||event.metaKey||event.shiftKey||event.altKey)return
  event.preventDefault()
  const destination=new URL(platform.loginUrl(name,platform.application(name).url))
  void signIn(destination.pathname+destination.search)
}
onMounted(async()=>{await initializeAuth();if(currentUser.value&&new URLSearchParams(window.location.search).get('openApp')==='ledger')window.location.replace(smartLedgerUrl)})
</script>
<template>
  <div class="personal-portal" :class="`portal-${theme}`">
    <header class="portal-header"><a class="portal-brand" href="/" aria-label="个人门户首页"><span><LayoutGrid :size="20"/></span><b>我的空间<small>PERSONAL SPACE</small></b></a><div class="portal-header-actions"><label class="portal-theme"><Sun v-if="theme==='light'" :size="15"/><Moon v-else-if="theme==='dark'" :size="15"/><Monitor v-else :size="15"/><select v-model="theme" aria-label="门户外观"><option value="system">跟随系统</option><option value="light">浅色模式</option><option value="dark">夜间模式</option></select></label><AppSwitcher current="portal"/><details v-if="currentUser" class="portal-account-menu"><summary><span>{{ accountLabel.slice(0,1) }}</span><b>{{ accountLabel }}</b></summary><nav><a href="/account/">账号与服务</a><button type="button" @click="signOut">退出登录</button></nav></details><div v-else class="portal-account-actions"><button class="portal-login" type="button" :disabled="!!authAction" @click="signIn('/')">{{ authAction==='login'?'正在连接…':'登录' }}</button><button v-if="registrationEnabled" class="portal-register" type="button" :disabled="!!authAction" @click="register('/')">{{ authAction==='register'?'正在打开…':'创建账号' }}</button></div></div></header>
    <main class="portal-content"><p v-if="authError" class="portal-auth-error" role="alert">{{ authError }}</p>
      <aside v-if="currentUser&&welcome" class="portal-welcome" role="status"><Check :size="20"/><div><b>账号已就绪，欢迎来到我的空间</b><p>现在可以打开旅行规划或记账。两个应用使用同一账号，各自保存你的数据。</p></div><button type="button" aria-label="关闭欢迎提示" @click="dismissWelcome">×</button></aside>
      <section class="portal-intro"><div class="portal-date"><span></span>{{ dateLabel }}</div><p class="portal-greeting">{{ greeting }}，欢迎回到你的空间</p><h1>安排好旅程，<br/>也照顾好日常。</h1><p class="portal-description">收藏想去的地方，记下生活的每一笔。<br class="portal-mobile-break"/>从这里，打开你的常用应用。</p><div class="portal-intro-art" aria-hidden="true"><span class="portal-orbit orbit-one"></span><span class="portal-orbit orbit-two"></span><span class="portal-art-center"><Compass :size="35" :stroke-width="1.4"/></span><i class="portal-art-wallet"><Wallet :size="23"/></i><i class="portal-art-pin"><MapPin :size="21"/></i><span class="portal-art-dot dot-one"></span><span class="portal-art-dot dot-two"></span></div></section>
      <p v-if="authAction" class="portal-auth-status" role="status">正在连接统一账号服务，请稍候…</p>
      <section class="portal-apps" aria-labelledby="portal-apps-title"><header class="portal-section-heading"><div><span>YOUR APPLICATIONS</span><h2 id="portal-apps-title">我的应用</h2></div><span>{{ String(platform.applications.length).padStart(2,'0') }} <small>个应用</small></span></header>
        <div class="portal-app-grid">
          <a v-for="app in platform.applications" :key="app.id" :href="app.url" @click="openApplication($event,app.id)" class="portal-app-card" :class="'portal-'+app.id"><div class="portal-card-heading"><span class="portal-app-icon"><Compass v-if="app.kind==='travel'" :size="27"/><BookOpen v-else-if="app.kind==='ledger'" :size="26"/><LayoutGrid v-else :size="26"/></span><span class="portal-app-type">{{ app.label }}</span><ArrowUpRight :size="21"/></div><div class="portal-app-copy"><small>{{ app.name.toUpperCase() }}</small><h3>{{ app.title }}</h3><p>{{ app.description }}</p></div><div v-if="app.kind==='travel'" class="portal-app-art portal-map-art" aria-hidden="true"><div class="portal-map-grid"></div><svg viewBox="0 0 460 135" fill="none"><path d="M-15 110C55 100 60 37 136 57S242 128 293 62 394 21 476 35" stroke="currentColor" stroke-width="3" stroke-dasharray="6 7"/><circle cx="136" cy="57" r="7"/><circle cx="293" cy="62" r="7"/></svg><span class="portal-map-pin"><MapPin :size="25"/></span><span class="portal-map-label"><Route :size="14"/>每一站，都有安排</span></div><div v-else-if="app.kind==='ledger'" class="portal-app-art portal-finance-art" aria-hidden="true"><span class="portal-finance-sheet"><i v-for="n in 3" :key="n"><span></span><Check :size="12"/></i></span><div class="portal-finance-bars"><i v-for="n in 7" :key="n"></i></div><span class="portal-finance-label"><Camera :size="14"/>一张截图，轻松记账</span></div><div class="portal-card-features"><span v-for="feature in app.features" :key="feature">{{ feature }}</span></div><footer><span>打开 {{ app.name }}</span><span class="portal-open-arrow"><ArrowRight :size="18"/></span></footer></a>
        </div>
      </section>
      <aside class="portal-connection"><span><LayoutGrid :size="18"/></span><div><b>各自专注，也能互相连接</b><p>日常记账直接打开 SmartLedger；旅行中的费用，从对应行程进入专属旅行账本。</p></div><span class="portal-connection-mark"><Compass :size="18"/><span>＋</span><BookOpen :size="18"/></span></aside>
    </main>
    <footer class="portal-footer"><span>我的空间 <i>·</i> 旅行与生活</span><a href="/account/">账号与服务 →</a><a href="/system/">API 管理 →</a></footer>
  </div>
</template>
