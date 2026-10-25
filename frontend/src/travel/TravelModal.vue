<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'
import { X } from '@lucide/vue'
const props=defineProps<{title:string;eyebrow?:string;wide?:boolean;locked?:boolean;error?:string}>()
const emit=defineEmits<{close:[]}>()
const element=ref<HTMLDialogElement|null>(null),titleId='travel-dialog-'+crypto.randomUUID()
let previous:HTMLElement|null=null
function close(){if(!props.locked)emit('close')}
onMounted(()=>{previous=document.activeElement as HTMLElement;element.value?.showModal();element.value?.querySelector<HTMLElement>('input,textarea,select')?.focus()})
onUnmounted(()=>{element.value?.close();if(previous?.isConnected)previous.focus()})
</script>
<template><dialog ref="element" class="tw-dialog" :class="{'tw-dialog-wide':wide}" :aria-labelledby="titleId" @cancel.prevent="close" @click="event=>{if(event.target===element)close()}"><header><div><small v-if="eyebrow">{{ eyebrow }}</small><h2 :id="titleId">{{ title }}</h2></div><button type="button" class="tw-icon" aria-label="关闭弹窗" :disabled="locked" @click="close"><X :size="20"/></button></header><p v-if="error" role="alert" class="tw-dialog-error">{{ error }}</p><slot/></dialog></template>
