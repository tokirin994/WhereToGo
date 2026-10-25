import { apiRequest } from './client'
export interface PlaceCollection{id:string;name:string;description:string;color:string;placeIds:string[]}
export type CollectionInput=Omit<PlaceCollection,'id'>
export const fetchCollections=()=>apiRequest<PlaceCollection[]>('/api/v1/collections')
export const createCollection=(body:CollectionInput)=>apiRequest<PlaceCollection>('/api/v1/collections',{method:'POST',body:JSON.stringify(body)})
export const updateCollection=(id:string,body:CollectionInput)=>apiRequest<PlaceCollection>(`/api/v1/collections/${id}`,{method:'PUT',body:JSON.stringify(body)})
export const deleteCollection=(id:string)=>apiRequest<void>(`/api/v1/collections/${id}`,{method:'DELETE'})
