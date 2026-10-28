/** Production JavaScript rendering in a simulated DOM. No live credentials or network.
 * This validates compiled view/gate wiring; it is not browser visual acceptance.
 */
import {createRequire} from 'node:module'
import {readFileSync} from 'node:fs'
import {resolve} from 'node:path'
import {pathToFileURL} from 'node:url'
const require=createRequire(new URL('../apps/portal/package.json',import.meta.url)),{JSDOM}=require('jsdom')
const args=process.argv.slice(2),at=args.indexOf('--bundle-dir')
const folder=resolve(at>=0?args[at+1]:'apps/portal/dist'),origin=process.env.WTG_PUBLIC_ORIGIN
if(!origin)throw Error('Set WTG_PUBLIC_ORIGIN to the origin used when building the bundle')
const html=readFileSync(resolve(folder,'index.html'),'utf8'),script=html.match(/<script[^>]*src="([^"]+)"/)?.[1]
if(!script||!script.startsWith('/'))throw Error('Expected a built portal module entry')
const entry=resolve(folder,script.slice(1))
if(!entry.startsWith(folder+'/')&&!entry.startsWith(folder+'\\'))throw Error('Bundle entry must remain inside the build directory')
const dom=new JSDOM('<div id="app"></div>',{url:origin+'/account/'})
for(const name of ['window','document','navigator','HTMLElement','Element','SVGElement','Node','MutationObserver','history','location','sessionStorage','localStorage','StorageEvent','Event','CustomEvent'])Object.defineProperty(globalThis,name,{configurable:true,value:name==='window'?dom.window:dom.window[name]})
const append=dom.window.Element.prototype.appendChild
dom.window.Element.prototype.appendChild=function(child){const result=append.call(this,child);if(child.tagName==='LINK')queueMicrotask(()=>child.dispatchEvent(new dom.window.Event('load')));return result}
const authority=origin+'/identity/realms/personal'
for(const client of ['portal-web','travel-web','smartledger-web'])sessionStorage.setItem('oidc.user:'+authority+':'+client,JSON.stringify({access_token:'dummy-account-bundle-token',token_type:'Bearer',scope:'openid profile email',profile:{iss:authority,sub:'alice',preferred_username:'alice',email:'alice@example.invalid',sid:'dummy-session'},expires_at:Math.floor(Date.now()/1000)+3600}))
globalThis.fetch=async input=>{
 const url=typeof input==='string'?input:input?.url||String(input)
 if(url.includes('/assets/'))return new Response('')
 const result=url.endsWith('/account/sessions')?[{id:'dummy-device',current:true,browser:'Test browser',lastAccess:Date.now(),clients:[]}]:url.endsWith('/account/')?{id:'alice',username:'alice',email:'alice@example.invalid'}:url.endsWith('/account/providers')?{available:true,encryption:'AES-256-GCM',providers:[]}:url.endsWith('/sync/nutstore/credentials')?{available:true,configured:false}:undefined
 if(!result)throw Error('Simulated unavailable iframe metadata; network requests are disabled')
 return new Response(JSON.stringify(result),{headers:{'content-type':'application/json'}})
}
const ensure=(condition,message)=>{if(!condition)throw Error(message)}
const settle=()=>new Promise(done=>setTimeout(done,20))
try{
 await import(pathToFileURL(entry).href)
 for(let step=0;step<150&&!document.querySelector('.account-app-launch');step++)await settle()
 ensure(document.querySelectorAll('.account-app-launch').length>=2,'Compiled account page did not render application cards')
 for(const [name,selector] of [['个人资料','input[autocomplete=given-name]'],['登录安全','.account-list'],['AI 与地图 Key','.account-provider-grid'],['记账与云同步','input[type=email]']]){
  const button=[...document.querySelectorAll('.account-tabs button')].find(item=>item.textContent.includes(name))
  ensure(button,'Missing account navigation: '+name);button.click();await settle()
  ensure(document.querySelector(selector),'Compiled account section did not render: '+name)
 }
 ensure(!document.querySelector('.platform-page-state'),'Account page entered an unexpected recovery screen')
 console.log('PASS production portal JavaScript: account gate, application cards and four settings sections render in a simulated DOM; all API data is fake')
 dom.window.close();process.exit(0)
}catch(cause){console.error(cause instanceof Error?cause.message:'Production portal rendering failed');dom.window.close();process.exit(1)}
