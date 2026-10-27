import { UserManager, WebStorageStateStore, type User } from 'oidc-client-ts'

/** Each app keeps its own audience-bound token; the identity provider owns the SSO session. */
export function createIdentitySession(config:{authority:string;clientId:string;audience:string;allowLoopback:boolean;basePath?:string;returnPath:(path:string)=>boolean;changed:(user:User|null)=>void}) {
  const authority=config.authority.replace(/\/$/,'')
  const origin=window.location.origin
  const base=new URL(config.basePath||'/',origin)
  if(base.origin!==origin||base.search||base.hash)throw new Error('应用基础路径无效')
  const root=base.pathname.replace(/\/?$/,'/')
  const storagePrefix=`personal-identity:${authority}:${config.clientId}:`
  const logoutKey=storagePrefix+'logout'
  const sidKey=storagePrefix+'sid'
  const manager=authority&&config.clientId?new UserManager({
    authority,client_id:config.clientId,response_type:'code',scope:'openid profile email',
    redirect_uri:origin+root+'auth/callback',silent_redirect_uri:origin+root+'auth/silent',
    post_logout_redirect_uri:origin+root+'auth/signed-out',
    automaticSilentRenew:true,monitorSession:true,checkSessionIntervalInSeconds:5,
    userStore:new WebStorageStateStore({store:window.sessionStorage}),
    stateStore:new WebStorageStateStore({store:window.sessionStorage}),
    extraQueryParams:{audience:config.audience},
  }):null
  let current:User|null=null
  let checking=false
  let stopped=false
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
  function loaded(user:User){
    const changed=current&&current.profile.sub!==user.profile.sub
    current=user
    try{if(user.profile.sid)localStorage.setItem(sidKey,String(user.profile.sid))}catch{/* Session monitoring remains enabled. */}
    if(changed){window.location.reload();return}
    config.changed(user)
  }
  async function clear(broadcast=false){
    current=null
    await manager?.removeUser()
    try{localStorage.removeItem(sidKey);if(broadcast)localStorage.setItem(logoutKey,crypto.randomUUID())}catch{/* Storage may be disabled. */}
    config.changed(null)
  }
  manager?.events.addUserLoaded(loaded)
  manager?.events.addUserSignedOut(()=>clear(true))
  manager?.events.addUserSessionChanged(()=>clear(true))
  manager?.events.addAccessTokenExpired(()=>clear())
  // Recheck IdP state when returning to an app; browsers may suspend iframe polling in background tabs.
  async function check(){
    if(!manager||!current||checking||stopped||document.visibilityState==='hidden')return
    checking=true
    try{const session=await manager.querySessionStatus();if(!session||session.sub!==current.profile.sub)await clear(true)}
    catch(cause){if(cause&&typeof cause==='object'&&'error' in cause&&['login_required','interaction_required','session_selection_required'].includes(String(cause.error)))await clear(true)}
    finally{checking=false}
  }
  window.addEventListener('storage',event=>{if(event.key===logoutKey)void clear()})
  window.addEventListener('focus',()=>void check())
  document.addEventListener('visibilitychange',()=>void check())
  return {
    manager,
    async initialize(){
      validate()
      if(window.location.pathname===root+'auth/silent'){await manager!.signinSilentCallback();return}
      if(window.location.pathname===root+'auth/frontchannel'){
        const params=new URLSearchParams(window.location.search)
        let sid:string|null=null;try{sid=localStorage.getItem(sidKey)}catch{/* No matching session. */}
        if(params.get('iss')===authority&&sid&&params.get('sid')===sid)await clear(true)
        return
      }
      if(window.location.pathname===root+'auth/signed-out'){
        if(new URLSearchParams(window.location.search).has('state'))await manager!.signoutRedirectCallback()
        await clear(true);window.location.replace(root+'?signedOut=1');return
      }
      if(window.location.pathname===root+'auth/callback'){
        const user=await manager!.signinRedirectCallback()
        loaded(user)
        const state=user.state as {returnTo?:unknown;registration?:boolean}|undefined
        const target=new URL(safePath(state?.returnTo),origin)
        if(state?.registration&&target.pathname===root&&!target.searchParams.has('openApp'))target.searchParams.set('welcome','1')
        window.location.replace(target.pathname+target.search+target.hash);return
      }
      const saved=await manager!.getUser()
      if(saved&&!saved.expired){loaded(saved);await check()}else await clear()
    },
    async signIn(returnTo=window.location.pathname+window.location.search){validate();await manager!.signinRedirect({ui_locales:'zh-CN',state:{returnTo:safePath(returnTo)}})},
    async register(returnTo=window.location.pathname+window.location.search){validate();await manager!.signinRedirect({prompt:'create',ui_locales:'zh-CN',state:{returnTo:safePath(returnTo),registration:true}})},
    async signOut(){
      validate();stopped=true
      const idToken=current?.id_token
      await clear(true)
      try{await manager!.signoutRedirect({id_token_hint:idToken})}
      catch{stopped=false;throw new Error('统一退出未完成，请重试或到账号中心结束会话')}
    },
    clear,
    get current(){return current},
  }
}
