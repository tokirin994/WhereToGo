<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { apiError, authorizedRequest } from './apiClient'
import { accountUrl } from './appLinks'
const props=defineProps<{apiUrl:string;token:string}>()
const info=ref<{authentication:string;localDevelopment:boolean;maxRequestBytes:number;requestsPerMinute:number;writesPerMinute:number}|null>(null)
const error=ref(''),busy=ref(false)
async function load(){busy.value=true;error.value='';try{const response=await authorizedRequest(props.apiUrl,props.token,'/api/v1/system/info');if(!response.ok)throw await apiError(response,'读取接口策略失败');info.value=await response.json()}catch(cause){error.value=cause instanceof Error?cause.message:'读取失败'}finally{busy.value=false}}
function logout(){window.dispatchEvent(new Event('smartledger-sign-out'))}
onMounted(load)
</script>
<template><section class="settings-card api-security-panel"><header><span class="settings-icon">↔</span><div><h3>API 与安全</h3><small>当前服务的认证方式与请求策略</small></div></header><dl><dt>接口地址</dt><dd>{{ apiUrl }}</dd><template v-if="info"><dt>认证方式</dt><dd>{{ info.authentication }}</dd><dt>运行模式</dt><dd>{{ info.localDevelopment?'本机开发':'正式认证' }}</dd><dt>每分钟请求</dt><dd>{{ info.requestsPerMinute }} 次，写入 {{ info.writesPerMinute }} 次</dd><dt>请求大小</dt><dd>{{ (info.maxRequestBytes/1024/1024).toFixed(0) }} MiB</dd></template></dl><p v-if="error" class="feature-error" role="alert">{{ error }}</p><div class="settings-actions"><button class="secondary-button" type="button" :disabled="busy" @click="load">{{ busy?'读取中…':'刷新策略' }}</button><a :href="accountUrl">账号中心</a><button class="secondary-button" type="button" @click="logout">退出所有应用</button></div></section></template>
<style scoped>.api-security-panel dl{display:grid;grid-template-columns:92px 1fr;gap:14px;margin:20px 0;font-size:12px;line-height:1.7;}.api-security-panel dt{color:var(--app-muted);}.api-security-panel dd{margin:0;color:var(--app-ink);overflow-wrap:anywhere;}</style>
