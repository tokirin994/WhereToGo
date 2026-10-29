<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import {asyncPage} from '@personal/platform/async-page'
import type { User } from 'oidc-client-ts'
import { createIdentitySession } from './identitySession'
const LedgerWorkspace=asyncPage(()=>import('./LedgerWorkspace.vue'),'日常记账')
import { clearNutstoreCredentials } from './nutstoreSync'
import { authorizedRequest, apiError, setSessionTokenProvider,type ApiSessionIssue } from './apiClient'
import { portalUrl, appBasePath, appRoutePath, ledgerOnly,platform } from './appLinks'

const apiUrl = import.meta.env.VITE_SMARTLEDGER_API_URL?.replace(/\/$/, '') || ''
const authority = import.meta.env.VITE_OIDC_AUTHORITY
const clientId = import.meta.env.VITE_OIDC_CLIENT_ID
const registrationEnabled=import.meta.env.VITE_REGISTRATION_ENABLED!=='false'
const localMockAuth = import.meta.env.VITE_LOCAL_MOCK_AUTH === 'true'
const user = ref<User | null>(null)
const error = ref('')
const loading = ref(true)
const authAction=ref<'login'|'register'|null>(null)
const connectionIssue=ref<ApiSessionIssue|null>(null),reconnecting=ref(false)
function apiSessionIssue(event:Event){connectionIssue.value=(event as CustomEvent<ApiSessionIssue>).detail}
async function reconnectSession(){
  if(reconnecting.value)return
  reconnecting.value=true
  try{
    // A refreshed legacy grant can remain unacceptable to this resource server.
    // A user-initiated, first-party silent grant obtains fresh client scopes
    // without relying on iframe cookies or creating an automatic redirect loop.
    if(connectionIssue.value)await identity.resumeSSO(window.location.pathname+window.location.search+window.location.hash)
    else{await identity.accessToken(true);window.location.reload()}
  }
  catch(cause){error.value=cause instanceof Error?cause.message:'暂时无法连接账号服务，请稍后再试'}
  finally{reconnecting.value=false}
}
function resetAuthAction(){authAction.value=null}
const bookId = computed(() => appRoutePath().match(/^\/books\/([0-9a-f-]+)\/?$/i)?.[1] || null)
const identityCallback=appRoutePath().startsWith('/auth/')
const accountKey = computed(() => `${authority || 'local'}:${user.value?.profile?.sub || 'unknown'}`)
const identity=createIdentitySession({basePath:appBasePath,authority:authority||'',clientId:clientId||'',audience:import.meta.env.VITE_OIDC_AUDIENCE||'smartledger-api',
  allowLoopback:import.meta.env.DEV&&['localhost','127.0.0.1','[::1]'].includes(window.location.hostname),
  returnPath:path=>/^\/(?:books\/[0-9a-f-]+\/?)?$/i.test(path),changed:next=>{user.value=next},
  sessionEnded:reason=>{if(reason==='user_logout')return;error.value=({remote_logout:'统一账号会话已在其他页面退出，请重新登录。',refresh_rejected:'记账会话续期被账号服务拒绝，静默恢复未成功，请重新连接。',sso_unavailable:'记账会话验证未完成，请重新连接。',account_changed:'检测到账号已切换，正在重新打开对应的账本。'})[reason]},
})
let mockRefreshTimer:number|undefined
function expired(){user.value=null;error.value='登录已过期，请重新登录'}
async function signOut(){clearNutstoreCredentials(accountKey.value);try{await identity.signOut()}catch(cause){error.value=cause instanceof Error?cause.message:'统一退出失败'}}
function reconnectLocal(){window.location.reload()}

async function openIdentity(action:'login'|'register'){
  if(authAction.value)return
  error.value='';authAction.value=action
  try{
    const returnTo=identityCallback?appBasePath:window.location.pathname+window.location.search
    if(action==='register'){
      if(!registrationEnabled)throw new Error('当前部署未开放注册，请联系管理员')
      if(!ledgerOnly){window.location.assign(platform.loginUrl('ledger',returnTo,action));return}
      await identity.register(returnTo)
    }else if(!ledgerOnly)window.location.assign(platform.loginUrl('ledger',returnTo,action))
    else await identity.signIn(returnTo)
  }catch(cause){error.value=cause instanceof Error?cause.message:'账号服务暂时不可用，请重试';authAction.value=null}
}
async function signIn(){await openIdentity('login')}
async function register(){await openIdentity('register')}

onMounted(async () => {
  loading.value = true
  window.addEventListener('pageshow',resetAuthAction)
  let travelHandoff = new URLSearchParams(window.location.search)
  try {
    const loopback=['localhost','127.0.0.1','[::1]'].includes(window.location.hostname)
    if(localMockAuth&&(!import.meta.env.DEV||!loopback))throw new Error('模拟登录仅允许在本机开发服务中启用')
    window.addEventListener('smartledger-api-session-issue',apiSessionIssue)
    window.addEventListener('smartledger-sign-out',signOut)
    if (localMockAuth && authority) {
      const response = await fetch(`${authority}/mock-session`)
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      const session = await response.json() as { access_token: string; profile: Record<string, unknown> }
      user.value = { access_token: session.access_token, profile: session.profile } as User
      mockRefreshTimer=window.setInterval(async()=>{try{const refresh=await fetch(`${authority}/mock-session`,{cache:'no-store',credentials:'omit'});if(!refresh.ok)throw new Error('refresh');const next=await refresh.json();user.value={access_token:next.access_token,profile:next.profile} as User}catch{expired()}},45*60*1000)
      window.history.replaceState({}, document.title, window.location.pathname)
    } else {
      setSessionTokenProvider(force=>identity.accessToken(force))
      try{await identity.initialize()}catch(cause){if(!travelHandoff.has('__sso')||identityCallback)throw cause}
      if(identityCallback)return
      if(travelHandoff.has('__sso')){
        travelHandoff.delete('__sso')
        const target=window.location.pathname+(travelHandoff.toString()?'?'+travelHandoff.toString():'')+window.location.hash
        window.history.replaceState({},'',target)
        if(!user.value){await identity.resumeSSO(target);return}
      }
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
onUnmounted(()=>{identity.dispose();setSessionTokenProvider();window.removeEventListener('pageshow',resetAuthAction);if(mockRefreshTimer)window.clearInterval(mockRefreshTimer);window.removeEventListener('smartledger-api-session-issue',apiSessionIssue);window.removeEventListener('smartledger-sign-out',signOut)})
</script>

<template>
  <main v-if="identityCallback&&!error" class="auth-screen"><div class="auth-card"><div class="auth-mark">🐟</div><h1>正在完成统一登录</h1><p role="status">验证账号后将自动打开记账。</p></div></main>
  <template v-else-if="!identityCallback&&user && apiUrl">
    <aside v-if="error||connectionIssue" class="ledger-connection-notice" role="alert" :aria-busy="reconnecting"><div><b>{{ connectionIssue?'记账服务连接需要重试':'暂时无法完成这次操作' }}</b><p>{{ error||(connectionIssue?'记账接口未接受当前凭证，尚未完成的操作没有自动重发。可以重新连接；当前账号与本地账本会保留。':'') }}</p><details v-if="connectionIssue"><summary>查看连接诊断</summary><small>HTTP {{ connectionIssue.status }} · {{ connectionIssue.method }} {{ connectionIssue.route }}<template v-if="connectionIssue.requestId"> · 请求编号 {{ connectionIssue.requestId }}</template></small></details></div><button type="button" :disabled="reconnecting" @click="reconnectSession">{{ reconnecting?'连接中…':'重新连接' }}</button><button type="button" aria-label="关闭连接提示" @click="error='';connectionIssue=null">×</button></aside>
    <LedgerWorkspace :key="accountKey" :user="user" :api-url="apiUrl" :account-key="accountKey" :book-id="bookId" />
  </template>
  <main v-else class="auth-screen"><div v-if="loading" class="auth-card"><div class="auth-mark">🐟</div><h1>正在打开 SmartLedger</h1><p>准备本地账本空间…</p></div><div v-else class="auth-card"><div class="auth-mark">🐟</div><div class="eyebrow">SMARTLEDGER</div><h1>轻松记录每一笔。</h1><p>一个独立的个人记账空间，账本、流水、预算与导入工具都在这里。</p><button v-if="!localMockAuth" class="primary-button" :disabled="!!authAction" @click="signIn">{{ authAction==='login'?'正在连接…':'统一账号登录' }} <span>→</span></button><button v-if="!localMockAuth&&registrationEnabled" class="secondary-button" :disabled="!!authAction" @click="register">{{ authAction==='register'?'正在打开注册…':'还没有账号？免费创建' }}</button><a v-if="!ledgerOnly" :href="portalUrl" class="ledger-auth-back">← 返回门户首页</a><button v-if="localMockAuth" class="primary-button" @click="reconnectLocal">重新连接本地服务</button><p v-if="error" class="error-message" role="alert">{{ error }}</p></div></main>
</template>

<style scoped>.auth-card button:disabled{opacity:.65;cursor:wait}.auth-card>.secondary-button{width:100%;margin-top:12px;min-height:44px}.ledger-auth-back{display:block;margin-top:24px;font-size:12px;color:inherit;text-decoration:none;opacity:.65}</style>
<style scoped>
.ledger-connection-notice{display:flex;align-items:center;gap:14px;padding:16px 20px;border-bottom:1px solid #d9c28d;background:#fff6df;color:#59431e;font-size:13px;line-height:1.6}.ledger-connection-notice>div{flex:1;min-width:0}.ledger-connection-notice p{margin:5px 0}.ledger-connection-notice small{display:block;overflow-wrap:anywhere;opacity:.8}.ledger-connection-notice summary{cursor:pointer;font-size:12px}.ledger-connection-notice button{flex:none;padding:8px 12px;border:1px solid currentColor;border-radius:9px;background:transparent;color:inherit;font:inherit;cursor:pointer}.ledger-connection-notice button:disabled{opacity:.6}.ledger-connection-notice button:last-child{border-color:transparent;font-size:21px}@media(prefers-color-scheme:dark){.ledger-connection-notice{background:#302a1e;color:#eed6a4;border-color:#615037}}:global(#app:has(.ledger-app.theme-dark)) .ledger-connection-notice{background:#302a1e;color:#eed6a4;border-color:#615037}:global(#app:has(.ledger-app.theme-light)) .ledger-connection-notice{background:#fff6df;color:#59431e;border-color:#d9c28d}@media(max-width:540px){.ledger-connection-notice{flex-wrap:wrap;padding:13px 16px}.ledger-connection-notice>div{flex-basis:100%}}
</style>
