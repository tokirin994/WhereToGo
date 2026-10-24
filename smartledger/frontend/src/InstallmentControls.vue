<script setup lang="ts">
import { computed } from 'vue'
import { shiftMonth } from './ledger'
const props = withDefaults(defineProps<{ enabled: boolean; months: number; startDate: string; amount: number; max?: number; existing?: boolean; index?: number | null; originalTotal?: number | null }>(), { max: 36 })
const emit = defineEmits<{ 'update:enabled': [value: boolean]; 'update:months': [value: number]; 'update:startDate': [value: string]; cancel: []; payoff: [] }>()
const preview = computed(() => {
  if (!props.enabled || props.existing || !props.startDate || !Number.isFinite(props.amount) || !Number.isInteger(props.months) || props.months < 2 || props.months > props.max) return null
  const cents = Math.round(props.amount * 100), each = Math.round(cents / props.months)
  const last = cents - each * (props.months - 1)
  if (cents < props.months || last <= 0) return null
  const end = new Date(shiftMonth(`${props.startDate}T00:00:00`, props.months - 1))
  return { each: (each / 100).toFixed(2), last: (last / 100).toFixed(2), end: `${end.getFullYear()} 年 ${end.getMonth()+1} 月` }
})
</script>
<template>
  <section class="installment-controls feature-section">
    <header class="feature-heading"><div><h3>分期记账</h3><p>{{ existing?'修改当前一期不会重新拆分整组流水':'按月分摊支出，最后一期自动调整尾差' }}</p></div><label v-if="!existing" class="feature-switch"><input :checked="enabled" type="checkbox" @change="emit('update:enabled',($event.target as HTMLInputElement).checked)"/><span></span><b>{{ enabled?'已开启':'开启' }}</b></label></header>
    <template v-if="existing"><div class="installment-existing"><span>第 <b>{{ index }}</b> / {{ months }} 期</span><span>原始总额 <b>¥{{ Number(originalTotal||amount).toFixed(2) }}</b></span></div><div class="installment-actions"><button type="button" class="feature-button" @click="emit('cancel')">取消分期并合并</button><button type="button" class="feature-button accent" @click="emit('payoff')">立即还清剩余分期</button></div></template>
    <template v-else-if="enabled"><div class="feature-fields"><label>分期月数（2–{{ max }}）<input :value="months" type="number" min="2" :max="max" step="1" @input="emit('update:months',Number(($event.target as HTMLInputElement).value))"/></label><label>分期起始日期<input :value="startDate" type="date" required @input="emit('update:startDate',($event.target as HTMLInputElement).value)"/></label></div><div v-if="preview" class="installment-preview"><span>前 {{ months-1 }} 期 <b>¥{{ preview.each }}</b> / 期</span><span>最后一期 <b>¥{{ preview.last }}</b></span><small>预计于 {{ preview.end }} 完成 · 按所选日期逐月记账</small></div><p v-else class="feature-help">请填写有效金额、期数和起始日期，每期至少 0.01 元。</p></template>
  </section>
</template>
