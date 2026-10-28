import { apiRequest } from './client'
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
  estimatedCost?:number
  completed?:boolean
}

export interface TripPreferences {
  pace:'relaxed'|'balanced'|'packed';budgetLevel:'economy'|'standard'|'comfort';budgetAmount:number;
  travelers:number;transport:'walk'|'transit'|'drive';departure:string;styles:string[];mustDo:string;avoid:string;
  checklist:Array<{id:string;text:string;done:boolean}>
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
  preferences?:TripPreferences
}

export type TripInput = Pick<TripRecord, 'name' | 'destination' | 'startsOn' | 'endsOn' | 'notes'> & {status?:string;preferences?:TripPreferences;shiftStops?:boolean}
export type TripStopInput = Omit<TripStopRecord, 'id'> & { id?: string }
export async function fetchTrips() { return apiRequest<TripRecord[]>('/api/v1/trips') }
export async function createTrip(input:TripInput) { return apiRequest<TripRecord>('/api/v1/trips',{method:'POST',body:JSON.stringify(input)}) }
export async function updateTrip(id:string,input:TripInput) { return apiRequest<TripRecord>(`/api/v1/trips/${encodeURIComponent(id)}`,{method:'PUT',body:JSON.stringify(input)}) }
export async function replaceTripStops(id:string,stops:TripStopInput[]) { return apiRequest<TripRecord>(`/api/v1/trips/${encodeURIComponent(id)}/stops`,{method:'PUT',body:JSON.stringify(stops)}) }
export async function deleteTrip(id:string) { return apiRequest<void>(`/api/v1/trips/${encodeURIComponent(id)}`,{method:'DELETE'}) }
export async function duplicateTrip(id:string){return apiRequest<TripRecord>(`/api/v1/trips/${encodeURIComponent(id)}/duplicate`,{method:'POST'})}
export async function importTrip(input:TripInput,stops:TripStopInput[]){return apiRequest<TripRecord>('/api/v1/trips/import',{method:'POST',body:JSON.stringify({trip:input,stops})})}
export interface PlannerDraft{engine:'local'|'ai';stops:TripStopInput[];notes:string[]}
export const plannerStatus=()=>apiRequest<{aiAvailable:boolean;localAvailable:boolean;aiRequestsPerDay:number}>('/api/v1/planner/status')
export const draftTrip=(id:string,strategy:'local'|'ai')=>apiRequest<PlannerDraft>(`/api/v1/planner/trips/${encodeURIComponent(id)}/draft`,{method:'POST',body:JSON.stringify({strategy})})
