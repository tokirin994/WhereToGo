<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import UiIcon from './UiIcon.vue'
const props=defineProps<{ channels:string[]; saving:boolean; error:string }>()
const emit=defineEmits<{ change:[channels:string[]] }>()
const name=ref(''),validation=ref('')
const preview=computed(()=>props.channels.length?props.channels.slice(0,3).join(' · ')+(props.channels.length>3?' …':''):'添加常用支付方式')
function add(){
  validation.value=''
  const value=name.value.trim()
  if(!value){validation.value='请输入渠道名称';return}
  if(value.length>40){validation.value='渠道名称最多 40 个字';return}
  if(props.channels.some(channel=>channel.toLocaleLowerCase()===value.toLocaleLowerCase())){validation.value='这个支付渠道已经添加过了';return}
  emit('change',[...props.channels,value])
}
watch(()=>props.channels,channels=>{if(channels.includes(name.value.trim()))name.value=''}, {deep:true})
</script>
<template>
  <details class="channel-settings">
    <summary><span class="channel-settings-icon"><UiIcon name="wallet" :size="20"/></span><span class="channel-settings-copy"><b>支付渠道 <small>{{ channels.length }}</small></b><span>{{ preview }}</span></span><UiIcon class="channel-settings-chevron" name="down" :size="17"/></summary>
    <div class="channel-settings-body">
      <p>管理记账和识图时可选的常用支付方式</p>
      <div v-if="channels.length" class="channel-settings-list"><div v-for="channel in channels" :key="channel"><span class="channel-item-mark"><UiIcon name="wallet" :size="16"/></span><b>{{ channel }}</b><button type="button" :disabled="saving" :aria-label="`移除支付渠道 ${channel}`" @click="emit('change',channels.filter(value=>value!==channel))"><UiIcon name="close" :size="15"/></button></div></div>
      <div v-else class="channel-settings-empty">还没有支付渠道，在下方添加一个吧。</div>
      <form class="channel-settings-add" @submit.prevent="add"><label class="sr-only" for="payment-channel-name">新支付渠道名称</label><input id="payment-channel-name" v-model="name" maxlength="40" autocomplete="off" placeholder="例如：公司补贴" :disabled="saving" @input="validation=''"/><button type="submit" class="feature-button" :disabled="saving||!name.trim()"><UiIcon name="plus" :size="15"/>{{ saving?'保存中':'添加' }}</button></form>
      <p v-if="validation||error" class="channel-settings-error" role="alert">{{ validation||error }}</p>
    </div>
  </details>
</template>
<style scoped>
.channel-settings{border-top:1px solid var(--app-line);color:var(--app-ink);}
.channel-settings summary{display:flex;align-items:center;gap:12px;padding:18px 0;list-style:none;cursor:pointer;user-select:none;}
.channel-settings summary::-webkit-details-marker{display:none;}.channel-settings summary::marker{content:'';}
.channel-settings summary:focus-visible{outline:2px solid var(--app-accent);outline-offset:3px;border-radius:10px;}
.channel-settings-icon{display:grid;place-items:center;flex:none;width:39px;height:39px;border-radius:12px;background:var(--app-soft);color:var(--app-accent);}
.channel-settings-copy{display:flex;flex:1;min-width:0;flex-direction:column;gap:7px;}.channel-settings-copy>b{display:flex;align-items:center;gap:8px;font-size:13px;font-weight:600;}.channel-settings-copy>b>small{min-width:20px;padding:2px 6px;border-radius:6px;background:var(--app-raised);color:var(--app-muted);font-size:10px;font-weight:500;text-align:center;}.channel-settings-copy>span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:11px;color:var(--app-muted);}
.channel-settings-chevron{color:var(--app-muted);transition:transform .18s;}.channel-settings[open] .channel-settings-chevron{transform:rotate(180deg);}
.channel-settings-body{padding:0 0 18px;}.channel-settings-body>p{margin:0 0 13px;color:var(--app-muted);font-size:11px;line-height:1.7;}
.channel-settings-list{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;max-height:280px;overflow-y:auto;overscroll-behavior:contain;}
.channel-settings-list>div{display:flex;align-items:center;gap:9px;padding:10px 11px;border:1px solid var(--app-line);border-radius:11px;background:var(--app-raised);}.channel-item-mark{display:grid;place-items:center;flex:none;color:var(--app-muted);}.channel-settings-list b{flex:1;min-width:0;overflow-wrap:anywhere;font-size:12px;font-weight:500;}
.channel-settings-list button{display:grid;place-items:center;flex:none;width:26px;height:26px;padding:0;border:0;border-radius:7px;background:transparent;color:var(--app-muted);cursor:pointer;}.channel-settings-list button:hover{background:color-mix(in srgb,var(--app-danger) 12%,var(--app-surface));color:var(--app-danger);}.channel-settings-list button:focus-visible{outline:2px solid var(--app-accent);}
.channel-settings-add{display:flex;align-items:stretch;gap:9px;margin-top:13px;}.channel-settings .channel-settings-add input{flex:1;width:0;min-width:0;padding:10px 12px;border:1px solid var(--app-line);border-radius:10px;background:var(--app-raised);color:var(--app-ink);font-size:12px;}.channel-settings-add>.feature-button{flex:none;font-size:12px;}
.channel-settings-empty{padding:15px;border-radius:10px;background:var(--app-raised);color:var(--app-muted);font-size:12px;line-height:1.8;}.channel-settings-body>.channel-settings-error{margin:10px 0 0;color:var(--app-danger);}.sr-only{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0;}
@media(max-width:400px){.channel-settings-list{grid-template-columns:1fr;}}
@media(prefers-reduced-motion:reduce){.channel-settings-chevron{transition:none;}}
</style>
