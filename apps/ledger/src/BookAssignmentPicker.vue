<script setup lang="ts">
import { computed, ref } from 'vue'
import { assignAutoBooks, recommendedBooks, splitRatioPercent, type FlowType, type LedgerSnapshot, type LedgerSplitSettings } from './ledger'
import CategoryIcon from './CategoryIcon.vue'
import BookSelectorDialog from './BookSelectorDialog.vue'
import UiIcon from './UiIcon.vue'
const props = defineProps<{
  modelValue: string[]; explicit: boolean; snapshot: LedgerSnapshot; happenedAt: string
  categoryId: string | null; kind: FlowType; editing?: boolean
  splitSettings?: Record<string, LedgerSplitSettings>
}>()
const emit = defineEmits<{
  'update:modelValue': [value: string[]]; 'update:explicit': [value: boolean]
  'update:splitSettings': [value: Record<string, LedgerSplitSettings>]
}>()
const expanded = ref(false)
const autoIds = computed(() => assignAutoBooks(props.snapshot, { happenedAt: props.happenedAt, categoryId: props.categoryId, kind: props.kind }))
const effectiveIds = computed(() => props.explicit && !props.modelValue.length ? [] : !props.snapshot.settings.bookAssignmentPromptEnabled ? [...new Set([...props.modelValue, ...autoIds.value])] : props.modelValue)
const selected = computed(() => props.snapshot.books.filter(book => effectiveIds.value.includes(book.id)))
const suggestions = computed(() => recommendedBooks(props.snapshot, props.happenedAt).filter(book => !effectiveIds.value.includes(book.id)))
function select(ids: string[]) { emit('update:modelValue', [...new Set(ids)]); emit('update:explicit', true) }
function toggle(id: string) { select(effectiveIds.value.includes(id) ? effectiveIds.value.filter(value => value !== id) : [...effectiveIds.value, id]) }
function automatic() { emit('update:modelValue', []); emit('update:explicit', false) }
function splitFor(bookId: string): LedgerSplitSettings {
  const book = props.snapshot.books.find(item => item.id === bookId)!
  const own = book.participants.find(person => person.name === '我') || book.participants[0]
  const saved=props.splitSettings?.[bookId]
  return saved?{...saved,splitRatio:saved.splitRatio==null?null:splitRatioPercent(saved),splitRatioUnit:'percent'}:{ paidByParticipantId: own?.id || null, splitParticipantIds: own ? [own.id] : [], splitMode: 'equal', splitRatio: null, splitAmount: null,splitRatioUnit:'percent' }
}
function updateSplit(bookId: string, field: keyof LedgerSplitSettings, value: unknown) {
  const split = { ...splitFor(bookId), [field]: value }
  if (field === 'splitMode' && value === 'ratio' && split.splitRatio == null) split.splitRatio = 50
  if (field === 'splitMode' && value === 'fixed' && split.splitAmount == null) split.splitAmount = 0
  emit('update:splitSettings', { ...props.splitSettings, [bookId]: split })
}
function toggleMember(bookId: string, id: string) {
  const ids = splitFor(bookId).splitParticipantIds
  updateSplit(bookId, 'splitParticipantIds', ids.includes(id) ? ids.filter(value => value !== id) : [...ids, id])
}
</script>

<template>
  <section class="assignment-picker feature-section">
    <header class="feature-heading"><div><h3>账本归属 <span class="assignment-count">{{ effectiveIds.length }}</span></h3><p>一笔流水可关联多个账本，各账本独立设置分账</p></div><button type="button" class="feature-text-button" aria-haspopup="dialog" :aria-expanded="expanded" @click="expanded=true">{{ selected.length?'管理关联':'选择账本' }}<UiIcon name="chevron" :size="13"/></button></header>
    <div v-if="selected.length" class="assignment-selected">
      <div v-for="book in selected" :key="book.id" class="assignment-book" :style="{'--book-color':book.color||'#5799dd'}">
        <div class="assignment-book-row"><span class="assignment-book-icon" :style="{'--book-color':book.color}"><CategoryIcon :name="book.icon" :color="book.color" :size="20"/></span><span><b>{{ book.name }}</b><small>{{ autoIds.includes(book.id)&&!modelValue.includes(book.id)?'自动归集':'已关联' }}</small></span><button type="button" :aria-label="`移除${book.name}`" class="feature-icon-button" @click="toggle(book.id)"><UiIcon name="close" :size="15"/></button></div>
        <label class="statistics-toggle"><input type="checkbox" :checked="splitFor(book.id).includeInStatistics!==false" @change="updateSplit(book.id,'includeInStatistics',($event.target as HTMLInputElement).checked)"/>计入此账本的收支统计</label>
        <details v-if="book.participants.length>1" class="assignment-split"><summary>此账本的分账设置</summary><label class="statistics-toggle"><input type="checkbox" :checked="splitFor(book.id).splitEnabled!==false" @change="updateSplit(book.id,'splitEnabled',($event.target as HTMLInputElement).checked)"/>启用此账本分摊</label><div v-if="splitFor(book.id).splitEnabled!==false" class="feature-fields"><label>付款人<select :value="splitFor(book.id).paidByParticipantId" @change="updateSplit(book.id,'paidByParticipantId',($event.target as HTMLSelectElement).value)"><option v-for="person in book.participants" :key="person.id" :value="person.id">{{ person.name }}</option></select></label><label>分摊方式<select :value="splitFor(book.id).splitMode" @change="updateSplit(book.id,'splitMode',($event.target as HTMLSelectElement).value)"><option value="equal">平均分摊</option><option value="ratio">本人比例</option><option value="fixed">本人固定金额</option></select></label><label v-if="splitFor(book.id).splitMode==='ratio'">本人比例（%）<input :value="splitFor(book.id).splitRatio??50" type="number" min="0" max="100" @input="updateSplit(book.id,'splitRatio',Number(($event.target as HTMLInputElement).value))"/></label><label v-if="splitFor(book.id).splitMode==='fixed'">本人分摊金额<input :value="splitFor(book.id).splitAmount??0" type="number" min="0" step="0.01" @input="updateSplit(book.id,'splitAmount',Number(($event.target as HTMLInputElement).value))"/></label></div><div v-if="splitFor(book.id).splitEnabled!==false" class="feature-check-chips"><label v-for="person in book.participants" :key="person.id"><input type="checkbox" :checked="splitFor(book.id).splitParticipantIds.includes(person.id)" @change="toggleMember(book.id,person.id)"/>{{ person.name }}</label></div></details>
      </div>
    </div>
    <p v-else class="feature-empty">{{ explicit?'不关联任何账本，流水仍会保留在个人流水中':autoIds.length?'尚未手选账本，保存时将按归集规则关联 '+snapshot.books.filter(book=>autoIds.includes(book.id)).map(book=>book.name).join('、'):'尚未选择账本，可从下面的推荐中补充关联' }}</p>
    <div v-if="snapshot.settings.bookAssignmentPromptEnabled&&suggestions.length" class="assignment-suggestions"><small>{{ editing?'可补充关联到这些账本':'符合这些账本时间范围' }}</small><div><button v-for="book in suggestions" :key="book.id" type="button" @click="select([...effectiveIds,book.id])"><CategoryIcon :name="book.icon" :color="book.color" :size="19"/><span><b>{{ book.name }}</b><small>{{ book.startDate||'不限开始' }} — {{ book.endDate||'不限结束' }}</small></span><UiIcon name="plus" :size="16"/></button></div></div>
    <BookSelectorDialog v-if="expanded" :books="snapshot.books" :model-value="effectiveIds" :multiple="true" :appearance-mode="snapshot.settings.appearanceMode" title="关联账本" @update:model-value="select" @close="expanded=false"/>
    <footer class="assignment-footer"><button type="button" class="feature-text-button" :class="{active:!explicit}" @click="automatic">按归集规则关联</button><button type="button" class="feature-text-button" :class="{active:explicit&&!modelValue.length}" @click="select([])">不绑定账本</button></footer>
  </section>
</template>

<style scoped>
.assignment-count{display:inline-grid;place-items:center;min-width:20px;min-height:20px;margin-left:5px;padding:1px 5px;border-radius:7px;background:var(--app-soft);color:var(--app-accent);font-size:10px;font-weight:500;vertical-align:middle}.assignment-picker{min-width:0}.assignment-picker>.feature-heading{align-items:flex-start;gap:12px}.assignment-picker>.feature-heading>div{min-width:0;flex:1}.assignment-picker>.feature-heading>button{flex:none;min-height:34px;padding:7px 10px;border:1px solid var(--app-line);border-radius:10px;background:var(--app-raised);font-size:11px}.assignment-selected{grid-template-columns:minmax(0,1fr);gap:12px}.assignment-book{padding:15px;border-radius:16px;border-color:var(--app-line);background:var(--app-raised);box-shadow:inset 3px 0 0 var(--book-color)}.assignment-book-row{gap:11px;min-width:0}.assignment-book-icon{width:39px;height:43px;flex:none;border:1px solid var(--app-line);border-radius:12px;background:var(--app-surface)}.assignment-book-row>span:nth-child(2){min-width:0}.assignment-book-row b{display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:2;overflow:hidden;font-size:13px;font-weight:600;line-height:1.7;overflow-wrap:anywhere}.assignment-book-row small{font-size:10px}.assignment-book-row>.feature-icon-button{flex:none;width:30px;min-height:32px;border:1px solid var(--app-line);border-radius:10px;background:var(--app-surface);color:var(--app-muted)}.assignment-book :deep(.statistics-toggle){font-size:11px;line-height:1.7}.assignment-split{margin-top:12px;padding-top:12px}.assignment-split summary{display:flex;align-items:center;justify-content:space-between;min-height:32px;list-style:none;font-size:11px}.assignment-split summary::-webkit-details-marker{display:none}.assignment-split summary::after{content:'＋';font-size:16px;color:var(--app-muted)}.assignment-split[open] summary::after{content:'−'}.assignment-split .feature-fields{grid-template-columns:minmax(0,1fr)}.assignment-footer{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:4px;padding:4px;border:1px solid var(--app-line);border-radius:11px;background:var(--app-raised)}.assignment-footer>button{min-width:0;min-height:35px;justify-content:center;border-radius:8px;font-size:10px;text-align:center}.assignment-footer>button.active{background:var(--app-surface);color:var(--app-accent)}.assignment-suggestions>div{grid-template-columns:minmax(0,1fr)}.assignment-suggestions button{min-width:0;border-style:solid;border-radius:12px;padding:11px}.assignment-suggestions b{font-size:12px;line-height:1.6}.assignment-picker button:focus-visible,.assignment-split summary:focus-visible{outline:2px solid var(--app-accent);outline-offset:2px}
</style>
