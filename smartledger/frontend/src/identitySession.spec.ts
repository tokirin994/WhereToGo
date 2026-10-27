import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import { createIdentitySession } from './identitySession'

const oidc=vi.hoisted(()=>({settings: {} as Record<string,unknown>,redirect:vi.fn(),callback:vi.fn(),remove:vi.fn()}))
vi.mock('oidc-client-ts',()=>({
  WebStorageStateStore:class {},
  UserManager:class {
    constructor(settings:Record<string,unknown>){oidc.settings=settings}
    events={addUserLoaded:vi.fn(),addUserSignedOut:vi.fn(),addUserSessionChanged:vi.fn(),addAccessTokenExpired:vi.fn()}
    signinRedirect=oidc.redirect
    signinRedirectCallback=oidc.callback
    removeUser=oidc.remove
  },
}))
const origin='https://personal.example'
function session(basePath='/'){
  return createIdentitySession({authority:origin+'/identity/realms/personal',clientId:'test-web',audience:'test-api',allowLoopback:false,basePath,
    returnPath:path=>path==='/'||/^\/(travel|books)(?:\/|$)/.test(path),changed:vi.fn()})
}
beforeEach(()=>{
  vi.clearAllMocks()
  vi.stubGlobal('window',{location:{origin,pathname:'/',search:'',replace:vi.fn(),reload:vi.fn()},sessionStorage:{},addEventListener:vi.fn()})
  vi.stubGlobal('document',{addEventListener:vi.fn()})
  vi.stubGlobal('localStorage',{setItem:vi.fn(),removeItem:vi.fn()})
})
afterEach(()=>vi.unstubAllGlobals())
describe('unified account registration',()=>{
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
