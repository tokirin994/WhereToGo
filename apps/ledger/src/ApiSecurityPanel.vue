<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { apiError, authorizedRequest } from './apiClient'
import { accountUrl } from './appLinks'
import UiIcon from './UiIcon.vue'
const props=defineProps<{apiUrl:string;token:string}>()
const info=ref<{authentication:string;localDevelopment:boolean;maxRequestBytes:number;requestsPerMinute:number;writesPerMinute:number}|null>(null)
const error=ref(''),busy=ref(false)
async function load(){busy.value=true;error.value='';try{const response=await authorizedRequest(props.apiUrl,props.token,'/api/v1/system/info');if(!response.ok)throw await apiError(response,'读取接口策略失败');info.value=await response.json()}catch(cause){error.value=cause instanceof Error?cause.message:'读取失败'}finally{busy.value=false}}
function logout(){window.dispatchEvent(new Event('smartledger-sign-out'))}
onMounted(load)
</script>
<template>
  <section class="settings-card api-security-panel" :aria-busy="busy">
    <header><span class="settings-icon"><UiIcon name="users" :size="22"/></span><div><h3>账号与安全</h3><small>一个账号，连接旅行与记账</small></div><span v-if="info" class="security-mode" :class="{'is-local':info.localDevelopment}">{{ info.localDevelopment?'开发模式':'统一认证' }}</span></header>
    <a class="security-account-link" :href="accountUrl"><span class="security-account-icon"><UiIcon name="users" :size="20"/></span><span><b>账号中心</b><small>个人资料 · 密码与设备 · AI / 地图 Key</small></span><UiIcon name="chevron" :size="17"/></a>
    <p class="security-caption">旅行与记账共享登录，坚果云凭据也可在账号中心管理。</p>
    <details class="security-details"><summary><span><UiIcon name="filter" :size="16"/>接口与请求策略</span><UiIcon name="down" :size="15"/></summary><dl><dt>接口地址</dt><dd class="security-endpoint">{{ apiUrl }}</dd><template v-if="info"><dt>认证方式</dt><dd>{{ info.authentication }}</dd><dt>运行模式</dt><dd>{{ info.localDevelopment?'本机开发':'正式认证' }}</dd><dt>每分钟请求</dt><dd>{{ info.requestsPerMinute }} 次 <span> / 写入 {{ info.writesPerMinute }} 次</span></dd><dt>请求大小上限</dt><dd>{{ (info.maxRequestBytes/1024/1024).toFixed(0) }} MiB</dd></template><template v-else><dt>策略状态</dt><dd>{{ busy?'正在读取…':'尚未读取，可点击下方刷新' }}</dd></template></dl></details>
    <p v-if="error" class="feature-error" role="alert">{{ error }}</p>
    <div class="security-actions"><button type="button" :disabled="busy" @click="load"><UiIcon name="sync" :size="16"/>{{ busy?'读取中…':'刷新策略' }}</button><button class="security-sign-out" type="button" @click="logout">退出所有应用<UiIcon name="export" :size="15"/></button></div>
  </section>
</template>
<style scoped>
.api-security-panel{min-width:0;}
.api-security-panel>header{gap:12px;align-items:center;}
.api-security-panel>header>div{flex:1;min-width:0;}
.api-security-panel .settings-icon{flex:none;}
.security-mode{flex:none;padding:5px 9px;border:1px solid color-mix(in srgb,var(--app-accent) 20%,var(--app-line));border-radius:7px;color:var(--app-accent);background:color-mix(in srgb,var(--app-accent) 8%,var(--app-surface));font-size:10px;font-weight:550;white-space:nowrap;}
.security-mode.is-local{color:var(--app-muted);background:var(--app-soft);border-color:var(--app-line);}
.security-account-link,.security-account-link:visited{display:flex;align-items:center;gap:12px;padding:16px;margin-top:19px;border:1px solid var(--app-line);border-radius:13px;background:var(--app-soft);color:var(--app-ink);text-decoration:none;transition:border-color .15s;}
.security-account-link:hover{border-color:var(--app-accent);}
.security-account-icon{display:grid;place-items:center;flex:none;width:38px;height:38px;border-radius:11px;background:color-mix(in srgb,var(--app-accent) 10%,var(--app-surface));color:var(--app-accent);}
.security-account-link>span:nth-child(2){display:grid;gap:5px;flex:1;min-width:0;}
.security-account-link b{font-size:14px;font-weight:600;line-height:1.5;}
.security-account-link small{font-size:11px;line-height:1.7;color:var(--app-muted);}
.security-account-link>svg{flex:none;color:var(--app-muted);}
.security-caption{margin:12px 2px 18px;color:var(--app-muted);font-size:11px;line-height:1.85;}
.security-details{border:1px solid var(--app-line);border-radius:11px;background:var(--app-surface);overflow:hidden;}
.security-details summary{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:14px 15px;list-style:none;font-size:12px;line-height:1.6;color:var(--app-muted);cursor:pointer;}
.security-details summary::-webkit-details-marker{display:none;}
.security-details summary>span{display:flex;align-items:center;gap:8px;}
.security-details[open] summary{border-bottom:1px solid var(--app-line);color:var(--app-ink);}
.security-details[open] summary>svg{transform:rotate(180deg);}
.security-details dl{display:grid;grid-template-columns:94px minmax(0,1fr);gap:13px 16px;padding:17px 15px;margin:0;font-size:12px;line-height:1.8;}
.security-details dt{color:var(--app-muted);}
.security-details dd{min-width:0;margin:0;color:var(--app-ink);overflow-wrap:anywhere;}
.security-details dd>span{color:var(--app-muted);}
.security-endpoint{font-family:ui-monospace,SFMono-Regular,Consolas,monospace;font-size:11px;}
.security-actions{display:flex;align-items:center;justify-content:space-between;gap:12px;padding-top:19px;margin-top:19px;border-top:1px solid var(--app-line);}
.security-actions button{display:inline-flex;align-items:center;justify-content:center;gap:8px;min-height:40px;padding:9px 13px;border:1px solid var(--app-line);border-radius:10px;background:var(--app-surface);color:var(--app-ink);font:inherit;font-size:12px;cursor:pointer;}
.security-actions .security-sign-out{border-color:transparent;background:transparent;color:var(--app-muted);}
.security-actions button:hover:not(:disabled){background:var(--app-soft);color:var(--app-accent);}
.security-actions button:disabled{opacity:.5;cursor:wait;}
.api-security-panel :is(a,button,summary):focus-visible{outline:2px solid var(--app-accent);outline-offset:3px;}
@media(max-width:480px){.api-security-panel>header{flex-wrap:wrap;}.security-mode{margin-left:auto;}.security-details dl{grid-template-columns:1fr;gap:4px;}.security-details dd+dt{margin-top:9px;}.security-account-link{padding:14px 12px;gap:10px;}.security-account-link small{font-size:10px;}.security-caption{font-size:10px;}.security-actions button{font-size:11px;padding:9px 11px;}}
@media(prefers-reduced-motion:reduce){.security-account-link{transition:none;}}
</style>
