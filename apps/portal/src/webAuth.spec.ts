import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest'
import {createWebAuth} from '@personal/identity/vue'
const mocks=vi.hoisted(()=>({initialize:vi.fn(),signIn:vi.fn(),register:vi.fn(),resume:vi.fn(),token:vi.fn(),changed:undefined as undefined|((user:unknown)=>void)}))
vi.mock('@personal/identity',()=>({createIdentitySession:(config:{changed:(user:unknown)=>void})=>{mocks.changed=config.changed;return {initialize:mocks.initialize,signIn:mocks.signIn,register:mocks.register,resumeSSO:mocks.resume,accessToken:mocks.token}}}))
const config={authority:'https://identity.example/realms/personal',clientId:'travel-web',audience:'wheretogo-api',basePath:'/',allowLoopback:true,registrationEnabled:true,localMockAuth:false,returnPath:()=>true}
beforeEach(()=>{vi.resetAllMocks();history.replaceState({},'','/');mocks.initialize.mockResolvedValue(undefined)})
afterEach(()=>vi.unstubAllGlobals())
describe('shared app authentication controller',()=>{
  it('uses an existing silent SSO session without interactive authentication',async()=>{
    const auth=createWebAuth(config)
    mocks.initialize.mockImplementation(async()=>mocks.changed?.({profile:{sub:'alice'}}))
    await auth.initializeAuth()
    expect(auth.currentUser.value?.profile.sub).toBe('alice');expect(mocks.signIn).not.toHaveBeenCalled()
  })
  it('consumes a central return marker and attempts top-level prompt-none once if iframe SSO fails',async()=>{
    history.replaceState({},'','/?__sso=1&trip=abc')
    mocks.initialize.mockRejectedValue(new Error('iframe blocked'))
    const auth=createWebAuth(config);await auth.initializeAuth();await auth.initializeAuth()
    expect(mocks.resume).toHaveBeenCalledExactlyOnceWith('/?trip=abc');expect(location.search).toBe('?trip=abc')
    expect(mocks.signIn).not.toHaveBeenCalled();expect(auth.authError.value).toBe('')
  })
  it('does not start top-level SSO repeatedly without a central return marker',async()=>{
    mocks.initialize.mockRejectedValue(new Error('offline'))
    const auth=createWebAuth(config);await auth.initializeAuth();await auth.initializeAuth()
    expect(mocks.resume).not.toHaveBeenCalled();expect(auth.authError.value).toBe('offline')
  })
  it('lets an exported standalone app use its own OIDC client',async()=>{
    const auth=createWebAuth(config);await auth.signIn('/?trip=abc');expect(mocks.signIn).toHaveBeenCalledExactlyOnceWith('/?trip=abc')
  })
  it('keeps direct registration available in standalone mode and guards repeated clicks',async()=>{
    const auth=createWebAuth(config);await auth.register('/');await auth.register('/')
    expect(mocks.register).toHaveBeenCalledTimes(1);expect(mocks.signIn).not.toHaveBeenCalled()
  })
})
