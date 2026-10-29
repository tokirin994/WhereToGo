<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { ArrowLeft, ArrowUpRight, Check, ChevronRight, Cloud, Fingerprint, KeyRound, LayoutGrid, LockKeyhole, Monitor, RefreshCw, ShieldCheck, UserRound } from '@lucide/vue'
import { accountConsoleUrl, authError, currentUser, identity, signOut } from './auth'
import {platform} from './appLinks'
import { apiRequest } from './api/client'
import { accountRequest, ledgerAccountRequest, type AccountProfile, type AccountSession, type ProviderList, type NutstoreStatus } from './accountApi'
import { providerPresets } from './providerPresets'
import {accountDate as date,accountProfile,accountSessions} from './accountPresentation'
import AccountOverview from './AccountOverview.vue'
import './portal.css'
import './account-center.css'
const theme=ref((()=>{try{const value=localStorage.getItem('personal-portal-theme');return value==='dark'||value==='light'?value:'system'}catch{return 'system'}})())
watch(theme,value=>{try{localStorage.setItem('personal-portal-theme',value)}catch{/* Theme selection still works without persistence. */}})
const initialTab=new URLSearchParams(location.search).get('tab')||'overview'
const tab=ref(['overview','profile','security','providers','ledger'].includes(initialTab)?initialTab:'overview')
watch(tab,value=>{const url=new URL(location.href);url.searchParams.set('tab',value);history.replaceState({},'',url.pathname+url.search)})
const profile=ref<AccountProfile|null>(null),sessions=ref<AccountSession[]>([]),providers=ref<ProviderList>({available:false,encryption:'AES-256-GCM',providers:[]})
const pending=ref(''),error=ref(''),message=ref(''),identityError=ref(''),providerError=ref(''),ledgerError=ref('')
const sessionError=ref(''),loadingIdentity=ref(true),loadingProviders=ref(true),loadingLedger=ref(true)
const loading=computed(()=>loadingIdentity.value||loadingProviders.value||loadingLedger.value)
const selected=ref('deepseek'),apiKey=ref(''),baseUrl=ref(''),model=ref(''),protocol=ref('chat-completions'),tokenField=ref('max_tokens'),authMode=ref('api-key'),enabled=ref(true)
const names=ref({firstName:'',lastName:''}),nutstore=ref<NutstoreStatus|null>(null),nutstoreDraft=ref({username:'',appPassword:''})
const selectedStatus=computed(()=>providers.value.providers.find(row=>row.provider===selected.value))
const name=computed(()=>[profile.value?.firstName,profile.value?.lastName].filter(Boolean).join(' ')||profile.value?.username||String(currentUser.value?.profile.preferred_username||'我的账号'))
const travelUrl=platform.launchUrl('travel'),smartLedgerUrl=platform.launchUrl('ledger')
const ledgerSettings=platform.launchUrl('ledger',new URL('?section=settings',platform.application('ledger').url).href)
const sections=[
  {id:'overview',name:'账号总览',description:'我的应用与常用设置',icon:LayoutGrid},
  {id:'profile',name:'个人资料',description:'称呼与绑定邮箱',icon:UserRound},
  {id:'security',name:'登录安全',description:'密码与登录设备',icon:ShieldCheck},
  {id:'providers',name:'AI 与地图 Key',description:'个人服务与调用配置',icon:KeyRound},
  {id:'ledger',name:'记账与云同步',description:'坚果云凭据与备份',icon:Cloud},
]
const activeSection=computed(()=>sections.find(item=>item.id===tab.value)!)
const profileChanged=computed(()=>!!profile.value&&(names.value.firstName!==(profile.value.firstName||'')||names.value.lastName!==(profile.value.lastName||'')))
const providerCount=computed(()=>providers.value.providers.filter(item=>!item.needsUpdate).length)
const sectionNav=ref<HTMLElement|null>(null)
function switchTab(id:string){if(pending.value)return;tab.value=id;error.value='';message.value=''}
async function navigateSections(event:KeyboardEvent){
 if(pending.value||event.altKey||event.ctrlKey||event.metaKey)return
 const buttons=[...(sectionNav.value?.querySelectorAll<HTMLButtonElement>('button')||[])]
 const current=buttons.findIndex(button=>button.contains(event.target as Node))
 if(current<0)return
 const next=event.key==='Home'?0:event.key==='End'?sections.length-1:['ArrowRight','ArrowDown'].includes(event.key)?(current+1)%sections.length:['ArrowLeft','ArrowUp'].includes(event.key)?(current+sections.length-1)%sections.length:-1
 if(next<0)return
 event.preventDefault();switchTab(sections[next]!.id);await nextTick();buttons[next]?.focus()
}
function resetProfile(){if(!profile.value)return;names.value={firstName:profile.value.firstName||'',lastName:profile.value.lastName||''};message.value='已撤销未保存的资料修改'}
function openProvider(id:string){switchTab('providers');selectProvider(id)}
function selectProvider(id:string){selected.value=id;const saved=providers.value.providers.find(row=>row.provider===id),preset=providerPresets.find(row=>row.id===id)!;baseUrl.value=saved?.config?.baseUrl||preset.baseUrl;model.value=saved?.config?.model||preset.model;protocol.value=saved?.config?.protocol||preset.protocol;tokenField.value=saved?.config?.tokenField||'max_tokens';authMode.value=saved?.config?.authMode||'api-key';enabled.value=saved?.enabled??true;apiKey.value='';message.value=''}
async function act(name:string,action:()=>Promise<void>){if(pending.value)return;pending.value=name;error.value='';message.value='';try{await action()}catch(cause){error.value=cause instanceof Error?cause.message:'操作失败，请稍后重试'}finally{pending.value=''}}
async function loadIdentity(){identityError.value='';sessionError.value='';loadingIdentity.value=true;try{const [info,devices]=await Promise.allSettled([accountRequest<unknown>('/'),accountRequest<unknown>('/sessions')]);try{if(info.status==='rejected')throw info.reason;const valid=accountProfile(info.value);profile.value=valid;names.value={firstName:valid.firstName||'',lastName:valid.lastName||''}}catch(cause){identityError.value=cause instanceof Error?cause.message:'读取账号资料失败'}try{if(devices.status==='rejected')throw devices.reason;sessions.value=accountSessions(devices.value)}catch(cause){sessionError.value=cause instanceof Error?cause.message:'读取登录设备失败'}}finally{loadingIdentity.value=false}}
async function loadProviders(){providerError.value='';loadingProviders.value=true;try{const result=await apiRequest<ProviderList>('/api/v1/account/providers');if(!result||!Array.isArray(result.providers))throw new Error('服务配置格式异常，请重试');providers.value=result;selectProvider(selected.value)}catch(cause){providerError.value=cause instanceof Error?cause.message:'读取服务 Key 失败'}finally{loadingProviders.value=false}}
async function loadLedger(){ledgerError.value='';loadingLedger.value=true;try{nutstore.value=await ledgerAccountRequest<NutstoreStatus>()}catch(cause){ledgerError.value=cause instanceof Error?cause.message:'无法连接记账账号，请刷新重试'}finally{loadingLedger.value=false}}
async function load(){await Promise.all([loadIdentity(),loadProviders(),loadLedger()])}
async function saveProfile(){await act('profile',async()=>{await accountRequest('/', 'POST',{username:profile.value?.username,email:profile.value?.email,firstName:names.value.firstName,lastName:names.value.lastName});await loadIdentity();message.value='个人资料已保存'})}
async function sensitive(action:'UPDATE_EMAIL'|'UPDATE_PASSWORD'){await act(action,()=>identity.accountAction(action))}
async function saveProvider(){await act('provider',async()=>{providers.value=await apiRequest<ProviderList>('/api/v1/account/providers/'+selected.value,{method:'PUT',body:JSON.stringify({apiKey:apiKey.value,baseUrl:baseUrl.value,model:model.value,protocol:protocol.value,tokenField:tokenField.value,authMode:authMode.value,enabled:enabled.value})});apiKey.value='';message.value='已加密保存，后续旅行请求使用当前启用的个人配置'})}
async function removeProvider(){if(!window.confirm('删除当前服务的 Key 和配置？删除后此服务将使用部署默认配置（若有）。'))return;await act('delete',async()=>{providers.value=await apiRequest<ProviderList>('/api/v1/account/providers/'+selected.value,{method:'DELETE'});selectProvider(selected.value);message.value='个人配置已删除'})}
async function testProvider(){await act('test',async()=>{const result=await apiRequest<{message:string}>('/api/v1/account/providers/'+selected.value+'/test',{method:'POST'});message.value=result.message})}
async function revokeSession(id?:string){if(!window.confirm(id?'结束这个设备的登录会话？':'退出其他设备的登录会话？当前设备会保留。'))return;await act('session',async()=>{await accountRequest('/sessions'+(id?'/'+encodeURIComponent(id):''),'DELETE');await loadIdentity();message.value='登录会话已结束；已签发的短期访问令牌可能在到期前仍有效'})}
async function saveNutstore(){await act('nutstore',async()=>{nutstore.value=await ledgerAccountRequest<NutstoreStatus>('PUT',nutstoreDraft.value);nutstoreDraft.value={username:'',appPassword:''};message.value='已更新记账服务的加密凭据；在 SmartLedger 中立即生效'})}
async function removeNutstore(){if(!window.confirm('删除当前账号在记账服务中保存的坚果云凭据？不会删除坚果云备份文件。'))return;await act('nutstore-delete',async()=>{nutstore.value=await ledgerAccountRequest<NutstoreStatus>('DELETE');nutstoreDraft.value={username:'',appPassword:''};message.value='已删除记账服务的坚果云凭据'})}
onMounted(async()=>{selectProvider(selected.value);await load();const params=new URLSearchParams(location.search);if(params.has('accountAction')){message.value=params.get('actionResult')==='success'?'账号安全设置已更新':params.get('actionResult')==='cancelled'?'已取消修改':'已返回账号中心，请核对最新资料';params.delete('accountAction');params.delete('actionResult');history.replaceState({},'',location.pathname+(params.toString()?'?'+params:''))}})
</script>
<template>
  <main class="personal-portal account-center" :class="`portal-${theme}`">
    <header class="portal-header account-topbar"><a class="portal-brand" href="/"><span><LayoutGrid :size="19"/></span><b>我的空间<small>PERSONAL SPACE</small></b></a><a class="account-back" href="/"><ArrowLeft :size="15"/>返回门户</a></header>
    <section class="account-content">
      <div class="account-heading"><div><span class="account-eyebrow">ACCOUNT / WORKSPACE</span><h1>账号与应用</h1><p>打开应用，管理资料、安全与个人服务。</p></div><button class="account-button account-refresh" :disabled="!!pending||loading" @click="act('refresh',load)"><RefreshCw :size="15" :class="{'account-spinning':pending==='refresh'||loading}"/>{{ pending==='refresh'||loading?'同步中…':'刷新信息' }}</button></div>
      <article class="account-profile" :class="{'is-overview':tab==='overview'}"><span class="account-avatar" aria-hidden="true">{{ name.slice(0,1).toUpperCase() }}</span><div class="account-profile-copy"><span class="account-eyebrow">我的账号</span><h2>{{ name }}</h2><p>{{ profile?.email||currentUser?.profile.email||'尚未填写邮箱' }}</p><span class="account-badge" :class="{'is-verified':profile?.emailVerified}"><Check v-if="profile?.emailVerified" :size="12"/>{{ profile?.emailVerified?'邮箱已验证':'邮箱未验证' }}</span></div><div v-if="tab!=='overview'" class="account-connected"><span><ShieldCheck :size="15"/>统一身份管理</span><small>一次登录，连接所有应用</small><div><a :href="travelUrl">旅行规划<ArrowUpRight :size="12"/></a><a :href="smartLedgerUrl">日常记账<ArrowUpRight :size="12"/></a></div></div></article>
      <div class="account-layout">
      <aside class="account-sidebar"><nav ref="sectionNav" class="account-tabs" aria-label="账号设置" @keydown="navigateSections"><button v-for="item in sections" :key="item.id" :aria-current="tab===item.id?'page':undefined" :disabled="!!pending" @click="switchTab(item.id)"><component :is="item.icon" :size="19"/><span><b>{{ item.name }}</b><small>{{ item.description }}</small></span><ChevronRight class="account-nav-arrow" :size="14"/></button></nav><div class="account-sidebar-note"><LockKeyhole :size="17"/><p>你的凭据，只属于你。<small>服务 Key 加密保存，账号在应用间统一管理。</small></p></div></aside>
      <div class="account-workspace" :aria-busy="!!pending||loading">
      <div class="account-section-title"><span><component :is="activeSection.icon" :size="18"/></span><div><small>{{ tab==='overview'?'我的工作台':'账号设置' }}</small><h2>{{ activeSection.name }}</h2></div><span class="account-section-count">{{ sections.findIndex(item=>item.id===tab)+1 }} / {{ sections.length }}</span></div>
      <p v-if="error||authError" class="account-notice error" role="alert">{{ error||authError }}</p><p v-if="message" class="account-notice" role="status">{{ message }}</p>
      <p v-if="loading" class="account-loading" role="status"><RefreshCw :size="14" class="account-spinning"/>正在同步账号信息，应用入口可以直接使用。</p>
      <p v-if="tab==='overview'&&(identityError||sessionError||providerError||ledgerError)" class="account-notice error" role="alert">部分账号信息暂未读取，应用仍可打开。进入对应设置可查看原因并重试。</p>
      <AccountOverview v-if="tab==='overview'" :session-count="sessions.length" :provider-count="providerCount" :cloud-configured="!!nutstore?.configured" :identity-state="loadingIdentity?'loading':identityError||sessionError?'error':'ready'" :provider-state="loadingProviders?'loading':providerError?'error':'ready'" :ledger-state="loadingLedger?'loading':ledgerError?'error':'ready'" :theme="theme" @navigate="switchTab" @provider="openProvider" @theme="theme=$event"/>
      <section v-else-if="tab==='profile'" class="account-section">
        <div class="account-card-heading"><span class="account-card-icon"><UserRound :size="20"/></span><div><h2>基本信息</h2><p>让应用用你喜欢的方式称呼你。</p></div></div><p v-if="identityError" class="account-notice error" role="alert">{{ identityError }} <button class="account-button" :disabled="!!pending||loadingIdentity" @click="act('identity-refresh',loadIdentity)">重新读取资料</button></p>
        <form class="account-form" @submit.prevent="saveProfile"><label>用户名<input :value="profile?.username||currentUser?.profile.preferred_username" readonly/><small>注册时的唯一名称，暂不支持修改。</small></label><div class="account-two-columns"><label>名字<input v-model.trim="names.firstName" maxlength="255" autocomplete="given-name" placeholder="你的名字"/></label><label>姓氏<input v-model.trim="names.lastName" maxlength="255" autocomplete="family-name" placeholder="你的姓氏"/></label></div><div class="account-save-row"><small>{{ profileChanged?'资料有改动，记得保存':'资料已与统一账号同步' }}</small><div class="account-actions"><button class="account-button primary" :disabled="!!pending||!profileChanged">{{ pending==='profile'?'保存中…':'保存资料' }}</button><button v-if="profileChanged" type="button" class="account-button" :disabled="!!pending" @click="resetProfile">撤销修改</button></div></div></form>
        <div class="account-setting-row"><div><h3>绑定邮箱</h3><p>{{ profile?.email||'尚未设置' }}</p><small>新邮箱目前不发送验证邮件；更换后会标记为未验证。</small></div><button class="account-button" :disabled="!!pending" @click="sensitive('UPDATE_EMAIL')">更换邮箱 →</button></div>
        <details class="account-details"><summary>账号标识</summary><dl><dt>账号 ID</dt><dd>{{ profile?.id||currentUser?.profile.sub }}</dd><dt>身份服务</dt><dd>{{ currentUser?.profile.iss }}</dd></dl></details>
      </section>
      <section v-else-if="tab==='security'" class="account-section">
        <div class="account-card-heading"><span class="account-card-icon"><ShieldCheck :size="20"/></span><div><h2>把账号的安全握在手里</h2><p>密码、设备与应用，共享一套安全设置。</p></div></div><div class="account-setting-row"><div><h3>登录密码</h3><p>先验证当前身份，再设置新密码。密码由统一身份服务保管。</p></div><button class="account-button" :disabled="!!pending" @click="sensitive('UPDATE_PASSWORD')">修改密码 →</button></div>
        <div class="account-setting-row"><div><h3>登录设备</h3><p>旅游与记账共享登录状态，可以结束不再使用的设备会话。</p></div><button class="account-button" :disabled="!!pending||!sessions.some(item=>!item.current)" @click="revokeSession()">退出其他设备</button></div><p v-if="sessionError" class="account-notice error" role="alert">{{ sessionError }} <button class="account-button" :disabled="!!pending||loadingIdentity" @click="act('identity-refresh',loadIdentity)">重新读取设备</button></p>
        <ul class="account-list"><li v-for="session in sessions" :key="session.id"><span class="account-device-icon"><Monitor :size="19"/></span><div><b>{{ session.browser||'浏览器会话' }} <span v-if="session.current" class="account-badge is-verified">当前设备</span></b><p>{{ session.ipAddress||'未知地址' }} · 最近活动 {{ date(session.lastAccess) }}</p><small>{{ session.clients?.map(client=>client.clientName||client.clientId).join('、') }}</small></div><button v-if="!session.current" class="account-button danger" :disabled="!!pending" @click="revokeSession(session.id)">结束会话</button></li></ul>
        <p v-if="!sessions.length" class="account-empty">暂无设备信息，可刷新重试。</p><div class="account-setting-row"><div><h3>更多安全设置</h3><p>管理验证器、多因素认证及应用授权。</p></div><a class="account-button" :href="accountConsoleUrl+'account-security/signing-in'">打开安全设置 ↗</a></div><button class="account-button danger" @click="signOut">退出当前账号及所有应用</button>
      </section>
      <section v-else-if="tab==='providers'" class="account-section">
        <div class="account-card-heading"><span class="account-card-icon"><KeyRound :size="20"/></span><div><h2>连接你喜欢的服务</h2><p>已配置 {{ providerCount }} 项 · 选择服务后管理个人 Key。</p></div></div><div class="account-encryption-note"><LockKeyhole :size="15"/><span>服务器 AES-256-GCM 加密保存，Key 不回显，也不写入账本导出。</span></div><p v-if="providerError" class="account-notice error" role="alert">{{ providerError }} <button class="account-button" :disabled="!!pending||loadingProviders" @click="act('provider-refresh',loadProviders)">重试连接</button></p><p v-if="!loadingProviders&&!providerError&&!providers.available" class="account-notice error">服务凭据加密尚未就绪，暂不能保存 Key。</p>
        <div class="account-provider-grid"><button v-for="provider in providerPresets" :key="provider.id" type="button" :aria-pressed="selected===provider.id" :disabled="!!pending" @click="selectProvider(provider.id)"><span class="account-provider-monogram" aria-hidden="true">{{ provider.id==='amap'?'高':provider.id==='custom-ai'?'+':provider.name.slice(0,1) }}</span><span><b>{{ provider.name }}</b><small>{{ providers.providers.find(row=>row.provider===provider.id)?.enabled?'使用中':providers.providers.some(row=>row.provider===provider.id)?'已保存':'未配置' }}</small></span><Check v-if="selected===provider.id" :size="14"/></button></div>
        <form class="account-form" @submit.prevent="saveProvider"><h3>{{ providerPresets.find(row=>row.id===selected)?.name }}</h3><p v-if="selectedStatus" class="account-provider-status">{{ selectedStatus.needsUpdate?'需要重新配置':selectedStatus.keyMasked }} · 更新于 {{ date(selectedStatus.updatedAt) }}</p>
          <template v-if="selected!=='amap'"><label>API 地址<input v-model.trim="baseUrl" type="url" required maxlength="500" placeholder="https://provider.example/v1"/></label><div class="account-two-columns"><label>接口协议<select v-model="protocol"><option value="chat-completions">Chat Completions</option><option value="responses">Responses</option><option value="anthropic">Claude Messages</option></select></label><label>模型名称<input v-model.trim="model" required maxlength="180" placeholder="填写你有权限使用的模型"/></label></div><details class="account-details"><summary>高级兼容选项</summary><div class="account-two-columns"><label>输出 Token 参数<select v-model="tokenField"><option value="max_tokens">max_tokens</option><option value="max_completion_tokens">max_completion_tokens</option></select></label><label>Claude 认证方式<select v-model="authMode"><option value="api-key">x-api-key</option><option value="bearer">Bearer</option></select></label></div></details></template>
          <p v-else class="account-help">填写高德「Web 服务」Key，供服务器地点搜索使用。不是浏览器 JS Key；搜索坐标会转换为 WGS84 后保存。</p>
          <label>API Key<input v-model="apiKey" type="password" autocomplete="new-password" :required="!selectedStatus" maxlength="4096" :placeholder="selectedStatus?'已保存，留空保留；输入新 Key 可替换':'请输入服务商提供的 Key'"/></label>
          <label class="account-checkbox"><input v-model="enabled" type="checkbox"/>{{ selected==='amap'?'启用个人高德地点搜索':'将此 AI 设为当前使用的服务（其他个人 AI 会停用）' }}</label>
          <div class="account-actions"><button class="account-button primary" :disabled="!!pending||!providers.available">{{ pending==='provider'?'保存中…':'加密保存' }}</button><button type="button" class="account-button" :disabled="!!pending||!selectedStatus" @click="testProvider">{{ pending==='test'?'测试中…':'测试已保存配置' }}</button><button v-if="selectedStatus" type="button" class="account-button danger" :disabled="!!pending" @click="removeProvider">删除配置</button></div><small>测试 AI 会发起一条简短请求，可能产生少量服务商费用。更换服务地址时需重新填写 Key。</small>
        </form>
      </section>
      <section v-else-if="tab==='ledger'" class="account-section"><div class="account-card-heading"><span class="account-card-icon"><Cloud :size="20"/></span><div><h2>给每一笔记录，多一份安心</h2><p>与 SmartLedger 共用一份加密保存的坚果云凭据。</p></div></div><p v-if="ledgerError" class="account-notice error" role="alert">{{ ledgerError }} <a :href="smartLedgerUrl">打开记账 →</a></p><div class="account-setting-row"><div><h3>坚果云 WebDAV</h3><p>{{ nutstore?.configured?'已配置 · '+(nutstore.usernameMasked||'已隐藏账号'):'尚未配置' }}</p><small>{{ nutstore?.needsUpdate?'已有凭据无法解密，需要重新保存':'请使用坚果云第三方应用密码，不要填写登录密码。' }}</small></div><button class="account-button" :disabled="!!pending" @click="act('ledger-refresh',loadLedger)">刷新</button></div>
        <form class="account-form" @submit.prevent="saveNutstore"><label>坚果云邮箱<input v-model.trim="nutstoreDraft.username" type="email" required autocomplete="off" placeholder="name@example.com"/></label><label>第三方应用密码<input v-model="nutstoreDraft.appPassword" type="password" required autocomplete="new-password" placeholder="更换配置时重新填写完整应用密码"/></label><div class="account-actions"><button class="account-button primary" :disabled="!!pending||!nutstore?.available">加密保存到记账服务</button><button v-if="nutstore?.configured" type="button" class="account-button danger" :disabled="!!pending" @click="removeNutstore">删除凭据</button></div></form>
        <div class="account-setting-row"><div><h3>账本同步计划与备份</h3><p>在记账应用调整自动同步频率、备份及恢复账本。这里修改邮箱或密码不会改变已有账本归属。</p></div><a class="account-button" :href="ledgerSettings">打开记账同步设置 →</a></div><p class="account-help">坚果云备份内容仍为 JSON；服务器数据库的每日加密备份是独立的运维机制。</p>
      </section>
      </div></div>
      <footer class="account-footer"><span><Fingerprint :size="15"/>你的空间，你来掌握。</span><a href="/system/">查看服务状态<ArrowUpRight :size="13"/></a></footer>
    </section>
  </main>
</template>
