/** Application registration is data. Never import another application's business code. */
export interface ApplicationDefinition {
  id:string;name:string;label:string;title:string;description:string;kind:'travel'|'ledger'|'tool'
  path:string;devPort:number;clientId:string;audience:string;features:string[];enabled?:boolean
}
export const applicationCatalog:ApplicationDefinition[]=[
  {id:'travel',name:'WhereToGo',label:'旅行与探索',title:'下一站，去哪里？',description:'收藏想去的地点，安排每一天的行程，把旅行灵感变成出发的计划。',kind:'travel',path:'/travel/',devPort:5175,clientId:'travel-web',audience:'wheretogo-api',features:['地点收藏','行程规划','旅行账本']},
  {id:'ledger',name:'SmartLedger',label:'账本与生活',title:'每一笔，都清楚。',description:'日常收支与旅行费用，各有归属。截图识别、预算与云同步，记录更轻松。',kind:'ledger',path:'/ledger/',devPort:5174,clientId:'smartledger-web',audience:'smartledger-api',features:['独立账本','截图识别','预算管理']},
]
type Environment=Record<string,string|boolean|undefined>
export interface RegisteredApplication extends ApplicationDefinition {url:string;apiUrl:string}
export function createPlatform(env:Environment,origin:string,development=false){
  const here=new URL(origin),local=['localhost','127.0.0.1','[::1]'].includes(here.hostname)
  function address(value:string){
    const url=new URL(value,origin)
    if(url.username||url.password||url.search||url.hash||!(url.protocol==='https:'||(development&&url.protocol==='http:'&&['localhost','127.0.0.1','[::1]'].includes(url.hostname))))throw new Error('应用地址必须是 HTTPS；本机开发仅允许回环 HTTP')
    return url
  }
  function fallback(path:string,port:number){const url=new URL(path,origin);if(development&&local){url.port=String(port);url.pathname='/'}return url.href}
  const portal=address(String(env.VITE_PORTAL_PUBLIC_URL||fallback('/',5173))).href.replace(/\/?$/,'/')
  const configured=env.VITE_APPLICATIONS_JSON?JSON.parse(String(env.VITE_APPLICATIONS_JSON)):[]
  if(!Array.isArray(configured))throw new Error('应用注册表必须为数组')
  const definitions=[...applicationCatalog,...configured] as (ApplicationDefinition&{url?:string;apiUrl?:string})[]
  const seen=new Set<string>()
  const applications:RegisteredApplication[]=definitions.map(app=>{
    if(!/^[a-z][a-z0-9-]{0,39}$/.test(app.id)||app.id==='portal'||seen.has(app.id))throw new Error('应用标识无效或重复')
    seen.add(app.id)
    if(!app.name||!app.clientId||!app.audience||!['travel','ledger','tool'].includes(app.kind)||!Array.isArray(app.features))throw new Error('应用注册信息不完整')
    const override=app.id==='travel'?env.VITE_WHERE_TO_GO_PUBLIC_URL:app.id==='ledger'?env.VITE_SMARTLEDGER_PUBLIC_URL:app.url
    const url=address(String(override||fallback(app.path,app.devPort))).href.replace(/\/?$/,'/')
    const api=app.id==='travel'?env.VITE_API_BASE_URL:app.id==='ledger'?env.VITE_SMARTLEDGER_API_URL:app.apiUrl
    const apiFallback=app.id==='travel'?fallback('/travel-api',8080):app.id==='ledger'?fallback('/ledger-api',8090):''
    const apiUrl=String(api||apiFallback).replace(/\/$/,'')
    if(apiUrl&&!apiUrl.startsWith('/'))address(apiUrl)
    if(apiUrl.startsWith('//'))throw new Error('API 地址不能使用相对协议')
    return {...app,url,apiUrl}
  }).filter(app=>app.enabled!==false)
  function application(id:string){const app=applications.find(app=>app.id===id);if(!app)throw new Error('应用尚未注册或已停用');return app}
  function launchTarget(id:string,returnTo?:string|null){
    const app=application(id),base=new URL(app.url),target=new URL(returnTo||app.url,app.url)
    if(target.username||target.password||target.origin!==base.origin||!target.pathname.startsWith(base.pathname)||/%(?:2f|5c|00|25)/i.test(target.pathname)||/^auth(?:\/|$)/.test(target.pathname.slice(base.pathname.length)))throw new Error('应用返回地址无效')
    return target
  }
  function loginUrl(id:string,returnTo:string,intent:'login'|'register'='login'){
    const target=launchTarget(id,returnTo),url=new URL('login/',portal)
    url.search=new URLSearchParams({app:id,returnTo:target.pathname+target.search+target.hash,intent}).toString()
    return url.href
  }
  return {portalUrl:portal,accountUrl:new URL('account/',portal).href,applications,application,launchTarget,loginUrl,authMode:env.VITE_AUTH_MODE==='standalone'?'standalone':'portal'}
}
export function browserPlatform(env:Environment){return createPlatform(env,window.location.origin,env.DEV===true)}
