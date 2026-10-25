import { travelCacheKey } from '../auth'
import { defineStore } from 'pinia'
import { createPlace, createPlacesBatch, deletePlace, fetchPlaces, updatePlace, type CreatePlaceInput, type PlaceRecord } from '../api/places'

export type PlaceCategory = '景点' | '美食' | '咖啡' | '住宿'
export type DemoMapPosition = { x: number; y: number }
export type Place = {
  id: string; name: string; city: string; address: string; category: PlaceCategory
  tags: string[]; thumb: 'lake' | 'temple' | 'food' | 'cafe' | 'hotel'
  mapPosition: DemoMapPosition | null; favorite: boolean
  longitude?: number | null; latitude?: number | null; coordinateStatus?: string
  visited?:boolean;notes?:string;sourceUrl?:string|null
}

function isApiPlaceId(id: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)
}

function placeFromApi(record: PlaceRecord): Place {
  return {
    id: record.id,
    name: record.name,
    city: record.city,
    address: record.address || '地址待确认',
    category: record.category,
    tags: record.tags ?? [],
    thumb: record.category === '美食' ? 'food' : record.category === '咖啡' ? 'cafe' : record.category === '住宿' ? 'hotel' : 'lake',
    // Plot longitude/latitude directly; never invent percentage coordinates for the legacy schematic.
    mapPosition: null,
    favorite: record.favorite??false,
    visited:record.visited??false,notes:record.notes??'',sourceUrl:record.sourceUrl,
    longitude: record.longitude,
    latitude: record.latitude,
    coordinateStatus: record.coordinateStatus,
  }
}

export const demoPlaces: Place[] = [
  { id: 'place-west-lake', name: '西湖边的日落', city: '杭州', address: '地址待核验 · 演示地点', category: '景点', tags: ['日落', '湖景', '散步'], thumb: 'lake', mapPosition: { x: 43, y: 39 }, favorite: true },
  { id: 'place-lingyin', name: '灵隐寺与飞来峰', city: '杭州', address: '地址待核验 · 演示地点', category: '景点', tags: ['寺院', '文化'], thumb: 'temple', mapPosition: { x: 24, y: 28 }, favorite: true },
  { id: 'place-lou-wai-lou', name: '楼外楼', city: '杭州', address: '地址待核验 · 演示地点', category: '美食', tags: ['杭帮菜', '西湖边'], thumb: 'food', mapPosition: { x: 48, y: 44 }, favorite: false },
  { id: 'place-man-jue-long', name: '满觉陇桂语', city: '杭州', address: '地址待核验 · 演示地点', category: '咖啡', tags: ['咖啡', '山景'], thumb: 'cafe', mapPosition: { x: 34, y: 61 }, favorite: true },
  { id: 'place-canal', name: '小河直街', city: '杭州', address: '地址待核验 · 演示地点', category: '景点', tags: ['运河', '街区'], thumb: 'lake', mapPosition: { x: 59, y: 25 }, favorite: false },
  { id: 'place-hotel', name: '湖滨附近的住处', city: '杭州', address: '地址待核验 · 演示地点', category: '住宿', tags: ['湖滨', '交通方便'], thumb: 'hotel', mapPosition: null, favorite: false },
]

function loadPlaces(): Place[] {
  try {
    const raw = localStorage.getItem(travelCacheKey('places'))
    if (!raw) return []
    const value: unknown = JSON.parse(raw)
    if (Array.isArray(value) && value.every((item) => item && typeof item.id === 'string')) return value as Place[]
  } catch { /* New accounts start empty even when browser storage is unavailable. */ }
  return []
}

export const usePlacesStore = defineStore('places', {
  state: () => ({ places: loadPlaces(), apiConnected: false, itinerary: [
    { id: 'stop-1', placeId: 'place-west-lake', placeName: '西湖边的日落', time: '09:30', duration: '停留时长待安排', category: '湖景漫步', thumb: 'lake' },
    { id: 'stop-2', placeId: 'place-lou-wai-lou', placeName: '楼外楼', time: '12:00', duration: '停留时长待安排', category: '午餐 · 杭帮菜', thumb: 'food' },
    { id: 'stop-3', placeId: 'place-man-jue-long', placeName: '满觉陇桂语', time: '15:00', duration: '停留时长待安排', category: '山景咖啡', thumb: 'cafe' },
  ] }),
  actions: {
    async importPlaces(input:CreatePlaceInput[]){const saved=(await createPlacesBatch(input)).map(placeFromApi);this.places.unshift(...saved);this.apiConnected=true;this.persist();return saved},
    persist() { try { localStorage.setItem(travelCacheKey('places'), JSON.stringify(this.places)) } catch { /* Storage may be disabled. */ } },
    async loadApiPlaces() {
      try {
        const records = await fetchPlaces()
        const apiPlaces = records.map(placeFromApi)
        const apiIds = new Set(apiPlaces.map((place) => place.id))
        this.places = [...apiPlaces, ...this.places.filter((place) => !isApiPlaceId(place.id) && !apiIds.has(place.id))]
        this.apiConnected = true
        this.persist()
      } catch {
        this.apiConnected = false
      }
    },
    async addPlace(name: string, category: PlaceCategory, city: string, address = '地址待确认', tags: string[] = [],details:Partial<CreatePlaceInput>={}) {
      const place: Place = { id: `place-${crypto.randomUUID()}`, name, city: city.trim() || '未指定城市', address, category, tags, thumb: category === '美食' ? 'food' : category === '咖啡' ? 'cafe' : category === '住宿' ? 'hotel' : 'lake', mapPosition: null, favorite: false }
      try {
        const record = await createPlace({ ...details,name, category, city: place.city, address: place.address, tags })
        const saved = placeFromApi(record)
        this.places.unshift(saved)
        this.apiConnected = true
        this.persist()
        return { place: saved, persisted: true }
      } catch (error) {
        if (!(error instanceof TypeError)) throw error
        Object.assign(place,details);this.places.unshift(place)
        this.apiConnected = false
        this.persist()
        return { place, persisted: false }
      }
    },
    async updatePlace(id: string, input: CreatePlaceInput) {
      const current = this.places.find((item) => item.id === id)
      if (!current) throw new Error('地点不存在')
      if (isApiPlaceId(id)) {
        const saved = placeFromApi(await updatePlace(id, input))
        Object.assign(current, saved)
      } else {
        Object.assign(current, input,{thumb: input.category === '美食' ? 'food' : input.category === '咖啡' ? 'cafe' : input.category === '住宿' ? 'hotel' : 'lake'})
      }
      this.persist()
      return current
    },
    async deletePlace(id: string) {
      if (isApiPlaceId(id)) await deletePlace(id)
      this.places = this.places.filter((item) => item.id !== id)
      this.persist()
    },
    async toggleFavorite(id: string) { const place = this.places.find((item) => item.id === id); if(place)return this.updatePlace(id,{name:place.name,city:place.city,address:place.address,category:place.category,tags:place.tags,longitude:place.longitude,latitude:place.latitude,coordinateSystem:place.longitude!=null?'WGS84':null,favorite:!place.favorite}) },
    isFavorite(id: string) { return this.places.find((item) => item.id === id)?.favorite ?? false },
  },
})
