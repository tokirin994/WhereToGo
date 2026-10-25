import { travelCacheKey } from '../auth'
import { defineStore } from 'pinia'
import { createTrip, deleteTrip, fetchTrips, importTrip, replaceTripStops, updateTrip, type TripInput, type TripRecord, type TripStopInput } from '../api/trips'
import { addDays, stopInput } from '../travel/model'

export type Trip = TripRecord
const storageKey = () => travelCacheKey('trips')
const today = new Date()
const isoDate = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
const start = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 14)
const end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 2)
export const seedTrip: Trip = {
  id: 'demo-trip-hangzhou', name: '杭州周末', destination: '杭州', startsOn: isoDate(start), endsOn: isoDate(end), status: 'planning', notes: '',
  stops: [
    { id: 'demo-stop-1', placeId: 'place-west-lake', dayDate: isoDate(start), placeName: '西湖边的日落', category: '景点', startsAt: '09:30', durationMinutes: 90, note: '演示安排，可编辑', sortOrder: 0 },
    { id: 'demo-stop-2', placeId: 'place-lou-wai-lou', dayDate: isoDate(start), placeName: '楼外楼', category: '美食', startsAt: '12:00', durationMinutes: 90, note: '', sortOrder: 1 },
    { id: 'demo-stop-3', placeId: 'place-man-jue-long', dayDate: isoDate(start), placeName: '满觉陇桂语', category: '咖啡', startsAt: '15:00', durationMinutes: 60, note: '', sortOrder: 2 },
  ],
}

function readTrips(): Trip[] {
  try {
    const raw = localStorage.getItem(storageKey())
    if (!raw) return []
    const value: unknown = JSON.parse(raw)
    if (Array.isArray(value) && value.every((trip) => trip && typeof trip.id === 'string' && typeof trip.name === 'string')) return value as Trip[]
  } catch { /* Browser storage can be disabled. */ }
  return []
}

function apiUuid(id: string) { return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id) }

export const useTripsStore = defineStore('trips', {
  state: () => ({ trips: readTrips(), apiConnected: false }),
  actions: {
    persist() { try { localStorage.setItem(storageKey(), JSON.stringify(this.trips)) } catch { /* Storage may be disabled. */ } },
    async loadApiTrips() {
      try {
        const remote = await fetchTrips()
        const remoteIds = new Set(remote.map((trip) => trip.id))
        this.trips = [...remote, ...this.trips.filter((trip) => !apiUuid(trip.id) && !remoteIds.has(trip.id))]
        this.apiConnected = true
        this.persist()
      } catch { this.apiConnected = false }
    },
    async addTrip(input: TripInput) {
      try {
        const trip = await createTrip(input)
        this.trips.unshift(trip)
        this.apiConnected = true
        this.persist()
        return { trip, persisted: true }
      } catch (error) {
        if (!(error instanceof TypeError)) throw error
        const trip: Trip = { ...input, id: `trip-${crypto.randomUUID()}`, status: input.status||'planning', stops: [] }
        this.trips.unshift(trip)
        this.apiConnected = false
        this.persist()
        return { trip, persisted: false }
      }
    },
    async updateTrip(id: string, input: TripInput) {
      const trip = this.trips.find((item) => item.id === id)
      if (!trip) throw new Error('行程不存在')
      if (apiUuid(id)) Object.assign(trip, await updateTrip(id, input))
      else {
        const delta=input.shiftStops&&trip.startsOn&&input.startsOn?Math.round((new Date(input.startsOn+'T12:00:00').getTime()-new Date(trip.startsOn+'T12:00:00').getTime())/86400000):0
        const nextStops=trip.stops.map(stop=>({...stop,dayDate:delta?addDays(stop.dayDate,delta):stop.dayDate}))
        if(nextStops.some(stop=>input.startsOn&&stop.dayDate<input.startsOn||input.endsOn&&stop.dayDate>input.endsOn))throw new Error('请先移动超出新日期范围的安排，再缩短旅行天数')
        try {
          const saved = await importTrip({ ...input, notes: input.notes ?? trip.notes }, nextStops.map(stop=>({...stopInput(stop),id:undefined,placeId:stop.placeId&&apiUuid(stop.placeId)?stop.placeId:null})))
          const index = this.trips.findIndex((item) => item.id === id)
          this.trips.splice(index, 1, saved)
          this.apiConnected = true
          this.persist()
          return saved
        } catch (error) {
          if (!(error instanceof TypeError)) throw error
          Object.assign(trip, input)
          trip.stops=nextStops
          this.apiConnected = false
        }
      }
      this.persist()
      return trip
    },
    async saveStops(id: string, stops: TripStopInput[]) {
      const trip = this.trips.find((item) => item.id === id)
      if (!trip) throw new Error('行程不存在')
      if (apiUuid(id)) Object.assign(trip, await replaceTripStops(id, stops.map((stop) => ({
        ...stop, id: stop.id && apiUuid(stop.id) ? stop.id : undefined,
        placeId: stop.placeId && apiUuid(stop.placeId) ? stop.placeId : null,
      }))))
      else {
        try {
          const saved = await importTrip({ name: trip.name, destination: trip.destination, startsOn: trip.startsOn, endsOn: trip.endsOn, notes: trip.notes,preferences:trip.preferences,status:trip.status }, stops.map((stop, index) => ({
            placeId: stop.placeId && apiUuid(stop.placeId) ? stop.placeId : null,
            dayDate: stop.dayDate, placeName: stop.placeName, category: stop.category, startsAt: stop.startsAt,
            durationMinutes: stop.durationMinutes, note: stop.note, sortOrder: index,estimatedCost:stop.estimatedCost,completed:stop.completed,
          })))
          const index = this.trips.findIndex((item) => item.id === id)
          this.trips.splice(index, 1, saved)
          this.apiConnected = true
          this.persist()
          return saved
        } catch (error) {
          if (!(error instanceof TypeError)) throw error
          trip.stops = stops.map((stop, index) => ({ ...stop, id: stop.id ?? `stop-${crypto.randomUUID()}`, sortOrder: index }))
          this.apiConnected = false
        }
      }
      this.persist()
      return trip
    },
    async removeTrip(id: string) {
      if (apiUuid(id)) await deleteTrip(id)
      this.trips = this.trips.filter((trip) => trip.id !== id)
      this.persist()
    },
  },
})
