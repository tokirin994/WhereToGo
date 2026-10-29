import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import { createIdentitySession } from './identitySession'

const oidc=vi.hoisted(()=>({settings: {} as Record<string,unknown>,redirect:vi.fn(),callback:vi.fn(),remove:vi.fn(),getUser:vi.fn(),silent:vi.fn(),silentCallback:vi.fn(),signout:vi.fn(),expiring:vi.fn(),expired:vi.fn(),loaded:vi.fn()}))
vi.mock('oidc-client-ts',()=>({
  WebStorageStateStore:class {},
  UserManager:class {
    constructor(settings:Record<string,unknown>){oidc.settings=settings}
    events={addUserLoaded:oidc.loaded,addAccessTokenExpiring:oidc.expiring,addAccessTokenExpired:oidc.expired}
    signinRedirect=oidc.redirect
    signinRedirectCallback=oidc.callback
    removeUser=oidc.remove
    getUser=oidc.getUser
    signinSilent=oidc.silent
    signinSilentCallback=oidc.silentCallback
    signoutRedirect=oidc.signout
  },
}))
const origin='https://personal.example'
function session(basePath='/',changed=vi.fn()){
  return createIdentitySession({authority:origin+'/identity/realms/personal',clientId:'test-web',audience:'test-api',allowLoopback:false,basePath,
    returnPath:path=>path==='/'||/^\/(travel|books)(?:\/|$)/.test(path),changed})
}
beforeEach(()=>{
  vi.resetAllMocks()
  vi.useFakeTimers()
  oidc.getUser.mockResolvedValue(null)
  oidc.silent.mockRejectedValue({error:'login_required'})
  vi.stubGlobal('window',{location:{origin,pathname:'/',search:'',replace:vi.fn(),reload:vi.fn()},sessionStorage:{},addEventListener:vi.fn(),removeEventListener:vi.fn()})
  vi.stubGlobal('document',{visibilityState:'visible',addEventListener:vi.fn(),removeEventListener:vi.fn()})
  vi.stubGlobal('localStorage',{setItem:vi.fn(),removeItem:vi.fn()})
})
afterEach(()=>{vi.clearAllTimers();vi.useRealTimers();vi.unstubAllGlobals()})
describe('unified account registration',()=>{
  it('requires fresh authentication before sensitive account changes',async()=>{
    window.location.pathname='/account/'
    await session().accountAction('UPDATE_EMAIL')
    expect(oidc.redirect).toHaveBeenCalledWith(expect.objectContaining({prompt:'login',max_age:0,extraQueryParams:{kc_action:'UPDATE_EMAIL'}}))
  })

  it('starts Keycloak registration with OIDC state and a Chinese interface',async()=>{
    await session().register('/travel/?tab=trips')
    expect(oidc.redirect).toHaveBeenCalledWith({prompt:'create',ui_locales:'zh-CN',state:{returnTo:'/travel/?tab=trips',registration:true}})
    expect(oidc.settings).toMatchObject({response_type:'code',redirect_uri:origin+'/auth/callback',extraQueryParams:{audience:'test-api'}})
    expect(oidc.settings).not.toHaveProperty('disablePKCE',true)
  })
  it.each(['https://evil.example/travel/','//evil.example/travel/','/identity/admin/'])('rejects unsafe return destination %s',async target=>{
    await session().register(target)
    expect(oidc.redirect).toHaveBeenCalledWith(expect.objectContaining({state:{returnTo:'/',registration:true}}))
  })
  it('preserves the ledger base path, book and handoff query',async()=>{
    await session('/ledger/').register('/ledger/books/123?travelTripId=abc')
    expect(oidc.settings.redirect_uri).toBe(origin+'/ledger/auth/callback')
    expect(oidc.redirect).toHaveBeenCalledWith(expect.objectContaining({state:{returnTo:'/ledger/books/123?travelTripId=abc',registration:true}}))
  })
  it('returns a registered user to the portal with a welcome hint',async()=>{
    window.location.pathname='/auth/callback'
    oidc.callback.mockResolvedValue({profile:{sub:'new-user'},state:{returnTo:'/',registration:true}})
    await session().initialize()
    expect(window.location.replace).toHaveBeenCalledWith('/?welcome=1')
  })
  it('keeps the application destination after registration',async()=>{
    window.location.pathname='/auth/callback'
    oidc.callback.mockResolvedValue({profile:{sub:'new-user'},state:{returnTo:'/travel/?tab=trips',registration:true}})
    await session().initialize()
    expect(window.location.replace).toHaveBeenCalledWith('/travel/?tab=trips')
  })
  it('preserves a ledger launch from the portal',async()=>{
    window.location.pathname='/auth/callback'
    oidc.callback.mockResolvedValue({profile:{sub:'new-user'},state:{returnTo:'/?openApp=ledger',registration:true}})
    await session().initialize()
    expect(window.location.replace).toHaveBeenCalledWith('/?openApp=ledger')
  })
  it('rejects a forged callback return destination',async()=>{
    window.location.pathname='/auth/callback'
    oidc.callback.mockResolvedValue({profile:{sub:'new-user'},state:{returnTo:'https://evil.example/',registration:true}})
    await session().initialize()
    expect(window.location.replace).toHaveBeenCalledWith('/?welcome=1')
  })
})

const alice=()=>({access_token:'alice-token',id_token:'alice-id',profile:{sub:'alice',sid:'session-a'},expires_in:300,expired:false})
const flush=async()=>{for(let i=0;i<12;i++)await Promise.resolve()}
function focus(){const cb=vi.mocked(window.addEventListener).mock.calls.find(args=>args[0]==='focus')?.[1];if(typeof cb==='function')cb(new Event('focus'))}
describe('shared SSO lifecycle regression',()=>{
  it('silently discovers a portal login when the ledger has no local token',async()=>{
    const changed=vi.fn();oidc.silent.mockResolvedValue(alice())
    const app=session('/ledger/',changed);await app.initialize()
    expect(oidc.silent).toHaveBeenCalledWith({forceIframeAuth:true})
    expect(app.current?.profile.sub).toBe('alice');expect(changed).toHaveBeenCalledWith(expect.objectContaining({access_token:'alice-token'}))
    expect(oidc.redirect).not.toHaveBeenCalled()
  })
  it('has one renewal owner and does not install the session-change-as-logout handler',()=>{
    session();expect(oidc.settings).toMatchObject({monitorSession:false,automaticSilentRenew:false,silentRequestTimeoutInSeconds:8})
    expect(oidc.expiring).toHaveBeenCalledTimes(1)
  })
  it('keeps a valid stored login when an iframe or network check fails',async()=>{
    oidc.getUser.mockResolvedValue(alice());oidc.silent.mockRejectedValue(new Error('iframe timed out'))
    const app=session();await app.initialize()
    expect(app.current?.profile.sub).toBe('alice');expect(oidc.remove).not.toHaveBeenCalled();expect(oidc.redirect).not.toHaveBeenCalled()
  })
  it('does not redirect or repeatedly initialize when SSO is absent',async()=>{
    const app=session('/ledger/');await Promise.all([app.initialize(),app.initialize()]);await app.initialize()
    expect(app.current).toBeNull();expect(oidc.silent).toHaveBeenCalledTimes(1);expect(oidc.redirect).not.toHaveBeenCalled()
    expect(localStorage.setItem).not.toHaveBeenCalled()
  })
  it('only processes the iframe callback inside a silent callback document',async()=>{
    window.location.pathname='/ledger/auth/silent';await session('/ledger/').initialize()
    expect(oidc.silentCallback).toHaveBeenCalledTimes(1);expect(oidc.silent).not.toHaveBeenCalled();expect(oidc.getUser).not.toHaveBeenCalled()
  })
  it('does not clear the account when same-subject session state changes on focus',async()=>{
    oidc.silent.mockResolvedValue(alice());const app=session();await app.initialize()
    vi.setSystemTime(Date.now()+31000);focus();await flush()
    expect(oidc.silent).toHaveBeenCalledTimes(2);expect(app.current?.profile.sub).toBe('alice');expect(oidc.remove).not.toHaveBeenCalled()
  })
  it('throttles concurrent focus and visibility checks',async()=>{
    oidc.silent.mockResolvedValue(alice());await session().initialize()
    vi.setSystemTime(Date.now()+31000);focus();focus();focus();await flush()
    expect(oidc.silent).toHaveBeenCalledTimes(2)
  })
  it('joins concurrent renewal requests, including the expiration timer',async()=>{
    oidc.silent.mockResolvedValue(alice());const app=session();await app.initialize();oidc.silent.mockClear()
    let finish!:(value:ReturnType<typeof alice>)=>void
    oidc.silent.mockImplementation(()=>new Promise(resolve=>{finish=resolve}))
    const first=app.accessToken(true),second=app.accessToken(true)
    oidc.expiring.mock.calls[0]![0]();finish(alice())
    expect(await first).toBe('alice-token');expect(await second).toBe('alice-token');expect(oidc.silent).toHaveBeenCalledTimes(1)
  })
  it('recovers a rotated refresh token through SSO without asking for credentials',async()=>{
    oidc.silent.mockResolvedValue(alice());const app=session();await app.initialize();oidc.silent.mockClear()
    oidc.silent.mockRejectedValueOnce({error:'invalid_grant'}).mockResolvedValueOnce(alice())
    expect(await app.accessToken(true)).toBe('alice-token')
    expect(oidc.silent.mock.calls).toEqual([[{forceIframeAuth:false}],[{forceIframeAuth:true}]]);expect(oidc.redirect).not.toHaveBeenCalled()
  })
  it('does not reuse an old subject before checking the current SSO account',async()=>{
    oidc.getUser.mockResolvedValue(alice());oidc.silent.mockResolvedValue({...alice(),profile:{sub:'bob'}})
    const changed=vi.fn();const app=session('/',changed);await app.initialize()
    expect(app.current?.profile.sub).toBe('bob');expect(changed).not.toHaveBeenCalledWith(expect.objectContaining({profile:expect.objectContaining({sub:'alice'})}))
  })
  it('clears an authenticated app after a confirmed IdP logout, without a redirect loop',async()=>{
    oidc.silent.mockResolvedValue(alice());const app=session();await app.initialize()
    oidc.silent.mockRejectedValue({error:'login_required'});vi.setSystemTime(Date.now()+31000);focus();await flush()
    expect(app.current).toBeNull();expect(oidc.redirect).not.toHaveBeenCalled()
  })
  it('shares logout notifications across client IDs, without sharing tokens',async()=>{
    oidc.silent.mockResolvedValue(alice());const app=session('/ledger/');await app.initialize()
    const listener=vi.mocked(window.addEventListener).mock.calls.find(args=>args[0]==='storage')?.[1]
    expect(typeof listener).toBe('function')
    if(typeof listener==='function')listener({key:`personal-identity:${origin}/identity/realms/personal:event`,newValue:JSON.stringify({type:'logout',id:'logout-1'})} as StorageEvent)
    await flush();expect(app.current).toBeNull()
    expect(JSON.stringify(vi.mocked(localStorage.setItem).mock.calls)).not.toContain('alice-token')
  })
  it('does not resurrect a session if logout happens during renewal',async()=>{
    oidc.silent.mockResolvedValue(alice());const app=session();await app.initialize()
    let finish!:(value:ReturnType<typeof alice>)=>void;oidc.silent.mockImplementation(()=>new Promise(resolve=>{finish=resolve}))
    const pending=app.accessToken(true);await app.signOut();finish(alice())
    await expect(pending).rejects.toThrow('登录已过期');expect(app.current).toBeNull()
  })
})

describe('SSO account and logout isolation',()=>{
  it('does not return a new account token to an old account workspace',async()=>{
    oidc.silent.mockResolvedValue(alice());const changed=vi.fn(),app=session('/',changed);await app.initialize()
    oidc.silent.mockResolvedValue({...alice(),access_token:'bob-token',profile:{sub:'bob'}})
    await expect(app.accessToken(true)).rejects.toThrow('登录已过期')
    expect(app.current).toBeNull();expect(changed).toHaveBeenLastCalledWith(null);expect(window.location.reload).toHaveBeenCalledTimes(1)
  })
  it('does not silently sign back in after receiving another application logout',async()=>{
    oidc.silent.mockResolvedValue(alice());const app=session();await app.initialize()
    const listener=vi.mocked(window.addEventListener).mock.calls.find(args=>args[0]==='storage')?.[1]
    if(typeof listener==='function')listener({key:`personal-identity:${origin}/identity/realms/personal:event`,newValue:JSON.stringify({type:'logout'})} as StorageEvent)
    await flush();oidc.silent.mockClear();vi.setSystemTime(Date.now()+61000);focus();await flush()
    expect(app.current).toBeNull();expect(oidc.silent).not.toHaveBeenCalled()
  })
  it('does not treat interaction-required as a logout of a still-valid local session',async()=>{
    oidc.getUser.mockResolvedValue(alice());oidc.silent.mockRejectedValue({error:'interaction_required'})
    const app=session();await app.initialize()
    expect(app.current?.profile.sub).toBe('alice');expect(oidc.remove).not.toHaveBeenCalled()
  })
  it('does not issue an expired token when renewal cannot connect',async()=>{
    oidc.silent.mockResolvedValue({...alice(),expired:true,expires_in:-1});const app=session();await app.initialize()
    oidc.silent.mockRejectedValue(new Error('offline'))
    await expect(app.accessToken()).rejects.toThrow('offline')
  })
})


describe('Safari session recovery',()=>{
  const refreshed=()=>({...alice(),refresh_token:'dummy-refresh-token'})
  it('renews an existing session without an iframe on page load and focus',async()=>{
    oidc.getUser.mockResolvedValue(refreshed());oidc.silent.mockResolvedValue(refreshed())
    const app=session();await app.initialize()
    expect(oidc.silent).toHaveBeenLastCalledWith({forceIframeAuth:false})
    vi.setSystemTime(Date.now()+31000);focus();await flush()
    expect(oidc.silent).toHaveBeenCalledTimes(2)
    expect(oidc.silent).toHaveBeenLastCalledWith({forceIframeAuth:false})
    expect(app.current?.profile.sub).toBe('alice')
  })
  it('does not clear a valid refresh session when Safari iframe checks cannot see cookies',async()=>{
    oidc.getUser.mockResolvedValue(refreshed());oidc.silent.mockResolvedValue(refreshed())
    const app=session();await app.initialize();oidc.remove.mockClear()
    oidc.silent.mockRejectedValue({error:'login_required'})
    vi.setSystemTime(Date.now()+31000);focus();await flush()
    expect(app.current?.profile.sub).toBe('alice');expect(oidc.remove).not.toHaveBeenCalled()
    expect(oidc.redirect).not.toHaveBeenCalled()
  })
  it('never restores cached credentials after a rejected refresh and failed iframe recovery',async()=>{
    oidc.getUser.mockResolvedValue(refreshed())
    oidc.silent.mockRejectedValueOnce({error:'invalid_grant'}).mockRejectedValueOnce({error:'login_required'})
    const app=session();await app.initialize()
    expect(app.current).toBeNull();expect(oidc.remove).toHaveBeenCalled();expect(oidc.redirect).not.toHaveBeenCalled()
  })
  it('does not mount a saved account that differs from the last shared login',async()=>{
    vi.stubGlobal('localStorage',{getItem:vi.fn(()=>JSON.stringify({type:'login',sub:'bob'})),setItem:vi.fn(),removeItem:vi.fn()})
    oidc.getUser.mockResolvedValue(refreshed());oidc.silent.mockRejectedValue(new Error('iframe blocked'))
    const changed=vi.fn(),app=session('/',changed)
    await expect(app.initialize()).rejects.toThrow('统一登录暂时无法连接')
    expect(app.current).toBeNull();expect(changed).not.toHaveBeenCalledWith(expect.objectContaining({profile:expect.objectContaining({sub:'alice'})}))
    expect(oidc.remove).toHaveBeenCalled()
  })
  it('checks bfcache restored pages without waiting for focus throttling',async()=>{
    oidc.getUser.mockResolvedValue(refreshed());oidc.silent.mockResolvedValue(refreshed())
    const app=session();await app.initialize();oidc.silent.mockClear()
    const listener=vi.mocked(window.addEventListener).mock.calls.find(args=>args[0]==='pageshow')?.[1]
    if(typeof listener==='function')listener({persisted:true} as PageTransitionEvent)
    await flush();expect(oidc.silent).toHaveBeenCalledExactlyOnceWith({forceIframeAuth:false})
    app.dispose();expect(window.removeEventListener).toHaveBeenCalledWith('pageshow',listener)
  })
  it('clears a restored account before exposing it after another tab switches accounts',async()=>{
    const getItem=vi.fn(()=>JSON.stringify({type:'login',sub:'alice'}))
    vi.stubGlobal('localStorage',{getItem,setItem:vi.fn(),removeItem:vi.fn()})
    oidc.getUser.mockResolvedValue(refreshed());oidc.silent.mockResolvedValue(refreshed())
    const app=session();await app.initialize();getItem.mockReturnValue(JSON.stringify({type:'login',sub:'bob'}))
    const listener=vi.mocked(window.addEventListener).mock.calls.find(args=>args[0]==='pageshow')?.[1]
    if(typeof listener==='function')listener({persisted:true} as PageTransitionEvent)
    await flush();expect(app.current).toBeNull();expect(window.location.reload).toHaveBeenCalled()
  })
})
