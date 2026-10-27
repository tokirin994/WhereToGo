<script setup lang="ts">
import { computed, defineAsyncComponent, onMounted, onUnmounted, ref } from 'vue'
import type { User } from 'oidc-client-ts'
import { createIdentitySession } from './identitySession'
const LedgerWorkspace=defineAsyncComponent(()=>import('./LedgerWorkspace.vue'))
import { clearNutstoreCredentials } from './nutstoreSync'
import { authorizedRequest, apiError } from './apiClient'
import { portalUrl, appBasePath, appRoutePath, ledgerOnly } from './appLinks'

const apiUrl = import.meta.env.VITE_SMARTLEDGER_API_URL?.replace(/\/$/, '') || ''
const authority = import.meta.env.VITE_OIDC_AUTHORITY
const clientId = import.meta.env.VITE_OIDC_CLIENT_ID
const registrationEnabled=import.meta.env.VITE_REGISTRATION_ENABLED!=='false'
const localMockAuth = import.meta.env.VITE_LOCAL_MOCK_AUTH === 'true'
const user = ref<User | null>(null)
const error = ref('')
const loading = ref(true)
const authAction=ref<'login'|'register'|null>(null)
function resetAuthAction(){authAction.value=null}
const bookId = computed(() => appRoutePath().match(/^\/books\/([0-9a-f-]+)\/?$/i)?.[1] || null)
const accountKey = computed(() => `${authority || 'local'}:${user.value?.profile?.sub || 'unknown'}`)
const identity=createIdentitySession({basePath:appBasePath,authority:authority||'',clientId:clientId||'',audience:import.meta.env.VITE_OIDC_AUDIENCE||'smartledger-api',
  allowLoopback:import.meta.env.DEV&&['localhost','127.0.0.1','[::1]'].includes(window.location.hostname),
  returnPath:path=>/^\/(?:books\/[0-9a-f-]+\/?)?$/i.test(path),changed:next=>{user.value=next},
})
let mockRefreshTimer:number|undefined
function expired(){user.value=null;error.value='登录已过期，请重新登录'}
async function signOut(){clearNutstoreCredentials(accountKey.value);try{await identity.signOut()}catch(cause){error.value=cause instanceof Error?cause.message:'统一退出失败'}}
function reconnectLocal(){window.location.reload()}

async function openIdentity(action:'login'|'register'){
  if(authAction.value)return
  error.value='';authAction.value=action
  try{
    if(action==='register'){
      if(!registrationEnabled)throw new Error('当前部署未开放注册，请联系管理员')
      await identity.register()
    }else await identity.signIn()
  }catch(cause){error.value=cause instanceof Error?cause.message:'账号服务暂时不可用，请重试';authAction.value=null}
}
async function signIn(){await openIdentity('login')}
async function register(){await openIdentity('register')}

onMounted(async () => {
  loading.value = true
  window.addEventListener('pageshow',resetAuthAction)
  const identityCallback=appRoutePath().startsWith('/auth/')
  let travelHandoff = new URLSearchParams(window.location.search)
  try {
    const loopback=['localhost','127.0.0.1','[::1]'].includes(window.location.hostname)
    if(localMockAuth&&(!import.meta.env.DEV||!loopback))throw new Error('模拟登录仅允许在本机开发服务中启用')
    window.addEventListener('smartledger-session-expired',expired)
    window.addEventListener('smartledger-sign-out',signOut)
    if (localMockAuth && authority) {
      const response = await fetch(`${authority}/mock-session`)
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      const session = await response.json() as { access_token: string; profile: Record<string, unknown> }
      user.value = { access_token: session.access_token, profile: session.profile } as User
      mockRefreshTimer=window.setInterval(async()=>{try{const refresh=await fetch(`${authority}/mock-session`,{cache:'no-store',credentials:'omit'});if(!refresh.ok)throw new Error('refresh');const next=await refresh.json();user.value={access_token:next.access_token,profile:next.profile} as User}catch{expired()}},45*60*1000)
      window.history.replaceState({}, document.title, window.location.pathname)
    } else {
      await identity.initialize()
      if(identityCallback)return
      if(!user.value&&!appRoutePath().startsWith('/auth/')&&!travelHandoff.has('signedOut')){await signIn();return}
      if(appRoutePath().startsWith('/auth/'))return
    }

    const tripId = travelHandoff.get('travelTripId')
    if (user.value && tripId) {
      if (!apiUrl) throw new Error('SmartLedger API 地址尚未配置。')
      const response = await authorizedRequest(apiUrl,user.value.access_token,`/api/v1/integrations/wheretogo/trips/${encodeURIComponent(tripId)}/open`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${user.value.access_token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tripName: travelHandoff.get('travelTripName') || '旅行账本',
          destination: travelHandoff.get('travelDestination'),
          startsOn: travelHandoff.get('travelStartsOn'),
          endsOn: travelHandoff.get('travelEndsOn'),
        }),
      })
      if (!response.ok) throw await apiError(response,'打开旅行账本失败')
      const result = await response.json() as { url: string }
      const target = new URL(result.url, window.location.origin)
      if (target.origin !== window.location.origin || !/^\/books\/[0-9a-f-]+\/?$/i.test(appRoutePath(target.pathname))) throw new Error('旅行账本服务返回了无效页面地址。')
      window.location.replace(target.toString())
    }
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : '初始化登录状态失败。'
  } finally { loading.value = false }
})
onUnmounted(()=>{window.removeEventListener('pageshow',resetAuthAction);if(mockRefreshTimer)window.clearInterval(mockRefreshTimer);window.removeEventListener('smartledger-session-expired',expired);window.removeEventListener('smartledger-sign-out',signOut)})
</script>

<template>
  <LedgerWorkspace v-if="user && apiUrl && !error" :key="accountKey" :user="user" :api-url="apiUrl" :account-key="accountKey" :book-id="bookId" />
  <main v-else class="auth-screen"><div v-if="loading" class="auth-card"><div class="auth-mark">🐟</div><h1>正在打开 SmartLedger</h1><p>准备本地账本空间…</p></div><div v-else class="auth-card"><div class="auth-mark">🐟</div><div class="eyebrow">SMARTLEDGER</div><h1>轻松记录每一笔。</h1><p>一个独立的个人记账空间，账本、流水、预算与导入工具都在这里。</p><button v-if="!localMockAuth" class="primary-button" :disabled="!!authAction" @click="signIn">{{ authAction==='login'?'正在连接…':'统一账号登录' }} <span>→</span></button><button v-if="!localMockAuth&&registrationEnabled" class="secondary-button" :disabled="!!authAction" @click="register">{{ authAction==='register'?'正在打开注册…':'还没有账号？免费创建' }}</button><a v-if="!ledgerOnly" :href="portalUrl" class="ledger-auth-back">← 返回门户首页</a><button v-if="localMockAuth" class="primary-button" @click="reconnectLocal">重新连接本地服务</button><p v-if="error" class="error-message" role="alert">{{ error }}</p></div></main>
</template>

<style scoped>.auth-card button:disabled{opacity:.65;cursor:wait}.auth-card>.secondary-button{width:100%;margin-top:12px;min-height:44px}.ledger-auth-back{display:block;margin-top:24px;font-size:12px;color:inherit;text-decoration:none;opacity:.65}</style>
