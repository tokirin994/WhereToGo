import { shallowRef } from 'vue'
import type { User } from 'oidc-client-ts'
import { createIdentitySession } from './identitySession'

export const localMockAuth=import.meta.env.VITE_LOCAL_MOCK_AUTH==='true'
const authority=import.meta.env.VITE_OIDC_AUTHORITY||''
export const currentUser=shallowRef<User|null>(null)
export const authError=shallowRef('')
let initialize:Promise<void>|undefined
let mockExpiresAt=0
let cacheIdentity='anonymous'
export const identity=createIdentitySession({authority,clientId:import.meta.env.VITE_OIDC_CLIENT_ID||'',audience:import.meta.env.VITE_OIDC_AUDIENCE||'wheretogo-api',
  allowLoopback:import.meta.env.DEV&&['localhost','127.0.0.1','[::1]'].includes(window.location.hostname),
  returnPath:path=>path==='/'||/^\/(travel|system|account)(?:\/|$)/.test(path),changed:user=>{currentUser.value=user},
})
export const accountConsoleUrl=authority?authority.replace(/\/$/,'')+'/account/':''
async function mockSession(){
  if(!import.meta.env.DEV||!['localhost','127.0.0.1','[::1]'].includes(window.location.hostname))throw new Error('模拟登录仅允许本机开发模式')
  const response=await fetch(`${authority}/mock-session?aud=wheretogo-api`,{credentials:'omit',cache:'no-store'})
  if(!response.ok)throw new Error('本地模拟登录不可用，请关闭模拟模式并使用统一账号登录')
  const result=await response.json() as {access_token:string;expires_in:number;profile:User['profile']}
  mockExpiresAt=Date.now()+result.expires_in*1000
  currentUser.value={access_token:result.access_token,profile:result.profile} as User
}
export async function initializeAuth(){
  if(initialize)return initialize
  initialize=(async()=>{authError.value='';try{if(localMockAuth)await mockSession();else await identity.initialize()}catch(cause){authError.value=cause instanceof Error?cause.message:'登录初始化失败'}})()
  return initialize
}
export async function signIn(returnTo?:string){authError.value='';try{await identity.signIn(returnTo)}catch(cause){authError.value=cause instanceof Error?cause.message:'无法打开登录服务'}}
export async function register(returnTo?:string){authError.value='';try{await identity.register(returnTo)}catch(cause){authError.value=cause instanceof Error?cause.message:'无法打开注册页面'}}
export async function signOut(){try{if(localMockAuth){currentUser.value=null;window.location.assign('/');return}await identity.signOut()}catch(cause){authError.value=cause instanceof Error?cause.message:'统一退出失败'}}
export async function accessToken(){
  await initializeAuth()
  if(localMockAuth&&mockExpiresAt<Date.now()+60000)await mockSession()
  if(!currentUser.value||(!localMockAuth&&currentUser.value.expired)){currentUser.value=null;throw new Error('登录已过期，请重新登录')}
  return currentUser.value.access_token
}
export function travelCacheKey(name:string){
  if(currentUser.value)cacheIdentity=`${authority}:${currentUser.value.profile.sub}`
  const key=`wheretogo:${encodeURIComponent(cacheIdentity)}:${name}`
  if(currentUser.value?.profile.sub==='local-demo-user'&&import.meta.env.DEV){
    const previous=name==='places'?'travelatlas.demo.places':name==='trips'?'travelatlas.trips':null
    if(previous)try{const data=localStorage.getItem(previous);if(data&&!localStorage.getItem(key)){localStorage.setItem(key,data);localStorage.removeItem(previous)}}catch{/* Storage migration is best effort. */}
  }
  return key
}
