<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import type { Category, FlowType } from './ledger'
import CategoryIcon from './CategoryIcon.vue'
import { categoryTrail } from './ledgerViewModels'
import UiIcon from './UiIcon.vue'
import { trapDialogTab } from './dialogFocus'

const props = withDefaults(defineProps<{
  modelValue: string | string[] | null
  categories: Category[]
  title?: string
  placeholder?: string
  flowType?: FlowType | 'all'
  multiple?: boolean
  allowUnassigned?: boolean
  appearanceMode?: 'system' | 'light' | 'dark'
}>(), {
  title: '选择分类', placeholder: '请选择分类', flowType: 'all', multiple: false,
  allowUnassigned: false, appearanceMode: 'system',
})
const emit = defineEmits<{ 'update:modelValue': [value: string | string[] | null] }>()
const open = ref(false)
const search = ref('')
const activeFlow = ref<FlowType | 'all'>(props.flowType)
const levels = ref<string[]>([])
const dialog = ref<HTMLElement|null>(null)
const options = ref<HTMLElement|null>(null)
let previousFocus: HTMLElement|null = null
watch(() => props.flowType, value => { activeFlow.value = value })
watch(activeFlow, () => { levels.value = [] })
const source = computed(()=>props.categories.filter(category=>activeFlow.value==='all'||category.flowType===activeFlow.value))
const current = computed(()=>source.value.find(category=>category.id===levels.value.at(-1)))
const children = (id:string) => source.value.filter(category=>category.parentId===id).sort((a,b)=>a.sortOrder-b.sortOrder)
const records = computed(() => {
  const query=search.value.trim().toLocaleLowerCase()
  if(query)return source.value.filter(category=>category.name.toLocaleLowerCase().includes(query)).sort((a,b)=>a.sortOrder-b.sortOrder)
  if(current.value)return children(current.value.id)
  const ids=new Set(source.value.map(category=>category.id))
  return source.value.filter(category=>!category.parentId||!ids.has(category.parentId)).sort((a,b)=>a.sortOrder-b.sortOrder)
})
const selectedIds = computed(() => Array.isArray(props.modelValue) ? props.modelValue : props.modelValue ? [props.modelValue] : [])
const selected = computed(() => props.categories.filter(item => selectedIds.value.includes(item.id)))
const path = (category: Category) => {
  return categoryTrail(props.categories,category.id).map(item=>item.name).join(' / ')
}
const summary = computed(() => {
  if (!selected.value.length) return props.placeholder
  if (props.multiple) return `已选 ${selected.value.length} 个分类`
  return path(selected.value[0])
})
function selectedInBranch(category:Category){return selected.value.filter(item=>categoryTrail(props.categories,item.id).some(ancestor=>ancestor.id===category.id))}
function branchHint(category:Category){const chosen=selectedInBranch(category);if(chosen.length)return props.multiple?`已选 ${chosen.length} 个分类`:`已选：${chosen[0].name}`;return `${children(category.id).length} 个子分类`}
const close = () => { open.value = false; search.value = '' }
const show = () => { activeFlow.value=props.flowType;levels.value=[];search.value='';open.value=true }
async function resetScroll(){await nextTick();if(options.value)options.value.scrollTop=0}
async function enter(category:Category){if(children(category.id).length){levels.value.push(category.id);search.value='';await resetScroll();dialog.value?.focus()}else choose(category)}
async function back(){if(search.value)search.value='';else levels.value.pop();await resetScroll();dialog.value?.focus()}
watch(open,async value=>{if(value){previousFocus=document.activeElement instanceof HTMLElement?document.activeElement:null;await nextTick();dialog.value?.focus()}else if(previousFocus?.isConnected)previousFocus.focus()})
watch([search,activeFlow],resetScroll)
function choose(category: Category) {
  if (props.multiple) {
    const ids = [...selectedIds.value]
    const index = ids.indexOf(category.id)
    if (index >= 0) ids.splice(index, 1); else ids.push(category.id)
    emit('update:modelValue', ids)
  } else {
    emit('update:modelValue', category.id)
    close()
  }
}
function chooseUnassigned() {
  emit('update:modelValue', props.multiple ? [] : null)
  if (!props.multiple) close()
}
</script>

<template>
  <div class="category-picker">
    <slot name="trigger" :open="show" :summary="summary"><button type="button" class="category-picker-trigger" :class="{ 'has-value': selected.length }" @click="show">
      <span class="category-picker-trigger-icon" :style="selected[0] ? { '--category-color': selected[0].color } : undefined"><CategoryIcon :name="selected[0]?.icon" :category-name="selected[0]?.name" :flow-type="selected[0]?.flowType" :color="selected[0]?.color || 'currentColor'" :size="18" /></span>
      <span class="category-picker-trigger-copy"><small>{{ title }}</small><b>{{ summary }}</b></span>
      <span class="category-picker-trigger-arrow">⌄</span>
    </button></slot>
    <div v-if="multiple && selected.length" class="category-picker-chips">
      <button v-for="item in selected" :key="item.id" type="button" @click="choose(item)"><CategoryIcon :name="item.icon" :category-name="item.name" :flow-type="item.flowType" :color="item.color" :size="13" />{{ path(item) }} <span>×</span></button>
    </div>
    <Teleport to="body">
      <div v-if="open" class="category-picker-shade category-level-shade" :class="`theme-${appearanceMode}`" role="presentation" @click.self="close" @keydown.esc.stop.prevent="close">
        <section ref="dialog" class="category-picker-dialog category-level-dialog" role="dialog" aria-modal="true" :aria-label="title" tabindex="-1" @keydown="trapDialogTab($event,dialog)">
          <header><div><small>选择分类</small><h2>{{ title }}</h2><p>{{ multiple ? '逐级查看分类，可多选；父分类包含其全部子分类' : '点击一级分类进入下一级，选择后自动返回' }}</p></div><button type="button" aria-label="关闭分类选择" @click="close"><UiIcon name="close" :size="18"/></button></header>
          <div v-if="flowType === 'all'" class="category-picker-flow-tabs"><button v-for="tab in [{id:'all',label:'全部'},{id:'expense',label:'支出'},{id:'income',label:'收入'}] as const" :key="tab.id" type="button" :class="{selected:activeFlow===tab.id}" @click="activeFlow=tab.id">{{ tab.label }}</button></div>
          <label class="category-picker-search"><UiIcon name="search" :size="17"/><input v-model="search" placeholder="搜索任意层级分类" aria-label="搜索分类名称"/><button v-if="search" type="button" @click="search=''">清除</button></label>
          <nav class="category-level-bar" aria-label="当前分类层级"><template v-if="search.trim()"><b>搜索结果</b><span>{{ records.length }} 个匹配分类</span></template><template v-else-if="current"><button type="button" @click="back"><UiIcon name="back" :size="16"/>返回</button><b :title="path(current)">{{ path(current) }}</b><button v-if="levels.length>1" type="button" @click="levels=[];resetScroll()">一级分类</button></template><template v-else><b>一级分类</b><span>有子分类的项目可点开查看</span></template></nav>
          <div ref="options" class="category-picker-options">
            <button v-if="allowUnassigned&&!current&&!search.trim()" type="button" class="category-picker-option unassigned" :class="{selected:!selected.length}" @click="chooseUnassigned"><span class="category-picker-option-icon"><UiIcon name="minus" :size="18"/></span><span><b>{{ multiple ? '清空选择' : '未分类' }}</b><small>{{ multiple ? '取消当前所有分类' : '不指定分类' }}</small></span><i v-if="!selected.length"><UiIcon name="check" :size="14"/></i></button>
            <button v-if="current&&!search.trim()" type="button" class="category-picker-option category-level-current" :class="{selected:selectedIds.includes(current.id)}" @click="choose(current)"><span class="category-picker-option-icon" :style="{'--category-color':current.color}"><CategoryIcon :name="current.icon" :category-name="current.name" :flow-type="current.flowType" :color="current.color" :size="19"/></span><span><b>{{ multiple?'选择整个':'直接选择' }}{{ current.name }}</b><small>{{ multiple?'包含此分类及其全部子分类':'使用当前分类，不继续细分' }}</small></span><i v-if="selectedIds.includes(current.id)"><UiIcon name="check" :size="14"/></i></button>
            <button v-for="category in records" :key="category.id" type="button" class="category-picker-option category-level-row" :class="{selected:selectedIds.includes(category.id),'has-selected-child':selectedInBranch(category).length>0}" @click="search.trim()?choose(category):enter(category)" @keydown.right.prevent="!search.trim()&&children(category.id).length&&enter(category)" @keydown.left.prevent="current&&back()"><span class="category-picker-option-icon" :style="{'--category-color':category.color}"><CategoryIcon :name="category.icon" :category-name="category.name" :flow-type="category.flowType" :color="category.color" :size="19"/></span><span><b>{{ category.name }}</b><small v-if="search.trim()">{{ path(category) }}</small><small v-else-if="children(category.id).length" :class="{'category-level-selected-hint':selectedInBranch(category).length}">{{ branchHint(category) }}</small><small v-else>{{ category.flowType==='expense'?'支出分类':'收入分类' }}</small></span><i v-if="selectedIds.includes(category.id)"><UiIcon name="check" :size="14"/></i><UiIcon v-if="!search.trim()&&children(category.id).length" name="chevron" class="category-level-arrow" :size="16"/></button>
            <p v-if="!records.length" class="category-picker-empty">没有找到匹配的分类</p>
          </div>
          <footer><span>{{ multiple ? `已选择 ${selected.length} 个分类` : selected.length ? `当前：${path(selected[0])}` : placeholder }}</span><button v-if="multiple" type="button" class="primary-button" @click="close">完成</button></footer>
        </section>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
.category-level-shade{--cl-paper:#fff;--cl-soft:#f3f6fb;--cl-line:#e5eaf2;--cl-ink:#233148;--cl-muted:#738198;--cl-accent:#3976d3;--cl-selected:#edf3ff;}
.category-level-shade.theme-dark{--cl-paper:#1b2432;--cl-soft:#202c3c;--cl-line:#2c3a4e;--cl-ink:#e6edf8;--cl-muted:#9cacc2;--cl-accent:#86b3ff;--cl-selected:#263955;}
@media(prefers-color-scheme:dark){.category-level-shade.theme-system{--cl-paper:#1b2432;--cl-soft:#202c3c;--cl-line:#2c3a4e;--cl-ink:#e6edf8;--cl-muted:#9cacc2;--cl-accent:#86b3ff;--cl-selected:#263955;}}
.category-picker-shade.category-level-shade .category-picker-dialog.category-level-dialog{width:min(470px,100%);max-height:min(740px,calc(100dvh - 40px));border-color:var(--cl-line);background:var(--cl-paper);color:var(--cl-ink);outline:0;}
.category-level-shade .category-level-dialog>header{padding:21px 22px 15px;}
.category-level-shade .category-level-dialog>header small{color:var(--cl-accent);font-size:9px;letter-spacing:1px;}
.category-level-shade .category-level-dialog>header h2{font-size:21px;color:var(--cl-ink);}
.category-level-shade .category-level-dialog>header p{max-width:335px;font-size:11px;line-height:1.8;color:var(--cl-muted);}
.category-level-shade .category-level-dialog>header>button{display:grid;place-items:center;flex:none;background:var(--cl-soft);color:var(--cl-muted);}
.category-level-shade .category-level-dialog .category-picker-search{background:var(--cl-soft);border-color:var(--cl-line);color:var(--cl-muted);}
.category-level-shade .category-level-dialog .category-picker-search input{background:transparent;color:var(--cl-ink);font-size:12px;}
.category-level-shade .category-level-dialog .category-picker-search input::placeholder{color:var(--cl-muted);}
.category-level-shade .category-level-dialog .category-picker-search button{color:var(--cl-accent);}
.category-level-shade .category-level-dialog .category-picker-flow-tabs{background:var(--cl-soft);}
.category-level-shade .category-level-dialog .category-picker-flow-tabs button{color:var(--cl-muted);}
.category-level-shade .category-level-dialog .category-picker-flow-tabs button.selected{background:var(--cl-paper);color:var(--cl-accent);}
.category-level-bar{display:flex;align-items:center;gap:10px;min-height:43px;padding:0 22px 11px;color:var(--cl-ink);}
.category-level-bar>b{min-width:0;font-size:11px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.category-level-bar>span{margin-left:auto;font-size:9px;color:var(--cl-muted);}
.category-level-bar>button{display:flex;align-items:center;gap:3px;flex:none;padding:5px 0;border:0;background:transparent;color:var(--cl-accent);font-size:11px;cursor:pointer;}
.category-level-bar>button:last-child:not(:first-child){margin-left:auto;font-size:10px;}
.category-level-shade .category-level-dialog .category-picker-options{padding:0 13px 13px;overscroll-behavior:contain;}
.category-level-shade .category-level-dialog .category-picker-option{min-height:58px;padding:10px 11px;border-radius:11px;color:var(--cl-ink);}
.category-level-shade .category-level-dialog .category-picker-option>span:nth-child(2){min-width:0;}
.category-level-shade .category-level-dialog .category-picker-option b{font-size:13px;font-weight:500;overflow-wrap:anywhere;}
.category-level-shade .category-level-dialog .category-picker-option small{color:var(--cl-muted);font-size:10px;line-height:1.6;}
.category-level-shade .category-level-dialog .category-picker-option:hover{background:var(--cl-soft);border-color:transparent;}
.category-level-shade .category-level-dialog .category-picker-option.selected{background:var(--cl-selected);border-color:color-mix(in srgb,var(--cl-accent) 24%,var(--cl-line));}
.category-level-shade .category-level-dialog .category-picker-option-icon{background:color-mix(in srgb,var(--category-color,#849184) 12%,var(--cl-paper));}
.category-level-shade .category-level-dialog .category-picker-option.unassigned .category-picker-option-icon{background:var(--cl-soft);color:var(--cl-muted);}
.category-level-shade .category-level-dialog .category-picker-option>i{width:20px;height:20px;border:0;background:transparent;color:var(--cl-accent);}
.category-level-shade .category-level-dialog .category-picker-option .category-level-selected-hint{color:var(--cl-accent);}
.category-level-arrow{margin-left:auto;color:var(--cl-muted);}
.category-level-shade .category-level-dialog .category-level-current{margin-bottom:10px;border-color:var(--cl-line);background:var(--cl-soft);}
.category-level-shade .category-level-dialog .category-picker-empty{font-size:12px;color:var(--cl-muted);}
.category-level-shade .category-level-dialog>footer{min-height:50px;border-color:var(--cl-line);background:var(--cl-paper);color:var(--cl-muted);font-size:10px;}
.category-level-shade .category-level-dialog>footer>span{min-width:0;overflow-wrap:anywhere;line-height:1.7;}
.category-level-shade .category-level-dialog>footer>button{flex:none;background:#397bd8;color:#fff;}
.category-level-shade .category-level-dialog button:focus-visible{outline:2px solid var(--cl-accent);outline-offset:2px;}
@media(max-width:600px){.category-picker-shade.category-level-shade{padding:12px;}.category-picker-shade.category-level-shade .category-picker-dialog.category-level-dialog{max-height:calc(100dvh - 24px);border-radius:19px;}.category-level-shade .category-level-dialog>header{padding:18px 18px 13px;}.category-level-shade .category-level-dialog>header h2{font-size:19px;}.category-level-shade .category-level-dialog .category-picker-search{margin-left:18px;margin-right:18px;}.category-level-bar{padding-left:18px;padding-right:18px;}.category-level-bar>span{font-size:8px;}.category-level-shade .category-level-dialog>header p{font-size:10px;}.category-level-shade .category-level-dialog .category-picker-option{min-height:57px;}.category-level-shade .category-level-dialog>footer{padding-bottom:max(13px,env(safe-area-inset-bottom));}}
</style>
