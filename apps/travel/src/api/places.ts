import type { PlaceCategory } from '../stores/places'

import { apiRequest } from './client'

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
  favorite?:boolean
  visited?:boolean
  notes?:string
  sourceUrl?:string|null
}

export type CreatePlaceInput = {
  name: string
  city: string
  address: string
  category: PlaceCategory
  tags: string[]
  longitude?:number|null
  latitude?:number|null
  coordinateSystem?:'WGS84'|null
  favorite?:boolean
  visited?:boolean
  notes?:string
  sourceUrl?:string|null
}

export async function fetchPlaces(): Promise<PlaceRecord[]> { return apiRequest('/api/v1/places') }
export async function createPlace(input: CreatePlaceInput): Promise<PlaceRecord> { return apiRequest('/api/v1/places',{method:'POST',body:JSON.stringify(input)}) }
export async function updatePlace(id: string,input: CreatePlaceInput): Promise<PlaceRecord> { return apiRequest(`/api/v1/places/${encodeURIComponent(id)}`,{method:'PATCH',body:JSON.stringify(input)}) }
export async function deletePlace(id: string): Promise<void> { return apiRequest(`/api/v1/places/${encodeURIComponent(id)}`,{method:'DELETE'}) }
export async function createPlacesBatch(input:CreatePlaceInput[]){return apiRequest<PlaceRecord[]>('/api/v1/places/batch',{method:'POST',body:JSON.stringify(input)})}
