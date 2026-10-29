/** Shared OIDC lifecycle. Apps retain separate PKCE clients and audience-bound tokens. */
export interface IdentityUser {
  access_token:string; id_token?:string; refresh_token?:string; expired?:boolean; expires_in?:number
  profile:{sub:string;sid?:string}; state?:unknown
}
interface RedirectArgs {ui_locales?:string;prompt?:string;max_age?:number;extraQueryParams?:Record<string,string>;state?:unknown}
export interface SessionSettings {
  authority:string;client_id:string;response_type:string;scope:string;redirect_uri:string
  silent_redirect_uri:string;post_logout_redirect_uri:string;automaticSilentRenew:boolean
  monitorSession:boolean;silentRequestTimeoutInSeconds:number;extraQueryParams:Record<string,string>
  validateSubOnSilentRenew:boolean
}
export interface SessionManager<U extends IdentityUser> {
  events:{addUserLoaded:(cb:(user:U)=>void)=>void;addAccessTokenExpiring:(cb:()=>void)=>void;addAccessTokenExpired:(cb:()=>void)=>void}
  getUser:()=>Promise<U|null>;removeUser:()=>Promise<void>
  signinSilent:(args?:{forceIframeAuth?:boolean})=>Promise<U|null>
  signinRedirect:(args:RedirectArgs)=>Promise<void>;signinRedirectCallback:()=>Promise<U>
  signinSilentCallback:()=>Promise<unknown>;signoutRedirectCallback:()=>Promise<unknown>
  signoutRedirect:(args:{id_token_hint?:string})=>Promise<void>
}
export type SessionEndReason='user_logout'|'remote_logout'|'refresh_rejected'|'sso_unavailable'|'account_changed'
export interface IdentityConfig<U extends IdentityUser> {
  authority:string;clientId:string;audience:string;allowLoopback:boolean;basePath?:string;callbackBaseUrl?:string
  returnPath:(path:string)=>boolean;changed:(user:U|null)=>void;monitor?:boolean
  sessionEnded?:(reason:SessionEndReason)=>void
}
export function createIdentitySessionCore<U extends IdentityUser>(config:IdentityConfig<U>,createManager:(settings:SessionSettings)=>SessionManager<U>){
  const authority=config.authority.replace(/\/$/,'')
  const origin=window.location.origin
  const base=new URL(config.basePath||'/',origin)
  if(base.origin!==origin||base.search||base.hash)throw new Error('应用基础路径无效')
  const root=base.pathname.replace(/\/?$/,'/')
  const callbackBase=new URL(config.callbackBaseUrl||root,origin)
  const loopback=(url:URL)=>config.allowLoopback&&url.protocol==='http:'&&['localhost','127.0.0.1','[::1]'].includes(url.hostname)
  if(callbackBase.username||callbackBase.password||callbackBase.search||callbackBase.hash||!(callbackBase.protocol==='https:'||loopback(callbackBase)))throw new Error('账号回调地址必须使用 HTTPS；本机开发允许回环 HTTP')
  const callbackRoot=callbackBase.href.replace(/\/?$/,'/')
  // Only non-secret notifications are shared across apps/tabs. Tokens stay in sessionStorage.
  const eventKey=`personal-identity:${authority}:event`
  const sidKey=`personal-identity:${authority}:${config.clientId}:sid`
  const manager=authority&&config.clientId?createManager({
    authority,client_id:config.clientId,response_type:'code',scope:'openid profile email',
    redirect_uri:callbackRoot+'auth/callback',silent_redirect_uri:callbackRoot+'auth/silent',
    post_logout_redirect_uri:callbackRoot+'auth/signed-out',
    // One renewal owner prevents refresh-token rotation races. Keep session
    // decisions here: SessionMonitor can report iframe errors as logout.
    automaticSilentRenew:false,monitorSession:false,silentRequestTimeoutInSeconds:8,
    // A fresh SSO grant may belong to the account selected in another app.
    // loaded() reloads an active workspace before exposing a changed subject.
    validateSubOnSilentRenew:false,
    extraQueryParams:{audience:config.audience},
  }):null
  let current:U|null=null,stopped=false,initialized=false,invalidated=false,refreshAvailable=false,epoch=0,lastCheck=0
  let renewing:Promise<U|null>|undefined,initializing:Promise<void>|undefined,pendingEpoch:number|undefined
  let timer:ReturnType<typeof setInterval>|undefined
  const callbackPath=window.location.pathname.startsWith(root+'auth/')
  const safePath=(value:unknown)=>{
    if(typeof value!=='string')return root
    const target=new URL(value,origin)
    const relative=target.pathname.startsWith(root)?'/'+target.pathname.slice(root.length):''
    return target.origin===origin&&relative&&config.returnPath(relative)?target.pathname+target.search+target.hash:root
  }
  function validate(){
    if(!manager)throw new Error('尚未配置统一账号服务')
    const url=new URL(authority)
    if(url.username||url.password||url.search||url.hash||!(url.protocol==='https:'||(config.allowLoopback&&url.protocol==='http:'&&['localhost','127.0.0.1','[::1]'].includes(url.hostname))))throw new Error('统一账号服务必须使用 HTTPS；本机开发允许回环 HTTP')
  }
  function notify(type:'login'|'logout',sub?:string){
    try{localStorage.setItem(eventKey,JSON.stringify({type,sub,id:crypto.randomUUID()}))}catch{/* Notifications are best effort. */}
  }
  function sharedEvent():{type?:string;sub?:string}|undefined{
    try{return JSON.parse(localStorage.getItem(eventKey)||'null')||undefined}catch{return undefined}
  }
  function conflicts(user:U){const value=sharedEvent();return value?.type==='logout'||(value?.type==='login'&&value.sub!==user.profile.sub)}
  function loaded(user:U){
    if(stopped||(pendingEpoch!==undefined&&pendingEpoch!==epoch))return
    const previous=current
    current=user;invalidated=false;refreshAvailable=!!user.refresh_token
    try{if(user.profile.sid)localStorage.setItem(sidKey,user.profile.sid)}catch{/* Storage may be disabled. */}
    if(previous&&previous.profile.sub!==user.profile.sub){
      config.sessionEnded?.('account_changed')
      stopped=true;epoch++;current=null;config.changed(null)
      window.location.reload();return
    }
    config.changed(user)
    if(!previous)notify('login',user.profile.sub)
  }
  async function clear(broadcast=false,reason?:SessionEndReason){
    if(reason&&(current||refreshAvailable))config.sessionEnded?.(reason)
    epoch++;current=null;refreshAvailable=false;config.changed(null)
    await manager?.removeUser()
    try{localStorage.removeItem(sidKey)}catch{/* Storage may be disabled. */}
    if(broadcast)notify('logout')
  }
  const errorCode=(cause:unknown)=>cause&&typeof cause==='object'&&'error' in cause?String(cause.error):''
  async function renew(forceIframe=false):Promise<U|null>{
    validate()
    if(stopped)return null
    if(renewing)return renewing
    const started=epoch
    renewing=(async()=>{
      pendingEpoch=started
      let rejectedRefresh=false
      try{
        let user:U|null
        try{user=await manager!.signinSilent({forceIframeAuth:forceIframe})}
        catch(cause){
          // A duplicated tab or an older client can have a rotated refresh token.
          // Recover through the IdP cookie, never by starting a redirect loop.
          if(!forceIframe&&errorCode(cause)==='invalid_grant'){
            rejectedRefresh=true
            user=await manager!.signinSilent({forceIframeAuth:true})
          }
          else throw cause
        }
        if(started!==epoch||stopped){await manager!.removeUser();return null}
        if(user)loaded(user)
        return user
      }catch(cause){
        // An iframe unable to see IdP cookies is not evidence that a valid
        // refresh-token session ended (Safari privacy settings can block it).
        // A rejected refresh grant, however, must never restore cached tokens.
        if(started===epoch&&(rejectedRefresh||(errorCode(cause)==='login_required'&&!refreshAvailable))){invalidated=true;await clear(!!current,rejectedRefresh?'refresh_rejected':'sso_unavailable')}
        throw cause
      }finally{pendingEpoch=undefined}
    })()
    try{return await renewing}finally{renewing=undefined}
  }
  async function check(){
    if(!initialized||callbackPath||stopped||document.visibilityState==='hidden'||Date.now()-lastCheck<30000)return
    lastCheck=Date.now()
    if(current&&conflicts(current)){stopped=true;await clear(false,sharedEvent()?.type==='logout'?'remote_logout':'account_changed');window.location.reload();return}
    try{await renew(!current?.refresh_token)}catch{/* Keep an unexpired token on transient network/iframe errors. */}
  }
  const storage=(event:StorageEvent)=>{
    if(event.key!==eventKey||!event.newValue||callbackPath)return
    try{
      const value=JSON.parse(event.newValue)
      if(value.type==='logout'){stopped=true;void clear(false,'remote_logout')}
      else if(value.type==='login'&&value.sub!==current?.profile.sub){
        // Hide the previous account before any async check or workspace request.
        if(current){stopped=true;void clear(false,'account_changed');window.location.reload()}
        else{stopped=false;lastCheck=0;void check()}
      }
    }catch{/* Ignore malformed non-secret notifications. */}
  }
  const focused=()=>void check()
  const restored=(event:PageTransitionEvent)=>{if(event.persisted){lastCheck=0;void check()}}
  manager?.events.addUserLoaded(loaded)
  manager?.events.addAccessTokenExpiring(()=>{if(!stopped)void renew().catch(()=>{})})
  manager?.events.addAccessTokenExpired(()=>{if(!stopped)void renew().catch(()=>{})})
  window.addEventListener('storage',storage)
  if(config.monitor!==false){window.addEventListener('focus',focused);window.addEventListener('pageshow',restored);document.addEventListener('visibilitychange',focused)}
  async function initialize(){
    validate()
    if(window.location.pathname===root+'auth/silent'){await manager!.signinSilentCallback();return}
    if(window.location.pathname===root+'auth/frontchannel'){
      const params=new URLSearchParams(window.location.search)
      let sid:string|null=null;try{sid=localStorage.getItem(sidKey)}catch{/* No matching session. */}
      if(params.get('iss')===authority&&sid&&params.get('sid')===sid)await clear(true,'remote_logout')
      return
    }
    if(window.location.pathname===root+'auth/signed-out'){
      if(new URLSearchParams(window.location.search).has('state'))await manager!.signoutRedirectCallback()
      await clear(true,'user_logout');window.location.replace(root+'?signedOut=1');return
    }
    if(window.location.pathname===root+'auth/callback'){
      const user=await manager!.signinRedirectCallback()
      loaded(user)
      const state=user.state as {returnTo?:unknown;registration?:boolean;accountAction?:string}|undefined
      const target=new URL(safePath(state?.returnTo),origin)
      if(state?.registration&&target.pathname===root&&!target.searchParams.has('openApp'))target.searchParams.set('welcome','1')
      if(state?.accountAction){
        const result=new URLSearchParams(window.location.search).get('kc_action_status')
        target.searchParams.set('accountAction',state.accountAction)
        target.searchParams.set('actionResult',result==='success'?'success':result==='cancelled'?'cancelled':'returned')
      }
      window.location.replace(target.pathname+target.search+target.hash);return
    }
    let saved=await manager!.getUser()
    // Cross-tab login/logout notifications also survive Safari's back/forward
    // cache. Discard a previous account before restoring its workspace.
    if(saved&&conflicts(saved)){await manager!.removeUser();saved=null}
    refreshAvailable=!!saved?.refresh_token
    // Use the client's refresh grant first. Forced iframe checks on every load
    // discard working sessions when iframe cookie access is unavailable.
    try{await renew(!saved?.refresh_token)}catch(cause){
      if(!invalidated&&saved&&!saved.expired&&!conflicts(saved))loaded(saved)
      else if(!['login_required','interaction_required','consent_required','account_selection_required'].includes(errorCode(cause))&&!saved)throw new Error('统一登录暂时无法连接，请点击登录重试')
    }
    initialized=true;lastCheck=Date.now()
    if(config.monitor!==false)timer=setInterval(focused,60000)
  }
  return {
    manager,initialize(){return initializing??=(initialize().catch(cause=>{initializing=undefined;throw cause}))},
    async accessToken(force=false){
      if(force||!current||current.expired||(current.expires_in!==undefined&&current.expires_in<60))await renew()
      if(!current||current.expired)throw new Error('登录已过期，请重新登录')
      return current.access_token
    },
    async signIn(returnTo=window.location.pathname+window.location.search){validate();stopped=false;await manager!.signinRedirect({ui_locales:'zh-CN',state:{returnTo:safePath(returnTo)}})},
    async resumeSSO(returnTo:string){validate();stopped=false;await manager!.signinRedirect({prompt:'none',ui_locales:'zh-CN',state:{returnTo:safePath(returnTo)}})},
    async register(returnTo=window.location.pathname+window.location.search){validate();await manager!.signinRedirect({prompt:'create',ui_locales:'zh-CN',state:{returnTo:safePath(returnTo),registration:true}})},
    async accountAction(action:'UPDATE_EMAIL'|'UPDATE_PASSWORD'|'UPDATE_PROFILE'){
      validate();await manager!.signinRedirect({prompt:'login',max_age:0,ui_locales:'zh-CN',extraQueryParams:{kc_action:action},state:{returnTo:safePath(window.location.pathname+window.location.search),accountAction:action}})
    },
    async signOut(){
      validate();stopped=true
      const idToken=current?.id_token
      await clear(true,'user_logout')
      try{await manager!.signoutRedirect({id_token_hint:idToken})}
      catch{stopped=false;throw new Error('统一退出未完成，请重试或到账号中心结束会话')}
    },
    clear,dispose(){if(timer)clearInterval(timer);window.removeEventListener('storage',storage);window.removeEventListener('focus',focused);window.removeEventListener('pageshow',restored);document.removeEventListener('visibilitychange',focused)},
    get current(){return current},
  }
}
