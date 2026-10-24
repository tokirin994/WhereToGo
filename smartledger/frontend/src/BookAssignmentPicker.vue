<script setup lang="ts">
import { computed, ref } from 'vue'
import { assignAutoBooks, recommendedBooks, type FlowType, type LedgerSnapshot, type LedgerSplitSettings } from './ledger'
import CategoryIcon from './CategoryIcon.vue'
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
const expanded = ref(false), search = ref('')
const autoIds = computed(() => assignAutoBooks(props.snapshot, { happenedAt: props.happenedAt, categoryId: props.categoryId, kind: props.kind }))
const effectiveIds = computed(() => props.explicit && !props.modelValue.length ? [] : !props.snapshot.settings.bookAssignmentPromptEnabled ? [...new Set([...props.modelValue, ...autoIds.value])] : props.modelValue)
const selected = computed(() => props.snapshot.books.filter(book => effectiveIds.value.includes(book.id)))
const suggestions = computed(() => recommendedBooks(props.snapshot, props.happenedAt).filter(book => !effectiveIds.value.includes(book.id)))
const available = computed(() => props.snapshot.books.filter(book => `${book.name} ${book.note}`.toLocaleLowerCase().includes(search.value.toLocaleLowerCase())))
function select(ids: string[]) { emit('update:modelValue', [...new Set(ids)]); emit('update:explicit', true) }
function toggle(id: string) { select(effectiveIds.value.includes(id) ? effectiveIds.value.filter(value => value !== id) : [...effectiveIds.value, id]) }
function automatic() { emit('update:modelValue', []); emit('update:explicit', false) }
function splitFor(bookId: string): LedgerSplitSettings {
  const book = props.snapshot.books.find(item => item.id === bookId)!
  const own = book.participants.find(person => person.name === '我') || book.participants[0]
  return props.splitSettings?.[bookId] || { paidByParticipantId: own?.id || null, splitParticipantIds: own ? [own.id] : [], splitMode: 'equal', splitRatio: null, splitAmount: null }
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
    <header class="feature-heading"><div><h3>账本归属</h3><p>一笔流水可关联多个账本，各账本独立设置分账</p></div><button type="button" class="feature-text-button" @click="expanded=!expanded">{{ expanded?'收起选择':'选择账本' }}<UiIcon name="chevron" :size="13"/></button></header>
    <div v-if="selected.length" class="assignment-selected">
      <div v-for="book in selected" :key="book.id" class="assignment-book">
        <div class="assignment-book-row"><span class="assignment-book-icon" :style="{'--book-color':book.color}"><CategoryIcon :name="book.icon" :color="book.color" :size="20"/></span><span><b>{{ book.name }}</b><small>{{ autoIds.includes(book.id)&&!modelValue.includes(book.id)?'自动归集':'已关联' }}</small></span><button type="button" :aria-label="`移除${book.name}`" class="feature-icon-button" @click="toggle(book.id)"><UiIcon name="close" :size="15"/></button></div>
        <details v-if="book.participants.length>1" class="assignment-split"><summary>此账本的分账设置</summary><div class="feature-fields"><label>付款人<select :value="splitFor(book.id).paidByParticipantId" @change="updateSplit(book.id,'paidByParticipantId',($event.target as HTMLSelectElement).value)"><option v-for="person in book.participants" :key="person.id" :value="person.id">{{ person.name }}</option></select></label><label>分摊方式<select :value="splitFor(book.id).splitMode" @change="updateSplit(book.id,'splitMode',($event.target as HTMLSelectElement).value)"><option value="equal">平均分摊</option><option value="ratio">本人比例</option><option value="fixed">本人固定金额</option></select></label><label v-if="splitFor(book.id).splitMode==='ratio'">本人比例（%）<input :value="splitFor(book.id).splitRatio??50" type="number" min="0" max="100" @input="updateSplit(book.id,'splitRatio',Number(($event.target as HTMLInputElement).value))"/></label><label v-if="splitFor(book.id).splitMode==='fixed'">本人分摊金额<input :value="splitFor(book.id).splitAmount??0" type="number" min="0" step="0.01" @input="updateSplit(book.id,'splitAmount',Number(($event.target as HTMLInputElement).value))"/></label></div><div class="feature-check-chips"><label v-for="person in book.participants" :key="person.id"><input type="checkbox" :checked="splitFor(book.id).splitParticipantIds.includes(person.id)" @change="toggleMember(book.id,person.id)"/>{{ person.name }}</label></div></details>
      </div>
    </div>
    <p v-else class="feature-empty">{{ explicit?'不关联任何账本，流水仍会保留在个人流水中':autoIds.length?'尚未手选账本，保存时将按归集规则关联 '+snapshot.books.filter(book=>autoIds.includes(book.id)).map(book=>book.name).join('、'):'尚未选择账本，可从下面的推荐中补充关联' }}</p>
    <div v-if="snapshot.settings.bookAssignmentPromptEnabled&&suggestions.length" class="assignment-suggestions"><small>{{ editing?'可补充关联到这些账本':'符合这些账本时间范围' }}</small><div><button v-for="book in suggestions" :key="book.id" type="button" @click="select([...effectiveIds,book.id])"><CategoryIcon :name="book.icon" :color="book.color" :size="19"/><span><b>{{ book.name }}</b><small>{{ book.startDate||'不限开始' }} — {{ book.endDate||'不限结束' }}</small></span><UiIcon name="plus" :size="16"/></button></div></div>
    <div v-if="expanded" class="assignment-all"><label class="feature-search"><UiIcon name="search" :size="16"/><input v-model="search" placeholder="搜索账本"/></label><div class="assignment-options"><button v-for="book in available" :key="book.id" type="button" :class="{selected:effectiveIds.includes(book.id)}" :aria-pressed="effectiveIds.includes(book.id)" @click="toggle(book.id)"><CategoryIcon :name="book.icon" :color="book.color" :size="19"/><span>{{ book.name }}</span><UiIcon v-if="effectiveIds.includes(book.id)" name="check" :size="16"/></button><p v-if="!available.length" class="feature-empty">没有匹配的账本</p></div></div>
    <footer class="assignment-footer"><button type="button" class="feature-text-button" :class="{active:!explicit}" @click="automatic">按归集规则关联</button><button type="button" class="feature-text-button" :class="{active:explicit&&!modelValue.length}" @click="select([])">不绑定账本</button></footer>
  </section>
</template>
