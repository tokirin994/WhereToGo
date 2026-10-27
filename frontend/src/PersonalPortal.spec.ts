import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'
import PersonalPortal from './PersonalPortal.vue'
import { authAction, currentUser, register, signIn } from './auth'
vi.mock('./auth',()=>({authAction:ref(null),authError:ref(''),currentUser:ref(null),registrationEnabled:true,register:vi.fn(),signIn:vi.fn(),signOut:vi.fn(),initializeAuth:vi.fn()}))
beforeEach(()=>{vi.clearAllMocks();currentUser.value=null;authAction.value=null;window.history.replaceState({},'','/')})
describe('portal account entry',()=>{
  it('offers registration in the header and near the application cards',async()=>{
    const view=mount(PersonalPortal)
    await view.get('.portal-register').trigger('click')
    expect(register).toHaveBeenCalledWith('/')
    expect(view.get('.portal-join').text()).toContain('一个账号')
    await view.get('.portal-join button').trigger('click')
    expect(register).toHaveBeenCalledTimes(2)
    view.unmount()
  })
  it('remembers the intended application when login is needed',async()=>{
    const view=mount(PersonalPortal)
    await view.get('.portal-travel').trigger('click')
    expect(signIn).toHaveBeenLastCalledWith('/travel/')
    await view.get('.portal-ledger').trigger('click')
    expect(signIn).toHaveBeenLastCalledWith('/?openApp=ledger')
    view.unmount()
  })
  it('disables repeated actions while connecting',async()=>{
    authAction.value='register'
    const view=mount(PersonalPortal)
    expect(view.get('.portal-register').attributes('disabled')).toBeDefined()
    expect(view.get('.portal-join button').attributes('disabled')).toBeDefined()
    expect(view.get('[role=status]').text()).toContain('正在连接')
    await view.get('.portal-travel').trigger('click')
    expect(signIn).not.toHaveBeenCalled()
    view.unmount()
  })
  it('welcomes a registered user and allows dismissing the hint',async()=>{
    window.history.replaceState({},'','/?welcome=1')
    currentUser.value={profile:{sub:'new-user',preferred_username:'新朋友'}} as never
    const view=mount(PersonalPortal)
    await flushPromises()
    expect(view.find('.portal-join').exists()).toBe(false)
    expect(view.get('.portal-welcome').text()).toContain('账号已就绪')
    await view.get('.portal-welcome button').trigger('click')
    expect(view.find('.portal-welcome').exists()).toBe(false)
    expect(window.location.search).toBe('')
    view.unmount()
  })
})
