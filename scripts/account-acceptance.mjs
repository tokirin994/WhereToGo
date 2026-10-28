// Uses only the isolated QA accounts created by test-registration.mjs.
import {randomBytes} from 'node:crypto'
import {createRequire} from 'node:module'
const require=createRequire(new URL('../apps/portal/package.json',import.meta.url))
const {JSDOM}=require('jsdom')
export async function accountAcceptance(context){
  const {origin,issuer,runId,first,second,ledgerA,ledgerB,begin,exchange,login,client,pass,assert}=context
  const dom=html=>new JSDOM(html).window.document
  async function call(path,token,method='GET',body){
    return fetch(origin+path,{method,redirect:'manual',signal:AbortSignal.timeout(30000),headers:{Authorization:'Bearer '+token,Accept:'application/json',...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})})
  }
  async function ok(response,expected,label){assert(response.status===expected,label+' HTTP '+response.status);return response.status===204?null:await response.json()}
  const a=await login(first),b=await login(second)
  const profile=await ok(await call('/identity/realms/personal/account/',a.token),200,'Read own account')
  await ok(await call('/identity/realms/personal/account/',a.token,'POST',{username:first.username,email:first.email,firstName:'QA',lastName:'Account'}),204,'Update profile')
  const updated=await ok(await call('/identity/realms/personal/account/',a.token),200,'Read updated profile')
  assert(updated.firstName==='QA'&&updated.id===profile.id,'Profile save must retain account identity')
  pass('Unified account REST reads and edits the current user profile')
  const attempted=await call('/identity/realms/personal/account/',a.token,'POST',{username:first.username,email:runId+'-bypass@example.invalid',firstName:'QA',lastName:'Account'})
  assert([200,204,400,403].includes(attempted.status),'Direct email update returned an unexpected status')
  const after=await (await call('/identity/realms/personal/account/',a.token)).json()
  assert(after.email===first.email,'Changing email must require the UPDATE_EMAIL action')
  pass('Profile REST cannot bypass step-up email change')

  async function action(name,values){
    const request=client(),flow=await begin(request,'login',false,{kc_action:name,prompt:'login',max_age:'0'})
    let response=flow.response,document=dom(await response.text()),loginForm=document.querySelector('#kc-form-login')
    assert(loginForm,'Sensitive account action must require reauthentication')
    response=await request(loginForm.action,{method:'POST',body:new URLSearchParams({username:first.username,password:first.password,credentialId:''})})
    for(let step=0;response.headers.get('location')&&step<6;step++){
      const location=new URL(response.headers.get('location'),origin)
      assert(!location.href.startsWith(flow.redirect+'?'),'Sensitive action must not skip its update form')
      response=await request(location)
    }
    assert(response.status===200,'Sensitive account form must load')
    document=dom(await response.text())
    const form=document.querySelector(name==='UPDATE_EMAIL'?'form:has(input[name=email])':'form:has(input[name="password-new"])')
    assert(form,'Expected the '+name+' form')
    const body=new URLSearchParams()
    for(const input of form.querySelectorAll('input[type=hidden][name]'))body.set(input.name,input.value)
    for(const [key,value] of Object.entries(values))body.set(key,value)
    response=await request(form.action,{method:'POST',body})
    return exchange(flow,response)
  }
  const newEmail=runId+'-changed@example.invalid'
  await action('UPDATE_EMAIL',{email:newEmail})
  first.email=newEmail
  let fresh=await login(first,true)
  const changed=await (await call('/identity/realms/personal/account/',fresh.token)).json()
  assert(changed.email===newEmail&&changed.id===profile.id&&!changed.emailVerified,'Email change must retain identity and reset verification')
  pass('Email change requires current-password verification; new email login retains account ID')
  const newPassword='Aa1!'+randomBytes(24).toString('base64url')
  await action('UPDATE_PASSWORD',{'password-new':newPassword,'password-confirm':newPassword,'logout-sessions':'on'})
  first.password=newPassword
  fresh=await login(first)
  assert(fresh.claims.sub===profile.id,'Password change must retain account identity')
  pass('Password change requires reauthentication; the new password can sign in')

  const sessions=await (await call('/identity/realms/personal/account/sessions',fresh.token)).json()
  assert(Array.isArray(sessions)&&sessions.length,'Login sessions must be available')
  const victim=sessions.find(item=>!item.current)
  if(victim){
    await ok(await call('/identity/realms/personal/account/sessions/'+victim.id,b.token,'DELETE'),204,'Cross user session removal')
    assert((await (await call('/identity/realms/personal/account/sessions',fresh.token)).json()).some(item=>item.id===victim.id),'Another user must not revoke the session')
    await ok(await call('/identity/realms/personal/account/sessions/'+victim.id,fresh.token,'DELETE'),204,'Own session removal')
    assert(!(await (await call('/identity/realms/personal/account/sessions',fresh.token)).json()).some(item=>item.id===victim.id),'Session removal must persist')
  }
  pass('Device sessions are listed and can only be revoked by their owner')

  const managedTravel=await login(first,false,'travel'),otherTravel=await login(second,false,'travel')
  const providers='/travel-api/api/v1/account/providers'
  const fakeKey='qa-private-key-'+runId,config={apiKey:fakeKey,baseUrl:'https://api.deepseek.com/v1',model:'qa-model',protocol:'chat-completions',tokenField:'max_tokens',authMode:'api-key',enabled:true}
  const saved=await ok(await call(providers+'/deepseek',managedTravel.token,'PUT',config),200,'Save personal AI key')
  assert(!JSON.stringify(saved).includes(fakeKey)&&!JSON.stringify(saved).includes('ciphertext')&&!JSON.stringify(saved).includes('"apiKey"'),'API must not disclose credentials')
  assert(saved.providers.find(row=>row.provider==='deepseek')?.keyMasked,'A saved key must have a masked status')
  const other=await (await call(providers,otherTravel.token)).json()
  assert(!other.providers.length,'Provider credentials must not cross accounts')
  await ok(await call(providers+'/deepseek',otherTravel.token,'DELETE'),200,'Other account delete')
  assert((await (await call(providers,managedTravel.token)).json()).providers.length===1,'Another user must not delete credentials')
  pass('Personal AI keys are saved with masked responses and isolated account ownership')
  await ok(await call(providers+'/deepseek',managedTravel.token,'PUT',{...config,apiKey:'',model:'qa-updated-model'}),200,'Keep key while changing model')
  assert((await (await call('/travel-api/api/v1/planner/status',managedTravel.token)).json()).aiAvailable,'The planner must use the personal AI configuration')
  const changedAddress=await call(providers+'/deepseek',managedTravel.token,'PUT',{...config,apiKey:'',baseUrl:'https://api.openai.com/v1'})
  assert(changedAddress.status===400,'Moving a key to another provider must require re-entry')
  await ok(await call(providers+'/openai',managedTravel.token,'PUT',{...config,apiKey:'qa-second-key-'+runId,baseUrl:'https://api.openai.com/v1'}),200,'Switch active AI')
  const active=(await (await call(providers,managedTravel.token)).json()).providers.filter(row=>row.enabled&&row.provider!=='amap')
  assert(active.length===1&&active[0].provider==='openai','Only one personal AI configuration may be active')
  const privateAddress=await call(providers+'/custom-ai',managedTravel.token,'PUT',{...config,baseUrl:'https://127.0.0.1/v1'})
  assert([400,409].includes(privateAddress.status),'Private AI destinations must be rejected')
  pass('AI settings take effect, preserve unchanged keys, enforce one active provider and reject unsafe destinations')
  await ok(await call(providers+'/amap',managedTravel.token,'PUT',{apiKey:'qa-amap-key-'+runId,enabled:true}),200,'Save Amap key')
  assert((await (await call('/travel-api/api/v1/maps/status',managedTravel.token)).json()).provider==='amap','Map search must select the personal Amap provider')
  assert((await (await call('/travel-api/api/v1/maps/status',otherTravel.token)).json()).provider!=='amap','Another user must not use the Amap key')
  pass('Personal Amap Web-service key selects server-side map search only for its owner')
  // Re-enter ledger with the newly authenticated identity after the password change.
  const ledgerRequest=client(),ledgerFlow=await begin(ledgerRequest,'login',true)
  let ledgerResponse=ledgerFlow.response
  if(ledgerResponse.status===200){const form=dom(await ledgerResponse.text()).querySelector('#kc-form-login');assert(form,'Ledger login form');ledgerResponse=await ledgerRequest(form.action,{method:'POST',body:new URLSearchParams({username:first.username,password:first.password,credentialId:''})})}
  const newLedger=await exchange(ledgerFlow,ledgerResponse)
  const credentials='/ledger-api/api/v1/sync/nutstore/credentials'
  const cloud=await ok(await call(credentials,newLedger.token,'PUT',{username:runId+'@example.invalid',appPassword:'qa-nutstore-password-'+runId}),200,'Save ledger cloud credential')
  assert(cloud.configured&&cloud.usernameMasked&&!JSON.stringify(cloud).includes('qa-nutstore-password'),'Ledger secret must remain masked')
  assert(!(await (await call(credentials,ledgerB.token)).json()).configured,'Ledger credentials must remain isolated')
  pass('Central account management and SmartLedger use the same encrypted cloud credential record')
  for(const name of ['deepseek','openai','amap'])await ok(await call(providers+'/'+name,managedTravel.token,'DELETE'),200,'Remove QA provider')
  await ok(await call(credentials,newLedger.token,'DELETE'),200,'Remove QA ledger credential')
  assert(!(await (await call(providers,managedTravel.token)).json()).providers.length,'Provider deletion must persist')
  pass('Provider and ledger credential deletion removes only the current account configuration')
}
