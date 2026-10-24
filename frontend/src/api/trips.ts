export type TripStopRecord = {
  id: string
  placeId: string | null
  dayDate: string
  placeName: string
  category: string
  startsAt: string
  durationMinutes: number
  note: string | null
  sortOrder: number
}

export type TripRecord = {
  id: string
  name: string
  destination: string | null
  startsOn: string | null
  endsOn: string | null
  status: string
  notes: string
  stops: TripStopRecord[]
}

export type TripInput = Pick<TripRecord, 'name' | 'destination' | 'startsOn' | 'endsOn' | 'notes'>
export type TripStopInput = Omit<TripStopRecord, 'id'> & { id?: string }
const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/$/, '')

async function parseResponse<T>(response: Response): Promise<T> {
  if (!response.ok) throw new Error((await response.text()) || `行程服务返回 HTTP ${response.status}`)
  if (response.status === 204) return undefined as T
  return response.json() as Promise<T>
}

export async function fetchTrips() { return parseResponse<TripRecord[]>(await fetch(`${API_BASE_URL}/api/v1/trips`)) }
export async function createTrip(input: TripInput) {
  return parseResponse<TripRecord>(await fetch(`${API_BASE_URL}/api/v1/trips`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input) }))
}
export async function updateTrip(id: string, input: TripInput) {
  return parseResponse<TripRecord>(await fetch(`${API_BASE_URL}/api/v1/trips/${encodeURIComponent(id)}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input) }))
}
export async function replaceTripStops(id: string, stops: TripStopInput[]) {
  return parseResponse<TripRecord>(await fetch(`${API_BASE_URL}/api/v1/trips/${encodeURIComponent(id)}/stops`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(stops) }))
}
export async function deleteTrip(id: string) {
  return parseResponse<void>(await fetch(`${API_BASE_URL}/api/v1/trips/${encodeURIComponent(id)}`, { method: 'DELETE' }))
}
