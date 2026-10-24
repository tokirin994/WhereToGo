<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { UserManager, type User } from 'oidc-client-ts'
import LedgerWorkspace from './LedgerWorkspace.vue'

const apiUrl = import.meta.env.VITE_SMARTLEDGER_API_URL?.replace(/\/$/, '') || ''
const authority = import.meta.env.VITE_OIDC_AUTHORITY
const clientId = import.meta.env.VITE_OIDC_CLIENT_ID
const localMockAuth = import.meta.env.VITE_LOCAL_MOCK_AUTH === 'true'
const user = ref<User | null>(null)
const error = ref('')
const loading = ref(true)
const bookId = computed(() => window.location.pathname.match(/^\/books\/([0-9a-f-]+)\/?$/i)?.[1] || null)
const accountKey = computed(() => `${authority || 'local'}:${user.value?.profile?.sub || 'unknown'}`)
const oidc = authority && clientId ? new UserManager({
  authority, client_id: clientId, redirect_uri: window.location.origin, post_logout_redirect_uri: window.location.origin,
  response_type: 'code', scope: 'openid profile email', loadUserInfo: true,
}) : null

async function signIn() {
  if (!oidc) { error.value = '尚未配置登录服务。请设置 OIDC authority 和 client id。'; return }
  await oidc.signinRedirect({ state: { returnTo: `${window.location.pathname}${window.location.search}` } })
}

onMounted(async () => {
  loading.value = true
  let travelHandoff = new URLSearchParams(window.location.search)
  try {
    if (localMockAuth && authority) {
      const response = await fetch(`${authority}/mock-session`)
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      const session = await response.json() as { access_token: string; profile: Record<string, unknown> }
      user.value = { access_token: session.access_token, profile: session.profile } as User
      window.history.replaceState({}, document.title, window.location.pathname)
    } else if (window.location.search.includes('code=')) {
      if (!oidc) throw new Error('登录回调已到达，但 OIDC 配置缺失。')
      user.value = await oidc.signinRedirectCallback()
      const returnTo = (user.value.state as { returnTo?: unknown } | undefined)?.returnTo
      if (typeof returnTo === 'string') travelHandoff = new URLSearchParams(new URL(returnTo, window.location.origin).search)
      window.history.replaceState({}, document.title, typeof returnTo === 'string' ? returnTo : '/')
    } else if (oidc) user.value = await oidc.getUser()

    const tripId = travelHandoff.get('travelTripId')
    if (user.value && tripId) {
      if (!apiUrl) throw new Error('SmartLedger API 地址尚未配置。')
      const response = await fetch(`${apiUrl}/api/v1/integrations/wheretogo/trips/${encodeURIComponent(tripId)}/open`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${user.value.access_token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tripName: travelHandoff.get('travelTripName') || '旅行账本',
          destination: travelHandoff.get('travelDestination'),
          startsOn: travelHandoff.get('travelStartsOn'),
          endsOn: travelHandoff.get('travelEndsOn'),
        }),
      })
      if (!response.ok) throw new Error(`打开旅行账本失败（HTTP ${response.status}）`)
      const result = await response.json() as { url: string }
      const target = new URL(result.url, window.location.origin)
      if (target.origin !== window.location.origin || !/^\/books\/[0-9a-f-]+\/?$/i.test(target.pathname)) throw new Error('旅行账本服务返回了无效页面地址。')
      window.location.replace(target.toString())
    }
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : '初始化登录状态失败。'
  } finally { loading.value = false }
})
</script>

<template>
  <LedgerWorkspace v-if="user && apiUrl && !error" :user="user" :api-url="apiUrl" :account-key="accountKey" :book-id="bookId" />
  <main v-else class="auth-screen"><div v-if="loading" class="auth-card"><div class="auth-mark">🐟</div><h1>正在打开 SmartLedger</h1><p>准备本地账本空间…</p></div><div v-else class="auth-card"><div class="auth-mark">🐟</div><div class="eyebrow">SMARTLEDGER</div><h1>轻松记录每一笔。</h1><p>一个独立的个人记账空间，账本、流水、预算与导入工具都在这里。</p><button v-if="!localMockAuth" class="primary-button" @click="signIn">登录 SmartLedger <span>→</span></button><p v-if="error" class="error-message">{{ error }}</p></div></main>
</template>
