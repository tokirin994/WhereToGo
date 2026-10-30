import {shallowRef} from 'vue'
import type {User} from 'oidc-client-ts'
import {createIdentitySession,type IdentityConfig} from './index'

export function createWebAuth(config:Omit<IdentityConfig<User>,'changed'> & {
  registrationEnabled:boolean;localMockAuth:boolean;audience:string
  loginUrl?:(intent:'login'|'register',returnTo:string)=>string
}){
  const currentUser=shallowRef<User|null>(null),authError=shallowRef(''),authAction=shallowRef<'login'|'register'|null>(null)
  const identity=createIdentitySession({...config,changed:user=>{currentUser.value=user}})
  const registrationEnabled=config.registrationEnabled,localMockAuth=config.localMockAuth
  let initialize:Promise<void>|undefined,mockExpiresAt=0
  window.addEventListener('pageshow',()=>{authAction.value=null})
  async function mockSession(){
    if(!config.allowLoopback||!['localhost','127.0.0.1','[::1]'].includes(window.location.hostname))throw new Error('模拟登录仅允许本机开发模式')
    const response=await fetch(`${config.authority}/mock-session?aud=${encodeURIComponent(config.audience)}`,{credentials:'omit',cache:'no-store'})
    if(!response.ok)throw new Error('本地模拟登录不可用，请使用统一账号登录')
    const result=await response.json() as {access_token:string;expires_in:number;profile:User['profile']}
    mockExpiresAt=Date.now()+result.expires_in*1000
    currentUser.value={access_token:result.access_token,profile:result.profile} as User
  }
  async function initializeAuth(){
    return initialize??=(async()=>{
      authError.value=''
      try{
        let initializationError:unknown
        try{if(localMockAuth)await mockSession();else await identity.initialize()}catch(cause){initializationError=cause}
        // A central-login return can make one top-level SSO grant if iframe cookies
        // are blocked. Consume the marker first so failure cannot form a loop.
        const target=new URL(window.location.href)
        if(target.searchParams.has('__sso')){
          target.searchParams.delete('__sso');window.history.replaceState({},'',target.pathname+target.search+target.hash)
          if(!currentUser.value&&!target.pathname.includes('/auth/')){authAction.value='login';await identity.resumeSSO(target.pathname+target.search+target.hash);return}
        }
        if(config.loginUrl&&!localMockAuth&&!currentUser.value&&!target.pathname.includes('/auth/')&&!target.searchParams.has('signedOut')){
          authAction.value='login';window.location.replace(config.loginUrl('login',target.pathname+target.search+target.hash));return
        }
        if(initializationError)throw initializationError
      }catch(cause){authAction.value=null;authError.value=cause instanceof Error?cause.message:'登录初始化失败'}
    })()
  }
  async function openIdentity(action:'login'|'register',returnTo=window.location.pathname+window.location.search+window.location.hash){
    if(authAction.value)return
    authError.value='';authAction.value=action
    try{
      if(action==='register'&&!registrationEnabled)throw new Error('当前部署未开放注册，请联系管理员')
      if(config.loginUrl){window.location.assign(config.loginUrl(action,returnTo));return}
      if(action==='register')await identity.register(returnTo);else await identity.signIn(returnTo)
    }catch(cause){authError.value=cause instanceof Error?cause.message:'账号服务暂时不可用，请重试';authAction.value=null}
  }
  async function accessToken(){
    await initializeAuth()
    if(localMockAuth){if(mockExpiresAt<Date.now()+60000)await mockSession();if(currentUser.value)return currentUser.value.access_token;throw new Error('登录已过期')}
    return identity.accessToken()
  }
  async function signOut(){try{if(localMockAuth){currentUser.value=null;return}await identity.signOut()}catch(cause){authError.value=cause instanceof Error?cause.message:'统一退出失败'}}
  return {currentUser,authError,authAction,identity,registrationEnabled,localMockAuth,initializeAuth,accessToken,signOut,
    signIn:(returnTo?:string)=>openIdentity('login',returnTo),register:(returnTo?:string)=>openIdentity('register',returnTo),
    accountConsoleUrl:config.authority?config.authority.replace(/\/$/,'')+'/account/':'',
  }
}
