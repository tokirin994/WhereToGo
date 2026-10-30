import type { LedgerSnapshot } from './ledger'
import { authorizedRequest, apiError } from './apiClient'
export interface NutstoreCredentials {username:string;appPassword:string}
export interface NutstoreStatus {available:boolean;configured:boolean;needsUpdate?:boolean;usernameMasked?:string;updatedAt?:string;backupPath?:string}
const settingsKey=(accountKey:string)=>`smartledger-nutstore:${accountKey}`
/** Legacy values are read into memory solely for migration; new writes never use Web Storage. */
export function readNutstoreCredentials(accountKey:string):NutstoreCredentials{
  try{const key=settingsKey(accountKey);const value=JSON.parse(sessionStorage.getItem(key)||localStorage.getItem(key)||'{}');return {username:value.username||'',appPassword:value.appPassword||''}}
  catch{return {username:'',appPassword:''}}
}
export function clearNutstoreCredentials(accountKey:string){for(const name of ['sessionStorage','localStorage'] as const)try{window[name].removeItem(settingsKey(accountKey))}catch{/* May be unavailable. */}}
async function request<T>(apiUrl:string,token:string,path:string,method='POST',body?:unknown):Promise<T>{
  const response=await authorizedRequest(apiUrl,token,`/api/v1/sync/nutstore/${path}`,{method,...(body!==undefined?{body:JSON.stringify(body)}:{})})
  if(!response.ok)throw await apiError(response,'坚果云请求失败')
  return await response.json() as T
}
export const getNutstoreStatus=(api:string,token:string)=>request<NutstoreStatus>(api,token,'credentials','GET')
export const writeNutstoreCredentials=(api:string,token:string,credentials:NutstoreCredentials)=>request<NutstoreStatus>(api,token,'credentials','PUT',credentials)
export const deleteNutstoreCredentials=(api:string,token:string)=>request<NutstoreStatus>(api,token,'credentials','DELETE')
export async function testNutstore(api:string,token:string){return (await request<{message:string}>(api,token,'test')).message}
export async function backupToNutstore(api:string,token:string,snapshot:LedgerSnapshot){return (await request<{message:string}>(api,token,'upload','POST',{snapshot})).message}
export const restoreFromNutstore=(api:string,token:string)=>request<LedgerSnapshot>(api,token,'download')
