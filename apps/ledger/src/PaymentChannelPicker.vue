<script setup lang="ts">
import { computed, nextTick, ref } from 'vue'
import UiIcon from './UiIcon.vue'

const props = defineProps<{ modelValue?: string; channels: string[]; disabled?: boolean }>()
const emit = defineEmits<{ 'update:modelValue': [value: string] }>()
const adding = ref(false)
const name = ref('')
const select = ref<HTMLSelectElement>()
const input = ref<HTMLInputElement>()
const value = computed(() => props.modelValue || '')
const options = computed(() => [...new Set([...props.channels, value.value].filter(Boolean))])
const selected = computed(() => adding.value ? 'add' : value.value ? 'channel:' + value.value : '')
const existing = computed(() => options.value.find(channel => channel.toLocaleLowerCase() === name.value.trim().toLocaleLowerCase()))

async function change(event: Event) {
  const option = (event.target as HTMLSelectElement).value
  if (option === 'add') {
    name.value = ''
    adding.value = true
    await nextTick()
    input.value?.focus()
    return
  }
  adding.value = false
  emit('update:modelValue', option.slice('channel:'.length))
}

async function closeAdd() {
  adding.value = false
  await nextTick()
  select.value?.focus()
}

function add(event?: KeyboardEvent) {
  if (event?.isComposing) return
  event?.preventDefault()
  const channel = name.value.trim()
  if (props.disabled || !channel || channel.length > 40) return
  emit('update:modelValue', existing.value || channel)
  void closeAdd()
}
</script>

<template>
  <div class="payment-channel-picker">
    <label>
      支付渠道
      <select ref="select" aria-label="支付渠道" :value="selected" :disabled="disabled" @change="change">
        <option value="">{{ value ? '不指定渠道' : '选择支付渠道（可选）' }}</option>
        <option v-for="channel in options" :key="channel" :value="'channel:' + channel">{{ channel }}</option>
        <option value="add">＋ 新增支付渠道…</option>
      </select>
    </label>
    <div v-if="adding" class="payment-channel-add">
      <label>
        新支付渠道名称
        <input ref="input" v-model="name" maxlength="40" autocomplete="off" placeholder="例如：交通卡" :disabled="disabled" @keydown.enter="add" @keydown.esc.stop.prevent="closeAdd"/>
      </label>
      <small>{{ existing ? '已有同名渠道，可以直接使用。' : '流水保存后，新渠道会加入常用列表。' }}</small>
      <div class="payment-channel-actions">
        <button type="button" class="feature-text-button" @click="closeAdd">取消新增</button>
        <button type="button" class="feature-button" :disabled="disabled || !name.trim()" @click="add()"><UiIcon :name="existing ? 'check' : 'plus'" :size="15"/>{{ existing ? '使用已有渠道' : '使用新渠道' }}</button>
      </div>
    </div>
    <slot />
  </div>
</template>

<style scoped>
.payment-channel-picker { display: grid; gap: 7px; min-width: 0; align-content: start; }
.payment-channel-picker label { display: grid; gap: 8px; min-width: 0; margin: 0; font-size: 12px; font-weight: 500; }
.payment-channel-picker select { min-width: 0; width: 100%; background-color: var(--app-raised); color: var(--app-ink); }
.payment-channel-add { display: grid; gap: 9px; padding: 12px; border: 1px solid var(--app-line); border-radius: 12px; background: var(--app-raised); }
.payment-channel-add small { color: var(--app-muted); font-size: 11px; line-height: 1.5; }
.payment-channel-actions { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: 8px; }
.payment-channel-actions button { min-height: 36px; }
@media (pointer: coarse) {
  .ledger-app .feature-fields .payment-channel-picker :is(select, input) { font-size: 16px; }
}
</style>
