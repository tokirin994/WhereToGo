import {mount,flushPromises} from '@vue/test-utils'
import type {User} from 'oidc-client-ts'
import {beforeEach,afterEach,describe,it,expect,vi} from 'vitest'
const mocks=vi.hoisted(()=>({initialize:vi.fn(),account:vi.fn(),api:vi.fn(),ledger:vi.fn()}))
vi.mock('./auth',async()=>{const {shallowRef}=await import('vue');const auth={currentUser:shallowRef(null),authError:shallowRef(''),authAction:shallowRef(null),initializeAuth:mocks.initialize,registrationEnabled:true,localMockAuth:false,signIn:vi.fn(),register:vi.fn(),signOut:vi.fn(),identity:{dispose:vi.fn(),accountAction:vi.fn()},accountConsoleUrl:'https://identity.example/account/'};return {auth,...auth}})
vi.mock('./accountApi',()=>({accountRequest:mocks.account,ledgerAccountRequest:mocks.ledger}))
vi.mock('./api/client',()=>({apiRequest:mocks.api}))
function signedInUser():User{return {access_token:'dummy-token',profile:{sub:'alice',iss:'https://identity.example/realms/personal',preferred_username:'alice'}} as User}
let wrapper:ReturnType<typeof mount>|undefined
beforeEach(()=>{vi.clearAllMocks();history.replaceState({},'','/account/');mocks.account.mockImplementation(async(path:string)=>path==='/sessions'?[]:{id:'alice',username:'alice',email:'alice@example.invalid'});mocks.api.mockResolvedValue({available:true,providers:[]});mocks.ledger.mockResolvedValue({available:true,configured:false})})
afterEach(()=>wrapper?.unmount())
async function drain(){await vi.dynamicImportSettled();for(let i=0;i<12;i++)await flushPromises()}
describe('portal account entry with the real authentication gate',()=>{
 it('renders the complete account workspace after an already signed-in user opens the account URL',async()=>{
  const auth=await import('./auth');auth.currentUser.value=signedInUser()
  mocks.initialize.mockResolvedValue(undefined)
  const {default:Root}=await import('./PortalRoot.vue');wrapper=mount(Root);expect(wrapper.text()).toContain('正在打开账号中心');await drain()
  expect(wrapper.text()).toContain('从这里，打开你的应用');expect(wrapper.findAll('.account-app-launch')).toHaveLength(2)
 })
 it('renders the account workspace when SSO completes after the gate initially mounts',async()=>{
  const auth=await import('./auth');auth.currentUser.value=null
  let complete!:()=>void;mocks.initialize.mockImplementation(()=>new Promise<void>(resolve=>{complete=()=>{auth.currentUser.value=signedInUser();resolve()}}))
  const {default:Root}=await import('./PortalRoot.vue');wrapper=mount(Root);expect(wrapper.text()).toContain('正在准备个人空间');complete();await drain()
  expect(wrapper.text()).toContain('从这里，打开你的应用')
 })
 it('connects the portal account menu to the complete protected account workspace',async()=>{
  const auth=await import('./auth');auth.currentUser.value=signedInUser();mocks.initialize.mockResolvedValue(undefined)
  history.replaceState({},'','/');const {default:Root}=await import('./PortalRoot.vue');wrapper=mount(Root);await drain()
  const entry=wrapper.get('.portal-account-menu a');expect(entry.text()).toBe('账号与服务');expect(entry.attributes('href')).toBe('/account/')
  wrapper.unmount();history.replaceState({},'',entry.attributes('href')!);wrapper=mount(Root);await drain()
  expect(wrapper.findAll('.account-app-launch')).toHaveLength(2)
  for(const [name,selector] of [['个人资料','input[autocomplete=given-name]'],['登录安全','.account-setting-row'],['AI 与地图 Key','.account-provider-grid'],['记账与云同步','input[type=email]']]){await wrapper.findAll('.account-tabs button').find(item=>item.text().includes(name!))!.trigger('click');expect(wrapper.find(selector!).exists()).toBe(true)}
 })
})
