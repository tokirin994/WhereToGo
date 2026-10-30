// @vitest-environment jsdom
import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest'
import {createRenderer,h} from 'vue'
const mocks=vi.hoisted(()=>({initialize:vi.fn(),login:vi.fn(),resume:vi.fn(),dispose:vi.fn(),workspace:vi.fn(),path:'/',changed:undefined as undefined|((user:unknown)=>void),ended:undefined as undefined|((reason:string)=>void)}))
vi.mock('./identitySession',()=>({createIdentitySession:(config:{changed:(user:unknown)=>void;sessionEnded:(reason:string)=>void})=>{mocks.changed=config.changed;mocks.ended=config.sessionEnded;return {initialize:mocks.initialize,signIn:mocks.login,resumeSSO:mocks.resume,dispose:mocks.dispose,accessToken:vi.fn()}}}))
vi.mock('./appLinks',()=>({portalUrl:'https://personal.example/',appBasePath:'/ledger/',appRoutePath:()=>mocks.path,ledgerOnly:false,platform:{loginUrl:()=>'/login/?app=ledger'}}))
vi.mock('./nutstoreSync',()=>({clearNutstoreCredentials:vi.fn()}))
vi.mock('./LedgerWorkspace.vue',()=>({__esModule:true,default:{setup(){mocks.workspace();return ()=>h('section',{class:'workspace-mock'})}}}))
// Run the real Vue onMounted/conditional rendering lifecycle without a browser DOM.
interface Host {children:Host[];parent?:Host;kind:string;props?:Record<string,unknown>;text?:string}
const node=(kind:string):Host=>({kind,children:[]})
const renderer=createRenderer<Host,Host>({
  createElement:node,createText:()=>node('text'),createComment:()=>node('comment'),
  insert(child,parent,anchor){if(child.parent){const previous=child.parent.children,at=previous.indexOf(child);if(at>=0)previous.splice(at,1)}child.parent=parent;const at=anchor?parent.children.indexOf(anchor):-1;if(at<0)parent.children.push(child);else parent.children.splice(at,0,child)},
  remove(child){const children=child.parent?.children;if(children){const at=children.indexOf(child);if(at>=0)children.splice(at,1)}},
  parentNode:child=>child.parent||null,nextSibling:child=>{const siblings=child.parent?.children;return siblings?.[siblings.indexOf(child)+1]||null},
  setText(el,text){el.text=text},setElementText(el,text){el.text=text},patchProp(el,key,_prev,next){(el.props??={})[key]=next},
})
const roots:Host[]=[]
function hasClass(name:string){const visit=(el:Host):boolean=>String(el.props?.class||'').split(' ').includes(name)||el.children.some(visit);return roots.some(visit)}
async function mount(){const {default:App}=await import('./App.vue');const root=node('root');roots.push(root);renderer.render(h(App),root);for(let i=0;i<30;i++)await Promise.resolve()}
beforeEach(()=>{
  vi.resetModules();vi.resetAllMocks();mocks.path='/';mocks.initialize.mockResolvedValue(undefined)
  vi.stubEnv('VITE_SMARTLEDGER_API_URL','https://personal.example/ledger-api');vi.stubEnv('VITE_LOCAL_MOCK_AUTH','false')
  vi.stubGlobal('window',{location:{origin:'https://personal.example',hostname:'personal.example',pathname:'/ledger/',search:'',hash:'',replace:vi.fn()},history:{replaceState:vi.fn()},addEventListener:vi.fn(),removeEventListener:vi.fn()})
})
afterEach(()=>{for(const root of roots.splice(0))renderer.render(null,root);vi.unstubAllGlobals();vi.unstubAllEnvs()})
describe('ledger application SSO entry',()=>{
  it('opens the ledger after silent SSO without starting an interactive login',async()=>{
    mocks.initialize.mockImplementation(async()=>mocks.changed?.({access_token:'ledger-token',profile:{sub:'alice'}}))
    await mount();expect(mocks.initialize).toHaveBeenCalledTimes(1);expect(mocks.workspace).toHaveBeenCalledTimes(1);expect(mocks.login).not.toHaveBeenCalled()
  })
  it('hands a bare app link to the portal once instead of displaying a separate login',async()=>{
    await mount();expect(mocks.workspace).not.toHaveBeenCalled();expect(mocks.login).not.toHaveBeenCalled()
    expect(window.location.replace).toHaveBeenCalledExactlyOnceWith('/login/?app=ledger')
  })
  it('does not automatically sign in again after an explicit logout',async()=>{
    window.location.search='?signedOut=1';await mount();expect(window.location.replace).not.toHaveBeenCalled();expect(hasClass('account-gate')).toBe(true)
  })
  it('consumes the central login marker and uses bounded top-level SSO when the iframe is blocked',async()=>{
    window.location.search='?__sso=1';mocks.initialize.mockRejectedValue(new Error('iframe blocked'))
    await mount();expect(mocks.resume).toHaveBeenCalledExactlyOnceWith('/ledger/');expect(window.history.replaceState).toHaveBeenCalledWith({},'','/ledger/');expect(mocks.login).not.toHaveBeenCalled()
  })
  it('does not redirect again after a callback or failed callback',async()=>{
    mocks.path='/auth/callback';mocks.initialize.mockRejectedValue(new Error('Callback is already consumed'))
    await mount();expect(mocks.login).not.toHaveBeenCalled();expect(mocks.workspace).not.toHaveBeenCalled()
  })
  it('never starts ledger requests inside a successful authentication callback document',async()=>{
    mocks.path='/auth/callback'
    mocks.initialize.mockImplementation(async()=>mocks.changed?.({access_token:'ledger-token',profile:{sub:'alice'}}))
    await mount();expect(mocks.workspace).not.toHaveBeenCalled();expect(hasClass('workspace-mock')).toBe(false)
    expect(hasClass('account-gate')).toBe(true);expect(mocks.login).not.toHaveBeenCalled()
  })
  it('keeps the ledger mounted when an API reports 401 a few seconds after login',async()=>{
    mocks.initialize.mockImplementation(async()=>mocks.changed?.({access_token:'ledger-token',profile:{sub:'alice'}}))
    await mount()
    const handler=vi.mocked(window.addEventListener).mock.calls.find(args=>args[0]==='smartledger-api-session-issue')?.[1]
    if(typeof handler==='function')handler(new CustomEvent('smartledger-api-session-issue',{detail:{status:401,method:'GET',route:'/api/v1/books',requestId:'test-request',at:new Date().toISOString()}}))
    for(let i=0;i<12;i++)await Promise.resolve()
    expect(hasClass('workspace-mock')).toBe(true);expect(hasClass('account-gate')).toBe(false)
    expect(hasClass('ledger-connection-notice')).toBe(true);expect(mocks.login).not.toHaveBeenCalled()
    expect(vi.mocked(window.addEventListener).mock.calls.some(args=>args[0]==='smartledger-session-expired')).toBe(false)
    const find=(el:Host):Host|undefined=>el.kind==='button'&&el.text==='重新连接'?el:el.children.map(find).find(Boolean)
    const button=roots.map(find).find(Boolean)
    expect(button).toBeDefined();await (button!.props!.onClick as ()=>Promise<void>)()
    expect(mocks.resume).toHaveBeenCalledExactlyOnceWith('/ledger/')
    expect(mocks.login).not.toHaveBeenCalled()
  })
  it('does not disguise a failed trip handoff as an account logout',async()=>{
    mocks.initialize.mockImplementation(async()=>mocks.changed?.({access_token:'ledger-token',profile:{sub:'alice'}}))
    window.location.search='?travelTripId=trip-test'
    vi.stubGlobal('fetch',vi.fn().mockResolvedValue(new Response('{}',{status:503})))
    await mount()
    expect(hasClass('workspace-mock')).toBe(true);expect(hasClass('account-gate')).toBe(false)
    expect(hasClass('ledger-connection-notice')).toBe(true);expect(mocks.login).not.toHaveBeenCalled()
  })
  it('still removes the workspace on a confirmed identity session end',async()=>{
    mocks.initialize.mockImplementation(async()=>mocks.changed?.({access_token:'ledger-token',profile:{sub:'alice'}}))
    await mount();mocks.ended?.('refresh_rejected');mocks.changed?.(null)
    for(let i=0;i<12;i++)await Promise.resolve()
    expect(hasClass('workspace-mock')).toBe(false);expect(hasClass('account-gate')).toBe(true)
  })
})
