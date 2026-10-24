<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { ImportCandidate } from './importers'
import { localDay, type LedgerSnapshot, type LedgerSplitSettings } from './ledger'
import { normalizeOcrName } from './ocrText'
import type { ImportSource } from './importSources'
import { money } from './ledgerViewModels'
import { trapDialogTab, useDialogFocus } from './dialogFocus'
import CategoryPicker from './CategoryPicker.vue'
import BookAssignmentPicker from './BookAssignmentPicker.vue'
import InstallmentControls from './InstallmentControls.vue'
import UiIcon from './UiIcon.vue'
const props = defineProps<{ candidate: ImportCandidate; snapshot: LedgerSnapshot; source?: ImportSource; saving: boolean; error?: string }>()
const emit = defineEmits<{ close: []; update: [candidate:ImportCandidate]; confirm: [candidate:ImportCandidate]; preview: [candidate:ImportCandidate] }>()
const dialog = ref<HTMLElement | null>(null);useDialogFocus(dialog)
const draft = ref<ImportCandidate>({ ...JSON.parse(JSON.stringify(props.candidate)), bookIds:[...(props.candidate.bookIds||[])], title:normalizeOcrName(props.candidate.title), merchant:normalizeOcrName(props.candidate.merchant),kind:props.candidate.kind||'expense' })
const dateLocal = ref(props.candidate.happenedAtLocal||toLocalTime(props.candidate.happenedAt))
const explicit = ref(props.candidate.hasExplicitBookSelection??props.candidate.bookIds!==undefined)
const splitSettings = ref<Record<string,LedgerSplitSettings>>(JSON.parse(JSON.stringify(props.candidate.ledgerSplitSettings||{})))
const installment = ref(Boolean(props.candidate.installmentMonths&&props.candidate.installmentMonths>1)), months = ref(props.candidate.installmentMonths||2)
const startDate = ref(localDay(props.candidate.installmentStartMonth||props.candidate.happenedAt||new Date()))
const offset = ref(Boolean(props.candidate.offsetEnabled)), offsetCategory = ref(props.candidate.offsetCategoryId||props.snapshot.categories.find(category=>category.flowType==='income'&&category.name==='报销')?.id||null),offsetRatio = ref(props.candidate.offsetRatio??100)
const anonymousSplit = ref(Boolean(props.candidate.unboundSplitCount&&props.candidate.unboundSplitCount>1)), anonymousCount = ref(props.candidate.unboundSplitCount||2)
const localError=ref(''),imageFailed=ref(false)
const unbound = computed(()=>explicit.value&&!draft.value.bookIds?.length)
const fieldsComplete = computed(()=>Boolean(draft.value.title?.trim()&&Number(draft.value.amount)>0&&dateLocal.value))
function toLocalTime(value?:string){if(!value)return '';const date=new Date(value);if(Number.isNaN(date.getTime()))return '';const pad=(n:number)=>String(n).padStart(2,'0');return `${localDay(date)}T${pad(date.getHours())}:${pad(date.getMinutes())}`}
function edited(){return JSON.stringify({draft:draft.value,date:dateLocal.value,explicit:explicit.value,splits:splitSettings.value,installment:installment.value,months:months.value,start:startDate.value,offset:offset.value,offsetCategory:offsetCategory.value,offsetRatio:offsetRatio.value,anonymous:anonymousSplit.value,count:anonymousCount.value})}
const baseline=edited()
function close(){if(props.saving)return;if(edited()!==baseline&&!window.confirm('识别结果的修改尚未保存，确定放弃修改吗？'))return;emit('close')}
function submit(confirm:boolean){
  localError.value=''
  try{
    if(!draft.value.title?.trim())throw new Error('请填写流水名称')
    if(!Number.isFinite(Number(draft.value.amount))||Number(draft.value.amount)<=0)throw new Error('请填写大于 0 的金额')
    const date=dateLocal.value?new Date(dateLocal.value):null
    if(date&&Number.isNaN(date.getTime()))throw new Error('请填写有效日期时间')
    if(confirm&&!date)throw new Error('未识别到订单日期，请核对原件并补全后再入账')
    if(installment.value&&(!Number.isInteger(months.value)||months.value<2||months.value>24||!startDate.value))throw new Error('分期需要 2–24 期及有效起始日期')
    if(offset.value&&draft.value.kind==='expense'&&(!offsetCategory.value||!Number.isFinite(offsetRatio.value)||offsetRatio.value<=0||offsetRatio.value>100))throw new Error('请选择报销或退款分类，比例应大于 0 且不超过 100%')
    if(unbound.value&&anonymousSplit.value&&(!Number.isInteger(anonymousCount.value)||anonymousCount.value<2||anonymousCount.value>20))throw new Error('匿名均分人数应为 2–20 人')
    const updated:ImportCandidate={...JSON.parse(JSON.stringify(draft.value)),title:draft.value.title.trim(),amount:Number(draft.value.amount),happenedAt:date?.toISOString(),happenedAtLocal:dateLocal.value||undefined,hasExplicitBookSelection:explicit.value,ledgerSplitSettings:JSON.parse(JSON.stringify(splitSettings.value)),installmentMonths:installment.value?months.value:1,installmentStartMonth:installment.value?new Date(startDate.value+'T00:00:00').toISOString():null,offsetEnabled:offset.value&&draft.value.kind==='expense',offsetCategoryId:offsetCategory.value,offsetRatio:offsetRatio.value,unboundSplitCount:unbound.value&&anonymousSplit.value?anonymousCount.value:undefined}
    if(updated.unboundSplitCount){updated.splitParticipantIds=['我',...Array.from({length:updated.unboundSplitCount-1},(_,i)=>`匿名${i+1}`)];updated.paidByParticipantId='我';updated.splitMode='equal';updated.splitRatio=null;updated.splitAmount=null}
    if(confirm)emit('confirm',updated);else emit('update',updated)
  }catch(cause){localError.value=cause instanceof Error?cause.message:'请检查流水信息'}
}
watch(()=>draft.value.kind,kind=>{if(draft.value.categoryId&&props.snapshot.categories.find(category=>category.id===draft.value.categoryId)?.flowType!==kind)draft.value.categoryId=null})
</script>
<template>
  <div class="ocr-editor-shade" @click.self="close">
    <section ref="dialog" class="ocr-editor" role="dialog" aria-modal="true" aria-labelledby="ocr-editor-title" tabindex="-1" @keydown="trapDialogTab($event,dialog)" @keydown.esc.stop.prevent="close">
      <header class="ocr-editor-header"><div><span class="ocr-eyebrow">核对这一笔</span><h2 id="ocr-editor-title">编辑识别结果</h2></div><button type="button" class="feature-icon-button" aria-label="关闭识别编辑" :disabled="saving" @click="close"><UiIcon name="close"/></button></header>
      <div class="ocr-editor-body"><div class="ocr-editor-main">
        <p v-if="candidate.presetKey==='meituan_enterprise_meal'&&offset&&draft.kind==='expense'" class="ocr-preset-note"><UiIcon name="check" :size="16"/>企业工作餐 · 公司补贴抵扣 {{ offsetRatio }}%<small>确认入账时生成关联收入，可在下方调整</small></p>
        <p v-if="candidate.categorySuggestion&&draft.categoryId===candidate.categoryId" class="ocr-category-note"><UiIcon name="tag" :size="14"/>已匹配已有分类 · {{ candidate.categorySuggestion }}</p>
        <section class="ocr-amount-card"><div class="ocr-flow-switch"><button v-for="kind in ['expense','income'] as const" :key="kind" type="button" :class="{active:draft.kind===kind}" :aria-pressed="draft.kind===kind" @click="draft.kind=kind"><UiIcon :name="kind" :size="15"/>{{ kind==='expense'?'支出':'收入' }}</button></div><label class="ocr-amount-input"><span>¥</span><input v-model.number="draft.amount" type="number" min="0.01" step="0.01" inputmode="decimal" aria-label="识别流水金额" placeholder="0.00"/></label><small>核对实付金额，优惠和原价单独记录</small></section>
        <section class="ocr-form-section"><header><UiIcon name="list" :size="16"/><h3>流水信息</h3><span :class="{incomplete:!fieldsComplete}">{{ fieldsComplete?'关键信息已补全':'请补全名称、金额与日期' }}</span></header><div class="feature-fields"><label class="feature-full">流水名称<input v-model.trim="draft.title" maxlength="240" placeholder="例如：午餐、咖啡、生活采购"/></label><label>订单日期与时间<input v-model="dateLocal" type="datetime-local" :aria-invalid="!dateLocal"/><small v-if="!dateLocal" class="ocr-field-warning">没有识别到日期，请对照原件填写</small></label><label>支付渠道<input v-model.trim="draft.paymentMethod" list="ocr-payment-channels" placeholder="选择或输入支付方式"/><datalist id="ocr-payment-channels"><option v-for="channel in snapshot.settings.paymentChannels" :key="channel" :value="channel"/></datalist></label><CategoryPicker :model-value="draft.categoryId||null" @update:model-value="draft.categoryId=$event as string|null" title="收支分类" placeholder="选择分类" :allow-unassigned="true" :categories="snapshot.categories" :flow-type="draft.kind" :appearance-mode="snapshot.settings.appearanceMode"/><label>商户<input v-model.trim="draft.merchant" maxlength="240" placeholder="商户或交易对方"/></label></div></section>
        <BookAssignmentPicker v-model="draft.bookIds!" v-model:explicit="explicit" v-model:split-settings="splitSettings" :snapshot="snapshot" :happened-at="dateLocal" :category-id="draft.categoryId||null" :kind="draft.kind||'expense'"/>
        <section v-if="unbound" class="ocr-anonymous-split"><label class="feature-check-row"><input v-model="anonymousSplit" type="checkbox"/>不绑定账本，按人数匿名均分</label><label v-if="anonymousSplit">包含我在内的人数<input v-model.number="anonymousCount" type="number" min="2" max="20" step="1"/><small>原始金额不变，个人统计仅计算我的份额</small></label></section>
        <InstallmentControls v-model:enabled="installment" v-model:months="months" v-model:start-date="startDate" :amount="Number(draft.amount)" :max="24"/>
        <section v-if="draft.kind==='expense'" class="ocr-offset-section feature-section"><header class="feature-heading"><div><h3>抵扣 / 报销</h3><p>生成一笔关联收入，按分期前的原始总额计算</p></div><label class="feature-switch"><input v-model="offset" type="checkbox"/><span></span><b>添加</b></label></header><div v-if="offset" class="feature-fields"><CategoryPicker v-model="offsetCategory" title="收入分类" placeholder="报销或退款" :categories="snapshot.categories" flow-type="income" :appearance-mode="snapshot.settings.appearanceMode"/><label>抵扣比例（%）<input v-model.number="offsetRatio" type="number" min="0.01" max="100" step="0.01"/></label><p class="ocr-offset-preview feature-full">预计生成收入 <b>{{ money(Number(draft.amount||0)*offsetRatio/100) }}</b></p></div></section>
        <details class="ocr-advanced feature-section"><summary><UiIcon name="edit" :size="15"/>高级信息<span>备注、原价、优惠与溢价</span><UiIcon name="down" :size="15"/></summary><div class="feature-fields"><label class="feature-full">备注<textarea v-model.trim="draft.note" rows="2" placeholder="补充订单说明"/></label><label>原价<input v-model.number="draft.originalAmount" type="number" min="0" step="0.01"/></label><label>优惠金额<input v-model.number="draft.discountAmount" type="number" min="0" step="0.01"/></label><label>溢价金额<input v-model.number="draft.premiumAmount" type="number" min="0" step="0.01"/></label></div></details>
      </div><aside class="ocr-editor-reference"><div class="ocr-reference-heading"><UiIcon name="image" :size="16"/><h3>对照原件</h3><span>{{ Math.round((candidate.confidence||0)*100) }}% 可信度</span></div><button v-if="source" type="button" class="ocr-reference-file" @click="emit('preview',candidate)"><span v-if="source.kind==='image'&&!imageFailed" class="ocr-reference-image"><img :src="source.url" :alt="source.name" @error="imageFailed=true"/></span><span v-else class="ocr-reference-document"><UiIcon :name="source.kind==='pdf'?'file':'table'" :size="37"/><b>{{ source.kind==='pdf'?'PDF 账单原件':'原始账单文件' }}</b></span><span class="ocr-reference-caption"><b>{{ source.name }}</b><small><template v-if="candidate.sourcePage">第 {{ candidate.sourcePage }} 页 · </template><template v-if="candidate.sourceSheet">{{ candidate.sourceSheet }} · </template><template v-if="candidate.sourceRow">第 {{ candidate.sourceRow }} 行 · </template>点击放大核对<UiIcon name="expand" :size="12"/></small></span></button><p v-else class="ocr-reference-missing">本条记录没有关联原始文件，可查看下方识别文字。</p><details class="ocr-raw-text"><summary>原始识别文字<UiIcon name="down" :size="13"/></summary><pre>{{ candidate.rawText||'没有可显示的文字' }}</pre></details><div v-if="candidate.details?.length" class="ocr-parsed-details"><h4>识别明细</h4><dl><template v-for="(item,index) in candidate.details" :key="index"><dt>{{ item.label }}</dt><dd>{{ item.value }}</dd></template></dl></div><p class="ocr-reference-tip"><UiIcon name="check" :size="14"/>原件在本次导入中保留，可随时放大核对。</p></aside></div>
      <footer class="ocr-editor-footer"><p v-if="localError||error" class="feature-error" role="alert">{{ localError||error }}</p><small>保存修改留在待确认列表；确认入账后才记入流水。</small><div><button type="button" class="feature-button" :disabled="saving" @click="close">取消</button><button type="button" class="feature-button" :disabled="saving" @click="submit(false)">保存修改</button><button type="button" class="feature-button accent" :disabled="saving" @click="submit(true)">{{ saving?'入账中…':'确认入账' }}</button></div></footer>
    </section>
  </div>
</template>
