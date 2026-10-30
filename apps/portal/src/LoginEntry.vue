<script setup lang="ts">
import {computed,onMounted,ref} from 'vue'
import {ArrowLeft,ShieldCheck} from '@lucide/vue'
import {currentUser,authAction,authError,initializeAuth,register,signIn} from './auth'
import {platform} from './appLinks'
import './portal.css'
const error=ref(''),loading=ref(true),appName=ref('应用')
const params=new URLSearchParams(window.location.search)
const intent=params.get('intent')==='register'?'register':'login'
const returnTo=window.location.pathname+window.location.search
const busy=computed(()=>loading.value||!!authAction.value)
async function proceed(){
  if(error.value)return
  if(currentUser.value){
    const target=platform.launchTarget(params.get('app')||'',params.get('returnTo'))
    target.searchParams.set('__sso','1');window.location.replace(target.href)
  }else if(intent==='register')await register(returnTo)
  else await signIn(returnTo)
}
onMounted(async()=>{
  try{appName.value=platform.application(params.get('app')||'').name;platform.launchTarget(params.get('app')||'',params.get('returnTo'))}
  catch{error.value='应用未注册或返回地址无效，请从门户重新打开应用';loading.value=false;return}
  await initializeAuth();loading.value=false
  // This is the central interactive entry. If an iframe cannot restore the
  // portal client, use one first-party authorization; the IdP cookie supplies SSO.
  await proceed()
})
</script>
<template><main class="personal-portal portal-system login-entry"><a :href="platform.portalUrl"><ArrowLeft :size="16"/>返回门户</a><section><ShieldCheck :size="36"/><small>PERSONAL SPACE</small><h1>{{ currentUser?'正在打开 '+appName:'统一账号，连接你的应用' }}</h1><p>登录后继续使用 {{ appName }}，账号资料与安全设置由门户统一管理。</p><p v-if="error||authError" role="alert" class="error">{{ error||authError }}</p><button v-if="!error" :disabled="busy" @click="proceed">{{ busy?'正在连接…':currentUser?'继续打开应用':intent==='register'?'创建统一账号':'登录并继续' }}</button></section></main></template>
<style scoped>.login-entry{padding:28px;display:grid;align-content:start;gap:10vh}.login-entry>a{display:flex;align-items:center;gap:8px;width:fit-content;text-decoration:none;font-size:13px;color:var(--muted)}section{width:min(440px,100%);margin:0 auto;padding:36px;border:1px solid var(--border);border-radius:24px;background:var(--panel)}section>svg{color:var(--accent)}small{display:block;margin:22px 0 12px;font-size:10px;letter-spacing:2px;color:var(--muted)}h1{font-size:24px;line-height:1.5}p{font-size:13px;line-height:1.9;color:var(--muted)}button{width:100%;margin-top:20px;min-height:46px;border:0;border-radius:12px;background:var(--accent);color:var(--panel);cursor:pointer}button:disabled{opacity:.6;cursor:wait}.error{color:#ce6975}</style>
