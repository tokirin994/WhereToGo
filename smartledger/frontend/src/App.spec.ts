// @vitest-environment jsdom
import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest'
import {createRenderer,h} from 'vue'
const mocks=vi.hoisted(()=>({initialize:vi.fn(),login:vi.fn(),dispose:vi.fn(),workspace:vi.fn(),path:'/',changed:undefined as undefined|((user:unknown)=>void)}))
vi.mock('./identitySession',()=>({createIdentitySession:(config:{changed:(user:unknown)=>void})=>{mocks.changed=config.changed;return {initialize:mocks.initialize,signIn:mocks.login,dispose:mocks.dispose,accessToken:vi.fn()}}}))
vi.mock('./appLinks',()=>({portalUrl:'https://personal.example/',appBasePath:'/ledger/',appRoutePath:()=>mocks.path,ledgerOnly:false}))
vi.mock('./nutstoreSync',()=>({clearNutstoreCredentials:vi.fn()}))
vi.mock('./LedgerWorkspace.vue',()=>({__esModule:true,default:{setup(){mocks.workspace();return ()=>null}}}))
// Run the real Vue onMounted/conditional rendering lifecycle without a browser DOM.
interface Host {children:Host[];parent?:Host;kind:string}
const node=(kind:string):Host=>({kind,children:[]})
const renderer=createRenderer<Host,Host>({
  createElement:node,createText:()=>node('text'),createComment:()=>node('comment'),
  insert(child,parent,anchor){child.parent=parent;const at=anchor?parent.children.indexOf(anchor):-1;if(at<0)parent.children.push(child);else parent.children.splice(at,0,child)},
  remove(child){const children=child.parent?.children;if(children){const at=children.indexOf(child);if(at>=0)children.splice(at,1)}},
  parentNode:child=>child.parent||null,nextSibling:()=>null,
  setText(){},setElementText(){},patchProp(){},
})
const roots:Host[]=[]
async function mount(){const {default:App}=await import('./App.vue');const root=node('root');roots.push(root);renderer.render(h(App),root);for(let i=0;i<30;i++)await Promise.resolve()}
beforeEach(()=>{
  vi.resetModules();vi.resetAllMocks();mocks.path='/';mocks.initialize.mockResolvedValue(undefined)
  vi.stubEnv('VITE_SMARTLEDGER_API_URL','https://personal.example/ledger-api');vi.stubEnv('VITE_LOCAL_MOCK_AUTH','false')
  vi.stubGlobal('window',{location:{origin:'https://personal.example',hostname:'personal.example',pathname:'/ledger/',search:''},addEventListener:vi.fn(),removeEventListener:vi.fn()})
})
afterEach(()=>{for(const root of roots.splice(0))renderer.render(null,root);vi.unstubAllGlobals();vi.unstubAllEnvs()})
describe('ledger application SSO entry',()=>{
  it('opens the ledger after silent SSO without starting an interactive login',async()=>{
    mocks.initialize.mockImplementation(async()=>mocks.changed?.({access_token:'ledger-token',profile:{sub:'alice'}}))
    await mount();expect(mocks.initialize).toHaveBeenCalledTimes(1);expect(mocks.workspace).toHaveBeenCalledTimes(1);expect(mocks.login).not.toHaveBeenCalled()
  })
  it('keeps the login screen stable when no SSO session exists',async()=>{
    await mount();expect(mocks.workspace).not.toHaveBeenCalled();expect(mocks.login).not.toHaveBeenCalled()
  })
  it('does not redirect again after a callback or failed callback',async()=>{
    mocks.path='/auth/callback';mocks.initialize.mockRejectedValue(new Error('Callback is already consumed'))
    await mount();expect(mocks.login).not.toHaveBeenCalled();expect(mocks.workspace).not.toHaveBeenCalled()
  })
})
