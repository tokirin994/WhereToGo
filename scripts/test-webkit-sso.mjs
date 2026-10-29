/** Real WebKit-engine UI regression, not an Apple Safari device test.
 * Uses an isolated test account/cookie jar. Default mode performs no mutations.
 * --cloud-sync-write explicitly opts into a marked empty-account sync fixture.
 * Optional --bundle-dir serves candidate static files at the configured HTTPS
 * origin while identity and read-only APIs still use that origin's real server.
 */
import {readFileSync,existsSync,mkdirSync,writeFileSync} from 'node:fs'
import {resolve,extname,sep} from 'node:path'
import {pathToFileURL} from 'node:url'
import {randomUUID} from 'node:crypto'
const {WTG_PUBLIC_ORIGIN,WTG_USERNAME,WTG_PASSWORD,WTG_PLAYWRIGHT_MODULE,WTG_BROWSER_REPORT_DIR}=process.env
if(!WTG_PUBLIC_ORIGIN||!WTG_USERNAME||!WTG_PASSWORD||!WTG_PLAYWRIGHT_MODULE)throw Error('Set public origin, isolated test credentials and Playwright module path through environment variables')
const origin=new URL(WTG_PUBLIC_ORIGIN).origin,args=process.argv.slice(2),bundleAt=args.indexOf('--bundle-dir')
const bundle=bundleAt>=0?resolve(args[bundleAt+1]):null,legacy=args.includes('--legacy'),mobile=args.includes('--mobile'),testRejection=args.includes('--rejected-api')
const syncWrite=args.includes('--cloud-sync-write')
if(syncWrite&&(!WTG_BROWSER_REPORT_DIR||process.env.WTG_ALLOW_SYNC_WRITE!=='true'||!process.env.WTG_SYNC_TEST_SUBJECT))throw Error('Sync writes require an explicit opt-in, a private report directory and the isolated test subject')
const {webkit}=await import(pathToFileURL(resolve(WTG_PLAYWRIGHT_MODULE)).href)
const browser=await webkit.launch({headless:true})
const context=await browser.newContext({viewport:mobile?{width:390,height:844}:{width:1440,height:1000},isMobile:mobile,hasTouch:mobile,deviceScaleFactor:mobile?3:1,locale:'zh-CN',timezoneId:'Asia/Hong_Kong',colorScheme:'light'})
let blockFrames=false,rejectLedgerRead=false,stage='setup',passwordForms=0
const checks=[],runtimeErrors=[]
let syncFixture
const pass=name=>{checks.push(name);console.log('PASS WebKit '+name)}
const ensure=(condition,message)=>{if(!condition)throw Error(message)}
async function ledgerReady(page,timeout=35000){
  await page.locator('.ledger-app').waitFor({timeout})
  await page.locator('.ledger-app .loading-state').waitFor({state:'hidden',timeout})
  ensure(await page.locator('.ledger-app .error-notice').count()===0,'Ledger initialization reported an error')
}
if(legacy)await context.addInitScript(()=>{
  // Compatibility shims target our applications, not the identity provider's
  // independently shipped login scripts.
  if(location.pathname.startsWith('/identity/'))return
  Object.defineProperty(AbortSignal,'timeout',{value:undefined,configurable:true})
  Object.defineProperty(URLSearchParams.prototype,'size',{get:()=>undefined,configurable:true})
})
await context.route(origin+'/**',async route=>{
  const request=route.request(),url=new URL(request.url())
  if(blockFrames&&request.isNavigationRequest()&&request.frame().parentFrame())return route.abort()
  if(rejectLedgerRead&&request.method()==='GET'&&['/ledger-api/api/v1/books','/ledger-api/api/v1/sync/snapshot'].includes(url.pathname))return route.fulfill({status:401,contentType:'application/json',headers:{'x-request-id':'test-ledger-rejection','cache-control':'no-store'},body:JSON.stringify({code:'invalid_token',message:'Test API rejection'})})
  const app=url.pathname.startsWith('/ledger/')?'ledger':url.pathname.startsWith('/travel/')?'travel':'portal'
  const relative=app==='portal'?url.pathname.slice(1):url.pathname.slice(app.length+2)
  let file=bundle?resolve(bundle,app,relative):null
  if(file&&(!file.startsWith(resolve(bundle,app)+sep)))file=null
  const html=request.isNavigationRequest()&&!url.pathname.startsWith('/identity/')&&!url.pathname.startsWith('/ledger-api/')&&!url.pathname.startsWith('/travel-api/')
  if(bundle&&html)file=resolve(bundle,app,'index.html')
  if(!file||!existsSync(file))return route.continue()
  const extension=extname(file),type={'.html':'text/html','.js':'application/javascript','.css':'text/css','.svg':'image/svg+xml','.wasm':'application/wasm'}[extension]||'application/octet-stream'
  let body=readFileSync(file)
  // Remove modern declarations to exercise the emitted CSS fallbacks in a real
  // renderer, rather than only changing the user agent string.
  if(legacy&&extension==='.css'){
    const {createRequire}=await import('node:module'),require=createRequire(new URL('../apps/portal/package.json',import.meta.url))
    const css=require('postcss').parse(body.toString())
    css.walkAtRules('supports',rule=>{if(rule.params.includes('color-mix('))rule.remove()})
    css.walkDecls(decl=>{if(decl.value.includes('color-mix(')||decl.value.includes('dvh'))decl.remove()})
    body=Buffer.from(css.toString())
  }
  const policy=readFileSync(resolve(bundle,app,'_headers'),'utf8').match(/Content-Security-Policy: ([^\r\n]+)/)?.[1]
  return route.fulfill({status:200,body,contentType:type,headers:{'cache-control':'no-store',...(policy?{'content-security-policy':policy}:{})}})
})
context.on('page',page=>page.on('pageerror',error=>runtimeErrors.push({stage,name:error.name,message:error.message,stack:error.stack})))
const page=await context.newPage()
try{
  stage='portal login';await page.goto(origin+'/',{waitUntil:'domcontentloaded'})
  await page.locator('.portal-login').click()
  await page.locator('input[name=username]').waitFor({timeout:30000});passwordForms++
  await page.locator('input[name=username]').fill(WTG_USERNAME)
  await page.locator('input[name=password]').fill(WTG_PASSWORD)
  await page.locator('#kc-login').click()
  await page.locator('.portal-account-menu').waitFor({timeout:30000})
  pass('one portal login')
  stage='account layout';await page.locator('.portal-account-menu summary').click()
  await page.locator('.portal-account-menu a[href="/account/"]').click()
  await page.locator('.account-app-grid').waitFor({timeout:30000})
  ensure(await page.locator('.account-layout').evaluate(el=>getComputedStyle(el).display)===(mobile?'block':'grid'),'Account stylesheet is missing')
  ensure(await page.locator('.account-app-grid').evaluate(el=>getComputedStyle(el).display)==='grid','Application cards are unstyled')
  await page.locator('.account-loading').waitFor({state:'hidden',timeout:35000})
  ensure(await page.locator('.account-notice.error').count()===0,'An account API failed to load')
  pass('account CSS and real account APIs')
  stage='account navigation'
  for(const [name,selector] of [['个人资料','input[autocomplete=given-name]'],['登录安全','.account-list'],['AI 与地图 Key','.account-provider-grid'],['记账与云同步','input[type=email]']]){
    await page.locator('.account-tabs button').filter({hasText:name}).click()
    await page.locator(selector).waitFor()
    const dimensions=await page.evaluate(()=>({viewport:innerWidth,width:document.documentElement.scrollWidth}))
    ensure(dimensions.width<=dimensions.viewport+1,'Account page overflows the viewport')
  }
  pass('all account sections and responsive width')
  await page.locator('.account-tabs button').filter({hasText:'账号总览'}).click()
  for(const theme of ['夜间','浅色']){
    await page.locator('.account-theme-options button').filter({hasText:theme}).click()
    await page.locator(theme==='夜间'?'.account-center.portal-dark':'.account-center.portal-light').waitFor()
    await page.waitForFunction(()=>{
      const button=document.querySelector('.account-summary-grid button'),panel=document.querySelector('.account-section')
      return button&&panel&&getComputedStyle(button).backgroundColor===getComputedStyle(panel).backgroundColor
    })
    await page.evaluate(()=>Promise.all(document.getAnimations().filter(animation=>animation.effect?.getComputedTiming().iterations!==Infinity).map(animation=>animation.finished.catch(()=>{}))))
    ensure(await page.locator('.account-app').first().evaluate(el=>getComputedStyle(el).backgroundColor!=='rgba(0, 0, 0, 0)'||getComputedStyle(el).backgroundImage!=='none'),'App card background disappeared')
    if(WTG_BROWSER_REPORT_DIR){
      mkdirSync(WTG_BROWSER_REPORT_DIR,{recursive:true});await page.evaluate(()=>scrollTo(0,0))
      const styles=await page.locator('.account-summary-grid button').first().evaluate(el=>{const s=getComputedStyle(el);return {background:s.backgroundColor,color:s.color,appearance:s.appearance,panel:s.getPropertyValue('--panel')}})
      writeFileSync(resolve(WTG_BROWSER_REPORT_DIR,`styles-${theme==='夜间'?'dark':'light'}.json`),JSON.stringify(styles))
      await page.screenshot({path:resolve(WTG_BROWSER_REPORT_DIR,`account-${mobile?'mobile':'desktop'}-${legacy?'fallback':'modern'}-${theme==='夜间'?'dark':'light'}.png`),fullPage:true})
    }
  }
  pass('light and dark account appearance')
  if(syncWrite){
    stage='prepare empty-account sync fixture'
    const bookId=randomUUID(),subject=process.env.WTG_SYNC_TEST_SUBJECT
    await page.evaluate(async({subject,bookId})=>{
      const authority=location.origin+'/identity/realms/personal',user=JSON.parse(sessionStorage.getItem('oidc.user:'+authority+':smartledger-web')||'null')
      if(!user||user.profile.sub!==subject)throw Error('The configured isolated test subject does not match')
      const headers={Authorization:'Bearer '+user.access_token,Accept:'application/json'}
      const remote=await fetch('/ledger-api/api/v1/sync/snapshot',{headers,cache:'no-store'})
      const books=await fetch('/ledger-api/api/v1/books',{headers,cache:'no-store'})
      if(!remote.ok||!books.ok)throw Error('Cannot verify that the test account is empty')
      const state=await remote.json(),list=await books.json()
      if(state.revision!==0||state.snapshot!==null||!Array.isArray(list)||list.length)throw Error('Refusing to overwrite a nonempty test account')
      const snapshot={schemaVersion:4,updatedAt:new Date().toISOString(),categories:[],transactions:[],budgets:[],pinnedRanges:[],books:[{id:bookId,name:'Cloud sync regression',type:'general',icon:'book',color:'#5b8def',note:'Disposable automated test fixture',startDate:null,endDate:null,isPinned:true,participants:[]}],settings:{cloudSyncEnabled:true,cloudSyncSchedule:'on_app_open',midnightSyncEnabled:false}}
      const db=await new Promise((resolve,reject)=>{const request=indexedDB.open('smartledger-local',1);request.onupgradeneeded=()=>request.result.createObjectStore('snapshots');request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(Error('Test IndexedDB unavailable'))})
      const key='snapshot:'+authority+':'+subject
      const existing=await new Promise((resolve,reject)=>{const request=db.transaction('snapshots','readonly').objectStore('snapshots').get(key);request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(Error('Cannot inspect local test state'))})
      if(existing){db.close();throw Error('Refusing to overwrite existing local test state')}
      await new Promise((resolve,reject)=>{const transaction=db.transaction('snapshots','readwrite');transaction.objectStore('snapshots').put(snapshot,key);transaction.oncomplete=()=>resolve();transaction.onerror=()=>reject(Error('Cannot seed local sync fixture'))})
      db.close()
    },{subject,bookId})
    syncFixture={subject,bookId,expectedEmpty:true,uploaded:false}
    writeFileSync(resolve(WTG_BROWSER_REPORT_DIR,'sync-fixture.json'),JSON.stringify(syncFixture,null,2))
  }
  stage='ledger launch';await page.locator('.account-app-ledger .account-app-launch').click()
  if(syncWrite){
    await ledgerReady(page)
    ensure(await page.locator('.ledger-connection-notice').count()===0,'Automatic snapshot upload reported a rejected credential')
    const saved=await page.evaluate(async({subject,bookId})=>{
      const authority=location.origin+'/identity/realms/personal',user=JSON.parse(sessionStorage.getItem('oidc.user:'+authority+':smartledger-web')||'null')
      if(!user||user.profile.sub!==subject)throw Error('Test identity changed')
      const response=await fetch('/ledger-api/api/v1/sync/snapshot',{headers:{Authorization:'Bearer '+user.access_token,Accept:'application/json'},cache:'no-store'})
      if(!response.ok)throw Error('Cannot read back the uploaded test snapshot')
      const result=await response.json()
      if(result.revision!==1||result.snapshot?.books?.length!==1||result.snapshot.books[0].id!==bookId||result.snapshot.transactions.length!==0)throw Error('Automatic upload did not persist the marked empty fixture exactly once')
      return {revision:result.revision,contentHash:result.contentHash}
    },syncFixture)
    syncFixture={...syncFixture,...saved,uploaded:true}
    writeFileSync(resolve(WTG_BROWSER_REPORT_DIR,'sync-fixture.json'),JSON.stringify(syncFixture,null,2))
    pass('automatic snapshot PUT and server read-back succeed on the isolated empty test account')
  }else{
  await ledgerReady(page)
  if(args.includes('--responsive')){
    if(WTG_BROWSER_REPORT_DIR)mkdirSync(WTG_BROWSER_REPORT_DIR,{recursive:true})
    const {checkMobileLayouts}=await import('./mobile-layout-checks.mjs')
    stage='responsive layouts';await checkMobileLayouts({page,origin,pass,ensure,reportDir:WTG_BROWSER_REPORT_DIR})
  }
  await page.reload()
  await ledgerReady(page)
  pass('ledger opens and reloads without another login')
  if(testRejection){
    stage='delayed API rejection';rejectLedgerRead=true;blockFrames=true
    await page.reload();await page.locator('.ledger-connection-notice').waitFor({timeout:30000})
    await page.locator('.ledger-app .loading-state').waitFor({state:'hidden',timeout:30000})
    ensure(await page.locator('.ledger-app').count()===1&&await page.locator('.auth-screen').count()===0,'An API rejection incorrectly returned the authenticated user to login')
    ensure((await page.locator('.ledger-connection-notice').textContent()).includes('test-ledger-rejection'),'Safe request diagnostics were not shown')
    // Observe the reported few-second delay instead of only checking first paint.
    await page.waitForTimeout(10000)
    ensure(await page.locator('.ledger-app').count()===1&&await page.locator('.auth-screen').count()===0,'Ledger dropped its login a few seconds after an API rejection')
    rejectLedgerRead=false;await page.locator('.ledger-connection-notice button').filter({hasText:'重新连接'}).click()
    await page.waitForURL(url=>!url.pathname.includes('/auth/'))
    await page.locator('.ledger-connection-notice').waitFor({state:'hidden',timeout:30000});await ledgerReady(page)
    pass('delayed API 401 retains the workspace and reconnects without a second login')
  }
  stage='first-party SSO fallback';blockFrames=true
  const fresh=await context.newPage();await fresh.goto(origin+'/ledger/?__sso=1',{waitUntil:'domcontentloaded'})
  await ledgerReady(fresh,40000)
  ensure(!new URL(fresh.url()).searchParams.has('__sso'),'SSO marker was not consumed')
  await fresh.reload();await ledgerReady(fresh)
  pass('fresh tab and refresh work with all iframe navigations blocked')
  await fresh.close()
  stage='return navigation';await page.goto(origin+'/account/',{waitUntil:'domcontentloaded'})
  await page.locator('.account-app-grid').waitFor({timeout:30000})
  await page.locator('.account-loading').waitFor({state:'hidden',timeout:35000})
  ensure(await page.locator('.account-notice.error').count()===0,'Account did not recover its services on return')
  await page.goBack()
  await ledgerReady(page)
  pass('back navigation restores ledger session')
  }
  stage='unified logout';blockFrames=false
  await page.goto(origin+'/',{waitUntil:'domcontentloaded'})
  await page.locator('.portal-account-menu summary').click()
  await page.locator('.portal-account-menu button').click()
  await page.locator('.portal-login').waitFor({timeout:30000})
  pass('portal logout clears the test session')
  ensure(passwordForms===1&&runtimeErrors.length===0,'Unexpected login or JavaScript failure')
  if(WTG_BROWSER_REPORT_DIR)writeFileSync(resolve(WTG_BROWSER_REPORT_DIR,`result-${mobile?'mobile':'desktop'}-${legacy?'fallback':'modern'}.json`),JSON.stringify({engine:'WebKit',appleDevice:false,candidateBundle:!!bundle,legacy,mobile,checks,passwordForms,runtimeErrors,syncFixture},null,2))
}catch(error){
  console.error('FAIL WebKit stage: '+stage)
  if(WTG_BROWSER_REPORT_DIR){
    mkdirSync(WTG_BROWSER_REPORT_DIR,{recursive:true})
    const location=await page.evaluate(()=>window.location.origin+window.location.pathname).catch(()=>null)
    const notices=await page.locator('#input-error,.kc-feedback-text,.alert-error').allTextContents().catch(()=>[])
    writeFileSync(resolve(WTG_BROWSER_REPORT_DIR,'failure.json'),JSON.stringify({stage,message:error.message,location,notices,runtimeErrors},null,2))
    await page.screenshot({path:resolve(WTG_BROWSER_REPORT_DIR,'failure.png')}).catch(()=>{})
  }
  process.exitCode=1
}finally{await context.close();await browser.close()}
