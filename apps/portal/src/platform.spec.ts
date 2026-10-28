import {describe,expect,it} from 'vitest'
import {createPlatform} from '@personal/platform'
const origin='https://personal.example'
describe('platform application registration and central login',()=>{
  it('keeps three independent entry points with separate OIDC clients',()=>{
    const p=createPlatform({},origin)
    expect(p.portalUrl).toBe(origin+'/')
    expect(p.application('travel')).toMatchObject({url:origin+'/travel/',clientId:'travel-web',audience:'wheretogo-api'})
    expect(p.application('ledger')).toMatchObject({url:origin+'/ledger/',clientId:'smartledger-web',audience:'smartledger-api'})
  })
  it('can register another application without adding a business import to the portal',()=>{
    const p=createPlatform({VITE_APPLICATIONS_JSON:JSON.stringify([{id:'notes',name:'Notes',label:'笔记',title:'我的笔记',description:'独立笔记',kind:'tool',path:'/notes/',url:'https://notes.example/',devPort:5176,clientId:'notes-web',audience:'notes-api',features:['笔记']}])},origin)
    expect(p.applications).toHaveLength(3);expect(p.application('notes').url).toBe('https://notes.example/')
  })
  it('preserves deep links and trip handoffs through central login',()=>{
    const p=createPlatform({},origin),url=new URL(p.loginUrl('ledger','/ledger/books/abc?travelTripId=123#entry'))
    expect(url.pathname).toBe('/login/');expect(url.searchParams.get('app')).toBe('ledger')
    expect(p.launchTarget('ledger',url.searchParams.get('returnTo')).href).toBe(origin+'/ledger/books/abc?travelTripId=123#entry')
  })
  it.each(['https://evil.example/ledger/','//evil.example/ledger/','/account/','/ledger-evil/','/ledger/auth/callback','/ledger/%2f..%2faccount/'])('blocks an unsafe application return %s',target=>{
    expect(()=>createPlatform({},origin).launchTarget('ledger',target)).toThrow('返回地址无效')
  })
  it('rejects an unknown application and a duplicated application ID',()=>{
    expect(()=>createPlatform({},origin).launchTarget('missing')).toThrow('尚未注册')
    expect(()=>createPlatform({VITE_APPLICATIONS_JSON:JSON.stringify([{id:'travel'}])},origin)).toThrow('重复')
  })
  it('supports independent HTTPS origins with the same central login',()=>{
    const p=createPlatform({VITE_WHERE_TO_GO_PUBLIC_URL:'https://travel.example/',VITE_PORTAL_PUBLIC_URL:'https://accounts.example/'},origin)
    expect(new URL(p.loginUrl('travel','/?trip=123')).origin).toBe('https://accounts.example')
    expect(p.launchTarget('travel','/?trip=123').href).toBe('https://travel.example/?trip=123')
  })
  it('uses loopback development ports and refuses insecure public application addresses',()=>{
    expect(createPlatform({},'http://localhost:5173',true).application('travel').url).toBe('http://localhost:5175/')
    expect(()=>createPlatform({VITE_SMARTLEDGER_PUBLIC_URL:'http://public.example/'},origin)).toThrow('HTTPS')
  })
  it('can explicitly run an app with direct OIDC and no portal runtime dependency',()=>{
    expect(createPlatform({VITE_AUTH_MODE:'standalone'},origin).authMode).toBe('standalone')
  })
})
