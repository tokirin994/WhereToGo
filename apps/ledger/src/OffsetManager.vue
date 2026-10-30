<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref } from 'vue'
import type { Category, OffsetDraft, OffsetEdit, OffsetPlan, Transaction } from './ledger'
import CategoryPicker from './CategoryPicker.vue'
import CategoryIcon from './CategoryIcon.vue'
import UiIcon from './UiIcon.vue'

const props = defineProps<{
  enabled: boolean; existing: Transaction[]; edits: OffsetEdit[]; drafts: OffsetDraft[]
  amount: number; sourceDate: string; editing: boolean; categories: Category[]
  appearanceMode: 'system'|'light'|'dark'; disabled?: boolean
}>()
const emit = defineEmits<{
  'update:enabled': [value:boolean]; 'update:edits': [value:OffsetEdit[]]
  'update:drafts': [value:OffsetDraft[]]; clear: [ids:string[]]
}>()
const expanded = ref('')
const dialog = ref<HTMLDialogElement|null>(null)
const confirmation = ref<'clear'|'remove'|'limit'|null>(null)
const confirmationRows = ref<Array<{id:string;name:string;amount:number;date:string;pending:boolean}>>([])
const limit = ref<OffsetPlan|null>(null)
type Choice = 'keep'|'normalize'|'confirm'|null
let resolveConfirmation: ((choice:Choice)=>void)|null = null
const money = (value:number) => new Intl.NumberFormat('zh-CN',{style:'currency',currency:'CNY'}).format(value||0)
const category = (id:string|null) => props.categories.find(item=>item.id===id)
const dateText = (value:string) => {const date=new Date(value);return Number.isNaN(date.getTime())?'日期待填写':date.toLocaleString('zh-CN',{year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false})}
function localTime(value:string){const date=new Date(value);if(Number.isNaN(date.getTime()))return '';return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}T${String(date.getHours()).padStart(2,'0')}:${String(date.getMinutes()).padStart(2,'0')}`}
const newAmount = (row:OffsetDraft) => Math.round((props.amount||0)*(Number(row.ratio)||0))/100
const total = computed(()=>props.edits.reduce((sum,row)=>sum+Math.round((Number(row.amount)||0)*100),0)/100+props.drafts.reduce((sum,row)=>sum+newAmount(row),0))
const percent = computed(()=>props.amount>0?total.value/props.amount*100:0)
function patchEdit(id:string,changes:Partial<OffsetEdit>){emit('update:edits',props.edits.map(row=>row.id===id?{...row,...changes}:row))}
function patchDraft(id:string,changes:Partial<OffsetDraft>){emit('update:drafts',props.drafts.map(row=>row.id===id?{...row,...changes}:row))}
function addDraft(){
  const id=crypto.randomUUID(),categoryId=props.categories.find(item=>item.flowType==='income'&&item.name==='报销')?.id||props.categories.find(item=>item.flowType==='income')?.id||null
  const remaining=Math.max(0,100-percent.value)
  emit('update:drafts',[...props.drafts,{id,categoryId,ratio:remaining>0?Math.round(remaining*100)/100:100,happenedAt:props.editing?new Date().toISOString():props.sourceDate,dateMode:props.editing?'independent':'source'}])
  expanded.value=id
}
function choose(choice:Choice){dialog.value?.close();confirmation.value=null;const resolve=resolveConfirmation;resolveConfirmation=null;resolve?.(choice)}
function ask(kind:'clear'|'remove'|'limit'):Promise<Choice>{
  choose(null);confirmation.value=kind
  return new Promise(resolve=>{resolveConfirmation=resolve;void nextTick(()=>{if(resolveConfirmation===resolve)dialog.value?.showModal()})})
}
async function confirmClearAll(){
  confirmationRows.value=[...props.existing.map(row=>({id:row.id,name:category(row.categoryId)?.name||'抵扣收入',amount:row.amount,date:row.happenedAt,pending:false})),...props.drafts.map(row=>({id:row.id,name:category(row.categoryId)?.name||'新增抵扣',amount:newAmount(row),date:row.dateMode==='source'?props.sourceDate:row.happenedAt,pending:true}))]
  if(!confirmationRows.value.length)return true
  return await ask('clear')==='confirm'
}
async function toggle(event:Event){
  const input=event.target as HTMLInputElement
  // The checkbox stays at its saved state until the user confirms the full list.
  const enabled=input.checked;input.checked=props.enabled
  if(!enabled){if(!await confirmClearAll())return;emit('clear',props.existing.map(row=>row.id));emit('update:edits',[]);emit('update:drafts',[])}
  emit('update:enabled',enabled)
  if(enabled&&!props.existing.length&&!props.drafts.length)addDraft()
}
async function removeEdit(row:OffsetEdit){
  confirmationRows.value=[{id:row.id,name:category(row.categoryId)?.name||'抵扣收入',amount:row.amount,date:row.dateMode==='source'?props.sourceDate:row.happenedAt,pending:false}]
  if(await ask('remove')==='confirm')emit('update:edits',props.edits.filter(item=>item.id!==row.id))
}
async function confirmLimit(plan:OffsetPlan):Promise<'keep'|'normalize'|null>{limit.value=plan;const choice=await ask('limit');return choice==='keep'||choice==='normalize'?choice:null}
defineExpose({confirmLimit,confirmClearAll})
onBeforeUnmount(()=>choose(null))
</script>

<template>
  <section class="feature-section offset-manager">
    <header class="feature-heading"><div><h3>抵扣与报销</h3><p>每笔抵扣单独保留，修改支出不会重算已收金额</p></div><label class="feature-switch"><input type="checkbox" :checked="enabled" :disabled="disabled" aria-label="启用抵扣与报销" @change="toggle"/><span></span><b>启用</b></label></header>
    <fieldset v-if="enabled" :disabled="disabled" class="offset-fields">
      <div class="offset-summary"><div><small>累计抵扣</small><strong>{{ money(total) }}</strong></div><span :class="{'over-limit':percent>100}">{{ percent.toFixed(1) }}% <small> / 支出 {{ money(amount) }}</small></span></div>
      <p v-if="editing" class="offset-hint">后续追加抵扣默认使用当前时间；已收到的抵扣金额保持不变。</p>
      <article v-for="row in edits" :key="row.id" class="offset-card">
        <button type="button" class="offset-card-heading" :aria-expanded="expanded===row.id" @click="expanded=expanded===row.id?'':row.id"><CategoryIcon :name="category(row.categoryId)?.icon" :category-name="category(row.categoryId)?.name" flow-type="income" :color="category(row.categoryId)?.color" :size="24"/><span><b>{{ category(row.categoryId)?.name||'抵扣收入' }}</b><small>{{ row.dateMode==='source'?'跟随原支出':dateText(row.happenedAt) }} · 已有抵扣</small></span><strong>{{ money(row.amount) }}</strong><UiIcon :name="expanded===row.id?'down':'chevron'" :size="16"/></button>
        <div v-if="expanded===row.id" class="offset-card-body"><div class="feature-fields"><CategoryPicker :model-value="row.categoryId" @update:model-value="patchEdit(row.id,{categoryId:typeof $event==='string'?$event:null})" title="收入分类" :categories="categories" flow-type="income" :appearance-mode="appearanceMode"/><label>已收金额<input type="number" min="0.01" step="0.01" required :value="row.amount" @input="patchEdit(row.id,{amount:Number(($event.target as HTMLInputElement).value)})"/></label><label class="feature-full">抵扣日期与时间<input type="datetime-local" required :value="localTime(row.dateMode==='source'?sourceDate:row.happenedAt)" @input="patchEdit(row.id,{happenedAt:($event.target as HTMLInputElement).value,dateMode:'independent'})"/></label></div><div class="offset-row-footer"><label><input type="checkbox" :checked="row.dateMode==='source'" @change="patchEdit(row.id,{dateMode:($event.target as HTMLInputElement).checked?'source':'independent',happenedAt:sourceDate})"/>日期跟随原支出</label><button type="button" class="offset-delete" @click="removeEdit(row)"><UiIcon name="trash" :size="15"/>删除此笔</button></div></div>
      </article>
      <article v-for="(row,index) in drafts" :key="row.id" class="offset-card pending">
        <button type="button" class="offset-card-heading" :aria-expanded="expanded===row.id" @click="expanded=expanded===row.id?'':row.id"><CategoryIcon :name="category(row.categoryId)?.icon" :category-name="category(row.categoryId)?.name" flow-type="income" :color="category(row.categoryId)?.color" :size="24"/><span><b>{{ category(row.categoryId)?.name||'新增抵扣' }} <em>新增 {{ index+1 }}</em></b><small>{{ row.ratio }}% · {{ row.dateMode==='source'?'跟随原支出':dateText(row.happenedAt) }}</small></span><strong>{{ money(newAmount(row)) }}</strong><UiIcon :name="expanded===row.id?'down':'chevron'" :size="16"/></button>
        <div v-if="expanded===row.id" class="offset-card-body"><div class="feature-fields"><CategoryPicker :model-value="row.categoryId" @update:model-value="patchDraft(row.id,{categoryId:typeof $event==='string'?$event:null})" title="收入分类" :categories="categories" flow-type="income" :appearance-mode="appearanceMode"/><label>抵扣比例（0–200%）<input type="number" min="0" max="200" step="0.01" required :value="row.ratio" @input="patchDraft(row.id,{ratio:Number(($event.target as HTMLInputElement).value)})"/></label><label class="feature-full">抵扣日期与时间<input type="datetime-local" required :value="localTime(row.dateMode==='source'?sourceDate:row.happenedAt)" @input="patchDraft(row.id,{happenedAt:($event.target as HTMLInputElement).value,dateMode:'independent'})"/></label></div><div class="offset-row-footer"><label><input type="checkbox" :checked="row.dateMode==='source'" @change="patchDraft(row.id,{dateMode:($event.target as HTMLInputElement).checked?'source':'independent',happenedAt:sourceDate})"/>日期跟随原支出</label><button type="button" class="offset-delete" @click="emit('update:drafts',drafts.filter(item=>item.id!==row.id))"><UiIcon name="trash" :size="15"/>移除</button></div></div>
      </article>
      <button type="button" class="offset-add" @click="addDraft()"><UiIcon name="plus" :size="17"/>追加一笔抵扣</button><small class="offset-hint">新增比例为 0% 时不创建流水。保存时若累计超过支出，将请你确认处理方式。</small>
    </fieldset>
    <dialog ref="dialog" class="offset-dialog" aria-labelledby="offset-confirm-title" @cancel.prevent="choose(null)" @click="($event.target===dialog)&&choose(null)">
      <header><h3 id="offset-confirm-title">{{ confirmation==='limit'?'累计抵扣超过 100%':confirmation==='remove'?'删除这笔抵扣？':'关闭并清空全部抵扣？' }}</h3><button type="button" aria-label="取消" @click="choose(null)"><UiIcon name="close"/></button></header>
      <template v-if="confirmation==='limit'&&limit"><p>支出 {{ money(amount) }}，已有抵扣 {{ money(limit.existingAmount) }}，本次新增 {{ money(limit.newAmount) }}。合计 {{ money(limit.totalAmount) }}（{{ limit.ratio.toFixed(1) }}%）。</p><div class="offset-confirm-note">保留已有抵扣金额。选择调整时，仅按比例缩减本次新增抵扣，精确分配到分；剩余额度为零时不再新增。<strong v-if="limit.existingAmount>amount" class="offset-existing-over">已有抵扣本身已超过支出，不会减少已有收入；调整后不创建新增抵扣，累计仍会超过 100%。</strong></div><footer><button type="button" autofocus @click="choose(null)">返回修改</button><button type="button" @click="choose('keep')">仍按原比例创建</button><button type="button" class="accent" @click="choose('normalize')">{{ limit.existingAmount>amount?'不再新增，保留已有收入':'调整新增抵扣至合计100%' }}</button></footer></template>
      <template v-else><p>{{ confirmation==='clear'?'以下抵扣将全部清空，确认后在保存流水时生效。':'保存流水后删除此笔抵扣，原支出会保留。' }}</p><ul class="offset-confirm-list"><li v-for="row in confirmationRows" :key="row.id"><span><b>{{ row.name }}<em v-if="row.pending">待新增</em></b><small>{{ dateText(row.date) }}</small></span><strong>{{ money(row.amount) }}</strong></li></ul><footer><button type="button" autofocus @click="choose(null)">保留抵扣</button><button type="button" class="danger" @click="choose('confirm')">{{ confirmation==='clear'?'确认全部清空':'确认删除此笔' }}</button></footer></template>
    </dialog>
  </section>
</template>

<style scoped>
.offset-fields{border:0;padding:0;margin:18px 0 0;min-width:0;display:grid;gap:12px}.offset-summary{display:flex;align-items:center;justify-content:space-between;gap:12px;background:var(--app-raised);border:1px solid var(--app-line);border-radius:16px;padding:16px}.offset-summary div{display:grid;gap:5px}.offset-summary small,.offset-hint{color:var(--app-muted);font-size:12px;line-height:1.7}.offset-summary strong{font-size:22px;font-variant-numeric:tabular-nums}.offset-summary>span{color:var(--app-accent);font-weight:650;text-align:right}.offset-summary>span small{display:block;font-weight:400}.offset-summary .over-limit{color:var(--app-danger)}.offset-hint{margin:0}.offset-card{border:1px solid var(--app-line);border-radius:16px;overflow:hidden;background:var(--app-surface)}.offset-card-heading{width:100%;display:flex;gap:12px;align-items:center;text-align:left;color:var(--app-ink);background:transparent;border:0;padding:15px;cursor:pointer}.offset-card-heading>span{min-width:0;flex:1;display:grid;gap:5px}.offset-card-heading b{font-size:14px;line-height:1.5}.offset-card-heading small{font-size:12px;color:var(--app-muted);line-height:1.5}.offset-card-heading strong{font-size:16px;font-variant-numeric:tabular-nums;color:var(--app-accent);white-space:nowrap}.offset-card em,.offset-confirm-list em{font-size:10px;font-style:normal;background:var(--app-raised);color:var(--app-accent);padding:3px 7px;border-radius:6px;margin-left:4px}.offset-card-body{border-top:1px solid var(--app-line);padding:16px}.offset-row-footer{display:flex;justify-content:space-between;gap:12px;align-items:center;flex-wrap:wrap;margin-top:14px}.offset-row-footer>label{display:flex;align-items:center;gap:8px;color:var(--app-muted);font-size:12px}.offset-row-footer input{width:16px;height:16px;margin:0;accent-color:var(--app-accent)}.offset-delete{display:flex;align-items:center;gap:5px;background:transparent;color:var(--app-danger);border:0;padding:8px;cursor:pointer;font-size:12px}.offset-add{border:1px dashed var(--app-line);background:var(--app-raised);color:var(--app-accent);border-radius:12px;padding:13px;display:flex;justify-content:center;gap:7px;align-items:center;cursor:pointer;font-weight:600}.offset-dialog{color:var(--app-ink);background:var(--app-surface);border:1px solid var(--app-line);border-radius:22px;padding:24px;width:min(520px,calc(100vw - 32px));box-sizing:border-box;max-height:85dvh;overflow:auto;box-shadow:0 22px 80px #0005}.offset-dialog::backdrop{background:#060d1bb3;backdrop-filter:blur(4px)}.offset-dialog header{display:flex;align-items:center;justify-content:space-between;gap:14px}.offset-dialog h3{font-size:18px;margin:0;line-height:1.5}.offset-dialog header button{border:0;background:transparent;color:var(--app-muted);padding:6px;display:flex;cursor:pointer}.offset-dialog p{color:var(--app-muted);font-size:14px;line-height:1.8}.offset-confirm-note{background:var(--app-raised);border:1px solid var(--app-line);padding:14px;border-radius:12px;font-size:13px;line-height:1.8}.offset-confirm-list{list-style:none;padding:0;margin:16px 0;border:1px solid var(--app-line);border-radius:12px;overflow:hidden}.offset-confirm-list li{display:flex;align-items:center;justify-content:space-between;gap:14px;padding:13px 14px}.offset-confirm-list li+li{border-top:1px solid var(--app-line)}.offset-confirm-list span{display:grid;gap:5px;min-width:0}.offset-confirm-list b{font-size:13px}.offset-confirm-list small{font-size:11px;color:var(--app-muted)}.offset-confirm-list strong{font-size:14px;white-space:nowrap}.offset-existing-over{display:block;margin-top:8px;color:var(--app-danger);font-weight:500}.offset-dialog footer{display:flex;justify-content:flex-end;gap:10px;flex-wrap:wrap;margin-top:22px}.offset-dialog footer button{border:1px solid var(--app-line);color:var(--app-ink);background:var(--app-raised);border-radius:10px;padding:12px 16px;cursor:pointer;min-height:44px;font-weight:600}.offset-dialog footer .accent{background:var(--app-accent);color:white;border-color:transparent}.offset-dialog footer .danger{background:var(--app-danger);color:white;border-color:transparent}.offset-manager button:focus-visible{outline:2px solid var(--app-accent);outline-offset:2px}@media(max-width:520px){.offset-dialog{padding:20px}.offset-dialog footer{display:grid;grid-template-columns:1fr}.offset-summary{padding:13px}.offset-card-heading{gap:9px;padding:13px}.offset-card-body{padding:13px}}
</style>
