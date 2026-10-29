/** Read-only UI checks. Theme changes and drafts remain in the isolated browser. */
import {mkdirSync,writeFileSync} from 'node:fs'
import {resolve} from 'node:path'

export async function checkMobileLayouts({page,origin,pass,ensure,reportDir}){
  const results=[]
  const settle=()=>page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))))
  async function bounds(locator,name,vertical=true){
    await locator.waitFor({state:'visible'});await settle()
    const rect=await locator.evaluate(el=>{const r=el.getBoundingClientRect(),v=visualViewport;return {left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:r.width,height:r.height,scrollWidth:el.scrollWidth,clientWidth:el.clientWidth,viewport:{left:v?.offsetLeft||0,top:v?.offsetTop||0,width:v?.width||innerWidth,height:v?.height||innerHeight}}})
    const v=rect.viewport
    ensure(rect.width>0&&rect.height>0&&rect.left>=v.left-1&&rect.right<=v.left+v.width+1,name+' extends past a horizontal screen edge')
    if(vertical)ensure(rect.top>=v.top-1&&rect.bottom<=v.top+v.height+1,name+' extends past a vertical screen edge')
    ensure(rect.scrollWidth<=rect.clientWidth+1,name+' clips content horizontally')
    results.push({name,...rect})
  }
  async function documentWidth(name){
    const size=await page.evaluate(()=>({viewport:innerWidth,width:document.documentElement.scrollWidth,overflow:[...document.querySelectorAll('body *')].filter(el=>{const r=el.getBoundingClientRect();return r.width>0&&r.right>innerWidth+1&&getComputedStyle(el).position!=='absolute'}).slice(0,6).map(el=>({tag:el.tagName,class:el.className,width:el.getBoundingClientRect().width}))}))
    ensure(size.width<=size.viewport+1,name+' causes page overflow: '+JSON.stringify(size))
  }
  async function switcher(selector){
    const root=page.locator(selector),trigger=root.locator('summary'),panel=root.locator('nav')
    await trigger.click();await bounds(panel,selector)
    await panel.evaluate(el=>{el.scrollTop=el.scrollHeight})
    await bounds(panel.locator('a').last(),selector+' last application')
    await trigger.press('Escape');ensure(!await root.evaluate(el=>el.open),'Escape did not close the application menu')
    await trigger.click();await panel.waitFor({state:'visible'})
    const viewport=page.viewportSize()
    await page.mouse.click(viewport.width-2,Math.max(2,viewport.height-110))
    await panel.waitFor({state:'hidden'})
  }
  async function actionMenu(trigger,name,exportGroup=false){
    await trigger.click();const panel=page.getByRole('menu',{name,exact:true})
    await bounds(panel,name)
    if(exportGroup){await panel.getByRole('menuitem',{name:'导出账本',exact:true}).click();await bounds(page.getByRole('menu',{name:'导出账本',exact:true}),name+' export choices')}
    await page.keyboard.press('Escape');await page.getByRole('menu').waitFor({state:'hidden'})
  }
  async function travelMenu(root,name){
    await root.locator('summary').click();await bounds(root.locator(':scope > div'),name)
    await page.keyboard.press('Escape')
    ensure(!await root.evaluate(el=>el.open),'Escape did not close '+name)
  }
  const tab=name=>page.locator('.ledger-sidebar nav button').filter({hasText:name}).click()
  for(const [width,height] of [[320,740],[390,844],[430,932],[768,1024],[1280,900],[844,390]]){
    await page.setViewportSize({width,height});await page.evaluate(()=>scrollTo(0,0));await settle()
    await documentWidth('Ledger overview '+width)
    await bounds(page.locator('.ledger-topbar'),'Ledger header '+width)
    const overlap=await page.locator('.ledger-topbar').evaluate(el=>{const title=el.children[0].getBoundingClientRect(),actions=el.children[1].getBoundingClientRect();return title.right>actions.left+1&&title.bottom>actions.top+1&&actions.bottom>title.top+1})
    ensure(!overlap,'Header title overlaps the actions')
    await switcher('.ledger-app-switcher')
    // Resize while open; the popup must follow its new trigger position.
    if(width===390){
      await page.locator('.ledger-app-switcher summary').click()
      await page.setViewportSize({width:320,height:740});await bounds(page.locator('.ledger-app-switcher nav'),'open menu after resize')
      await page.setViewportSize({width,height});await bounds(page.locator('.ledger-app-switcher nav'),'open menu after restore')
      if(reportDir)await page.screenshot({path:resolve(reportDir,'ledger-mobile-menu.png')})
      await page.keyboard.press('Escape')
    }
    await page.locator('.calendar-shortcut').click()
    await bounds(page.locator('.calendar-modal-card'),'Calendar '+width)
    await page.getByRole('button',{name:'关闭日历',exact:true}).click()
    await tab('账本');await documentWidth('Book library '+width)
    await actionMenu(page.getByRole('button',{name:'账本排序',exact:true}),'账本排序')
    if(await page.locator('.bl-card').count()){
      const trigger=page.locator('.bl-card .lv-menu-trigger').first(),name=await trigger.getAttribute('aria-label')
      await actionMenu(trigger,name,true)
      await page.locator('.bl-open').first().click();await documentWidth('Book details '+width)
      await actionMenu(page.getByRole('button',{name:'账本操作',exact:true}),'账本操作',true)
    }
    for(const name of ['流水','识图','更多']){await tab(name);await documentWidth(name+' '+width)}
    await page.locator('.more-grid button').filter({hasText:'分类管理'}).click()
    await documentWidth('Category management '+width)
    const category=page.locator('.cm-menu-toggle').last()
    if(await category.count()){
      await category.click();await bounds(page.locator('.cm-action-menu'),'Category actions '+width)
      await page.keyboard.press('Escape')
    }
    await tab('概览')
    pass('ledger menus, calendar, books, filters and categories fit '+width+'x'+height)
  }
  await page.setViewportSize({width:390,height:844})
  // Exercise the two themes through the real settings control, without cloud sync.
  await tab('更多');await page.locator('.more-grid button').filter({hasText:'设置与云同步'}).click()
  const theme=page.locator('.setting-row').filter({hasText:'主题模式'}).locator('select')
  for(const value of ['dark','light']){
    await theme.selectOption(value);await tab('概览')
    await page.locator('.ledger-app-switcher summary').click();await bounds(page.locator('.ledger-app-switcher nav'),'Ledger '+value+' menu')
    if(reportDir)await page.screenshot({path:resolve(reportDir,'ledger-'+value+'-menu.png')})
    await page.keyboard.press('Escape')
    await page.locator('.top-actions>.primary-button').click()
    await documentWidth('Entry editor '+value)
    await page.locator('.entry-editor .category-picker-trigger').click()
    await bounds(page.locator('.category-level-dialog'),'Category selector '+value)
    await page.getByRole('button',{name:'关闭分类选择',exact:true}).click()
    await page.getByRole('button',{name:'关闭记账',exact:true}).click()
    await tab('更多');await page.locator('.more-grid button').filter({hasText:'设置与云同步'}).click()
  }
  pass('ledger dark/light menus and nested category dialog fit mobile')
  for(const app of ['portal','travel']){
    // Synthetic records are fulfilled in this browser only. No server data is written.
    const fixtureRoute=origin+'/travel-api/api/v1/{trips,collections}**'
    if(app==='travel')await page.route(fixtureRoute,async route=>{
      const request=route.request(),path=new URL(request.url()).pathname
      if(request.method()!=='GET')throw Error('Layout tests must not write travel fixtures to the server')
      const body=path.endsWith('/trips')?[{id:'layout-test-trip',name:'移动布局测试行程',destination:'测试目的地',startsOn:'2026-11-05',endsOn:'2026-11-06',status:'planning',notes:'仅在测试浏览器显示',stops:[{id:'layout-test-stop',placeId:null,dayDate:'2026-11-05',placeName:'测试日程',category:'景点',startsAt:'09:00',durationMinutes:60,note:'',sortOrder:0}]}]:path.endsWith('/collections')?[{id:'layout-test-collection',name:'测试合集',description:'',color:'#4d7c76',placeIds:[]}]:null
      if(body===null)return route.fallback()
      return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(body)})
    })
    await page.goto(origin+(app==='portal'?'/':'/travel/?__sso=1'),{waitUntil:'domcontentloaded'})
    await page.locator(app==='portal'?'.portal-account-menu':'.travel-app').waitFor({timeout:35000})
    for(const [width,height] of [[320,740],[390,844],[768,1024],[844,390]]){
      await page.setViewportSize({width,height});await page.evaluate(()=>scrollTo(0,0));await settle()
      await documentWidth(app+' '+width);await switcher('.application-switcher')
      if(app==='portal'){
        await page.locator('.portal-account-menu summary').focus()
        await page.locator('.portal-account-menu summary').press('Enter')
        await bounds(page.locator('.portal-account-menu nav'),'Portal account '+width)
        await page.keyboard.press('Escape')
      }else{
        const nav=page.getByRole('navigation',{name:'旅游导航',exact:true})
        await nav.getByRole('button',{name:/我的旅行/}).click()
        await page.locator('.tw-trip-card').first().waitFor()
        await travelMenu(page.locator('.tw-trip-card .tw-menu').first(),'Travel card '+width)
        await page.locator('.tw-trip-cover').first().click()
        await documentWidth('Travel planner '+width)
        await travelMenu(page.locator('.tw-planner-tools .tw-menu'),'Travel export '+width)
        await travelMenu(page.locator('.tw-plan-menu'),'Travel planner actions '+width)
        await travelMenu(page.locator('.tw-stop .tw-menu').first(),'Travel stop actions '+width)
        await nav.getByRole('button',{name:/地点收藏/}).click()
        await documentWidth('Travel place library '+width)
        await travelMenu(page.locator('.tw-collection-chip .tw-menu').first(),'Travel collection '+width)
        await nav.getByRole('button',{name:/我的旅行/}).click()
      }
    }
    if(app==='travel')await page.unroute(fixtureRoute)
    pass(app+' switcher and page fit phone, tablet and landscape')
  }
  await page.setViewportSize({width:390,height:844})
  await page.goto(origin+'/ledger/?__sso=1',{waitUntil:'domcontentloaded'})
  await page.locator('.ledger-app .loading-state').waitFor({state:'hidden',timeout:35000})
  await page.locator('.home-dashboard').waitFor({timeout:35000})
  // The overview paints before bootstrap finishes its book request. Wait after
  // the workspace exists so the next SSO reload does not interrupt that request.
  await page.locator('.ledger-app .loading-state').waitFor({state:'hidden',timeout:35000})
  if(reportDir){mkdirSync(reportDir,{recursive:true});writeFileSync(resolve(reportDir,'mobile-layout-results.json'),JSON.stringify({engine:'WebKit',appleDevice:false,results},null,2))}
}
