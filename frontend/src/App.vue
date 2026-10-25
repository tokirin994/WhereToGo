<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import {
  ArrowDownUp, ArrowRight, Bookmark, CalendarDays, Check, ChevronDown, ChevronRight,
  CircleHelp, Clock3, Cloud, Coffee, Compass, Ellipsis, Filter, Heart, Layers2, LocateFixed,
  Map, MapPin, Minus, Moon, MoreHorizontal, Plus, Search, SlidersHorizontal, Sparkles,
  Sun, Utensils, X,
} from '@lucide/vue'
import { usePlacesStore, type PlaceCategory } from './stores/places'
import { useTripsStore, type Trip } from './stores/trips'
import type { TripStopInput } from './api/trips'
import { openTripLedgerEntry } from './api/ledgerIntegration'
import AppSwitcher from './AppSwitcher.vue'
import { smartLedgerUrl } from './appLinks'
import { signOut } from './auth'

const store = usePlacesStore()
const tripsStore = useTripsStore()
const activeTripId = ref(tripsStore.trips[0]?.id ?? '')
const selectedDay = ref('')
const showTripDialog = ref(false)
const showMemoDialog = ref(false)
const memoValue = ref('')
const showStopDialog = ref(false)
const editingStopId = ref<string | null>(null)
const tripName = ref('')
const tripDestination = ref('')
const tripStartsOn = ref('')
const tripEndsOn = ref('')
const stopPlaceId = ref('')
const stopDate = ref('')
const stopTime = ref('09:00')
const stopDuration = ref(60)
const stopNote = ref('')
const query = ref('')
const selectedCategory = ref<PlaceCategory | '全部'>('全部')
const selectedId = ref(store.places[0]?.id ?? '')
const darkMode = ref(false)
const showAddDialog = ref(false)
const editingPlaceId = ref<string | null>(null)
const showTripPopover = ref(false)
const newName = ref('')
const newCity = ref('')
const newCategory = ref<PlaceCategory>('景点')
const newAddress = ref('')
const newTags = ref('')
const toast = ref('')
const activeNav = ref('地图')
const favoritesOnly = ref(false)
const mobileDrawer = ref<'places' | 'trip' | null>(null)

const categories: Array<{ name: PlaceCategory | '全部'; icon: typeof MapPin; color: string }> = [
  { name: '全部', icon: Layers2, color: '#4c665b' },
  { name: '景点', icon: MapPin, color: '#f07859' },
  { name: '美食', icon: Utensils, color: '#e8a340' },
  { name: '咖啡', icon: Coffee, color: '#9272bd' },
  { name: '住宿', icon: Bookmark, color: '#4c89ae' },
]

onMounted(() => {
  void store.loadApiPlaces()
  void tripsStore.loadApiTrips().then(() => {
    if (!tripsStore.trips.some((trip) => trip.id === activeTripId.value)) activeTripId.value = tripsStore.trips[0]?.id ?? ''
    selectedDay.value = currentTrip.value?.startsOn ?? ''
  })
})

const filteredPlaces = computed(() => store.places.filter((place) => {
  const matchesCategory = selectedCategory.value === '全部' || place.category === selectedCategory.value
  const matchesCollection = !favoritesOnly.value || place.favorite
  const text = `${place.name} ${place.city} ${place.address} ${place.tags.join(' ')}`.toLowerCase()
  return matchesCategory && matchesCollection && text.includes(query.value.toLowerCase().trim())
}))
const selectedPlace = computed(() => store.places.find((place) => place.id === selectedId.value) ?? null)
const currentTrip = computed(() => tripsStore.trips.find((trip) => trip.id === activeTripId.value) ?? tripsStore.trips[0] ?? null)
const tripDays = computed(() => {
  const trip = currentTrip.value
  if (!trip?.startsOn || !trip.endsOn) return trip?.startsOn ? [trip.startsOn] : []
  const result: string[] = []
  const cursor = new Date(`${trip.startsOn}T12:00:00`)
  const last = new Date(`${trip.endsOn}T12:00:00`)
  while (cursor <= last && result.length < 60) {
    result.push(`${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}-${String(cursor.getDate()).padStart(2, '0')}`)
    cursor.setDate(cursor.getDate() + 1)
  }
  return result
})
const dayStops = computed(() => (currentTrip.value?.stops ?? []).filter((stop) => stop.dayDate === selectedDay.value).sort((a, b) => a.sortOrder - b.sortOrder || a.startsAt.localeCompare(b.startsAt)))
const tripDuration = computed(() => tripDays.value.length || (currentTrip.value?.startsOn ? 1 : 0))
const dayLabel = computed(() => selectedDay.value ? new Date(`${selectedDay.value}T12:00:00`).toLocaleDateString('zh-CN', { month: 'long', day: 'numeric', weekday: 'long' }) : '请先设置行程日期')
const locatedCount = computed(() => store.places.filter((place) => place.mapPosition).length)
const pendingLocationCount = computed(() => store.places.filter((place) => !place.mapPosition && (place.longitude == null || place.latitude == null)).length)
function locationLabel(place: (typeof store.places)[number]) {
  return place.longitude != null && place.latitude != null ? '地图待接入' : '待定位'
}

function notify(message: string) {
  toast.value = message
  window.setTimeout(() => { toast.value = '' }, 2600)
}
async function addPlace() {
  if (!newName.value.trim()) return
  let result: Awaited<ReturnType<typeof store.addPlace>>
  try {
    result = await store.addPlace(newName.value.trim(), newCategory.value, newCity.value, newAddress.value.trim() || '地址待确认', newTags.value.split(/[,，]/).map((tag) => tag.trim()).filter(Boolean))
  } catch {
    notify('地点服务未能保存，请检查输入或稍后重试。')
    return
  }
  const { place, persisted } = result
  selectedId.value = place.id
  selectedCategory.value = '全部'
  newName.value = ''
  newCity.value = ''
  newAddress.value = ''
  newTags.value = ''
  showAddDialog.value = false
  notify(persisted ? '地点已保存到数据库，确认地图服务后再显示真实位置。' : '地点仅保存在此浏览器；后端不可用，恢复连接后可重试保存。')
}
function openAddDialog() {
  editingPlaceId.value = null
  newName.value = ''
  newCity.value = ''
  newAddress.value = ''
  newTags.value = ''
  newCategory.value = '景点'
  showAddDialog.value = true
}
function openEditDialog(place: (typeof store.places)[number]) {
  editingPlaceId.value = place.id
  newName.value = place.name
  newCity.value = place.city
  newAddress.value = place.address
  newTags.value = place.tags.join(', ')
  newCategory.value = place.category
  showAddDialog.value = true
}
async function savePlace() {
  if (!newName.value.trim()) return
  const input = { name: newName.value.trim(), city: newCity.value.trim() || '未指定城市', address: newAddress.value.trim() || '地址待确认', category: newCategory.value, tags: newTags.value.split(/[,，]/).map((tag) => tag.trim()).filter(Boolean) }
  if (!editingPlaceId.value) return addPlace()
  try {
    await store.updatePlace(editingPlaceId.value, input)
    showAddDialog.value = false
    notify('地点信息已更新。')
  } catch {
    notify('地点服务未能更新，请检查连接后重试。')
  }
}
async function removeSelectedPlace() {
  if (!selectedPlace.value) return
  const place = selectedPlace.value
  if (!window.confirm(`确定删除“${place.name}”吗？`)) return
  try {
    await store.deletePlace(place.id)
    selectedId.value = store.places[0]?.id ?? ''
    notify('地点已删除。')
  } catch {
    notify('地点服务未能删除，请检查连接后重试。')
  }
}
function navTo(name: string) {
  activeNav.value = name
  if (name === '地图') { mobileDrawer.value = null; favoritesOnly.value = false }
  if (name === '我的地点') { mobileDrawer.value = 'places'; favoritesOnly.value = false }
  if (name === '地点合集') { mobileDrawer.value = 'places'; favoritesOnly.value = true; selectedCategory.value = '全部'; query.value = '' }
  if (name === '我的行程') mobileDrawer.value = 'trip'
  if (name === '备忘录') { mobileDrawer.value = null; openMemoDialog() }
}
function focusStop(id: string) {
  selectedId.value = id
  selectedCategory.value = '全部'
  activeNav.value = '地图'
}
function openTripDialog(trip?: Trip) {
  tripName.value = trip?.name ?? ''
  tripDestination.value = trip?.destination ?? ''
  tripStartsOn.value = trip?.startsOn ?? ''
  tripEndsOn.value = trip?.endsOn ?? ''
  showTripDialog.value = true
}
async function saveTrip() {
  if (!tripName.value.trim()) return
  if (tripStartsOn.value && tripEndsOn.value && tripStartsOn.value > tripEndsOn.value) { notify('结束日期不能早于开始日期。'); return }
  const input = { name: tripName.value.trim(), destination: tripDestination.value.trim() || null, startsOn: tripStartsOn.value || null, endsOn: tripEndsOn.value || null, notes: editingTrip.value ? currentTrip.value?.notes ?? '' : '' }
  try {
    let trip: Trip
    if (currentTrip.value && editingTrip.value) {
      trip = await tripsStore.updateTrip(currentTrip.value.id, input)
    } else {
      const result = await tripsStore.addTrip(input)
      trip = result.trip
      notify(result.persisted ? '行程已保存到数据库。' : '后端暂不可用，行程已保存在此浏览器。')
    }
    activeTripId.value = trip.id
    selectedDay.value = trip.startsOn ?? ''
    showTripDialog.value = false
  } catch { notify('行程保存失败，请检查后端连接。') }
}
const editingTrip = ref(false)
function beginEditTrip() { editingTrip.value = true; openTripDialog(currentTrip.value ?? undefined) }
function beginCreateTrip() { editingTrip.value = false; openTripDialog() }
function openStopDialog(stop?: Trip['stops'][number]) {
  if (!currentTrip.value) { notify('请先创建一个行程。'); return }
  if (!currentTrip.value.startsOn) { notify('请先为行程设置开始日期。'); beginEditTrip(); return }
  editingStopId.value = stop?.id ?? null
  stopPlaceId.value = stop?.placeId ?? selectedPlace.value?.id ?? ''
  stopDate.value = stop?.dayDate ?? selectedDay.value ?? currentTrip.value.startsOn
  stopTime.value = stop?.startsAt ?? '09:00'
  stopDuration.value = stop?.durationMinutes ?? 60
  stopNote.value = stop?.note ?? ''
  showStopDialog.value = true
}
async function saveStop() {
  if (!currentTrip.value) return
  const place = store.places.find((item) => item.id === stopPlaceId.value)
  if (!place) { notify('请先选择一个已收藏地点。'); return }
  const existing = currentTrip.value.stops
  const order = editingStopId.value ? existing.find((item) => item.id === editingStopId.value)?.sortOrder ?? existing.length : existing.filter((item) => item.dayDate === stopDate.value).length
  const replacement: TripStopInput[] = existing.filter((item) => item.id !== editingStopId.value).map((item) => ({ ...item }))
  replacement.push({ placeId: place.id, dayDate: stopDate.value, placeName: place.name, category: place.category, startsAt: stopTime.value, durationMinutes: Number(stopDuration.value), note: stopNote.value.trim(), sortOrder: order })
  replacement.forEach((item, index) => { item.sortOrder = index })
  try {
    const savedTrip = await tripsStore.saveStops(currentTrip.value.id, replacement)
    activeTripId.value = savedTrip.id
    selectedDay.value = stopDate.value
    showStopDialog.value = false
    notify('日程已保存。')
  } catch { notify('日程保存失败，请确认日期在行程范围内。') }
}
async function removeStop(id: string) {
  if (!currentTrip.value) return
  const stops = currentTrip.value.stops.filter((stop) => stop.id !== id).map((stop, index) => ({ ...stop, sortOrder: index }))
  try { const savedTrip = await tripsStore.saveStops(currentTrip.value.id, stops); activeTripId.value = savedTrip.id; notify('日程点已移除。') }
  catch { notify('移除失败，请检查后端连接。') }
}
async function moveStop(id: string, direction: -1 | 1) {
  if (!currentTrip.value) return
  const stops = [...currentTrip.value.stops].sort((a, b) => a.dayDate.localeCompare(b.dayDate) || a.sortOrder - b.sortOrder)
  const index = stops.findIndex((stop) => stop.id === id)
  const target = index + direction
  if (index < 0 || target < 0 || target >= stops.length || stops[target].dayDate !== stops[index].dayDate) return
  ;[stops[index], stops[target]] = [stops[target], stops[index]]
  stops.forEach((stop, order) => { stop.sortOrder = order })
  try { const savedTrip = await tripsStore.saveStops(currentTrip.value.id, stops.map((stop) => ({ ...stop }))); activeTripId.value = savedTrip.id }
  catch { notify('调整顺序失败，请检查后端连接。') }
}
async function removeTrip(trip: Trip) {
  if (!window.confirm(`确定删除行程“${trip.name}”吗？其日程也会一并删除。`)) return
  try {
    await tripsStore.removeTrip(trip.id)
    if (activeTripId.value === trip.id) activeTripId.value = tripsStore.trips[0]?.id ?? ''
    selectedDay.value = currentTrip.value?.startsOn ?? ''
    notify('行程已删除。')
  } catch { notify('删除失败，请检查后端连接。') }
}
function escapeHtml(value: string) { return value.replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char] ?? char)) }
function exportTrip() {
  if (!currentTrip.value) { notify('请先创建一个行程。'); return }
  const trip = currentTrip.value
  const days = tripDays.value.map((date) => `<section><h2>${escapeHtml(date)}</h2><ol>${trip.stops.filter((stop) => stop.dayDate === date).sort((a,b) => a.sortOrder-b.sortOrder).map((stop) => `<li><b>${escapeHtml(stop.startsAt)} ${escapeHtml(stop.placeName)}</b> · ${stop.durationMinutes} 分钟 · ${escapeHtml(stop.category)}${stop.note ? `<p>${escapeHtml(stop.note)}</p>` : ''}</li>`).join('')}</ol></section>`).join('')
  const content = `<!doctype html><meta charset="utf-8"><title>${escapeHtml(trip.name)}</title><style>body{font:16px/1.7 system-ui,sans-serif;max-width:760px;margin:48px auto;color:#263b2d}h1{border-bottom:2px solid #3f7654;padding-bottom:12px}li{padding:8px 0}section{break-inside:avoid}@media print{body{margin:16mm}}</style><h1>${escapeHtml(trip.name)}</h1><p>${escapeHtml(trip.destination ?? '')} · ${escapeHtml(trip.startsOn ?? '日期待定')} — ${escapeHtml(trip.endsOn ?? '日期待定')}</p>${days}`
  const blob = new Blob([content], { type: 'text/html;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url; anchor.download = `${trip.name.replace(/[\\/:*?"<>|]/g, '_')}-行程.html`; anchor.click()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}
async function openTripLedger() {
  if (!currentTrip.value) { notify('请先创建一个行程。'); return }
  let trip = currentTrip.value
  try {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(trip.id)) {
      trip = await tripsStore.updateTrip(trip.id, { name: trip.name, destination: trip.destination, startsOn: trip.startsOn, endsOn: trip.endsOn, notes: trip.notes })
      activeTripId.value = trip.id
    }
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(trip.id)) {
      throw new Error('关联旅行账本需要先连接 WhereToGo 后端，请启动后端服务后重试。')
    }
    openTripLedgerEntry({ id: trip.id, name: trip.name, destination: trip.destination, startsOn: trip.startsOn, endsOn: trip.endsOn })
  } catch (error) { notify(error instanceof Error ? error.message : '无法打开旅行账本。') }
}
function openMemoDialog() {
  if (!currentTrip.value) { notify('先创建一个行程，再记录旅行备忘。'); return }
  memoValue.value = currentTrip.value.notes ?? ''
  showMemoDialog.value = true
}
async function saveMemo() {
  if (!currentTrip.value) return
  const trip = currentTrip.value
  try {
    const saved = await tripsStore.updateTrip(trip.id, { name: trip.name, destination: trip.destination, startsOn: trip.startsOn, endsOn: trip.endsOn, notes: memoValue.value })
    activeTripId.value = saved.id
    showMemoDialog.value = false
    notify('备忘录已保存。')
  } catch { notify('备忘录保存失败，请检查后端连接。') }
}
</script>

<template>
  <div class="app-shell" :class="{ 'theme-dark': darkMode }">
    <header class="topbar">
      <a class="brand" href="#" aria-label="WhereToGo 旅行工作区" @click.prevent="navTo('地图')">
        <span class="brand-mark"><Compass :size="20" :stroke-width="1.8" /></span>
        <span class="brand-name">Where<span>ToGo</span></span>
      </a>
      <nav class="main-nav" aria-label="主导航">
        <button v-for="item in ['地图', '我的地点', '我的行程', '地点合集', '备忘录']" :key="item"
          class="nav-link" :class="{ active: activeNav === item }" @click="navTo(item)">{{ item }}</button>
      </nav>
      <div class="top-actions">
        <a class="travel-ledger-shortcut" :href="smartLedgerUrl" aria-label="打开 SmartLedger 记账"><span>记账</span><ArrowRight :size="14"/></a>
        <AppSwitcher current="travel"/>
        <div class="global-search"><Search :size="16" /><input v-model="query" aria-label="搜索地点" placeholder="搜索地点、城市或标签" /><kbd>⌘ K</kbd></div>
        <button class="icon-button theme-toggle" :aria-label="darkMode ? '切换浅色模式' : '切换深色模式'" @click="darkMode = !darkMode"><Sun v-if="darkMode" :size="18" /><Moon v-else :size="18" /></button>
        <button class="avatar-button" aria-label="退出当前旅行账号" title="退出当前账号" @click="signOut">退出</button>
      </div>
    </header>

    <main class="workspace">
      <aside class="places-panel panel">
        <div class="panel-heading"><div><div class="eyebrow">YOUR COLLECTION</div><h1>{{ favoritesOnly ? '收藏合集' : '我的地点' }} <span class="count-pill">{{ filteredPlaces.length }}</span></h1></div><button class="icon-button subtle" aria-label="重置地点筛选" @click="selectedCategory = '全部'; query = ''; favoritesOnly = false"><SlidersHorizontal :size="17" /></button></div>
        <button class="import-card" @click="notify('链接导入将在第三阶段实现。现在可以先手动添加地点。')"><span class="import-icon"><Plus :size="18" /></span><span class="import-copy"><strong>收集一个新地点</strong><small>粘贴链接或手动添加</small></span><ArrowRight :size="16" class="import-arrow" /></button>
        <div class="section-label-row"><span class="section-label">快速筛选</span><button class="text-action" @click="selectedCategory = '全部'; query = ''">重置</button></div>
        <div class="category-list">
          <button v-for="category in categories" :key="category.name" class="category-button" :class="{ chosen: selectedCategory === category.name }" @click="selectedCategory = category.name">
            <span class="category-icon" :style="{ color: category.color, backgroundColor: `${category.color}15` }"><component :is="category.icon" :size="15" :stroke-width="2" /></span>
            <span>{{ category.name === '全部' ? '所有地点' : category.name }}</span>
            <span class="category-count">{{ category.name === '全部' ? store.places.length : store.places.filter(p => p.category === category.name).length }}</span>
          </button>
        </div>
        <div class="section-label-row places-title-row"><span class="section-label">最近收藏 <span class="muted-count">{{ filteredPlaces.length }}</span></span><button class="icon-button tiny" aria-label="切换排序" @click="notify('已按最近收藏排序。')"><ArrowDownUp :size="15" /></button></div>
        <div class="place-list" v-if="filteredPlaces.length">
          <button v-for="place in filteredPlaces" :key="place.id" class="place-row" :class="{ selected: selectedId === place.id }" @click="selectedId = place.id">
            <span class="place-thumb" :class="`thumb-${place.thumb}`"><span class="thumb-sun"></span><span class="thumb-shape"></span><MapPin v-if="place.category === '景点'" :size="15" /><Utensils v-else-if="place.category === '美食'" :size="15" /><Coffee v-else-if="place.category === '咖啡'" :size="15" /><Bookmark v-else :size="15" /></span>
            <span class="place-copy"><strong>{{ place.name }}</strong><small><span class="place-city">{{ place.city }}</span><span class="dot-separator">·</span>{{ place.category }}</small></span>
            <span v-if="place.mapPosition" class="place-pin-state" title="已在演示地图标注"><MapPin :size="13" /></span><span v-else class="pending-state">{{ locationLabel(place) }}</span>
          </button>
        </div>
        <div v-else class="empty-search"><Search :size="20" /><span>没有找到匹配的地点</span><button @click="openAddDialog">添加这个地点</button></div>
        <div class="panel-bottom"><div class="collection-mini-title"><span class="section-label">我的合集</span><button class="text-action" @click="navTo('地点合集')">查看全部</button></div><button class="collection-row" @click="navTo('地点合集')"><span class="collection-cover cover-green"><span></span><span></span><span></span></span><span><strong>我的收藏</strong><small>{{ store.places.filter(p => p.favorite).length }} 个地点 · 本地收藏夹</small></span><ChevronRight :size="16" /></button></div>
      </aside>

      <section class="map-workspace" aria-label="地图和地点">
        <div class="map-toolbar"><div class="map-title-block"><div class="location-breadcrumb"><MapPin :size="14" /> 中国 <ChevronRight :size="12" /> 浙江省 <ChevronRight :size="12" /> 杭州市</div><h2>杭州 <span>Hangzhou</span></h2></div><div class="map-tools"><button class="tool-button" @click="notify('此版本使用本地演示地图，城市搜索将在地图服务接入后开放。')"><Search :size="15" /> 搜索地图</button><button class="tool-button tool-square" aria-label="筛选地图地点" @click="notify('地图筛选与左侧分类同步。')"><Filter :size="16" /></button><button class="tool-button tool-square" aria-label="地图图层" @click="notify('地图图层将在高德地图接入后开放。')"><Layers2 :size="16" /></button></div></div>
        <div class="map-canvas" aria-label="示意地图；位置仅用于界面演示">
          <div class="map-paper"></div>
          <svg class="map-lines" viewBox="0 0 1200 900" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
            <path class="river" d="M-60 620 C130 545 212 603 344 532 C463 468 532 474 608 403 C692 325 750 280 835 287 C951 298 1033 225 1260 172 L1260 395 C1070 457 1017 472 899 455 C781 438 730 483 662 560 C573 659 473 665 374 722 C259 788 134 743 -60 827Z" />
            <path class="road road-major" d="M-40 180 C205 260 293 177 442 205 S723 321 836 240 S1079 98 1250 130" /><path class="road road-major" d="M85 -20 C181 155 239 247 227 382 S253 604 319 926" /><path class="road road-major" d="M535 -20 C488 124 535 228 593 328 S686 515 649 916" /><path class="road road-major" d="M914 -20 C850 115 867 238 927 364 S1007 595 1134 933" />
            <path class="road" d="M-30 335 C172 370 299 324 436 346 S746 429 898 347 S1095 270 1244 301" /><path class="road" d="M-25 471 C144 448 298 499 417 479 S696 394 849 502 S1076 631 1248 573" /><path class="road" d="M-28 768 C164 696 260 757 408 730 S688 622 812 674 S1024 795 1228 714" /><path class="road" d="M385 -22 C347 112 397 226 411 309 S373 476 434 565 S496 771 476 930" /><path class="road" d="M760 -15 C729 138 765 217 759 314 S759 505 817 604 S868 792 834 926" />
            <path class="road minor" d="M20 80 L1160 805 M44 798 L1113 83 M170 5 L1084 901 M-32 256 L1200 633 M-40 649 L1182 432" />
            <path class="park" d="M702 124 C750 96 817 116 836 161 C854 201 812 243 761 233 C704 222 675 161 702 124Z" /><path class="park" d="M1046 488 C1099 470 1155 498 1157 539 C1159 582 1102 603 1057 580 C1013 558 1003 503 1046 488Z" /><path class="park" d="M104 480 C142 445 205 456 219 499 C232 541 191 574 147 565 C103 556 75 511 104 480Z" />
          </svg>
          <div class="map-grid-fade"></div><span class="district-label label-west">西湖风景区</span><span class="district-label label-north">拱墅区</span><span class="district-label label-east">上城区</span><span class="district-label label-south">滨江区</span><span class="map-place-label west-lake">西湖</span><span class="map-place-label canal">京杭大运河</span>
          <button v-for="place in store.places.filter(p => p.mapPosition && (selectedCategory === '全部' || p.category === selectedCategory))" :key="`marker-${place.id}`" class="map-marker" :class="[`marker-${place.category}`, { active: selectedId === place.id }]" :style="{ left: `${place.mapPosition!.x}%`, top: `${place.mapPosition!.y}%` }" :aria-label="`在地图上选择${place.name}`" @click="selectedId = place.id"><span class="marker-dot"><MapPin v-if="place.category !== '美食'" :size="17" /><Utensils v-else :size="15" /></span><span class="marker-label">{{ place.name }}</span></button>
          <div class="map-demo-badge"><span></span> 演示地图 · 非真实导航</div>
          <div class="map-zoom-controls"><button aria-label="放大地图" @click="notify('地图缩放将在地图服务接入后启用。')"><Plus :size="17" /></button><button aria-label="缩小地图" @click="notify('地图缩放将在地图服务接入后启用。')"><Minus :size="17" /></button><span></span><button aria-label="定位到当前位置" @click="notify('当前位置功能需要浏览器定位授权和地图服务。')"><LocateFixed :size="17" /></button></div>
          <button class="map-fullscreen" aria-label="地图全屏" @click="notify('全屏地图将在高德地图接入后开放。')"><ArrowRight :size="16" /></button>
          <div class="map-legend"><span><i class="legend-dot legend-sight"></i>景点</span><span><i class="legend-dot legend-food"></i>美食</span><span><i class="legend-dot legend-cafe"></i>咖啡</span></div>
        </div>
        <div class="map-footer"><span><Map :size="14" /> {{ locatedCount }} 个收藏地点已标注 <i></i> {{ pendingLocationCount }} 个待定位 <template v-if="store.places.length - locatedCount - pendingLocationCount > 0"><i></i> {{ store.places.length - locatedCount - pendingLocationCount }} 个地图待接入</template></span><button @click="notify('地图数据来自演示内容；真实地图服务接入后才会按坐标展示。')"><CircleHelp :size="14" /> 关于演示地图</button></div>
      </section>

      <aside class="trip-panel panel">
        <div class="trip-panel-top"><div class="trip-heading"><div><div class="eyebrow">PLAN A JOURNEY</div><h2>行程规划</h2></div><button class="icon-button subtle" aria-label="编辑当前行程" @click="beginEditTrip"><MoreHorizontal :size="19" /></button></div>
          <button class="trip-select" @click="showTripPopover = !showTripPopover"><span class="trip-thumb"><span class="trip-thumb-sun"></span><span class="trip-thumb-mountain"></span></span><span class="trip-select-copy"><strong>{{ currentTrip ? `${currentTrip.destination || '未设置目的地'} · ${currentTrip.name}` : '还没有行程' }}</strong><small><CalendarDays :size="12" /> {{ currentTrip?.startsOn || '日期待定' }} — {{ currentTrip?.endsOn || '日期待定' }} <span v-if="tripDuration" class="day-pill">{{ tripDuration }}天</span></small></span><ChevronDown :size="16" /></button>
          <div v-if="showTripPopover" class="trip-popover"><strong>我的行程 · {{ tripsStore.trips.length }}</strong><button v-for="trip in tripsStore.trips" :key="trip.id" class="trip-option" :class="{ selected: trip.id === currentTrip?.id }" @click="activeTripId = trip.id; selectedDay = trip.startsOn || ''; showTripPopover = false"><span>{{ trip.destination || '未设置目的地' }} · {{ trip.name }}</span><small>{{ trip.startsOn || '日期待定' }}</small></button><button @click="showTripPopover = false; beginCreateTrip()"><Plus :size="15" /> 新建行程</button><button v-if="currentTrip" class="trip-danger" @click="showTripPopover = false; removeTrip(currentTrip)">删除当前行程</button></div>
        </div>
        <div class="itinerary-content"><div class="itinerary-topline"><div><span class="section-label">DAY {{ String(Math.max(1, tripDays.indexOf(selectedDay) + 1)).padStart(2, '0') }}</span><span class="day-date">{{ dayLabel }}</span></div><div class="day-arrows"><button class="icon-button tiny" aria-label="上一天" :disabled="tripDays.indexOf(selectedDay) <= 0" @click="selectedDay = tripDays[tripDays.indexOf(selectedDay) - 1]"><ChevronRight :size="17" class="arrow-left" /></button><button class="icon-button tiny" aria-label="下一天" :disabled="tripDays.indexOf(selectedDay) < 0 || tripDays.indexOf(selectedDay) >= tripDays.length - 1" @click="selectedDay = tripDays[tripDays.indexOf(selectedDay) + 1]"><ChevronRight :size="17" /></button></div></div><div class="day-progress"><span :style="{ width: `${tripDuration ? ((tripDays.indexOf(selectedDay) + 1) / tripDuration) * 100 : 0}%` }"></span></div><div class="day-tabs" v-if="tripDays.length > 1"><button v-for="(date, index) in tripDays" :key="date" :class="{ chosen: selectedDay === date }" @click="selectedDay = date">D{{ index + 1 }} <small>{{ date.slice(5) }}</small></button></div><div class="itinerary-title"><h3>{{ currentTrip?.destination || '旅行' }} · {{ selectedDay ? '当日日程' : '行程概览' }}</h3><span class="weather-pill"><Cloud :size="13" /> 天气待接入</span></div>
          <div v-if="currentTrip && dayStops.length" class="timeline"><div class="timeline-track"></div><article class="timeline-stop" v-for="(stop, index) in dayStops" :key="stop.id"><div class="stop-time">{{ stop.startsAt }}</div><div class="timeline-node"><span></span></div><div class="stop-card-wrap"><button class="stop-card" :class="{ 'stop-current': selectedPlace?.name === stop.placeName }" @click="stop.placeId && focusStop(stop.placeId)"><div class="stop-image" :class="`thumb-${store.places.find(p => p.id === stop.placeId)?.thumb || 'lake'}`"><span></span><span></span><span></span></div><div class="stop-info"><strong>{{ stop.placeName }}</strong><small><Clock3 :size="11" /> {{ stop.durationMinutes }}分钟 <span class="stop-category">{{ stop.category }}</span></small></div><span class="stop-more" aria-hidden="true"><Ellipsis :size="17" /></span></button><div class="stop-actions"><button aria-label="提前" title="提前" @click="moveStop(stop.id, -1)">↑</button><button aria-label="延后" title="延后" @click="moveStop(stop.id, 1)">↓</button><button aria-label="编辑日程" title="编辑" @click="openStopDialog(stop)">编辑</button><button aria-label="删除日程" title="删除" @click="removeStop(stop.id)">×</button></div><small v-if="stop.note" class="stop-note">{{ stop.note }}</small></div><div v-if="index < dayStops.length - 1" class="travel-between"><span class="travel-line"></span><span class="travel-icon"><ArrowRight :size="11" /></span><span>路线待计算</span></div></article></div>
          <div v-else class="itinerary-empty"><CalendarDays :size="20" /><strong>{{ currentTrip ? '这一天还没有安排' : '先创建你的旅行行程' }}</strong><span>{{ currentTrip ? '从收藏地点添加站点，再调整时间顺序。' : '设置目的地和日期后开始添加地点。' }}</span></div>
          <button v-if="currentTrip" class="add-stop-button" @click="openStopDialog()"><Plus :size="15" /> 从收藏地点添加</button><button v-else class="add-stop-button" @click="beginCreateTrip()"><Plus :size="15" /> 新建行程</button>
          <div class="selected-place-card" v-if="selectedPlace"><div class="selected-place-head"><span class="section-label">地图选中地点</span><button class="icon-button tiny" aria-label="关闭地点详情" @click="selectedId = ''"><X :size="15" /></button></div><div class="selected-place-body"><span class="selected-place-icon"><MapPin :size="16" /></span><div><strong>{{ selectedPlace.name }}</strong><small>{{ selectedPlace.address || '位置待确认' }}</small></div><button class="heart-button" :aria-label="store.isFavorite(selectedPlace.id) ? '取消收藏' : '收藏地点'" @click="store.toggleFavorite(selectedPlace.id)"><Heart :size="16" :fill="store.isFavorite(selectedPlace.id) ? 'currentColor' : 'none'" /></button></div><div class="place-detail-actions"><button class="detail-link" @click="openEditDialog(selectedPlace)">编辑地点 <ArrowRight :size="13" /></button><button class="detail-link delete-place-action" @click="removeSelectedPlace">删除地点</button></div></div>
        </div>
        <div class="trip-panel-bottom"><div class="ai-notice"><span class="ai-spark"><Sparkles :size="16" /></span><span><strong>路线与天气</strong><small>连接真实地图服务后可计算路线和天气</small></span></div><button class="ledger-entry-button" @click="openTripLedger"><span>打开此行程的旅行账本</span><ArrowRight :size="15" /></button><button class="preview-button" @click="exportTrip"><span>导出行程 HTML</span><ArrowRight :size="16" /></button></div>
      </aside>
    </main>

    <div v-if="mobileDrawer" class="mobile-sheet-scrim" @click.self="mobileDrawer = null">
      <section class="mobile-sheet" :aria-label="mobileDrawer === 'places' ? '地点收藏抽屉' : '行程抽屉'">
        <div class="sheet-grab"></div>
        <header class="sheet-heading"><div><div class="eyebrow">{{ mobileDrawer === 'places' ? 'YOUR COLLECTION' : 'PLAN A JOURNEY' }}</div><h2>{{ mobileDrawer === 'places' ? (favoritesOnly ? '收藏合集' : '我的地点') : `${currentTrip?.destination || '旅行'} · ${currentTrip?.name || '行程'}` }}</h2></div><button class="icon-button subtle" aria-label="关闭抽屉" @click="mobileDrawer = null"><X :size="18" /></button></header>
        <div v-if="mobileDrawer === 'places'" class="sheet-content">
          <div class="sheet-categories"><button v-for="category in categories" :key="category.name" :class="{ chosen: selectedCategory === category.name }" @click="selectedCategory = category.name">{{ category.name === '全部' ? '全部' : category.name }}</button></div>
          <button v-for="place in filteredPlaces" :key="place.id" class="sheet-place" @click="selectedId = place.id; mobileDrawer = null; activeNav = '地图'"><span class="sheet-place-icon" :class="`thumb-${place.thumb}`"><MapPin :size="16" /></span><span><strong>{{ place.name }}</strong><small>{{ place.city }} · {{ place.category }}</small></span><span v-if="!place.mapPosition" class="pending-state">{{ locationLabel(place) }}</span><ChevronRight :size="15" /></button>
          <button class="sheet-add-button" @click="mobileDrawer = null; openAddDialog()"><Plus :size="16" /> 手动添加地点</button>
        </div>
        <div v-else class="sheet-content sheet-itinerary"><div class="sheet-trip-date"><CalendarDays :size="14" /> {{ currentTrip?.startsOn || '日期待定' }} — {{ currentTrip?.endsOn || '日期待定' }} <span class="day-pill">{{ tripDuration || '未定' }}天</span></div><button v-for="stop in (currentTrip?.stops ?? []).filter(item => item.dayDate === selectedDay)" :key="stop.id" class="sheet-place" @click="stop.placeId && focusStop(stop.placeId); mobileDrawer = null"><span class="sheet-stop-time">{{ stop.startsAt }}</span><span><strong>{{ stop.placeName }}</strong><small>{{ stop.durationMinutes }}分钟 · {{ stop.category }}</small></span><ChevronRight :size="15" /></button><button class="sheet-add-button" @click="mobileDrawer = null; openStopDialog()"><Plus :size="15" /> 添加日程点</button></div>
      </section>
    </div>

    <div v-if="showMemoDialog" class="dialog-backdrop" @click.self="showMemoDialog = false"><form class="add-dialog" @submit.prevent="saveMemo"><div class="dialog-heading"><div><div class="eyebrow">TRIP MEMO</div><h2>{{ currentTrip?.name }} · 旅行备忘</h2></div><button class="icon-button subtle" type="button" aria-label="关闭" @click="showMemoDialog = false"><X :size="18" /></button></div><p class="dialog-hint">备忘内容跟随当前行程保存，可记录预约、交通和行前提醒。</p><textarea v-model="memoValue" class="text-field memo-field" maxlength="10000" placeholder="写下这趟旅行要记住的事情…"></textarea><div class="dialog-actions"><button type="button" class="cancel-button" @click="showMemoDialog = false">取消</button><button type="submit" class="save-button"><Check :size="15" /> 保存备忘</button></div></form></div>
    <div v-if="showTripDialog" class="dialog-backdrop" @click.self="showTripDialog = false"><form class="add-dialog" @submit.prevent="saveTrip"><div class="dialog-heading"><div><div class="eyebrow">{{ editingTrip ? 'EDIT TRIP' : 'NEW TRIP' }}</div><h2>{{ editingTrip ? '编辑行程' : '创建行程' }}</h2></div><button class="icon-button subtle" type="button" aria-label="关闭" @click="showTripDialog = false"><X :size="18" /></button></div><label class="field-label" for="trip-name">行程名称</label><input id="trip-name" v-model="tripName" class="text-field" required maxlength="180" placeholder="例如：杭州周末" /><label class="field-label" for="trip-destination">目的地</label><input id="trip-destination" v-model="tripDestination" class="text-field" maxlength="180" placeholder="例如：杭州" /><div class="date-fields"><div><label class="field-label" for="trip-start">开始日期</label><input id="trip-start" v-model="tripStartsOn" class="text-field" type="date" /></div><div><label class="field-label" for="trip-end">结束日期</label><input id="trip-end" v-model="tripEndsOn" class="text-field" type="date" /></div></div><p class="dialog-hint">行程日期用于安排每天的日程点，也会同步用于旅行记账入口。</p><div class="dialog-actions"><button type="button" class="cancel-button" @click="showTripDialog = false">取消</button><button type="submit" class="save-button"><Check :size="15" /> 保存行程</button></div></form></div>
    <div v-if="showStopDialog" class="dialog-backdrop" @click.self="showStopDialog = false"><form class="add-dialog" @submit.prevent="saveStop"><div class="dialog-heading"><div><div class="eyebrow">ITINERARY STOP</div><h2>{{ editingStopId ? '编辑日程点' : '添加日程点' }}</h2></div><button class="icon-button subtle" type="button" aria-label="关闭" @click="showStopDialog = false"><X :size="18" /></button></div><label class="field-label" for="stop-place">收藏地点</label><select id="stop-place" v-model="stopPlaceId" class="text-field" required><option value="" disabled>选择一个地点</option><option v-for="place in store.places" :key="place.id" :value="place.id">{{ place.name }} · {{ place.city }}</option></select><label class="field-label" for="stop-day">日期</label><input id="stop-day" v-model="stopDate" class="text-field" type="date" :min="currentTrip?.startsOn || undefined" :max="currentTrip?.endsOn || undefined" required /><div class="date-fields"><div><label class="field-label" for="stop-time">开始时间</label><input id="stop-time" v-model="stopTime" class="text-field" type="time" required /></div><div><label class="field-label" for="stop-duration">停留分钟</label><input id="stop-duration" v-model.number="stopDuration" class="text-field" type="number" min="1" max="1440" required /></div></div><label class="field-label" for="stop-note">备注</label><input id="stop-note" v-model="stopNote" class="text-field" maxlength="500" placeholder="预约、地址或提醒" /><div class="dialog-actions"><button type="button" class="cancel-button" @click="showStopDialog = false">取消</button><button type="submit" class="save-button"><Check :size="15" /> 保存日程</button></div></form></div>
    <div v-if="showAddDialog" class="dialog-backdrop" @click.self="showAddDialog = false"><form class="add-dialog" @submit.prevent="savePlace"><div class="dialog-heading"><div><div class="eyebrow">{{ editingPlaceId ? 'EDIT A PLACE' : 'SAVE A PLACE' }}</div><h2>{{ editingPlaceId ? '编辑地点' : '添加一个地点' }}</h2></div><button class="icon-button subtle" type="button" aria-label="关闭" @click="showAddDialog = false"><X :size="18" /></button></div><label class="field-label" for="place-name">地点名称</label><input id="place-name" v-model="newName" class="text-field" autofocus required placeholder="例如：西湖边的一家咖啡馆" /><label class="field-label" for="place-city">城市（可选）</label><input id="place-city" v-model="newCity" class="text-field" placeholder="输入地点所在城市" /><label class="field-label" for="place-address">详细地址（可选）</label><input id="place-address" v-model="newAddress" class="text-field" placeholder="填写已确认的地址" /><label class="field-label" for="place-category">分类</label><select id="place-category" v-model="newCategory" class="text-field"><option v-for="category in categories.slice(1)" :key="category.name" :value="category.name">{{ category.name }}</option></select><label class="field-label" for="place-tags">标签（逗号分隔，可选）</label><input id="place-tags" v-model="newTags" class="text-field" placeholder="例如：日落，湖景" /><div class="pending-note"><MapPin :size="16" /><span><strong>位置稍后确认</strong><small>未接入地理编码服务，不会为地点添加虚假坐标。</small></span></div><div class="dialog-actions"><button type="button" class="cancel-button" @click="showAddDialog = false">取消</button><button type="submit" class="save-button"><Check :size="15" /> {{ editingPlaceId ? '保存修改' : '保存地点' }}</button></div></form></div>
    <Transition name="toast"><div v-if="toast" class="toast-message"><Check :size="16" /> {{ toast }}</div></Transition>
    <button class="floating-add" aria-label="添加地点" @click="openAddDialog"><Plus :size="21" /></button>
  </div>
</template>
