<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { ImportCandidate } from './importers'
import { localDay, type LedgerSnapshot, type LedgerSplitSettings } from './ledger'
import { normalizeOcrName } from './ocrText'
import { enhancedImageType } from './enhancedOcr'
import type { OcrFieldIssue } from './receiptEvidence'
import { findCompanySubsidyCategory } from './importDefaults'
import type { ImportSource } from './importSources'
import { money } from './ledgerViewModels'
import { trapDialogTab, useDialogFocus } from './dialogFocus'
import CategoryPicker from './CategoryPicker.vue'
import PaymentChannelPicker from './PaymentChannelPicker.vue'
import BookAssignmentPicker from './BookAssignmentPicker.vue'
import InstallmentControls from './InstallmentControls.vue'
import UiIcon from './UiIcon.vue'
const props = defineProps<{ candidate: ImportCandidate; snapshot: LedgerSnapshot; source?: ImportSource; saving: boolean; error?: string; enhance?: (file: File) => Promise<ImportCandidate> }>()
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
const enhancement = ref<ImportCandidate>()
const enhancing = ref(false)
const enhancementError = ref('')
const evidenceReference = ref(props.candidate)
const canEnhance = computed(() => props.enhance && props.source?.kind === 'image' && enhancedImageType(props.source.file))
const unbound = computed(()=>explicit.value&&!draft.value.bookIds?.length)
const fieldsComplete = computed(()=>Boolean(draft.value.title?.trim()&&Number(draft.value.amount)>0&&dateLocal.value))
const companySubsidy = computed(()=>Boolean((draft.value.enterpriseMealNeedsReview || draft.value.presetKey) && draft.value.paymentMethod==='公司补贴'))
const fieldLabels = { amount:'实付金额', date:'订单时间', merchant:'商户', channel:'支付渠道', original:'原价', discount:'金额核对', premium:'溢价', subsidy:'工作餐抵扣' }
const selectedIssue = ref<OcrFieldIssue>()
const issues = computed(() => (evidenceReference.value.ocrIssues || []).filter(issue => {
  const before = evidenceReference.value, after = draft.value
  switch (issue.field) {
    case 'amount': return after.amount === before.amount
    case 'date': return dateLocal.value === (before.happenedAtLocal || toLocalTime(before.happenedAt))
    case 'merchant': return after.merchant === normalizeOcrName(before.merchant)
    case 'channel': return (after.paymentMethod || '') === (before.paymentMethod || '')
    case 'subsidy': return !offset.value
    default: return after.amount === before.amount && after.originalAmount === before.originalAmount
      && after.discountAmount === before.discountAmount && after.premiumAmount === before.premiumAmount
  }
}))
const cropView = computed(() => {
  const region = selectedIssue.value?.region, size = draft.value.ocrDiagnostic
  if (!region || !size || !issues.value.includes(selectedIssue.value!) || props.source?.kind !== 'image') return
  const padding = Math.max(12, Math.round((region.y1 - region.y0) * .45))
  const x = Math.max(0, region.x0 - padding), y = Math.max(0, region.y0 - padding)
  const width = Math.min(size.width, region.x1 + padding) - x
  const height = Math.min(size.height, region.y1 + padding) - y
  return width > 0 && height > 0 ? `${x} ${y} ${width} ${height}` : undefined
})
function viewIssue(issue: OcrFieldIssue) {
  if (issue.region && props.source?.kind === 'image') selectedIssue.value = selectedIssue.value === issue ? undefined : issue
  else if (props.source) emit('preview', props.candidate)
}
function confirmCompanyMeal() {
  draft.value.paymentMethod='公司补贴'
  offset.value=true
  offsetRatio.value=100
  offsetCategory.value=findCompanySubsidyCategory(props.snapshot)?.id||null
}
const enhancedFields = [
  ['title', '流水名称'], ['merchant', '商户'], ['amount', '实付金额'], ['paymentMethod', '支付渠道'],
  ['happenedAt', '订单时间'], ['originalAmount', '原价'], ['discountAmount', '优惠金额'], ['premiumAmount', '溢价金额'],
] as const
const differences = computed(() => {
  const result = enhancement.value
  if (!result) return []
  const rows: Array<{ label: string; before: string; after: string }> = []
  for (const [key, label] of enhancedFields) {
    const previous = key === 'happenedAt' ? dateLocal.value : draft.value[key]
    const next = key === 'happenedAt' ? toLocalTime(result[key]) : result[key]
    if (next == null || next === '' || previous === next) continue
    const display = (value?: string | number | null) => value == null || value === '' ? '待补充'
      : typeof value === 'number' ? money(value) : key === 'happenedAt' ? value.replace('T', ' ') : value
    rows.push({ label, before: display(previous), after: display(next) })
  }
  if (result.presetKey && draft.value.kind === 'expense' && (!offset.value || offsetRatio.value !== 100)) {
    rows.push({ label: '公司补贴抵扣', before: offset.value ? `${offsetRatio.value}%` : '未设置', after: '100%' })
  }
  return rows
})

async function runEnhancement() {
  if (!canEnhance.value || !props.enhance || !props.source || enhancing.value) return
  enhancementError.value = ''
  enhancement.value = undefined
  enhancing.value = true
  try {
    enhancement.value = await props.enhance(props.source.file)
  } catch (error) {
    enhancementError.value = error instanceof Error ? error.message : '增强识别失败'
  } finally {
    enhancing.value = false
  }
}

function useEnhancement() {
  const result = enhancement.value
  if (!result) return
  for (const [key] of enhancedFields) {
    const value = result[key]
    if (value == null || value === '') continue
    if (key === 'happenedAt') dateLocal.value = toLocalTime(result.happenedAt)
    else Object.assign(draft.value, { [key]: value })
  }
  if (result.presetKey && draft.value.kind === 'expense') {
    draft.value.presetKey = result.presetKey
    confirmCompanyMeal()
  }
  Object.assign(draft.value, {
    rawText: result.rawText, details: result.details, confidence: result.confidence,
    ocrDiagnostic: result.ocrDiagnostic, paymentMethodNeedsReview: result.paymentMethodNeedsReview,
    enterpriseMealNeedsReview: result.enterpriseMealNeedsReview,
  })
  evidenceReference.value = { ...draft.value, happenedAtLocal: dateLocal.value, ocrIssues: result.ocrIssues }
  selectedIssue.value = undefined
  enhancement.value = undefined
}
function toLocalTime(value?:string){if(!value)return '';const date=new Date(value);if(Number.isNaN(date.getTime()))return '';const pad=(n:number)=>String(n).padStart(2,'0');return `${localDay(date)}T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`}
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
    if(offset.value&&draft.value.kind==='expense'&&((!offsetCategory.value&&!companySubsidy.value)||!Number.isFinite(offsetRatio.value)||offsetRatio.value<=0||offsetRatio.value>100))throw new Error('请选择报销或退款分类，比例应大于 0 且不超过 100%')
    if(unbound.value&&anonymousSplit.value&&(!Number.isInteger(anonymousCount.value)||anonymousCount.value<2||anonymousCount.value>20))throw new Error('匿名均分人数应为 2–20 人')
    const updated:ImportCandidate={...JSON.parse(JSON.stringify(draft.value)),title:draft.value.title.trim(),amount:Number(draft.value.amount),happenedAt:date?.toISOString(),happenedAtLocal:dateLocal.value||undefined,hasExplicitBookSelection:explicit.value,ledgerSplitSettings:JSON.parse(JSON.stringify(splitSettings.value)),installmentMonths:installment.value?months.value:1,installmentStartMonth:installment.value?new Date(startDate.value+'T00:00:00').toISOString():null,offsetEnabled:offset.value&&draft.value.kind==='expense',offsetCategoryId:offsetCategory.value,offsetRatio:offsetRatio.value,unboundSplitCount:unbound.value&&anonymousSplit.value?anonymousCount.value:undefined}
    if(evidenceReference.value.ocrIssues)updated.ocrIssues=issues.value
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
        <section v-if="canEnhance" class="ocr-field-review ocr-enhancement">
          <div class="ocr-enhancement-heading">
            <h3>增强识别</h3>
            <button type="button" class="feature-button" :disabled="saving||enhancing" @click="runEnhancement">{{ enhancing ? '识别中…' : '用服务器识别' }}</button>
          </div>
          <p>点选后将这张图片发到你的记账服务器处理。</p>
          <p v-if="enhancementError" class="ocr-field-warning" role="alert">{{ enhancementError }}</p>
          <div v-if="enhancement" aria-live="polite">
            <p v-if="!differences.length">增强识别没有找到可替换的字段。</p>
            <template v-else>
              <table><thead><tr><th>字段</th><th>当前</th><th>增强结果</th></tr></thead><tbody>
                <tr v-for="row in differences" :key="row.label"><th scope="row">{{ row.label }}</th><td>{{ row.before }}</td><td>{{ row.after }}</td></tr>
              </tbody></table>
              <button type="button" class="feature-button accent" :disabled="saving" @click="useEnhancement">采用增强结果</button>
            </template>
          </div>
        </section>
        <section v-if="issues.length" class="ocr-field-review" aria-label="识别字段核对">
          <h3><UiIcon name="scan" :size="16"/>待核对字段 <span>{{ issues.length }} 项</span></h3>
          <ul>
            <li v-for="issue in issues" :key="issue.field">
              <div><strong>{{ fieldLabels[issue.field] }}</strong><p>{{ issue.message }}</p></div>
              <button v-if="source" type="button" class="feature-text-button" :aria-label="`核对${fieldLabels[issue.field]}原件`" @click="viewIssue(issue)">
                {{ issue.region&&source.kind==='image' ? (selectedIssue===issue?'收起局部':'看局部') : '看原图' }}
              </button>
            </li>
          </ul>
          <figure v-if="cropView && source && draft.ocrDiagnostic && selectedIssue" class="ocr-field-crop">
            <svg :viewBox="cropView" role="img" :aria-label="`${fieldLabels[selectedIssue.field]}的原图区域`">
              <image :href="source.url" :width="draft.ocrDiagnostic.width" :height="draft.ocrDiagnostic.height"/>
            </svg>
            <figcaption>{{ fieldLabels[selectedIssue.field] }}所在的原图区域</figcaption>
          </figure>
        </section>
        <p v-if="companySubsidy&&offset&&draft.kind==='expense'" class="ocr-preset-note"><UiIcon name="check" :size="16"/>企业工作餐 · 公司补贴抵扣 {{ offsetRatio }}%<small>确认入账时生成关联收入，可在下方调整</small></p>
        <div v-if="draft.enterpriseMealNeedsReview&&!offset&&draft.kind==='expense'" class="ocr-preset-note ocr-preset-review">
          <small>识别到美团企业订单，请对照原图确认是否为公司全额补贴的工作餐。</small>
          <button type="button" class="feature-button" :disabled="saving" @click="confirmCompanyMeal">确认公司补贴并抵扣 100%</button>
        </div>
        <p v-if="candidate.categorySuggestion&&draft.categoryId===candidate.categoryId" class="ocr-category-note"><UiIcon name="tag" :size="14"/>已匹配已有分类 · {{ candidate.categorySuggestion }}</p>
        <section class="ocr-amount-card"><div class="ocr-flow-switch"><button v-for="kind in ['expense','income'] as const" :key="kind" type="button" :class="{active:draft.kind===kind}" :aria-pressed="draft.kind===kind" @click="draft.kind=kind"><UiIcon :name="kind" :size="15"/>{{ kind==='expense'?'支出':'收入' }}</button></div><label class="ocr-amount-input"><span>¥</span><input v-model.number="draft.amount" type="number" min="0.01" step="0.01" inputmode="decimal" aria-label="识别流水金额" placeholder="0.00"/></label><small>实付金额 · 原价、优惠和溢价请在补充信息中核对</small></section>
        <section class="ocr-form-section"><header><UiIcon name="list" :size="16"/><h3>流水信息</h3><span :class="{incomplete:!fieldsComplete||issues.length}">{{ !fieldsComplete?'请补全名称、金额与日期':issues.length?'有字段待核对':'关键信息已补全' }}</span></header><div class="feature-fields"><label class="feature-full">流水名称<input v-model.trim="draft.title" maxlength="240" placeholder="例如：午餐、咖啡、生活采购"/></label><label>订单日期与时间<input v-model="dateLocal" type="datetime-local" step="1" :aria-invalid="!dateLocal"/><small v-if="!dateLocal" class="ocr-field-warning">没有识别到日期，请对照原件填写</small></label><PaymentChannelPicker v-model="draft.paymentMethod" :channels="snapshot.settings.paymentChannels" :disabled="saving"><small v-if="draft.paymentMethodNeedsReview&&!draft.paymentMethod" class="ocr-field-warning">付款方式未能可靠识别，请对照原件选择。</small></PaymentChannelPicker><CategoryPicker :model-value="draft.categoryId||null" @update:model-value="draft.categoryId=$event as string|null" title="收支分类" placeholder="选择分类" :allow-unassigned="true" :categories="snapshot.categories" :flow-type="draft.kind" :appearance-mode="snapshot.settings.appearanceMode"/><label>商户<input v-model.trim="draft.merchant" maxlength="240" placeholder="商户或交易对方"/></label></div></section>
        <section class="ocr-form-section ocr-supplement"><header><UiIcon name="file" :size="16"/><h3>补充信息</h3></header><dl v-if="draft.details?.length" class="ocr-supplement-details"><template v-for="(item,index) in draft.details" :key="index"><dt>{{ item.label }}</dt><dd>{{ item.value }}</dd></template></dl><div class="feature-fields"><label>原价<input v-model.number="draft.originalAmount" type="number" min="0" step="0.01"/></label><label>优惠金额<input v-model.number="draft.discountAmount" type="number" min="0" step="0.01"/></label><label>溢价金额<input v-model.number="draft.premiumAmount" type="number" min="0" step="0.01"/></label><label class="feature-full">备注<textarea v-model.trim="draft.note" rows="2" placeholder="可自行补充用途或订单备注"/></label></div></section>
        <BookAssignmentPicker v-model="draft.bookIds!" v-model:explicit="explicit" v-model:split-settings="splitSettings" :snapshot="snapshot" :happened-at="dateLocal" :category-id="draft.categoryId||null" :kind="draft.kind||'expense'"/>
        <section v-if="unbound" class="ocr-anonymous-split"><label class="feature-check-row"><input v-model="anonymousSplit" type="checkbox"/>不绑定账本，按人数匿名均分</label><label v-if="anonymousSplit">包含我在内的人数<input v-model.number="anonymousCount" type="number" min="2" max="20" step="1"/><small>原始金额不变，个人统计仅计算我的份额</small></label></section>
        <InstallmentControls v-model:enabled="installment" v-model:months="months" v-model:start-date="startDate" :amount="Number(draft.amount)" :max="24"/>
        <section v-if="draft.kind==='expense'" class="ocr-offset-section feature-section"><header class="feature-heading"><div><h3>抵扣 / 报销</h3><p>生成一笔关联收入，按分期前的原始总额计算</p></div><label class="feature-switch"><input v-model="offset" type="checkbox"/><span></span><b>添加</b></label></header><div v-if="offset" class="feature-fields"><CategoryPicker v-model="offsetCategory" title="收入分类" placeholder="报销或退款" :categories="snapshot.categories" flow-type="income" :appearance-mode="snapshot.settings.appearanceMode"/><label>抵扣比例（%）<input v-model.number="offsetRatio" type="number" min="0.01" max="100" step="0.01"/></label><p class="ocr-offset-preview feature-full">预计生成收入 <b>{{ money(Number(draft.amount||0)*offsetRatio/100) }}</b></p></div></section>
      </div><aside class="ocr-editor-reference"><div class="ocr-reference-heading"><UiIcon name="image" :size="16"/><h3>对照原件</h3><span>{{ Math.round((draft.confidence||0)*100) }}% 可信度</span></div><button v-if="source" type="button" class="ocr-reference-file" @click="emit('preview',candidate)"><span v-if="source.kind==='image'&&!imageFailed" class="ocr-reference-image"><img :src="source.url" :alt="source.name" @error="imageFailed=true"/></span><span v-else class="ocr-reference-document"><UiIcon :name="source.kind==='pdf'?'file':'table'" :size="37"/><b>{{ source.kind==='pdf'?'PDF 账单原件':'原始账单文件' }}</b></span><span class="ocr-reference-caption"><b>{{ source.name }}</b><small><template v-if="candidate.sourcePage">第 {{ candidate.sourcePage }} 页 · </template><template v-if="candidate.sourceSheet">{{ candidate.sourceSheet }} · </template><template v-if="candidate.sourceRow">第 {{ candidate.sourceRow }} 行 · </template>点击放大核对<UiIcon name="expand" :size="12"/></small></span></button><p v-else class="ocr-reference-missing">本条记录没有关联原始文件，可查看下方识别文字。</p><details class="ocr-raw-text"><summary>原始识别文字<UiIcon name="down" :size="13"/></summary><pre>{{ draft.rawText||'没有可显示的文字' }}</pre></details><details v-if="draft.ocrDiagnostic" class="ocr-raw-text ocr-diagnostics"><summary>识别诊断<UiIcon name="down" :size="13"/></summary><dl><dt>识别版本</dt><dd>{{ draft.ocrDiagnostic.revision }}</dd><dt>模型版本</dt><dd>{{ draft.ocrDiagnostic.modelCache }}</dd><dt>原图指纹（相同文件应一致）</dt><dd>{{ draft.ocrDiagnostic.sourceSha256 }}</dd><template v-if="draft.ocrDiagnostic.normalizedSha256"><dt>统一图像指纹</dt><dd>{{ draft.ocrDiagnostic.normalizedSha256 }}</dd></template><dt>图像尺寸 / 原文件大小</dt><dd>{{ draft.ocrDiagnostic.width }} × {{ draft.ocrDiagnostic.height }} · {{ draft.ocrDiagnostic.sourceBytes }} B</dd><dt>识别引擎</dt><dd>{{ draft.ocrDiagnostic.engine }}</dd><template v-if="draft.ocrDiagnostic.enterpriseCheck"><dt>企业餐复读定位</dt><dd>{{ {original:'原图',enhanced:'增强图',missing:'未找到商户行'}[draft.ocrDiagnostic.enterpriseCheck.row] }}</dd><dt>商户 / 工作餐复核</dt><dd>{{ draft.ocrDiagnostic.enterpriseCheck.merchant==='confirmed'?'商户已复核':'商户待核对' }} · {{ draft.ocrDiagnostic.enterpriseCheck.scene==='confirmed'?'已确认工作餐':'场景待核对' }}<template v-if="draft.ocrDiagnostic.enterpriseCheck.failed"> · 局部复读中断</template></dd></template></dl></details><p class="ocr-reference-tip"><UiIcon name="check" :size="14"/>原件在本次导入中保留，可随时放大核对。</p></aside></div>
      <footer class="ocr-editor-footer"><p v-if="localError||error" class="feature-error" role="alert">{{ localError||error }}</p><small>保存修改留在待确认列表；确认入账后才记入流水。</small><div><button type="button" class="feature-button" :disabled="saving" @click="close">取消</button><button type="button" class="feature-button" :disabled="saving" @click="submit(false)">保存修改</button><button type="button" class="feature-button accent" :disabled="saving" @click="submit(true)">{{ saving?'入账中…':'确认入账' }}</button></div></footer>
    </section>
  </div>
</template>
