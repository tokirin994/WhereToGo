import type { PlaceCategory } from '../stores/places'

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
  return parseResponse<PlaceRecord[]>(await fetch('/api/v1/places'))
}

export async function createPlace(input: CreatePlaceInput): Promise<PlaceRecord> {
  return parseResponse<PlaceRecord>(await fetch('/api/v1/places', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  }))
}
