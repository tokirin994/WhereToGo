import type { PlaceCategory } from '../stores/places'

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/$/, '')

export type PlaceRecord = {
  id: string
  name: string
  city: string
  address: string | null
  category: PlaceCategory
  tags: string[] | null
  longitude: number | null
  latitude: number | null
  coordinateSystem: string | null
  coordinateStatus: string
  coordinateSource: string | null
}

export type CreatePlaceInput = {
  name: string
  city: string
  address: string
  category: PlaceCategory
  tags: string[]
}

async function parseResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const detail = await response.text()
    throw new Error(detail || `地点服务返回 HTTP ${response.status}`)
  }
  return response.json() as Promise<T>
}

export async function fetchPlaces(): Promise<PlaceRecord[]> {
  return parseResponse<PlaceRecord[]>(await fetch(`${API_BASE_URL}/api/v1/places`))
}

export async function createPlace(input: CreatePlaceInput): Promise<PlaceRecord> {
  return parseResponse<PlaceRecord>(await fetch(`${API_BASE_URL}/api/v1/places`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  }))
}

export async function updatePlace(id: string, input: CreatePlaceInput): Promise<PlaceRecord> {
  return parseResponse<PlaceRecord>(await fetch(`${API_BASE_URL}/api/v1/places/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  }))
}

export async function deletePlace(id: string): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/api/v1/places/${encodeURIComponent(id)}`, { method: 'DELETE' })
  if (!response.ok) {
    const detail = await response.text()
    throw new Error(detail || `地点服务返回 HTTP ${response.status}`)
  }
}
