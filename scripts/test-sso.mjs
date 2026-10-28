/** Live protocol test, not browser UI automation. Uses an isolated cookie jar. */
import {randomBytes,createHash} from 'node:crypto'
import {writeFileSync} from 'node:fs'
if(!process.env.WTG_PUBLIC_ORIGIN)throw new Error('Set WTG_PUBLIC_ORIGIN to the deployed HTTPS origin')
const origin=new URL(process.env.WTG_PUBLIC_ORIGIN).origin
const issuer=origin+'/identity/realms/personal',cookies=new Map(),checks=[]
function ensure(condition,message){if(!condition)throw new Error(message)}
function pass(message){checks.push(message);console.log('PASS '+message)}
ensure(process.env.WTG_USERNAME&&process.env.WTG_PASSWORD,'Set WTG_USERNAME and WTG_PASSWORD; credentials are never logged')
async function request(url,options={}){
  ensure(new URL(url).origin===origin,'Requests must stay on the configured HTTPS origin')
  const response=await fetch(url,{...options,redirect:'manual',headers:{...options.headers,Cookie:[...cookies].map(([k,v])=>k+'='+v).join('; ')},signal:AbortSignal.timeout(25000)})
  for(const entry of response.headers.getSetCookie()){
    const pair=entry.split(';')[0],index=pair.indexOf('=')
    if(index>0)cookies.set(pair.slice(0,index),pair.slice(index+1))
  }
  return response
}
const clients=[{id:'portal-web',prefix:'/',audience:'portal-api',api:'/identity/realms/personal/account/'},{id:'smartledger-web',prefix:'/ledger/',audience:'smartledger-api',api:'/ledger-api/api/v1/books'},{id:'travel-web',prefix:'/travel/',audience:'wheretogo-api',api:'/travel-api/api/v1/trips'}]
async function authorize(client,{silent=false,anonymous=false,scope='openid profile email',callbackPrefix=client.prefix}={}){
  const verifier=randomBytes(32).toString('base64url'),state=randomBytes(16).toString('hex')
  const redirect=origin+callbackPrefix+'auth/'+(silent?'silent':'callback')
  const params=new URLSearchParams({client_id:client.id,redirect_uri:redirect,response_type:'code',scope,state,nonce:randomBytes(16).toString('hex'),code_challenge:createHash('sha256').update(verifier).digest('base64url'),code_challenge_method:'S256'})
  if(silent)params.set('prompt','none')
  let response=await request(issuer+'/protocol/openid-connect/auth?'+params)
  let usedPassword=false
  if(response.status===200){
    ensure(!silent,'Silent SSO must never display a credentials form')
    const html=await response.text(),tag=html.match(/<form\b[^>]*id="kc-form-login"[^>]*>/)?.[0]
    ensure(tag,'Expected initial login form')
    const action=tag.match(/action="([^"]+)"/)?.[1].replaceAll('&amp;','&').replaceAll('&quot;','"')
    ensure(action,'Expected login action')
    response=await request(action,{method:'POST',body:new URLSearchParams({username:process.env.WTG_USERNAME,password:process.env.WTG_PASSWORD,credentialId:''})})
    usedPassword=true
  }
  let location=response.headers.get('location')
  for(let hop=0;hop<6&&location&&!location.startsWith(redirect+'?');hop++){
    response=await request(new URL(location,issuer));location=response.headers.get('location')
  }
  ensure(location?.startsWith(redirect+'?'),'Expected registered callback')
  const callback=new URL(location)
  ensure(callback.searchParams.get('state')===state,'Authorization state must match')
  if(anonymous){ensure(callback.searchParams.get('error')==='login_required','Signed-out silent request must return login_required');return}
  ensure(!callback.searchParams.has('error')&&callback.searchParams.has('code'),'Expected successful authorization')
  const tokenResponse=await request(issuer+'/protocol/openid-connect/token',{method:'POST',headers:{Origin:origin},body:new URLSearchParams({grant_type:'authorization_code',client_id:client.id,redirect_uri:redirect,code:callback.searchParams.get('code'),code_verifier:verifier})})
  ensure(tokenResponse.status===200,'PKCE token exchange must succeed')
  const token=await tokenResponse.json(),claims=JSON.parse(Buffer.from(token.access_token.split('.')[1],'base64url'))
  ensure(claims.iss===issuer,'Correct issuer')
  ensure([claims.aud].flat().includes(client.audience),'Correct application audience')
  return {token,claims,usedPassword}
}
async function refresh(client,token){
  const response=await request(issuer+'/protocol/openid-connect/token',{method:'POST',body:new URLSearchParams({grant_type:'refresh_token',client_id:client.id,refresh_token:token.refresh_token})})
  ensure(response.status===200,'Token rotation must succeed independently for '+client.id)
  return response.json()
}
await authorize(clients[1],{silent:true,anonymous:true});pass('匿名进入子应用：静默认证返回未登录，不显示登录表单')
const portal=await authorize(clients[0]);ensure(portal.usedPassword,'Initial portal login must authenticate');pass('门户首次登录：真实账号、授权码及 PKCE 验证通过')
const ledger=await authorize(clients[1],{silent:true}),travel=await authorize(clients[2],{silent:true})
ensure(!ledger.usedPassword&&portal.claims.sub===ledger.claims.sub&&portal.claims.sid===ledger.claims.sid,'Both apps must share the same IdP user session')
pass('门户 → 记账：prompt=none，无二次密码输入，同一账号及 SSO 会话')
for(const client of [clients[1],clients[2]]){
  const managed=await authorize(client,{silent:true,callbackPrefix:'/'})
  ensure(managed.claims.sub===portal.claims.sub&&managed.claims.sid===portal.claims.sid,'Managed service grants must retain the portal identity')
  const path=client.id==='travel-web'?'/travel-api/api/v1/account/providers':'/ledger-api/api/v1/sync/nutstore/credentials'
  ensure((await request(origin+path,{headers:{Authorization:'Bearer '+managed.token.access_token}})).status===200,'Managed service account settings must accept their own app token')
}
pass('门户账号中心：旅游和记账分别授权到门户静默回调，使用各自令牌读取设置')
ensure((await request(origin+'/identity/realms/personal/account/',{headers:{Authorization:'Bearer '+portal.token.access_token}})).status===200,'Central profile must remain available')
pass('统一账号资料：门户自身的 account audience 可读取资料')
for(let i=0;i<3;i++)for(const client of clients){
  const result=await authorize(client,{silent:true})
  ensure(result.claims.sub===portal.claims.sub&&result.claims.sid===portal.claims.sid&&!result.usedPassword,'Repeated application switches must retain the SSO session')
}
pass('门户、旅行及记账反复切换：9 次静默授权均通过')
const openidOnly=await authorize(clients[1],{silent:true,scope:'openid'})
ensure(openidOnly.claims.sub===portal.claims.sub,'Session-only scope must retain the subject');pass('会话检查使用的 openid 授权仍识别为同一账号')
let portalToken=portal.token,travelToken=travel.token,ledgerToken=ledger.token
for(let i=0;i<3;i++){portalToken=await refresh(clients[0],portalToken);travelToken=await refresh(clients[2],travelToken);ledgerToken=await refresh(clients[1],ledgerToken)}
pass('门户及两应用分别续期并轮换 refresh token：9 次通过')
for(const [client,token] of [[clients[0],portalToken],[clients[2],travelToken],[clients[1],ledgerToken]]){
  ensure((await request(origin+client.api,{headers:{Authorization:'Bearer '+token.access_token}})).status===200,'Refreshed token must read its own API')
}
ensure((await request(origin+clients[1].api,{headers:{Authorization:'Bearer '+travelToken.access_token}})).status===401,'Travel token must not access ledger API')
ensure((await request(origin+clients[2].api,{headers:{Authorization:'Bearer '+ledgerToken.access_token}})).status===401,'Ledger token must not access travel API')
for(const client of [clients[1],clients[2]])ensure((await request(origin+client.api,{headers:{Authorization:'Bearer '+portalToken.access_token}})).status===401,'Portal token must not be used as an application business token')
pass('续期后 API 可用；门户、旅游、记账 token 的 audience 隔离保持有效')
let logout=await request(issuer+'/protocol/openid-connect/logout?'+new URLSearchParams({client_id:clients[0].id,id_token_hint:portalToken.id_token,post_logout_redirect_uri:origin+'/auth/signed-out',state:randomBytes(16).toString('hex')}))
let logoutTarget=logout.headers.get('location')
if(logout.status!==302){
  const html=await logout.text()
  // Keycloak renders a front-channel logout page before its final redirect.
  // Follow its explicit continuation link without executing browser JavaScript.
  const anchor=html.match(/<a\b[^>]*id="continue"[^>]*>/)?.[0]
  logoutTarget=anchor?.match(/href="([^"]+)"/)?.[1].replaceAll('&amp;','&')
  ensure(logoutTarget&&new URL(logoutTarget).origin===origin,'Expected a same-origin logout continuation')
  if(!logoutTarget.startsWith(origin+'/auth/signed-out?')){
    logout=await request(logoutTarget);logoutTarget=logout.headers.get('location')
  }
}
ensure(logoutTarget?.startsWith(origin+'/auth/signed-out?'),'Unified logout must finish at a registered callback')
for(const client of clients)await authorize(client,{silent:true,anonymous:true})
pass('统一退出后：门户与记账均无法静默恢复已退出的 SSO 会话')
if(process.env.WTG_SSO_REPORT)writeFileSync(process.env.WTG_SSO_REPORT,JSON.stringify({checkedAt:new Date().toISOString(),origin,method:'HTTPS OIDC protocol checks; no browser UI automation',checks},null,2))
console.log(`SSO protocol checks passed: ${checks.length}`)
