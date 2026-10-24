<script setup lang="ts">
import { nextTick, onMounted, onUnmounted, ref } from 'vue'
import UiIcon from './UiIcon.vue'
export interface MenuAction { id: string; label: string; icon?: string; danger?: boolean; disabled?: boolean; children?: MenuAction[] }
withDefaults(defineProps<{ actions: MenuAction[]; label?: string }>(), { label: '更多操作' })
const emit = defineEmits<{ select: [id: string] }>()
const open = ref(false), upward = ref(false)
const group = ref<MenuAction | null>(null)
const anchor = ref<HTMLElement | null>(null), menu = ref<HTMLElement | null>(null), trigger = ref<HTMLButtonElement | null>(null)
async function toggle() {
  if (open.value) { close(); return }
  group.value=null; upward.value=false; open.value=true
  await nextTick()
  if (menu.value) { const rect=menu.value.getBoundingClientRect(); upward.value=rect.bottom>window.innerHeight-12&&rect.top>rect.height }
}
function close(restoreFocus=false) { open.value=false;group.value=null;if(restoreFocus)trigger.value?.focus() }
async function openWithKeyboard(){if(!open.value)await toggle();await nextTick();menu.value?.querySelector<HTMLButtonElement>('[role=menuitem]')?.focus()}
async function choose(action:MenuAction) {
  if(action.disabled)return
  if(action.children){group.value=action;await nextTick();menu.value?.querySelector<HTMLButtonElement>('[role=menuitem]')?.focus();return}
  close(true);emit('select',action.id)
}
function outside(event:PointerEvent){if(event.target instanceof Node&&!anchor.value?.contains(event.target))close()}
function keydown(event:KeyboardEvent){
  if(event.key==='Escape'){event.preventDefault();close(true);return}
  if(event.key!=='ArrowDown'&&event.key!=='ArrowUp'&&event.key!=='Home'&&event.key!=='End')return
  event.preventDefault()
  const options=[...(menu.value?.querySelectorAll<HTMLButtonElement>('[role=menuitem]:not(:disabled)')||[])]
  const current=options.indexOf(document.activeElement as HTMLButtonElement)
  const index=event.key==='Home'?0:event.key==='End'?options.length-1:(current+(event.key==='ArrowDown'?1:-1)+options.length)%options.length
  options[index]?.focus()
}
function escape(event:KeyboardEvent){if(open.value&&event.key==='Escape')close(true)}
onMounted(()=>{document.addEventListener('pointerdown',outside);document.addEventListener('keydown',escape)})
onUnmounted(()=>{document.removeEventListener('pointerdown',outside);document.removeEventListener('keydown',escape)})
</script>
<template>
  <div ref="anchor" class="lv-menu-anchor">
    <button ref="trigger" type="button" class="lv-menu-trigger" :aria-label="label" :aria-expanded="open" aria-haspopup="menu" @click="toggle" @keydown.down.prevent="openWithKeyboard"><slot name="trigger"><UiIcon name="more"/></slot></button>
    <div v-if="open" ref="menu" class="lv-action-menu" :class="{upward}" role="menu" :aria-label="group?.label||label" @keydown="keydown">
      <button v-if="group" class="lv-menu-back" type="button" @click="group=null"><UiIcon name="back" :size="15"/>{{ group.label }}</button>
      <button v-for="action in group?.children||actions" :key="action.id" role="menuitem" type="button" :disabled="action.disabled" :class="{danger:action.danger}" @click="choose(action)"><UiIcon :name="action.icon||'list'" :size="16"/><span>{{ action.label }}</span><UiIcon v-if="action.children" name="chevron" :size="13"/></button>
    </div>
  </div>
</template>
<style scoped>
.lv-menu-anchor{position:relative;flex:none;}
.lv-menu-trigger{display:flex;align-items:center;justify-content:center;gap:6px;min-width:34px;min-height:34px;padding:7px;border:1px solid transparent;border-radius:11px;background:transparent;color:var(--lv-muted,#85939d);font:inherit;cursor:pointer;}
.lv-menu-trigger:hover,.lv-menu-trigger[aria-expanded=true]{background:var(--lv-soft,#f0f4f6);color:var(--lv-ink,#283b47);}
.lv-menu-trigger:focus-visible{outline:2px solid var(--lv-accent,#348fd2);outline-offset:2px;}
.lv-action-menu{position:absolute;z-index:30;top:calc(100% + 6px);right:0;width:205px;max-width:calc(100vw - 40px);max-height:65dvh;overflow:auto;padding:5px;border:1px solid var(--lv-line,#e3e9ec);border-radius:14px;background:var(--lv-paper,#fff);box-shadow:0 10px 40px #142b3926;color:var(--lv-ink,#283b47);}
.lv-action-menu.upward{top:auto;bottom:calc(100% + 6px);}
.lv-action-menu button{display:flex;align-items:center;gap:10px;width:100%;min-height:40px;padding:10px;border:0;border-radius:9px;background:transparent;color:inherit;text-align:left;font-family:inherit;font-size:12px;cursor:pointer;}
.lv-action-menu button span{flex:1;}.lv-action-menu button:hover,.lv-action-menu button:focus-visible{outline:0;background:var(--lv-soft,#f0f4f6);}.lv-action-menu .danger{color:#d9756c;}.lv-action-menu button:disabled{opacity:.4;cursor:default;}.lv-action-menu .lv-menu-back{border-bottom:1px solid var(--lv-line,#e3e9ec);border-radius:0;font-size:11px;color:var(--lv-muted,#85939d);}
</style>
