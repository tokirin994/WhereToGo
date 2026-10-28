// @vitest-environment jsdom
import { mount, flushPromises } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import ApiSecurityPanel from './ApiSecurityPanel.vue'
const mocks=vi.hoisted(()=>({request:vi.fn(),error:vi.fn()}))
vi.mock('./apiClient',()=>({authorizedRequest:mocks.request,apiError:mocks.error}))
vi.mock('./appLinks',()=>({accountUrl:'https://personal.example.com/account/'}))
const policy={authentication:'OIDC JWT',localDevelopment:false,maxRequestBytes:11*1024*1024,requestsPerMinute:120,writesPerMinute:30}
beforeEach(()=>{vi.clearAllMocks();mocks.request.mockResolvedValue({ok:true,json:async()=>policy})})
async function start(){const wrapper=mount(ApiSecurityPanel,{props:{apiUrl:'https://personal.example.com/ledger-api',token:'dummy-token'}});await flushPromises();return wrapper}
describe('ledger account and API settings',()=>{
 it('provides one styled account link and folds technical details initially',async()=>{const w=await start();expect(w.findAll('a')).toHaveLength(1);expect(w.get('a').attributes('href')).toContain('/account/');expect(w.get('a').classes()).toContain('security-account-link');expect(w.get('details').attributes('open')).toBeUndefined();expect(w.get('dl').text()).toContain('OIDC JWT');expect(w.get('dl').text()).toContain('120');expect(w.get('.security-mode').text()).toBe('统一认证');w.unmount()})
 it('refreshes the authenticated policy without navigating or logging out',async()=>{const w=await start();await w.findAll('button').find(item=>item.text()==='刷新策略')!.trigger('click');await flushPromises();expect(mocks.request).toHaveBeenCalledTimes(2);expect(mocks.request).toHaveBeenLastCalledWith('https://personal.example.com/ledger-api','dummy-token','/api/v1/system/info');w.unmount()})
 it('keeps account navigation available after a failed policy read',async()=>{mocks.request.mockRejectedValue(Error('读取失败'));const w=await start();expect(w.get('[role=alert]').text()).toBe('读取失败');expect(w.find('a').exists()).toBe(true);expect(w.get('dl').text()).toContain('可点击下方刷新');w.unmount()})
 it('uses the existing global sign-out event only when the sign-out button is pressed',async()=>{const w=await start();const listener=vi.fn();window.addEventListener('smartledger-sign-out',listener);expect(listener).not.toHaveBeenCalled();await w.get('.security-sign-out').trigger('click');expect(listener).toHaveBeenCalledTimes(1);window.removeEventListener('smartledger-sign-out',listener);w.unmount()})
})
