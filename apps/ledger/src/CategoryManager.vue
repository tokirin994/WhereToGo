<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import CategoryIcon from './CategoryIcon.vue'
import {useAnchoredPopover} from '@personal/platform/popover'
import type { Category, FlowType } from './ledger'

const props = defineProps<{ categories: Category[]; flowType: FlowType }>()
const emit = defineEmits<{
  'update:flowType': [value: FlowType]
  back: []
  create: [parent?: Category]
  edit: [category: Category]
  delete: [category: Category]
  reorder: [ids: string[]]
}>()
const search = ref('')
const sorting = ref(false)
const expanded = ref(new Set<string>())
const activeMenuId = ref<string | null>(null)
const root=ref<HTMLElement|null>(null),activeAnchor=ref<HTMLElement|null>(null),activePanel=ref<HTMLElement|null>(null)
const {style:menuStyle,position:positionMenu}=useAnchoredPopover(activeAnchor,activePanel,computed(()=>activeMenuId.value!==null))
watch(activeMenuId,async()=>{
  await nextTick()
  activeAnchor.value=root.value?.querySelector<HTMLElement>('.cm-menu-toggle[aria-expanded=true]')?.parentElement||null
  activePanel.value=root.value?.querySelector<HTMLElement>('.cm-action-menu')||null
  positionMenu()
})
const draggingId = ref<string | null>(null)
const dropTarget = ref<{ id: string; after: boolean } | null>(null)
const announcement = ref('')
const available = computed(() => props.categories.filter(item => item.flowType === props.flowType))
const query = computed(() => search.value.trim().toLocaleLowerCase())
const children = computed(() => {
  const result = new Map<string | null, Category[]>()
  const ids = new Set(available.value.map(item => item.id))
  for (const category of available.value) {
    const parent = category.parentId && ids.has(category.parentId) ? category.parentId : null
    result.set(parent, [...(result.get(parent) || []), category])
  }
  for (const group of result.values()) group.sort((a,b) => a.sortOrder-b.sortOrder)
  return result
})
const roots = computed(() => children.value.get(null) || [])
const visibleRows = computed(() => {
  const result: Array<{ category: Category; depth: number; hasChildren: boolean; expanded: boolean }> = []
  const visited = new Set<string>()
  function matches(category: Category, ancestors = new Set<string>()): boolean {
    if (!query.value || category.name.toLocaleLowerCase().includes(query.value)) return true
    if (ancestors.has(category.id)) return false
    return (children.value.get(category.id) || []).some(child => matches(child, new Set([...ancestors, category.id])))
  }
  function visit(category: Category, depth: number, parentMatches = false) {
    if (visited.has(category.id) || (!parentMatches && !matches(category))) return
    visited.add(category.id)
    const nested = children.value.get(category.id) || []
    const isExpanded = !!query.value || expanded.value.has(category.id)
    result.push({ category, depth, hasChildren: !!nested.length, expanded: isExpanded })
    if (isExpanded) {
      const showAllChildren = parentMatches || (!!query.value && category.name.toLocaleLowerCase().includes(query.value))
      nested.forEach(child => visit(child, depth+1, showAllChildren))
    }
  }
  roots.value.forEach(root => visit(root, 0))
  return result
})

watch(() => props.flowType, () => { activeMenuId.value = null; sorting.value = false; cancelDrag() })
watch(query, () => { activeMenuId.value = null; sorting.value = false; cancelDrag() })
watch(sorting, () => { activeMenuId.value = null; cancelDrag() })
function toggleExpanded(id: string) {
  const next = new Set(expanded.value)
  if (next.has(id)) next.delete(id); else next.add(id)
  expanded.value = next
}
function act(action: 'edit' | 'delete' | 'create', category: Category) {
  activeMenuId.value = null
  if (action === 'create') emit('create', category)
  else if (action === 'edit') emit('edit', category)
  else emit('delete', category)
}
function dismissMenu(event: PointerEvent) {
  if (!(event.target instanceof Element) || !event.target.closest('[data-category-menu]')) activeMenuId.value = null
}
function onEscape(event: KeyboardEvent) {
  if (event.key === 'Escape') { activeMenuId.value = null; cancelDrag() }
}
onMounted(() => { document.addEventListener('pointerdown', dismissMenu); document.addEventListener('keydown', onEscape) })
onUnmounted(() => { document.removeEventListener('pointerdown', dismissMenu); document.removeEventListener('keydown', onEscape); cancelDrag() })

let swipeStart: { id: string; x: number; y: number } | null = null
let suppressClickId: string | null = null
function startSwipe(event: PointerEvent, id: string) {
  if (event.pointerType === 'touch' && !sorting.value) swipeStart = { id, x: event.clientX, y: event.clientY }
}
function finishSwipe(event: PointerEvent, id: string) {
  if (!swipeStart || swipeStart.id !== id) return
  const dx = event.clientX-swipeStart.x, dy = event.clientY-swipeStart.y
  if (dx < -45 && Math.abs(dx) > Math.abs(dy)*1.5) {
    activeMenuId.value = id
    suppressClickId = id
    window.setTimeout(() => { if (suppressClickId === id) suppressClickId = null }, 500)
  }
  swipeStart = null
}
function openEditor(category: Category) {
  if (suppressClickId === category.id) { suppressClickId = null; return }
  if (!sorting.value) act('edit', category)
}

let drag: { id: string; pointerId: number; handle: HTMLElement; x: number; y: number } | null = null
let scrollFrame = 0
function siblingsOf(category: Category) {
  return available.value.filter(item => item.parentId === category.parentId).sort((a,b) => a.sortOrder-b.sortOrder)
}
function updateDropTarget() {
  if (!drag) return
  const element = document.elementFromPoint(drag.x, drag.y)?.closest<HTMLElement>('[data-category-row]')
  const target = available.value.find(item => item.id === element?.dataset.categoryRow)
  const source = available.value.find(item => item.id === drag?.id)
  if (!element || !target || !source || target.id === source.id || target.parentId !== source.parentId) {
    dropTarget.value = null
    return
  }
  const rect = element.getBoundingClientRect()
  dropTarget.value = { id: target.id, after: drag.y > rect.top+rect.height/2 }
}
function scrollWhileDragging() {
  if (!drag) return
  const edge = 80
  const delta = drag.y < edge ? -Math.ceil((edge-drag.y)/7) : drag.y > window.innerHeight-edge ? Math.ceil((drag.y-window.innerHeight+edge)/7) : 0
  if (delta) { window.scrollBy(0, Math.max(-16, Math.min(16, delta))); updateDropTarget() }
  scrollFrame = window.requestAnimationFrame(scrollWhileDragging)
}
function startDrag(category: Category, event: PointerEvent) {
  if (!sorting.value || event.button !== 0) return
  event.preventDefault()
  const handle = event.currentTarget as HTMLElement
  handle.setPointerCapture(event.pointerId)
  drag = { id: category.id, pointerId: event.pointerId, handle, x: event.clientX, y: event.clientY }
  draggingId.value = category.id
  scrollFrame = window.requestAnimationFrame(scrollWhileDragging)
}
function moveDrag(event: PointerEvent) {
  if (!drag || drag.pointerId !== event.pointerId) return
  drag.x = event.clientX; drag.y = event.clientY
  updateDropTarget()
}
function finishDrag(event: PointerEvent) {
  if (!drag || drag.pointerId !== event.pointerId) return
  const source = available.value.find(item => item.id === drag?.id)
  const target = dropTarget.value
  if (source && target) {
    const previous = siblingsOf(source).map(item => item.id)
    const ordered = previous.filter(id => id !== source.id)
    const position = ordered.indexOf(target.id)+(target.after ? 1 : 0)
    ordered.splice(position, 0, source.id)
    if (ordered.some((id,index) => id !== previous[index])) {
      emit('reorder', ordered)
      announcement.value = `已调整${source.name}的顺序`
    }
  }
  cancelDrag()
}
function cancelDrag() {
  window.cancelAnimationFrame(scrollFrame)
  if (drag?.handle.hasPointerCapture(drag.pointerId)) drag.handle.releasePointerCapture(drag.pointerId)
  drag = null; draggingId.value = null; dropTarget.value = null
}
function moveWithKeyboard(category: Category, direction: -1 | 1) {
  const ordered = siblingsOf(category).map(item => item.id)
  const index = ordered.indexOf(category.id), destination = index+direction
  if (destination < 0 || destination >= ordered.length) return
  ;[ordered[index], ordered[destination]] = [ordered[destination], ordered[index]]
  emit('reorder', ordered)
  announcement.value = `已${direction < 0 ? '上移' : '下移'}${category.name}`
}
</script>

<template>
  <section ref="root" class="category-manager" :class="{'is-sorting':sorting}">
    <header class="cm-header">
      <button class="cm-back" type="button" @click="emit('back')"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m14 6-6 6 6 6"/></svg>更多</button>
      <div class="cm-header-actions">
        <button class="cm-sort" type="button" :class="{active:sorting}" :disabled="!!query || available.length < 2" @click="sorting=!sorting">{{ sorting?'完成':'排序' }}</button>
        <button class="cm-add" type="button" :disabled="sorting" @click="emit('create')"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg><span>新建分类</span></button>
      </div>
    </header>
    <div class="cm-intro"><h2>分类管理</h2><p>整理每一笔收支的归属</p></div>
    <div class="cm-segments" role="group" aria-label="分类类型">
      <button v-for="flow in [{id:'expense',name:'支出'},{id:'income',name:'收入'}] as const" :key="flow.id" type="button" :aria-pressed="flowType===flow.id" :class="{selected:flowType===flow.id}" @click="emit('update:flowType',flow.id)">{{ flow.name }}</button>
    </div>
    <label class="cm-search"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 4 4"/></svg><input v-model="search" placeholder="搜索分类名称" aria-label="搜索分类名称"/><button v-if="search" type="button" aria-label="清除搜索" @click="search=''"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m7 7 10 10M7 17 17 7"/></svg></button></label>
    <div class="cm-stats"><div><span>一级分类</span><b>{{ roots.length }}</b></div><div><span>全部分类</span><b>{{ available.length }}</b></div></div>
    <p v-if="sorting" class="cm-sort-help">拖动右侧手柄调整同级分类顺序，完成后点击“完成”。</p>
    <div class="cm-list" :aria-label="`${flowType==='expense'?'支出':'收入'}分类`">
      <div v-for="row in visibleRows" :key="row.category.id" class="cm-row-wrap" :style="{'--category-depth':Math.min(row.depth,4)}">
        <article class="cm-row" :data-category-row="row.category.id" :class="{'is-dragging':draggingId===row.category.id,'drop-before':dropTarget?.id===row.category.id&&!dropTarget.after,'drop-after':dropTarget?.id===row.category.id&&dropTarget.after}">
          <button v-if="row.hasChildren" type="button" class="cm-disclosure" :aria-expanded="row.expanded" :aria-label="`${row.expanded?'收起':'展开'}${row.category.name}的子分类`" :disabled="!!query" @click="toggleExpanded(row.category.id)"><svg viewBox="0 0 24 24" :class="{expanded:row.expanded}" aria-hidden="true"><path d="m9 5 7 7-7 7"/></svg></button>
          <span v-else class="cm-disclosure-spacer"></span>
          <button class="cm-open" type="button" :aria-label="`编辑${row.category.name}`" :disabled="sorting" @click="openEditor(row.category)" @pointerdown="startSwipe($event,row.category.id)" @pointerup="finishSwipe($event,row.category.id)" @pointercancel="swipeStart=null">
            <span class="cm-icon" :style="{'--category-accent':row.category.color}"><CategoryIcon :name="row.category.icon" :color="row.category.color" :size="20"/></span>
            <span class="cm-row-copy"><b>{{ row.category.name }}</b><small>{{ flowType==='expense'?'支出':'收入' }}<span class="cm-dot"></span>{{ row.depth===0?'一级分类':`${row.depth+1}级分类` }}<template v-if="row.hasChildren"><span class="cm-dot"></span>{{ children.get(row.category.id)?.length }} 个子分类</template></small></span>
          </button>
          <button v-if="sorting" class="cm-reorder-handle" type="button" :aria-label="`拖动调整${row.category.name}顺序，也可按上下方向键移动`" @pointerdown="startDrag(row.category,$event)" @pointermove="moveDrag" @pointerup="finishDrag" @pointercancel="cancelDrag" @lostpointercapture="cancelDrag" @keydown.up.prevent="moveWithKeyboard(row.category,-1)" @keydown.down.prevent="moveWithKeyboard(row.category,1)"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 7h14M5 12h14M5 17h14"/></svg></button>
          <div v-else data-category-menu class="cm-menu-anchor"><button type="button" class="cm-menu-toggle" :aria-label="`${row.category.name}的更多操作`" :aria-expanded="activeMenuId===row.category.id" aria-haspopup="menu" @click="activeMenuId=activeMenuId===row.category.id?null:row.category.id"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="5" cy="12" r="1.4"/><circle cx="12" cy="12" r="1.4"/><circle cx="19" cy="12" r="1.4"/></svg></button>
            <div v-if="activeMenuId===row.category.id" class="cm-action-menu" :style="menuStyle" role="menu"><button type="button" role="menuitem" @click="act('edit',row.category)">编辑分类</button><button type="button" role="menuitem" @click="act('create',row.category)">添加子分类</button><button type="button" role="menuitem" class="cm-delete" @click="act('delete',row.category)">删除分类</button></div>
          </div>
        </article>
      </div>
      <div v-if="!visibleRows.length" class="cm-empty"><span><CategoryIcon name="grid" :size="25"/></span><b>{{ query?'未找到相关分类':'还没有分类' }}</b><p>{{ query?'试试其他名称，或清除搜索条件。':'创建一个分类，开始整理你的收支。' }}</p><button v-if="!query" class="cm-sort" type="button" @click="emit('create')">新建分类</button></div>
    </div>
    <p v-if="visibleRows.length&&!sorting" class="cm-footnote">点击分类编辑，点击展开按钮查看子分类。</p>
    <span class="cm-sr-only" role="status" aria-live="polite">{{ announcement }}</span>
  </section>
</template>

<style scoped>
.category-manager { --cm-paper:#fff;--cm-soft:#f3f5f5;--cm-line:#e7ebed;--cm-ink:#28363e;--cm-muted:#879399;--cm-accent:#288fca;--cm-shadow:0 10px 35px #25394612;max-width:850px;margin:0 auto;padding-bottom:20px;color:var(--cm-ink);font-family:inherit; }
button,input { font:inherit; }
button { cursor:pointer; }
button:disabled { cursor:default; }
button:focus-visible,input:focus-visible { outline:2px solid var(--cm-accent);outline-offset:3px; }
svg { display:block;width:19px;height:19px;fill:none;stroke:currentColor;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round;flex:none; }
.cm-header,.cm-header-actions { display:flex;align-items:center;gap:10px; }
.cm-header { justify-content:space-between;margin-bottom:20px; }
.cm-back { display:flex;align-items:center;gap:3px;padding:6px 0;border:0;background:transparent;color:var(--cm-muted);font-size:12px; }
.cm-back svg { width:16px;height:16px; }
.cm-sort,.cm-add { display:flex;align-items:center;justify-content:center;gap:6px;min-height:36px;padding:7px 13px;border:1px solid var(--cm-line);border-radius:11px;background:var(--cm-paper);color:var(--cm-ink);font-size:12px;font-weight:600; }
.cm-sort.active { color:var(--cm-accent);border-color:color-mix(in srgb,var(--cm-accent) 35%,var(--cm-line));background:color-mix(in srgb,var(--cm-accent) 9%,var(--cm-paper)); }
.cm-sort:disabled,.cm-add:disabled { opacity:.4; }
.cm-add { border-color:transparent;background:var(--cm-accent);color:#fff; }
.cm-add svg { width:16px;height:16px; }
.cm-intro { margin-bottom:20px; }
.cm-intro h2 { margin:0 0 6px;font-size:25px;font-weight:750;letter-spacing:-.6px;color:var(--cm-ink); }
.cm-intro p { margin:0;color:var(--cm-muted);font-size:12px; }
.cm-segments { display:grid;grid-template-columns:1fr 1fr;gap:4px;padding:4px;border:1px solid var(--cm-line);border-radius:13px;background:var(--cm-soft); }
.cm-segments button { min-height:36px;border:0;border-radius:9px;background:transparent;color:var(--cm-muted);font-size:13px;font-weight:600; }
.cm-segments button.selected { background:var(--cm-paper);color:var(--cm-ink);box-shadow:0 2px 6px #233d4810; }
.cm-search { display:flex;align-items:center;gap:9px;margin:14px 0;padding:0 13px;border:1px solid var(--cm-line);border-radius:12px;background:var(--cm-paper);color:var(--cm-muted); }
.cm-search svg { width:17px;height:17px; }
.cm-search input { width:100%;min-width:0;height:42px;padding:0;border:0;outline:0;background:transparent;color:var(--cm-ink);font-size:12px; }
.cm-search input::placeholder { color:var(--cm-muted); }
.cm-search button { display:grid;place-items:center;width:26px;height:26px;flex:none;padding:3px;border:0;border-radius:50%;background:var(--cm-soft);color:var(--cm-muted); }
.cm-stats { display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:18px; }
.cm-stats > div { display:flex;align-items:center;justify-content:space-between;padding:13px 16px;border:1px solid var(--cm-line);border-radius:13px;background:var(--cm-paper); }
.cm-stats span { color:var(--cm-muted);font-size:11px; }
.cm-stats b { font-size:18px;font-weight:650;font-variant-numeric:tabular-nums; }
.cm-list { display:grid;gap:8px; }
.cm-row-wrap { min-width:0;margin-left:calc(var(--category-depth) * 22px); }
.cm-row { position:relative;display:flex;align-items:center;gap:2px;min-height:72px;padding:7px 10px 7px 6px;border:1px solid var(--cm-line);border-radius:18px;background:var(--cm-paper);transition:background .15s,border-color .15s,opacity .15s; }
.cm-row:hover { border-color:color-mix(in srgb,var(--cm-accent) 20%,var(--cm-line)); }
.cm-disclosure,.cm-disclosure-spacer { display:grid;place-items:center;width:25px;height:36px;flex:0 0 25px; }
.cm-disclosure { padding:5px;border:0;border-radius:8px;background:transparent;color:var(--cm-muted); }
.cm-disclosure svg { width:13px;height:13px;transition:transform .18s; }
.cm-disclosure svg.expanded { transform:rotate(90deg); }
.cm-disclosure:hover { color:var(--cm-accent);background:var(--cm-soft); }
.cm-open { display:flex;align-items:center;gap:12px;min-width:0;flex:1;min-height:56px;padding:4px 6px;border:0;border-radius:12px;background:transparent;color:var(--cm-ink);text-align:left;touch-action:pan-y; }
.cm-open:disabled { opacity:1; }
.cm-icon { display:grid;place-items:center;width:39px;height:39px;flex:0 0 39px;border-radius:50%;background:color-mix(in srgb,var(--category-accent,#288fca) 12%,var(--cm-paper)); }
.cm-row-copy { display:flex;flex:1;min-width:0;flex-direction:column;gap:6px; }
.cm-row-copy b { overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:14px;font-weight:600; }
.cm-row-copy small { display:flex;align-items:center;gap:6px;color:var(--cm-muted);font-size:10px; }
.cm-dot { width:2px;height:2px;border-radius:50%;background:var(--cm-muted);opacity:.7; }
.cm-menu-anchor { position:relative;flex:none; }
.cm-menu-toggle,.cm-reorder-handle { display:grid;place-items:center;width:36px;height:36px;padding:7px;border:0;border-radius:10px;background:transparent;color:var(--cm-muted); }
.cm-menu-toggle svg { width:20px;height:20px;fill:currentColor;stroke:none; }
.cm-menu-toggle:hover,.cm-menu-toggle[aria-expanded=true] { background:var(--cm-soft);color:var(--cm-ink); }
.cm-action-menu { position:absolute;z-index:6;right:0;top:calc(100% + 6px);display:grid;min-width:148px;max-width:calc(100vw - 24px);overflow:auto;overscroll-behavior:contain;padding:5px;border:1px solid var(--cm-line);border-radius:13px;background:var(--cm-paper);box-shadow:var(--cm-shadow); }
.cm-action-menu button { min-height:38px;padding:9px 12px;border:0;border-radius:8px;background:transparent;color:var(--cm-ink);font-size:12px;text-align:left;white-space:nowrap; }
.cm-action-menu button:hover { background:var(--cm-soft); }
.cm-action-menu .cm-delete { margin-top:3px;border-top:1px solid var(--cm-line);border-radius:0 0 8px 8px;color:#d56860; }
.cm-reorder-handle { color:var(--cm-accent);cursor:grab;touch-action:none;user-select:none; }
.cm-reorder-handle:active { cursor:grabbing; }
.is-sorting .cm-row { border-color:color-mix(in srgb,var(--cm-accent) 18%,var(--cm-line)); }
.cm-row.is-dragging { opacity:.4; }
.cm-row.drop-before:before,.cm-row.drop-after:after { position:absolute;left:14px;right:14px;height:3px;border-radius:5px;background:var(--cm-accent);content:'';pointer-events:none; }
.cm-row.drop-before:before { top:-5px; }.cm-row.drop-after:after { bottom:-5px; }
.cm-sort-help { margin:0 0 13px;padding:11px 14px;border-radius:12px;background:color-mix(in srgb,var(--cm-accent) 8%,var(--cm-paper));color:var(--cm-accent);font-size:11px;line-height:1.6; }
.cm-footnote { margin:16px 0 0;color:var(--cm-muted);font-size:10px;text-align:center; }
.cm-empty { display:flex;align-items:center;flex-direction:column;gap:12px;padding:38px 18px;border:1px solid var(--cm-line);border-radius:18px;background:var(--cm-paper);text-align:center; }
.cm-empty > span { display:grid;place-items:center;width:56px;height:56px;border-radius:20px;background:var(--cm-soft);color:var(--cm-muted); }
.cm-empty b { font-size:14px; }.cm-empty p { margin:0;color:var(--cm-muted);font-size:12px; }
.cm-sr-only { position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%);white-space:nowrap; }
:global(.theme-dark .category-manager) { --cm-paper:#222b32;--cm-soft:#1a232a;--cm-line:#35414b;--cm-ink:#e1e8ed;--cm-muted:#91a0ac;--cm-accent:#69b9ee;--cm-shadow:0 12px 35px #0005; }
@media(prefers-color-scheme:dark) { :global(.theme-system .category-manager) { --cm-paper:#222b32;--cm-soft:#1a232a;--cm-line:#35414b;--cm-ink:#e1e8ed;--cm-muted:#91a0ac;--cm-accent:#69b9ee;--cm-shadow:0 12px 35px #0005; } }
@media(max-width:600px) {
  .cm-header { margin-bottom:15px; }.cm-intro h2 { font-size:23px; }.cm-header-actions { gap:7px; }.cm-add,.cm-sort { min-height:35px;padding:7px 10px;font-size:11px; }
  .cm-stats { gap:9px; }.cm-stats > div { padding:11px 13px; }.cm-row-wrap { margin-left:calc(var(--category-depth) * 14px); }
  .cm-row { min-height:69px;padding-right:6px;border-radius:16px; }.cm-open { gap:10px;padding-left:2px; }.cm-icon { width:35px;height:35px;flex-basis:35px; }.cm-row-copy b { font-size:13px; }.cm-row-copy small { font-size:9px;gap:5px; }
}
</style>
