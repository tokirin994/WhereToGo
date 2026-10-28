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
    const fetcher=vi.fn().mockResolvedValueOnce(new Response('{}',{status:401})).mockResolvedValueOnce(new Response('{}'))
    vi.stubGlobal('fetch',fetcher);const provider=vi.fn().mockResolvedValue('token');setSessionTokenProvider(provider)
    expect((await authorizedRequest('/api','old','/books')).status).toBe(200)
    expect(provider.mock.calls).toEqual([[false],[true]]);expect(fetcher).toHaveBeenCalledTimes(2)
  })
  it('does not replay mutations after a 401',async()=>{
    const dispatchEvent=vi.fn();vi.stubGlobal('window',{dispatchEvent})
    const fetcher=vi.fn().mockResolvedValue(new Response('{}',{status:401}));vi.stubGlobal('fetch',fetcher)
    setSessionTokenProvider(vi.fn().mockResolvedValue('token'))
    expect((await authorizedRequest('/api','old','/books',{method:'POST',body:'{}'})).status).toBe(401)
    expect(fetcher).toHaveBeenCalledTimes(1);expect(dispatchEvent).toHaveBeenCalledTimes(1)
  })
  it('keeps mock and isolated callers working without a configured token provider',async()=>{
    const fetcher=vi.fn().mockResolvedValue(new Response('{}'));vi.stubGlobal('fetch',fetcher)
    await authorizedRequest('/api','mock-token','/books')
    expect(fetcher).toHaveBeenCalledWith('/api/books',expect.objectContaining({headers:{Authorization:'Bearer mock-token'}}))
  })
})
