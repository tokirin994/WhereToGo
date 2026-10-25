// Explicit integration test. Receives all credentials through process environment, never prints them.
// Uses two disposable registered users and one unique cloud file, then removes only its own test data.
import assert from 'node:assert/strict'
import { createHash, randomBytes, createDecipheriv } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { createInitialSnapshot, createTransaction } from '../smartledger/frontend/src/ledger.ts'

const issuer='http://localhost:8091/realms/local'
const api='http://localhost:8090'
const supplied={username:process.env.NUTSTORE_TEST_USERNAME,appPassword:process.env.NUTSTORE_TEST_PASSWORD}
if(!supplied.username||!supplied.appPassword||!process.env.IDENTITY_TEST_ADMIN_PASSWORD||!process.env.LEDGER_TEST_DB_PASSWORD)throw new Error('Configure the transient test credentials first')
const results=[],users=[]
let adminToken,accessToken,cloudPath,cloudUploaded=false
function pass(name){results.push({name,result:'PASS'});console.log('PASS '+name)}
function decode(text){return text.replace(/&amp;/g,'&').replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/&lt;/g,'<').replace(/&gt;/g,'>')}
class Session{
  cookies=new Map()
  async request(url,options={}){
    const response=await fetch(url,{...options,redirect:'manual',signal:AbortSignal.timeout(45000),headers:{...options.headers,Cookie:[...this.cookies].map(([name,value])=>`${name}=${value}`).join('; ')}})
    for(const cookie of response.headers.getSetCookie()){
      const pair=cookie.split(';',1)[0],at=pair.indexOf('=')
      if(at>0)this.cookies.set(pair.slice(0,at),pair.slice(at+1))
    }
    return response
  }
}
async function responseJson(response,expected,label){
  if(response.status!==expected){
    let hint='';try{const body=await response.json();hint=body.message||body.error_description||body.error||''}catch{/* Do not print raw provider pages. */}
    throw new Error(`${label}: HTTP ${response.status}${hint?' '+hint:''}`)
  }
  return response.json()
}
async function business(path,method='GET',body,token=accessToken){
  return fetch(api+path,{method,headers:{Authorization:`Bearer ${token}`,...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(90000)})
}
function database(sql){
  const child=spawnSync('D:/Application/PostgreSQL16/pgsql/bin/psql.exe',['-X','-t','-A','-v','ON_ERROR_STOP=1','-h','127.0.0.1','-U','smartledger','-d','smartledger','-c',sql],{encoding:'utf8',env:{...process.env,PGPASSWORD:process.env.LEDGER_TEST_DB_PASSWORD}})
  if(child.status!==0)throw new Error('Database verification command failed')
  return child.stdout.trim()
}
async function register(clientId,origin){
  const session=new Session(),verifier=randomBytes(32).toString('base64url'),state=randomBytes(16).toString('hex')
  const params=new URLSearchParams({client_id:clientId,redirect_uri:origin+'/auth/callback',response_type:'code',scope:'openid profile email',state,prompt:'create',ui_locales:'zh-CN',nonce:randomBytes(16).toString('hex'),code_challenge:createHash('sha256').update(verifier).digest('base64url'),code_challenge_method:'S256'})
  let response=await session.request(issuer+'/protocol/openid-connect/auth?'+params)
  for(let step=0;step<6&&response.status>=300&&response.status<400;step++)response=await session.request(new URL(response.headers.get('location'),issuer))
  assert.equal(response.status,200,'Registration page must load')
  const html=await response.text()
  assert.match(html,/personal\.css/,'Custom login theme must load')
  assert.match(html,/href="http:\/\/localhost:5173\/" class="personal-back-link"/,'Login theme must link back to the public portal')
  for(const style of html.matchAll(/<link href="([^"]+)" rel="stylesheet"/g)){
    const resource=await session.request(new URL(decode(style[1]),issuer));assert.equal(resource.status,200,'Login stylesheet must load')
  }
  const form=html.match(/<form\b[^>]*id="kc-register-form"[^>]*>/)
  assert.ok(form,'OIDC prompt=create must display a registration form')
  const action=decode(form[0].match(/action="([^"]+)"/)[1])
  const suffix=randomBytes(8).toString('hex')
  const username='qa-nutstore-'+suffix,password='Aa1!'+randomBytes(24).toString('base64url')
  const fields=new URLSearchParams({username,email:username+'@example.test',firstName:'集成',lastName:'测试',password,'password-confirm':password})
  for(const input of html.matchAll(/<input\b[^>]*>/g)){
    if(!/type="hidden"/.test(input[0]))continue
    const name=input[0].match(/name="([^"]+)"/),value=input[0].match(/value="([^"]*)"/)
    if(name&&!fields.has(name[1]))fields.set(name[1],value?decode(value[1]):'')
  }
  response=await session.request(action,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:fields})
  const registered=await responseJson(await fetch('http://localhost:8091/admin/realms/local/users?'+new URLSearchParams({username,exact:'true'}),{headers:{Authorization:'Bearer '+adminToken}}),200,'Registration cleanup tracking')
  if(registered[0]?.id)users.push(registered[0].id)
  let location=response.headers.get('location')
  for(let step=0;step<6&&location&&!location.startsWith(origin+'/auth/callback');step++){
    response=await session.request(new URL(location,issuer));location=response.headers.get('location')
  }
  if(!location?.startsWith(origin+'/auth/callback')){
    const returned=await response.text()
    const messages=[...returned.matchAll(/class="[^"]*(?:kc-feedback-text|pf-m-error)[^"]*"[^>]*>([^<]+)/g)].map(match=>match[1].trim()).filter(Boolean)
    throw new Error('Registration did not return an authorization code'+(messages.length?': '+messages.join(' / '):''))
  }
  const callback=new URL(location);assert.equal(callback.searchParams.get('state'),state)
  const tokens=await responseJson(await session.request(issuer+'/protocol/openid-connect/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'authorization_code',client_id:clientId,code:callback.searchParams.get('code'),redirect_uri:origin+'/auth/callback',code_verifier:verifier})}),200,'PKCE token exchange')
  const claims=JSON.parse(Buffer.from(tokens.access_token.split('.')[1],'base64url').toString())
  assert.equal(typeof claims.sub,'string','Access token must include the subject from the basic client scope')
  assert.match(claims.sub,/^[0-9a-f-]{36}$/)
  assert.equal(claims.sub,registered[0]?.id)
  assert.ok(!claims.realm_access?.roles?.includes('portal-admin'),'Self-registration must not grant administrator rights')
  assert.ok(!claims.resource_access?.['realm-management']?.roles?.includes('realm-admin'))
  return {...tokens,testSession:session}
}
async function sso(session,clientId,origin){
  const verifier=randomBytes(32).toString('base64url'),state=randomBytes(16).toString('hex')
  const redirect=origin+'/auth/callback'
  const params=new URLSearchParams({client_id:clientId,redirect_uri:redirect,response_type:'code',scope:'openid profile email',state,code_challenge:createHash('sha256').update(verifier).digest('base64url'),code_challenge_method:'S256',prompt:'none'})
  const response=await session.request(issuer+'/protocol/openid-connect/auth?'+params)
  assert.equal(response.status,302,'Existing SSO session must continue without asking for a password')
  const callback=new URL(response.headers.get('location'));assert.equal(callback.searchParams.get('state'),state);assert.ok(callback.searchParams.get('code'),'SSO must return a code')
  return responseJson(await session.request(issuer+'/protocol/openid-connect/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'authorization_code',client_id:clientId,code:callback.searchParams.get('code'),redirect_uri:redirect,code_verifier:verifier})}),200,'SSO token exchange')
}
try{
  const admin=await responseJson(await fetch('http://localhost:8091/realms/master/protocol/openid-connect/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'password',client_id:'admin-cli',username:'identity-admin',password:process.env.IDENTITY_TEST_ADMIN_PASSWORD})}),200,'Identity test setup')
  adminToken=admin.access_token
  const anon=await fetch(api+'/api/v1/sync/nutstore/credentials');assert.equal(anon.status,401);pass('anonymous credentials endpoint is protected')
  const tokens=await register('smartledger-web','http://localhost:5174');accessToken=tokens.access_token
  pass('public registration, ordinary-user permissions and PKCE login')
  const travelSession=await sso(tokens.testSession,'wheretogo-web','http://localhost:5173')
  const travelIdentity=JSON.parse(Buffer.from(travelSession.access_token.split('.')[1],'base64url').toString())
  assert.equal(travelIdentity.sub,users[0]);pass('same account uses travel and ledger through SSO without another password')
  const status=await responseJson(await business('/api/v1/sync/nutstore/credentials','PUT',supplied),200,'Save credentials')
  assert.equal(status.configured,true);assert.equal(status.available,true)
  assert.ok(!JSON.stringify(status).includes(supplied.appPassword));assert.ok(!JSON.stringify(status).includes(supplied.username))
  pass('encrypted credential save and masked response')
  const stored=JSON.parse(database(`SELECT row_to_json(c) FROM ledger_provider_credentials c JOIN sl_users u ON u.id=c.user_id WHERE u.issuer='${issuer}' AND u.subject='${users[0]}'`))
  assert.equal(Buffer.from(stored.nonce,'base64').length,12)
  assert.ok(!stored.ciphertext.includes(supplied.appPassword));assert.ok(!stored.ciphertext.includes(supplied.username))
  const keyring=JSON.parse(readFileSync('D:/Application/WhereToGo/secrets/credential-keyring.json','utf8'))
  const packed=Buffer.from(stored.ciphertext,'base64'),tag=packed.subarray(-16),encrypted=packed.subarray(0,-16)
  const decrypt=(identity)=>{const cipher=createDecipheriv('aes-256-gcm',Buffer.from(keyring.keys[stored.key_id],'base64'),Buffer.from(stored.nonce,'base64'));cipher.setAAD(Buffer.from('smartledger:nutstore:v1\0'+issuer+'\0'+identity));cipher.setAuthTag(tag);return Buffer.concat([cipher.update(encrypted),cipher.final()])}
  assert.deepEqual(JSON.parse(decrypt(users[0]).toString()),supplied);assert.throws(()=>decrypt('another-user'))
  pass('database AES-256-GCM ciphertext and identity-bound authentication')
  await responseJson(await business('/api/v1/sync/nutstore/test','POST'),200,'Nutstore WebDAV connection');pass('real Nutstore WebDAV connection')
  const snapshot=createInitialSnapshot();snapshot.books[0].name='SmartLedger 自动化连接测试'
  snapshot.transactions=createTransaction(snapshot,{title:'坚果云临时测试流水',amount:12.34,kind:'expense',happenedAt:new Date().toISOString(),categoryId:snapshot.categories.find(item=>item.flowType==='expense').id,bookIds:[snapshot.books[0].id],source:'manual',currency:'CNY'})
  cloudPath='https://dav.jianguoyun.com/dav/SmartLedger/snapshot-'+createHash('sha256').update(issuer+'|'+users[0]).digest('hex')+'.json'
  // Set before upload so cleanup also handles a write followed by a client-side timeout.
  cloudUploaded=true
  await responseJson(await business('/api/v1/sync/nutstore/upload','POST',{snapshot}),200,'Nutstore upload');pass('real snapshot backup to an isolated cloud file')
  const restored=await responseJson(await business('/api/v1/sync/nutstore/download','POST'),200,'Nutstore download');assert.deepEqual(restored,snapshot);pass('restore preserves transaction amount, date, book and category')
  const second=await register('wheretogo-web','http://localhost:5173')
  const secondClaims=JSON.parse(Buffer.from(second.access_token.split('.')[1],'base64url').toString())
  assert.ok(secondClaims.aud.includes('wheretogo-api'))
  const travel=await fetch('http://localhost:8080/api/v1/system/info',{headers:{Authorization:'Bearer '+second.access_token}});assert.equal(travel.status,200);pass('registered account can access its travel service')
  // Wrong audience must never read the credential store.
  const wrongAudience=await business('/api/v1/sync/nutstore/credentials','GET',undefined,second.access_token);assert.equal(wrongAudience.status,401);pass('travel token cannot access ledger credentials')
  const secondLedger=await sso(second.testSession,'smartledger-web','http://localhost:5174')
  const isolated=await responseJson(await business('/api/v1/sync/nutstore/credentials','GET',undefined,secondLedger.access_token),200,'Another account status')
  assert.equal(isolated.configured,false);assert.ok(!isolated.usernameMasked);pass('another account cannot read or reuse the saved Nutstore credentials')
  await responseJson(await business('/api/v1/sync/nutstore/credentials','DELETE'),200,'Delete test credentials')
  const deleted=await responseJson(await business('/api/v1/sync/nutstore/credentials'),200,'Read deleted status');assert.equal(deleted.configured,false);pass('credential deletion')
}catch(error){
  process.exitCode=1
  // Only test labels and sanitized service errors are emitted. No response bodies or tokens.
  const message=String(error.message).replaceAll(supplied.appPassword,'[redacted]').replaceAll(supplied.username,'[redacted]')
  results.push({result:'FAIL',message});console.error('FAIL '+message)
}finally{
  if(cloudUploaded&&cloudPath){
    try{
      const response=await fetch(cloudPath,{method:'DELETE',headers:{Authorization:'Basic '+Buffer.from(supplied.username+':'+supplied.appPassword).toString('base64')},signal:AbortSignal.timeout(30000),redirect:'error'})
      assert.ok([200,204,404].includes(response.status));pass('temporary cloud file removed')
    }catch{process.exitCode=1;results.push({result:'FAIL',message:'Temporary cloud file cleanup failed'});console.error('FAIL temporary cloud file cleanup')}
  }
  for(const id of users){
    try{
      database(`DELETE FROM sl_users WHERE issuer='${issuer}' AND subject='${id}'`)
      const response=await fetch('http://localhost:8091/admin/realms/local/users/'+id,{method:'DELETE',headers:{Authorization:'Bearer '+adminToken}});assert.equal(response.status,204)
    }catch{process.exitCode=1;console.error('FAIL temporary local account cleanup')}
  }
  console.log(JSON.stringify({cases:results,temporaryAccountsRemoved:users.length},null,2))
}
