// Public HTTPS acceptance checks. Creates isolated QA accounts; never logs passwords/tokens.
// Install frontend dependencies first. See docs/账号注册与验收.md for cleanup instructions.
import { randomBytes, createHash } from 'node:crypto'
import { createRequire } from 'node:module'
import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { accountAcceptance } from './account-acceptance.mjs'
const require=createRequire(new URL('../apps/portal/package.json',import.meta.url))
const {JSDOM}=require('jsdom')
const origin=new URL(process.env.WTG_PUBLIC_ORIGIN||'https://personal-45-205-23-125.sslip.io').origin
if(!process.argv.includes('--create-test-accounts'))throw Error('Pass --create-test-accounts to authorize isolated test accounts')
if(!origin.startsWith('https://'))throw Error('An HTTPS public origin is required')
const issuer=origin+'/identity/realms/personal'
const runId='qa-reg-'+Date.now()+'-'+randomBytes(3).toString('hex')
const report={origin,runId,checkedAt:new Date().toISOString(),users:[],checks:[],success:false,method:'HTTPS form submissions, real PKCE/SSO and database API checks; not browser rendering'}
const reportFile=resolve(process.env.WTG_REGISTRATION_REPORT||'.local/registration-report.json')
mkdirSync(resolve(reportFile,'..'),{recursive:true})
function save(){writeFileSync(reportFile,JSON.stringify(report,null,2))}
function assert(value,message){if(!value)throw Error(message)}
function pass(message){report.checks.push(message);console.log('PASS '+message);save()}
function page(html){return new JSDOM(html).window.document}
function client(){
  const jar=new Map()
  return async (url,options={})=>{
    url=new URL(url,origin)
    assert(new URL(url,origin).origin===origin,'Request must stay on the selected origin')
    const r=await fetch(url,{...options,redirect:'manual',headers:{...options.headers,Cookie:[...jar].map(([k,v])=>k+'='+v).join('; ')},signal:AbortSignal.timeout(30000)})
    for(const cookie of r.headers.getSetCookie()){
      const pair=cookie.split(';')[0],at=pair.indexOf('=')
      if(at>0)jar.set(pair.slice(0,at),pair.slice(at+1))
    }
    return r
  }
}
async function follow(request,response,stop){
  for(let step=0;step<8;step++){
    const location=response.headers.get('location')
    if(!location||stop?.(new URL(location,origin)))return response
    response=await request(new URL(location,origin))
  }
  throw Error('Too many redirects')
}
async function begin(request,kind='login',ledger=false,extra={}){
  const verifier=randomBytes(32).toString('base64url'),state=randomBytes(16).toString('hex')
  const app=ledger==='travel'?'travel':ledger?'ledger':'portal'
  const clientId={portal:'portal-web',travel:'travel-web',ledger:'smartledger-web'}[app],redirect=origin+{portal:'/',travel:'/travel/',ledger:'/ledger/'}[app]+'auth/callback'
  const params=new URLSearchParams({client_id:clientId,redirect_uri:redirect,response_type:'code',scope:'openid profile email',ui_locales:'zh-CN',state,code_challenge:createHash('sha256').update(verifier).digest('base64url'),code_challenge_method:'S256'})
  if(kind==='register')params.set('prompt','create')
  for(const [key,value] of Object.entries(extra))params.set(key,value)
  const response=await request(issuer+'/protocol/openid-connect/auth?'+params)
  return {request,response,verifier,state,clientId,redirect}
}
async function exchange(flow,response){
  response=await follow(flow.request,response,url=>url.href.startsWith(flow.redirect+'?'))
  const location=response.headers.get('location')
  assert(location?.startsWith(flow.redirect+'?'),'Expected authorization code callback; HTTP '+response.status)
  const callback=new URL(location)
  assert(callback.searchParams.get('state')===flow.state,'OIDC state must match')
  assert(callback.searchParams.has('code'),'Callback must contain a code')
  const result=await flow.request(issuer+'/protocol/openid-connect/token',{method:'POST',body:new URLSearchParams({grant_type:'authorization_code',client_id:flow.clientId,redirect_uri:flow.redirect,code:callback.searchParams.get('code'),code_verifier:flow.verifier})})
  assert(result.status===200,'PKCE token exchange failed')
  const token=(await result.json()).access_token,claims=JSON.parse(Buffer.from(token.split('.')[1],'base64url'))
  assert(claims.iss===issuer,'Unexpected token issuer')
  assert(!claims.realm_access?.roles?.includes('portal-admin')&&!claims.portal_roles?.includes('portal-admin'),'Registration must not grant administrator access')
  return {token,claims}
}
function newAccount(suffix){
  const user={username:runId+'-'+suffix,email:runId+'-'+suffix+'@example.invalid',password:'Aa1!'+randomBytes(24).toString('base64url')}
  report.users.push({username:user.username});save()
  return user
}
async function submitRegistration(flow,user,overrides={}){
  assert(flow.response.status===200,'Registration page must load')
  const doc=page(await flow.response.text()),form=doc.querySelector('#kc-register-form')
  assert(form,'Registration form is missing')
  const data=new URLSearchParams()
  for(const input of form.querySelectorAll('input[type=hidden][name]'))data.set(input.name,input.value)
  for(const [key,value] of Object.entries({username:user.username,email:user.email,password:user.password,'password-confirm':user.password,...overrides}))data.set(key,value)
  return flow.request(form.action,{method:'POST',body:data})
}
async function register(user,ledger=false){
  const flow=await begin(client(),'register',ledger)
  const result=await exchange(flow,await submitRegistration(flow,user))
  report.users.find(item=>item.username===user.username).subject=result.claims.sub;save()
  return {...result,request:flow.request}
}
async function login(user,useEmail=false,app=false){
  const flow=await begin(client(),'login',app)
  const doc=page(await flow.response.text()),form=doc.querySelector('#kc-form-login')
  assert(form,'Login form is missing')
  return exchange(flow,await flow.request(form.action,{method:'POST',body:new URLSearchParams({username:useEmail?user.email:user.username,password:user.password,credentialId:''})}))
}
async function invalid(user,overrides,label){
  const flow=await begin(client(),'register')
  const result=await submitRegistration(flow,user,overrides)
  assert(result.status===200,label+' must be rejected without creating a session')
  const doc=page(await result.text())
  assert(doc.querySelector('#kc-register-form'),label+' must stay on registration')
  assert(doc.querySelector('[aria-invalid=true],.pf-m-danger,.pf-m-error'),label+' must show a validation error')
  assert(doc.querySelector('[name=username]')?.value===(overrides.username||user.username),label+' must preserve the username')
  assert(!doc.querySelector('[name=password]')?.value,label+' must not echo the password')
  pass(label+' is rejected with field feedback and preserved input')
}
async function api(prefix,path,token,options={}){
  return fetch(origin+prefix+path,{...options,redirect:'error',headers:{...(token?{Authorization:'Bearer '+token}:{}),...(options.body?{'Content-Type':'application/json'}:{})},signal:AbortSignal.timeout(30000)})
}
async function status(response,expected,label){assert(response.status===expected,label+' returned HTTP '+response.status+' instead of '+expected);return response}
save()
try{
  const initial=await begin(client()),doc=page(await initial.response.text()),entry=doc.querySelector('#kc-registration a.personal-registration-link')
  assert(entry?.textContent.includes('创建账号'),'Login must offer a prominent registration entry')
  const reg=await initial.request(entry.href),regDoc=page(await reg.text())
  assert(regDoc.querySelector('#kc-register-form'),'Login registration link must open the form')
  assert(!regDoc.querySelector('.personal-optional-fields')?.hasAttribute('open'),'Optional profile fields must start collapsed')
  assert(regDoc.querySelector('#personal-password-hint'),'Registration must show password guidance')
  const cssHref=[...regDoc.querySelectorAll('link[rel=stylesheet]')].find(link=>link.href.includes('personal.css'))?.href
  assert(cssHref,'Custom login styles must be included')
  const css=await (await initial.request(cssHref)).text()
  assert(css.includes('.pf-v5-theme-dark')&&css.includes('@media(max-width:480px)'),'Responsive dark mode styles must be present')
  pass('Login registration entry, optional profile collapse, password guidance and responsive theme resources')

  const first=newAccount('a'),second=newAccount('b'),bad=newAccount('invalid')
  await invalid(bad,{username:'ab'},'Short username')
  await invalid(bad,{email:'invalid-email'},'Invalid email')
  await invalid(bad,{password:'short','password-confirm':'short'},'Weak password')
  await invalid(bad,{'password-confirm':'DifferentPassword123!'},'Password confirmation mismatch')
  const a=await register(first)
  pass('Portal registration succeeds with username/email/password only, automatic login and no administrator role')
  await invalid(second,{username:first.username},'Duplicate username')
  await invalid(second,{email:first.email},'Duplicate email')
  const ledgerFlow=await begin(a.request,'login',true),ledgerA=await exchange(ledgerFlow,ledgerFlow.response)
  assert(ledgerA.claims.sub===a.claims.sub,'Both clients must use the same account')
  pass('New portal account enters SmartLedger using SSO without another password')
  const ledgerB=await register(second,true),travelFlow=await begin(ledgerB.request),b=await exchange(travelFlow,travelFlow.response)
  assert(b.claims.sub===ledgerB.claims.sub,'Reverse SSO subject must match')
  pass('Direct SmartLedger registration and reverse SSO into travel succeed')
  assert((await login(first)).claims.sub===a.claims.sub,'Username login failed')
  assert((await login(first,true)).claims.sub===a.claims.sub,'Email login failed')
  pass('New account can sign in again with username or email')

  const travelAFlow=await begin(a.request,'login','travel'),travelA=await exchange(travelAFlow,travelAFlow.response)
  const travelBFlow=await begin(ledgerB.request,'login','travel'),travelB=await exchange(travelBFlow,travelBFlow.response)
  for(const [prefix,token] of [['/travel-api',travelA.token],['/ledger-api',ledgerA.token]]){
    const info=await (await status(await api(prefix,'/api/v1/system/info',token),200,'New account API admission')).json()
    assert(!info.localDevelopment&&info.accessPolicy==='authenticated-users','Public registration admission policy must be active')
    await status(await api(prefix,prefix==='/travel-api'?'/api/v1/trips':'/api/v1/books'),401,'Anonymous API request')
  }
  pass('Both production APIs accept registered users and reject anonymous requests')
  await status(await api('/travel-api','/api/v1/trips',ledgerA.token),401,'Wrong travel audience')
  await status(await api('/ledger-api','/api/v1/books',a.token),401,'Wrong ledger audience')
  pass('Tokens remain restricted to their application audience')

  const trip=await (await status(await api('/travel-api','/api/v1/trips',travelA.token,{method:'POST',body:JSON.stringify({name:'Registration QA',destination:'Hong Kong',startsOn:'2026-11-01',endsOn:'2026-11-02'})}),201,'Create trip')).json()
  await status(await api('/travel-api','/api/v1/trips/'+trip.id,travelA.token),200,'Read own trip')
  await status(await api('/travel-api','/api/v1/trips/'+trip.id,travelB.token),404,'Read another account trip')
  await status(await api('/travel-api','/api/v1/trips/'+trip.id,travelB.token,{method:'DELETE'}),404,'Delete another account trip')
  const tripList=await (await api('/travel-api','/api/v1/trips',travelB.token)).json()
  assert(!tripList.some(item=>item.id===trip.id),'Trip list must not leak another account data')
  await status(await api('/travel-api','/api/v1/trips/'+trip.id,travelA.token,{method:'DELETE'}),204,'Delete own trip')
  pass('New travel account can create/read/delete; another account cannot read or delete its trip')
  const book=await (await status(await api('/ledger-api','/api/v1/books',ledgerA.token,{method:'POST',body:JSON.stringify({name:'Registration QA book'})}),201,'Create book')).json()
  await status(await api('/ledger-api','/api/v1/books/'+book.id,ledgerA.token),200,'Read own book')
  await status(await api('/ledger-api','/api/v1/books/'+book.id,ledgerB.token),404,'Read another account book')
  assert(!(await (await api('/ledger-api','/api/v1/books',ledgerB.token)).json()).some(item=>item.id===book.id),'Book list must not leak data')
  const snapshot={schemaVersion:1,books:[],transactions:[],categories:[],settings:{qaMarker:runId}}
  await status(await api('/ledger-api','/api/v1/sync/snapshot',ledgerA.token,{method:'PUT',body:JSON.stringify({schemaVersion:1,expectedRevision:0,snapshot})}),200,'Write own cloud snapshot')
  const own=await (await api('/ledger-api','/api/v1/sync/snapshot',ledgerA.token)).json()
  const other=await (await api('/ledger-api','/api/v1/sync/snapshot',ledgerB.token)).json()
  assert(own.snapshot.settings.qaMarker===runId&&other.snapshot===null,'Cloud snapshots must be isolated')
  pass('New ledger account can create a book and persist a cloud snapshot; another account cannot read either')
  for(const path of ['/','/travel/','/ledger/']){
    const r=await fetch(origin+path,{redirect:'error'})
    assert(r.status===200&&r.headers.has('content-security-policy'),'HTTPS application page '+path)
  }
  for(const path of ['/identity/admin/','/identity/realms/master/.well-known/openid-configuration','/travel-api/actuator/env','/ledger-api/actuator/env'])await status(await fetch(origin+path,{redirect:'manual'}),404,'Private route '+path)
  pass('Application pages and CSP are available; identity administration and diagnostic routes remain private')
  if(process.argv.includes('--account-checks'))await accountAcceptance({origin,issuer,runId,first,second,ledgerA,ledgerB,begin,exchange,login,client,pass,assert})
  report.success=true;save()
  console.log('Acceptance complete. Clean up ONLY the QA usernames listed in '+reportFile)
}catch(error){report.error=error.message;save();throw error}
