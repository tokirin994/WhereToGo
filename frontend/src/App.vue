<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import {
  ArrowDownUp, ArrowRight, Bookmark, CalendarDays, Check, ChevronDown, ChevronRight,
  CircleHelp, Clock3, Cloud, Coffee, Compass, Ellipsis, Filter, Heart, Layers2, LocateFixed,
  Map, MapPin, Minus, Moon, MoreHorizontal, Plus, Search, SlidersHorizontal, Sparkles,
  Sun, Utensils, X,
} from '@lucide/vue'
import { usePlacesStore, type PlaceCategory } from './stores/places'

const store = usePlacesStore()
const query = ref('')
const selectedCategory = ref<PlaceCategory | '全部'>('全部')
const selectedId = ref(store.places[0]?.id ?? '')
const darkMode = ref(false)
const showAddDialog = ref(false)
const showTripPopover = ref(false)
const newName = ref('')
const newCity = ref('')
const newCategory = ref<PlaceCategory>('景点')
const toast = ref('')
const activeNav = ref('地图')
const mobileDrawer = ref<'places' | 'trip' | null>(null)

const categories: Array<{ name: PlaceCategory | '全部'; icon: typeof MapPin; color: string }> = [
  { name: '全部', icon: Layers2, color: '#4c665b' },
  { name: '景点', icon: MapPin, color: '#f07859' },
  { name: '美食', icon: Utensils, color: '#e8a340' },
  { name: '咖啡', icon: Coffee, color: '#9272bd' },
  { name: '住宿', icon: Bookmark, color: '#4c89ae' },
]

onMounted(() => { void store.loadApiPlaces() })

const filteredPlaces = computed(() => store.places.filter((place) => {
  const matchesCategory = selectedCategory.value === '全部' || place.category === selectedCategory.value
  const text = `${place.name} ${place.city} ${place.address} ${place.tags.join(' ')}`.toLowerCase()
  return matchesCategory && text.includes(query.value.toLowerCase().trim())
}))
const selectedPlace = computed(() => store.places.find((place) => place.id === selectedId.value) ?? null)
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
    result = await store.addPlace(newName.value.trim(), newCategory.value, newCity.value)
  } catch {
    notify('地点服务未能保存，请检查输入或稍后重试。')
    return
  }
  const { place, persisted } = result
  selectedId.value = place.id
  selectedCategory.value = '全部'
  newName.value = ''
  newCity.value = ''
  showAddDialog.value = false
  notify(persisted ? '地点已保存到数据库，确认地图服务后再显示真实位置。' : '地点仅保存在此浏览器；后端不可用，恢复连接后可重试保存。')
}
function navTo(name: string) {
  activeNav.value = name
  if (name === '地图') mobileDrawer.value = null
  if (name === '我的地点') mobileDrawer.value = 'places'
  if (name === '我的行程') mobileDrawer.value = 'trip'
  if (name !== '地图') notify(`${name}模块将在后续阶段接入，这里先展示地图工作台。`)
}
function focusStop(id: string) {
  selectedId.value = id
  selectedCategory.value = '全部'
  activeNav.value = '地图'
}
</script>

<template>
  <div class="app-shell" :class="{ 'theme-dark': darkMode }">
    <header class="topbar">
      <a class="brand" href="#" aria-label="TravelAtlas 首页" @click.prevent="navTo('地图')">
        <span class="brand-mark"><Compass :size="20" :stroke-width="1.8" /></span>
        <span class="brand-name">travel<span>atlas</span></span>
      </a>
      <nav class="main-nav" aria-label="主导航">
        <button v-for="item in ['地图', '我的地点', '我的行程', '地点合集', '备忘录']" :key="item"
          class="nav-link" :class="{ active: activeNav === item }" @click="navTo(item)">{{ item }}</button>
      </nav>
      <div class="top-actions">
        <div class="global-search"><Search :size="16" /><input v-model="query" aria-label="搜索地点" placeholder="搜索地点、城市或标签" /><kbd>⌘ K</kbd></div>
        <button class="icon-button theme-toggle" :aria-label="darkMode ? '切换浅色模式' : '切换深色模式'" @click="darkMode = !darkMode"><Sun v-if="darkMode" :size="18" /><Moon v-else :size="18" /></button>
        <button class="avatar-button" aria-label="打开个人菜单">L</button>
      </div>
    </header>

    <main class="workspace">
      <aside class="places-panel panel">
        <div class="panel-heading"><div><div class="eyebrow">YOUR COLLECTION</div><h1>我的地点 <span class="count-pill">{{ store.places.length }}</span></h1></div><button class="icon-button subtle" aria-label="地点筛选设置" @click="notify('筛选设置将在地点管理阶段开放。')"><SlidersHorizontal :size="17" /></button></div>
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
        <div v-else class="empty-search"><Search :size="20" /><span>没有找到匹配的地点</span><button @click="showAddDialog = true">添加这个地点</button></div>
        <div class="panel-bottom"><div class="collection-mini-title"><span class="section-label">我的合集</span><button class="text-action" @click="navTo('地点合集')">查看全部</button></div><button class="collection-row" @click="notify('杭州周末已包含 6 个地点。')"><span class="collection-cover cover-green"><span></span><span></span><span></span></span><span><strong>杭州周末</strong><small>6 个地点 · 更新于今天</small></span><ChevronRight :size="16" /></button></div>
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
        <div class="trip-panel-top"><div class="trip-heading"><div><div class="eyebrow">PLAN A JOURNEY</div><h2>行程规划</h2></div><button class="icon-button subtle" aria-label="行程设置" @click="notify('行程偏好设置将在行程模块开放。')"><MoreHorizontal :size="19" /></button></div>
          <button class="trip-select" @click="showTripPopover = !showTripPopover"><span class="trip-thumb"><span class="trip-thumb-sun"></span><span class="trip-thumb-mountain"></span></span><span class="trip-select-copy"><strong>杭州 · 演示行程</strong><small><CalendarDays :size="12" /> 10月18日 — 10月20日 <span class="day-pill">3天</span></small></span><ChevronDown :size="16" /></button>
          <div v-if="showTripPopover" class="trip-popover"><strong>我的行程</strong><button @click="showTripPopover = false; notify('新行程创建表单将在第四阶段开放。')"><Plus :size="15" /> 新建行程</button><small>当前只有演示行程</small></div>
        </div>
        <div class="itinerary-content"><div class="itinerary-topline"><div><span class="section-label">DAY 01</span><span class="day-date">10月18日 · 演示日程</span></div><button class="icon-button tiny" aria-label="切换日期" @click="notify('日期切换将在行程编辑器开放。')"><ChevronRight :size="17" /></button></div><div class="day-progress"><span></span></div><div class="itinerary-title"><h3>湖滨漫步与城市烟火</h3><span class="weather-pill"><Cloud :size="13" /> 天气待接入</span></div>
          <div class="timeline"><div class="timeline-track"></div><article class="timeline-stop" v-for="(stop, index) in store.itinerary" :key="stop.id"><div class="stop-time">{{ stop.time }}</div><div class="timeline-node"><span></span></div><button class="stop-card" :class="{ 'stop-current': selectedPlace?.name === stop.placeName }" @click="focusStop(stop.placeId)"><div class="stop-image" :class="`thumb-${stop.thumb}`"><span></span><span></span><span></span></div><div class="stop-info"><strong>{{ stop.placeName }}</strong><small><Clock3 :size="11" /> {{ stop.duration }} <span class="stop-category">{{ stop.category }}</span></small></div><span class="stop-more" aria-hidden="true"><Ellipsis :size="17" /></span></button><div v-if="index < store.itinerary.length - 1" class="travel-between"><span class="travel-line"></span><span class="travel-icon"><ArrowRight :size="11" /></span><span>路线待计算</span></div></article></div>
          <button class="add-stop-button" @click="notify('请先从左侧选择地点；跨面板添加将在行程编辑器开放。')"><Plus :size="15" /> 添加一个地点</button>
          <div class="selected-place-card" v-if="selectedPlace"><div class="selected-place-head"><span class="section-label">地图选中地点</span><button class="icon-button tiny" aria-label="关闭地点详情" @click="selectedId = ''"><X :size="15" /></button></div><div class="selected-place-body"><span class="selected-place-icon"><MapPin :size="16" /></span><div><strong>{{ selectedPlace.name }}</strong><small>{{ selectedPlace.address || '位置待确认' }}</small></div><button class="heart-button" :aria-label="store.isFavorite(selectedPlace.id) ? '取消收藏' : '收藏地点'" @click="store.toggleFavorite(selectedPlace.id)"><Heart :size="16" :fill="store.isFavorite(selectedPlace.id) ? 'currentColor' : 'none'" /></button></div><button class="detail-link" @click="notify('地点详情编辑将在第二阶段开放。')">查看地点详情 <ArrowRight :size="13" /></button></div>
        </div>
        <div class="trip-panel-bottom"><div class="ai-notice"><span class="ai-spark"><Sparkles :size="16" /></span><span><strong>让路线更顺一点</strong><small>AI 规划可稍后配置，也可以手动安排</small></span><button @click="notify('AI 规划将在第四阶段接入；当前不需要配置 Token。')"><ArrowRight :size="15" /></button></div><button class="preview-button" @click="notify('网页预览与 HTML 导出将在第五阶段交付。')"><span>预览旅行计划</span><ArrowRight :size="16" /></button></div>
      </aside>
    </main>

    <div v-if="mobileDrawer" class="mobile-sheet-scrim" @click.self="mobileDrawer = null">
      <section class="mobile-sheet" :aria-label="mobileDrawer === 'places' ? '地点收藏抽屉' : '行程抽屉'">
        <div class="sheet-grab"></div>
        <header class="sheet-heading"><div><div class="eyebrow">{{ mobileDrawer === 'places' ? 'YOUR COLLECTION' : 'PLAN A JOURNEY' }}</div><h2>{{ mobileDrawer === 'places' ? '我的地点' : '杭州 · 演示行程' }}</h2></div><button class="icon-button subtle" aria-label="关闭抽屉" @click="mobileDrawer = null"><X :size="18" /></button></header>
        <div v-if="mobileDrawer === 'places'" class="sheet-content">
          <div class="sheet-categories"><button v-for="category in categories" :key="category.name" :class="{ chosen: selectedCategory === category.name }" @click="selectedCategory = category.name">{{ category.name === '全部' ? '全部' : category.name }}</button></div>
          <button v-for="place in filteredPlaces" :key="place.id" class="sheet-place" @click="selectedId = place.id; mobileDrawer = null; activeNav = '地图'"><span class="sheet-place-icon" :class="`thumb-${place.thumb}`"><MapPin :size="16" /></span><span><strong>{{ place.name }}</strong><small>{{ place.city }} · {{ place.category }}</small></span><span v-if="!place.mapPosition" class="pending-state">{{ locationLabel(place) }}</span><ChevronRight :size="15" /></button>
          <button class="sheet-add-button" @click="mobileDrawer = null; showAddDialog = true"><Plus :size="16" /> 手动添加地点</button>
        </div>
        <div v-else class="sheet-content sheet-itinerary"><div class="sheet-trip-date"><CalendarDays :size="14" /> 10月18日 — 10月20日 <span class="day-pill">演示日期</span></div><button v-for="stop in store.itinerary" :key="stop.id" class="sheet-place" @click="focusStop(stop.placeId); mobileDrawer = null"><span class="sheet-stop-time">{{ stop.time }}</span><span><strong>{{ stop.placeName }}</strong><small>{{ stop.duration }} · {{ stop.category }} · 演示安排</small></span><ChevronRight :size="15" /></button><button class="sheet-add-button" @click="notify('预览和编辑能力将在后续阶段交付。')"><ArrowRight :size="15" /> 继续查看行程</button></div>
      </section>
    </div>

    <div v-if="showAddDialog" class="dialog-backdrop" @click.self="showAddDialog = false"><form class="add-dialog" @submit.prevent="addPlace"><div class="dialog-heading"><div><div class="eyebrow">SAVE A PLACE</div><h2>添加一个地点</h2></div><button class="icon-button subtle" type="button" aria-label="关闭" @click="showAddDialog = false"><X :size="18" /></button></div><label class="field-label" for="place-name">地点名称</label><input id="place-name" v-model="newName" class="text-field" autofocus required placeholder="例如：西湖边的一家咖啡馆" /><label class="field-label" for="place-city">城市（可选）</label><input id="place-city" v-model="newCity" class="text-field" placeholder="输入地点所在城市" /><label class="field-label" for="place-category">分类</label><select id="place-category" v-model="newCategory" class="text-field"><option v-for="category in categories.slice(1)" :key="category.name" :value="category.name">{{ category.name }}</option></select><div class="pending-note"><MapPin :size="16" /><span><strong>位置稍后确认</strong><small>未接入地理编码服务，不会为地点添加虚假坐标。</small></span></div><div class="dialog-actions"><button type="button" class="cancel-button" @click="showAddDialog = false">取消</button><button type="submit" class="save-button"><Check :size="15" /> 保存地点</button></div></form></div>
    <Transition name="toast"><div v-if="toast" class="toast-message"><Check :size="16" /> {{ toast }}</div></Transition>
    <button class="floating-add" aria-label="添加地点" @click="showAddDialog = true"><Plus :size="21" /></button>
  </div>
</template>
