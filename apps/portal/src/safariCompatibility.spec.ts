import {afterEach,describe,expect,it,vi} from 'vitest'
import {browserCompatibility,fallbackColors} from '@personal/platform/build'
import {timedFetch} from '@personal/platform/http'
import {browserSessionStorage} from '@personal/identity/storage'
import {createPlatform} from '@personal/platform'
afterEach(()=>{vi.unstubAllGlobals();vi.useRealTimers()})
describe('Safari browser compatibility',()=>{
  it('targets Safari 15.4 for both script syntax and CSS',()=>{
    expect(browserCompatibility.build.target).toContain('safari15.4')
    expect(browserCompatibility.build.cssTarget).toBe('safari15.4')
  })
  it('preserves var fallbacks and gradients when color-mix is unsupported',()=>{
    expect(fallbackColors('1px solid color-mix(in srgb,var(--ink,#123) 25%,var(--border))')).toBe('1px solid var(--border)')
    expect(fallbackColors('linear-gradient(90deg,color-mix(in srgb,var(--panel) 70%,transparent),var(--bg))')).toBe('linear-gradient(90deg,var(--panel),var(--bg))')
    expect(fallbackColors('color-mix(in srgb,red 20%,white) color-mix(in srgb,blue 10%,black)')).toBe('white black')
  })
  it('retains a non-secret one-shot SSO marker on all registered app launch links',()=>{
    const p=createPlatform({},'https://personal.example')
    const url=new URL(p.launchUrl('ledger','/ledger/books/abc?travelTripId=123#entry'))
    expect(url.pathname).toBe('/ledger/books/abc');expect(url.searchParams.get('travelTripId')).toBe('123')
    expect(url.searchParams.get('__sso')).toBe('1');expect(url.hash).toBe('#entry')
    expect(()=>p.launchUrl('ledger','https://evil.example/')).toThrow('返回地址无效')
  })
  it('does not crash module initialization when Safari denies storage access',()=>{
    vi.stubGlobal('window',{get sessionStorage(){throw new DOMException('denied','SecurityError')}})
    const store=browserSessionStorage()
    expect(()=>store.getItem('oidc.state')).toThrow('浏览器无法保存登录会话')
    expect(()=>store.setItem('oidc.state','dummy')).toThrow('浏览器无法保存登录会话')
  })
  it('has a bounded timeout without AbortSignal.timeout',async()=>{
    vi.useFakeTimers();vi.stubGlobal('AbortSignal',{})
    const request=vi.fn((_input:unknown,options:RequestInit)=>new Promise<Response>((_resolve,reject)=>options.signal?.addEventListener('abort',()=>reject(new Error('aborted')))))
    vi.stubGlobal('fetch',request)
    const pending=expect(timedFetch('/test',{},10)).rejects.toThrow('aborted')
    await vi.advanceTimersByTimeAsync(10);await pending
    expect(vi.getTimerCount()).toBe(0)
  })
  it('cleans up request timers and preserves caller cancellation',async()=>{
    vi.useFakeTimers();const fetch=vi.fn().mockResolvedValue(new Response('{}'));vi.stubGlobal('fetch',fetch)
    await timedFetch('/test');expect(vi.getTimerCount()).toBe(0)
    const controller=new AbortController();await timedFetch('/test',{signal:controller.signal})
    expect(fetch).toHaveBeenLastCalledWith('/test',{signal:controller.signal});expect(vi.getTimerCount()).toBe(0)
  })
})
