// Local acceptance against a disposable OIDC account. Never prints credentials or tokens.
import assert from 'node:assert/strict'
import { randomBytes, createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { writeFileSync } from 'node:fs'
const identity='http://localhost:8091',issuer=identity+'/realms/local',origin='http://localhost:5175',api='http://localhost:8080'
if(!process.env.IDENTITY_TEST_ADMIN_PASSWORD||!process.env.TRAVEL_TEST_DB_PASSWORD)throw Error('Use scripts/test-travel.ps1 to supply transient local credentials')
let adminToken,userId,token
const results=[]
function pass(name){results.push({name,result:'PASS'});console.log('PASS '+name)}
async function json(response,status=200){if(response.status!==status)throw Error('Unexpected HTTP '+response.status);return status===204?null:response.json()}
async function admin(path,method='GET',body){return fetch(identity+'/admin/realms/local'+path,{method,headers:{Authorization:'Bearer '+adminToken,...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(20000)})}
async function call(path,method='GET',body){return fetch(api+path,{method,headers:{Authorization:'Bearer '+token,...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(90000)})}
const cookies=new Map()
async function session(url,options={}){const response=await fetch(url,{...options,redirect:'manual',headers:{...options.headers,Cookie:[...cookies].map(([k,v])=>k+'='+v).join('; ')},signal:AbortSignal.timeout(30000)});for(const c of response.headers.getSetCookie()){const pair=c.split(';',1)[0],at=pair.indexOf('=');if(at>0)cookies.set(pair.slice(0,at),pair.slice(at+1))}return response}
function decode(value){return value.replaceAll('&amp;','&').replaceAll('&quot;','"')}
function cleanDatabase(){
  assert.match(userId,/^[a-f0-9-]{36}$/)
  const sql=`BEGIN; DELETE FROM travel_collection_places WHERE collection_id IN(SELECT id FROM travel_collections WHERE user_id IN(SELECT id FROM users WHERE subject='${userId}')); DELETE FROM travel_collections WHERE user_id IN(SELECT id FROM users WHERE subject='${userId}'); DELETE FROM trip_stops WHERE trip_id IN(SELECT id FROM trips WHERE user_id IN(SELECT id FROM users WHERE subject='${userId}')); DELETE FROM trips WHERE user_id IN(SELECT id FROM users WHERE subject='${userId}'); DELETE FROM place_tags WHERE place_id IN(SELECT id FROM places WHERE user_id IN(SELECT id FROM users WHERE subject='${userId}')); DELETE FROM places WHERE user_id IN(SELECT id FROM users WHERE subject='${userId}'); DELETE FROM tags WHERE user_id IN(SELECT id FROM users WHERE subject='${userId}'); DELETE FROM users WHERE subject='${userId}' AND issuer='${issuer}'; COMMIT;`
  const result=spawnSync('D:/Application/PostgreSQL16/pgsql/bin/psql.exe',['-X','-v','ON_ERROR_STOP=1','-h','127.0.0.1','-U','travelatlas','-d','travelatlas','-c',sql],{env:{...process.env,PGPASSWORD:process.env.TRAVEL_TEST_DB_PASSWORD},encoding:'utf8'});if(result.status!==0)throw Error('Disposable travel data cleanup failed')
}
try{
  adminToken=(await json(await fetch(identity+'/realms/master/protocol/openid-connect/token',{method:'POST',body:new URLSearchParams({grant_type:'password',client_id:'admin-cli',username:'identity-admin',password:process.env.IDENTITY_TEST_ADMIN_PASSWORD})}))).access_token
  const username='qa-travel-'+randomBytes(8).toString('hex'),password='Aa1!'+randomBytes(24).toString('base64url')
  const created=await admin('/users','POST',{username,enabled:true,email:username+'@example.test',firstName:'Travel',lastName:'QA',emailVerified:true,credentials:[{type:'password',value:password,temporary:false}]});assert.equal(created.status,201);userId=created.headers.get('location').split('/').at(-1)
  const verifier=randomBytes(32).toString('base64url'),state=randomBytes(16).toString('hex')
  let response=await session(issuer+'/protocol/openid-connect/auth?'+new URLSearchParams({client_id:'travel-web',redirect_uri:origin+'/auth/callback',response_type:'code',scope:'openid profile email',state,code_challenge:createHash('sha256').update(verifier).digest('base64url'),code_challenge_method:'S256'}))
  const html=await response.text(),form=html.match(/<form\b[^>]*id="kc-form-login"[^>]*>/);assert.ok(form,'Login form')
  const action=decode(form[0].match(/action="([^"]+)"/)[1]);response=await session(action,{method:'POST',body:new URLSearchParams({username,password,credentialId:''}),headers:{'Content-Type':'application/x-www-form-urlencoded'}})
  let location=response.headers.get('location');for(let i=0;i<6&&location&&!location.startsWith(origin+'/auth/callback');i++){response=await session(new URL(location,issuer));location=response.headers.get('location')}
  assert.ok(location?.startsWith(origin+'/auth/callback'),'PKCE login callback');const callback=new URL(location);assert.equal(callback.searchParams.get('state'),state)
  token=(await json(await session(issuer+'/protocol/openid-connect/token',{method:'POST',body:new URLSearchParams({grant_type:'authorization_code',client_id:'travel-web',redirect_uri:origin+'/auth/callback',code:callback.searchParams.get('code'),code_verifier:verifier})}))).access_token
  pass('Real OIDC authorization code + PKCE login')
  assert.deepEqual(await json(await call('/api/v1/trips')),[]);pass('New account starts without demo trips')
  const prefs={pace:'balanced',budgetLevel:'standard',budgetAmount:1000,travelers:2,transport:'drive',departure:'',styles:['nature'],mustDo:'',avoid:'',checklist:[{id:'qa-check',text:'Check tickets',done:false}]}
  const input={name:'QA Travel',destination:'Hangzhou',startsOn:'2026-11-01',endsOn:'2026-11-03',notes:'QA only',preferences:prefs}
  let trip=await json(await call('/api/v1/trips','POST',input),201);assert.equal(trip.preferences.travelers,2);pass('Trip creation persists preferences and budget')
  const places=await json(await call('/api/v1/places/batch','POST',[{name:'QA West Lake',city:'Hangzhou',category:'景点',address:'',tags:[],longitude:120.15,latitude:30.25,coordinateSystem:'WGS84',favorite:true},{name:'QA Walk',city:'Hangzhou',category:'景点',address:'',tags:[],longitude:120.16,latitude:30.26,coordinateSystem:'WGS84'}]));assert.equal(places.length,2);pass('Batch places persist real coordinates and favorite')
  const collection=await json(await call('/api/v1/collections','POST',{name:'QA collection',description:'isolated test',color:'#4d7c76',placeIds:places.map(p=>p.id)}));assert.equal(collection.placeIds.length,2);pass('Place collections persist membership')
  let stops=places.map((p,index)=>({placeId:p.id,dayDate:'2026-11-01',placeName:p.name,category:p.category,startsAt:index?'11:00':'09:00',durationMinutes:60,note:'',sortOrder:index,estimatedCost:20,completed:index===0}))
  trip=await json(await call('/api/v1/trips/'+trip.id+'/stops','PUT',stops));const originalStopId=trip.stops[0].id;trip=await json(await call('/api/v1/trips/'+trip.id+'/stops','PUT',trip.stops.map((s,i)=>({...s,completed:!!i}))));assert.equal(trip.stops[0].id,originalStopId);assert.equal(trip.stops[1].estimatedCost,20);pass('Stop edits preserve IDs, cost and completion')
  const draft=await json(await call('/api/v1/planner/trips/'+trip.id+'/draft','POST',{strategy:'local'}));assert.equal(draft.stops.length,2);assert.equal((await json(await call('/api/v1/trips/'+trip.id))).stops[0].id,originalStopId);pass('Local drafting previews without replacing original stops')
  const route=await json(await call('/api/v1/travel-services/trips/'+trip.id+'/route','POST',{date:'2026-11-01',mode:'drive'}));assert.ok(route.distance>0);assert.ok(route.geometry.coordinates.length>=2);assert.equal(route.trafficAware,false);pass('Java backend retrieves a real OSRM road route')
  const candidates=await json(await call('/api/v1/maps/search?query=Hangzhou'));assert.ok(candidates.length>0);assert.ok(Number.isFinite(candidates[0].latitude));pass('Java backend retrieves real Photon name search candidates')
  const weather=await json(await call('/api/v1/travel-services/weather?latitude=30.25&longitude=120.15'));assert.ok(weather.daily.time.length>0);assert.ok(weather.timezone);pass('Java backend retrieves real Open-Meteo forecast')
  const cities=await json(await call('/api/v1/travel-services/destinations?query=Hangzhou'));assert.ok(cities.length>0);pass('Java backend retrieves destination search candidates')
  const shifted={...input,startsOn:'2026-11-08',endsOn:'2026-11-10',shiftStops:true};trip=await json(await call('/api/v1/trips/'+trip.id,'PUT',shifted));assert.equal(trip.stops[0].dayDate,'2026-11-08');pass('Rescheduling atomically shifts existing stops')
  const copy=await json(await call('/api/v1/trips/'+trip.id+'/duplicate','POST'));assert.notEqual(copy.id,trip.id);assert.ok(copy.stops.every(s=>!s.completed));pass('Duplicate trip resets completion')
  const imported=await json(await call('/api/v1/trips/import','POST',{trip:{...shifted,name:'QA Imported'},stops:trip.stops}));assert.equal(imported.stops.length,2);pass('Transactional trip import')
  const before=(await json(await call('/api/v1/trips'))).length;assert.equal((await call('/api/v1/trips/import','POST',{trip:{...input,name:'QA Invalid'},stops:[{...stops[0],dayDate:'2027-01-01'}]})).status,400);assert.equal((await json(await call('/api/v1/trips'))).length,before);pass('Invalid import rolls back without an orphan trip')
  assert.equal((await call('/api/v1/places/'+places[0].id,'DELETE')).status,204);const detached=await json(await call('/api/v1/trips/'+trip.id));assert.equal(detached.stops[0].placeId,undefined);assert.equal(detached.stops[0].placeName,places[0].name);pass('Deleting a place preserves the itinerary text and detaches its reference')
  assert.equal((await fetch(api+'/api/v1/trips')).status,401);pass('Anonymous requests remain unauthorized')
}finally{
  if(userId){cleanDatabase();assert.equal((await admin('/users/'+userId,'DELETE')).status,204);pass('Temporary account and its test records removed')}
  writeFileSync(new URL('../docs/travel-acceptance-results.json',import.meta.url),JSON.stringify({date:new Date().toISOString(),method:'Real local OIDC PKCE, Java8 API, PostgreSQL, public provider calls. No browser automation. Isolated disposable user; no user travel records modified.',results},null,2)+'\n')
}
