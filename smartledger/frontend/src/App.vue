<script setup lang="ts">
import { computed, defineAsyncComponent, onMounted, onUnmounted, ref } from 'vue'
import type { User } from 'oidc-client-ts'
import { createIdentitySession } from './identitySession'
const LedgerWorkspace=defineAsyncComponent(()=>import('./LedgerWorkspace.vue'))
import { clearNutstoreCredentials } from './nutstoreSync'
import { authorizedRequest, apiError } from './apiClient'
import { portalUrl } from './appLinks'

const apiUrl = import.meta.env.VITE_SMARTLEDGER_API_URL?.replace(/\/$/, '') || ''
const authority = import.meta.env.VITE_OIDC_AUTHORITY
const clientId = import.meta.env.VITE_OIDC_CLIENT_ID
const localMockAuth = import.meta.env.VITE_LOCAL_MOCK_AUTH === 'true'
const user = ref<User | null>(null)
const error = ref('')
const loading = ref(true)
const bookId = computed(() => window.location.pathname.match(/^\/books\/([0-9a-f-]+)\/?$/i)?.[1] || null)
const accountKey = computed(() => `${authority || 'local'}:${user.value?.profile?.sub || 'unknown'}`)
const identity=createIdentitySession({authority:authority||'',clientId:clientId||'',audience:import.meta.env.VITE_OIDC_AUDIENCE||'smartledger-api',
  allowLoopback:import.meta.env.DEV&&['localhost','127.0.0.1','[::1]'].includes(window.location.hostname),
  returnPath:path=>/^\/(?:books\/[0-9a-f-]+\/?)?$/i.test(path),changed:next=>{user.value=next},
})
let mockRefreshTimer:number|undefined
function expired(){user.value=null;error.value='登录已过期，请重新登录'}
async function signOut(){clearNutstoreCredentials(accountKey.value);try{await identity.signOut()}catch(cause){error.value=cause instanceof Error?cause.message:'统一退出失败'}}
function reconnectLocal(){window.location.reload()}

async function signIn() {
  try{await identity.signIn()}catch(cause){error.value=cause instanceof Error?cause.message:'无法打开统一登录服务'}
}
async function register(){try{await identity.register()}catch(cause){error.value=cause instanceof Error?cause.message:'无法打开注册页面'}}

onMounted(async () => {
  loading.value = true
  const identityCallback=window.location.pathname.startsWith('/auth/')
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
      if(!user.value&&!window.location.pathname.startsWith('/auth/')&&!travelHandoff.has('signedOut')){await signIn();return}
      if(window.location.pathname.startsWith('/auth/'))return
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
      if (target.origin !== window.location.origin || !/^\/books\/[0-9a-f-]+\/?$/i.test(target.pathname)) throw new Error('旅行账本服务返回了无效页面地址。')
      window.location.replace(target.toString())
    }
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : '初始化登录状态失败。'
  } finally { loading.value = false }
})
onUnmounted(()=>{if(mockRefreshTimer)window.clearInterval(mockRefreshTimer);window.removeEventListener('smartledger-session-expired',expired);window.removeEventListener('smartledger-sign-out',signOut)})
</script>

<template>
  <LedgerWorkspace v-if="user && apiUrl && !error" :key="accountKey" :user="user" :api-url="apiUrl" :account-key="accountKey" :book-id="bookId" />
  <main v-else class="auth-screen"><div v-if="loading" class="auth-card"><div class="auth-mark">🐟</div><h1>正在打开 SmartLedger</h1><p>准备本地账本空间…</p></div><div v-else class="auth-card"><div class="auth-mark">🐟</div><div class="eyebrow">SMARTLEDGER</div><h1>轻松记录每一笔。</h1><p>一个独立的个人记账空间，账本、流水、预算与导入工具都在这里。</p><button v-if="!localMockAuth" class="primary-button" @click="signIn">统一账号登录 <span>→</span></button><button v-if="!localMockAuth" class="secondary-button" @click="register">创建账号</button><a :href="portalUrl" class="ledger-auth-back">← 返回门户首页</a><button v-if="localMockAuth" class="primary-button" @click="reconnectLocal">重新连接本地服务</button><p v-if="error" class="error-message">{{ error }}</p></div></main>
</template>

<style scoped>.auth-card>.secondary-button{width:100%;margin-top:12px;min-height:44px}.ledger-auth-back{display:block;margin-top:24px;font-size:12px;color:inherit;text-decoration:none;opacity:.65}</style>
