import {flushPromises,mount} from '@vue/test-utils'
import {beforeEach,describe,expect,it,vi} from 'vitest'
import {ref} from 'vue'
import LoginEntry from './LoginEntry.vue'
import {initializeAuth,signIn,register,authError} from './auth'
vi.mock('./auth',()=>({currentUser:ref(null),authAction:ref(null),authError:ref(''),initializeAuth:vi.fn(),signIn:vi.fn(),register:vi.fn()}))
beforeEach(()=>{vi.clearAllMocks();authError.value='';history.replaceState({},'','/login/?app=travel&returnTo=%2F%3Ftrip%3Dabc')})
describe('portal central login entry',()=>{
  it('uses first-party login when an iframe could not restore the portal session',async()=>{
    authError.value='iframe blocked';const view=mount(LoginEntry);await flushPromises()
    expect(signIn).toHaveBeenCalledExactlyOnceWith(location.pathname+location.search);view.unmount()
  })
  it('starts login with the registered application return point in OIDC state',async()=>{
    const view=mount(LoginEntry);await flushPromises()
    expect(signIn).toHaveBeenCalledExactlyOnceWith(location.pathname+location.search)
    expect(view.text()).toContain('WhereToGo');view.unmount()
  })
  it('rejects an external return before starting authentication',async()=>{
    history.replaceState({},'','/login/?app=ledger&returnTo=https%3A%2F%2Fevil.example%2F')
    const view=mount(LoginEntry);await flushPromises()
    expect(view.get('[role=alert]').text()).toContain('返回地址无效');expect(signIn).not.toHaveBeenCalled();expect(initializeAuth).not.toHaveBeenCalled();view.unmount()
  })
  it('opens one central registration flow for a child application',async()=>{
    history.replaceState({},'','/login/?app=ledger&intent=register')
    const view=mount(LoginEntry);await flushPromises()
    expect(register).toHaveBeenCalledExactlyOnceWith(location.pathname+location.search);expect(signIn).not.toHaveBeenCalled();view.unmount()
  })
})
