import { applicationAccessToken } from './applicationAccess'
import { accessToken, accountConsoleUrl, identity } from './auth'
import { platform } from './appLinks'
import { responseJson } from './responseJson'

export interface AccountProfile {id:string;username:string;email:string;emailVerified?:boolean;firstName?:string;lastName?:string}
export interface AccountSession {id:string;ipAddress:string;started?:number|string;lastAccess?:number|string;expires?:number|string;current?:boolean;browser?:string;clients?:{clientId:string;clientName?:string}[]}
export interface ProviderConfig {baseUrl?:string;model?:string;protocol?:string;tokenField?:string;authMode?:string}
export interface ProviderStatus {provider:string;enabled:boolean;keyMasked?:string;needsUpdate?:boolean;updatedAt:string;config?:ProviderConfig}
export interface ProviderList {available:boolean;encryption:string;providers:ProviderStatus[]}
export interface NutstoreStatus {available:boolean;configured:boolean;needsUpdate?:boolean;usernameMasked?:string;updatedAt?:string}
async function read<T>(response:Response):Promise<T>{
  if(!response.ok){
    let message=`操作失败（HTTP ${response.status}）`
    try{const body=await response.json();if(body.message)message=body.message;else if(body.errorMessage)message=body.errorMessage}catch{/* Never expose raw HTML. */}
    if(response.status===401)message='会话已过期，请重新登录后再试'
    throw new Error(message)
  }
  return responseJson<T>(response)
}
export async function accountRequest<T>(path:string,method='GET',body?:unknown):Promise<T>{
  if(!['/','/sessions','/applications'].includes(path)&&!/^\/sessions\/[a-zA-Z0-9_-]+$/.test(path))throw new Error('无效的账号操作')
  const send=async()=>fetch(accountConsoleUrl.replace(/\/$/,'')+path,{method,credentials:'omit',redirect:'error',cache:'no-store',signal:AbortSignal.timeout(20000),headers:{Authorization:'Bearer '+await accessToken(),Accept:'application/json',...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})})
  let response=await send()
  // Sessions created before the self-service role rollout need a fresh access token.
  // Retry GET only; never replay a mutation whose first outcome may be ambiguous.
  if(method==='GET'&&[401,403].includes(response.status)&&identity.manager){
    await identity.accessToken(true)
    response=await send()
  }
  return read<T>(response)
}
export async function ledgerAccountRequest<T>(method='GET',body?:unknown):Promise<T>{
  const base=platform.application('ledger').apiUrl.replace(/\/$/,'')
  if(!base)throw new Error('记账服务地址尚未配置')
  return read<T>(await fetch(base+'/api/v1/sync/nutstore/credentials',{method,credentials:'omit',redirect:'error',cache:'no-store',signal:AbortSignal.timeout(20000),headers:{Authorization:'Bearer '+await applicationAccessToken('ledger'),Accept:'application/json',...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})}))
}
