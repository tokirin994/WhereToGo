import {afterEach,describe,expect,it,vi} from 'vitest'
import {authorizedRequest,setSessionTokenProvider} from './apiClient'
afterEach(()=>{setSessionTokenProvider();vi.unstubAllGlobals()})
describe('ledger session token lifecycle',()=>{
  it('obtains the current token before every API call rather than using a stale component prop',async()=>{
    const fetcher=vi.fn().mockResolvedValue(new Response('{}'));vi.stubGlobal('fetch',fetcher)
    const provider=vi.fn().mockResolvedValue('renewed-ledger-token');setSessionTokenProvider(provider)
    await authorizedRequest('/ledger-api','old-token','/api/v1/books')
    expect(fetcher).toHaveBeenCalledWith('/ledger-api/api/v1/books',expect.objectContaining({headers:{Authorization:'Bearer renewed-ledger-token'}}))
  })
  it('renews and retries a rejected GET once',async()=>{
    const dispatchEvent=vi.fn();vi.stubGlobal('window',{dispatchEvent})
    const fetcher=vi.fn().mockResolvedValueOnce(new Response('{}',{status:401})).mockResolvedValueOnce(new Response('{}'))
    vi.stubGlobal('fetch',fetcher);const provider=vi.fn().mockResolvedValue('token');setSessionTokenProvider(provider)
    expect((await authorizedRequest('/api','old','/books')).status).toBe(200)
    expect(provider.mock.calls).toEqual([[false],[true]]);expect(fetcher).toHaveBeenCalledTimes(2)
    expect(dispatchEvent).not.toHaveBeenCalled()
  })
  it('does not replay mutations after a 401',async()=>{
    const dispatchEvent=vi.fn();vi.stubGlobal('window',{dispatchEvent})
    const fetcher=vi.fn().mockResolvedValue(new Response('{}',{status:401}));vi.stubGlobal('fetch',fetcher)
    setSessionTokenProvider(vi.fn().mockResolvedValue('token'))
    expect((await authorizedRequest('/api','old','/books',{method:'POST',body:'{}'})).status).toBe(401)
    expect(fetcher).toHaveBeenCalledTimes(1);expect(dispatchEvent).toHaveBeenCalledTimes(1)
    expect(dispatchEvent.mock.calls[0]![0].type).toBe('smartledger-api-session-issue')
    expect(dispatchEvent.mock.calls[0]![0].detail.method).toBe('POST')
  })
  it('reports a persistent API rejection without declaring the unified account expired',async()=>{
    const dispatchEvent=vi.fn();vi.stubGlobal('window',{dispatchEvent})
    vi.stubGlobal('fetch',vi.fn().mockResolvedValue(new Response('{}',{status:401,headers:{'X-Request-ID':'test-request-1'}})))
    setSessionTokenProvider(vi.fn().mockResolvedValue('dummy-ledger-token'))
    const result=await authorizedRequest('/api','old','/books/aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee?access_token=never-copy')
    expect(result.status).toBe(401)
    const event=dispatchEvent.mock.calls[0]![0]
    expect(event.type).toBe('smartledger-api-session-issue')
    expect(event.detail).toMatchObject({status:401,route:'/books/:id',requestId:'test-request-1'})
    expect(JSON.stringify(event.detail)).not.toMatch(/never-copy|dummy-ledger-token/)
  })
  it.each([403,429,500])('does not treat HTTP %s as a login expiration',async status=>{
    const dispatchEvent=vi.fn();vi.stubGlobal('window',{dispatchEvent})
    vi.stubGlobal('fetch',vi.fn().mockResolvedValue(new Response('{}',{status})))
    setSessionTokenProvider(vi.fn().mockResolvedValue('dummy-token'))
    expect((await authorizedRequest('/api','old','/books')).status).toBe(status)
    expect(dispatchEvent).not.toHaveBeenCalled()
  })
  it('ignores an old request rejection after the active session provider changes',async()=>{
    const dispatchEvent=vi.fn();vi.stubGlobal('window',{dispatchEvent})
    let finish!:(response:Response)=>void
    vi.stubGlobal('fetch',vi.fn(()=>new Promise<Response>(resolve=>{finish=resolve})))
    const old=vi.fn().mockResolvedValue('old-token'),next=vi.fn().mockResolvedValue('new-token')
    setSessionTokenProvider(old);const pending=authorizedRequest('/api','old','/books')
    for(let i=0;i<8;i++)await Promise.resolve()
    setSessionTokenProvider(next);finish(new Response('{}',{status:401}))
    expect((await pending).status).toBe(401);expect(old).toHaveBeenCalledTimes(1)
    expect(next).not.toHaveBeenCalled();expect(dispatchEvent).not.toHaveBeenCalled()
  })
  it('keeps mock and isolated callers working without a configured token provider',async()=>{
    const fetcher=vi.fn().mockResolvedValue(new Response('{}'));vi.stubGlobal('fetch',fetcher)
    await authorizedRequest('/api','mock-token','/books')
    expect(fetcher).toHaveBeenCalledWith('/api/books',expect.objectContaining({headers:{Authorization:'Bearer mock-token'}}))
  })
})
