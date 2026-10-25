import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount, flushPromises, type VueWrapper } from '@vue/test-utils'
import { createPinia } from 'pinia'
import TravelApplication from '../TravelApplication.vue'
import { useTripsStore } from '../stores/trips'
import { usePlacesStore } from '../stores/places'
import { defaultPreferences } from './model'
const request=vi.hoisted(()=>vi.fn())
vi.mock('../api/client',()=>({apiRequest:request}))
vi.mock('../auth',async()=>{const {ref}=await import('vue');return {currentUser:ref({profile:{sub:'qa-component',name:'验证账号'}}),travelCacheKey:(name:string)=>'qa-travel-'+name}})
vi.mock('../api/ledgerIntegration',()=>({openTripLedgerEntry:vi.fn()}))
vi.mock('../AppSwitcher.vue',()=>({default:{template:'<span>应用切换</span>'}}))
vi.mock('./TravelMap.vue',()=>({default:{template:'<div data-map>真实地图组件占位</div>',props:['points','selected','route','road']}}))
const trips=[{id:'a2e122e0-42ce-4a44-9f4e-6518ef289361',name:'杭州试验行程',destination:'杭州',startsOn:'2026-11-01',endsOn:'2026-11-03',notes:'预约提醒',status:'planning',preferences:defaultPreferences(),stops:[{id:'bc747d11-eae8-42ef-b4ed-8565a8d88f1c',placeId:null,dayDate:'2026-11-01',placeName:'步行活动',startsAt:'09:00',durationMinutes:60,category:'活动',note:'备忘',sortOrder:0,estimatedCost:20,completed:false}]}]
let wrapper:VueWrapper|undefined
beforeAll(()=>{HTMLDialogElement.prototype.showModal=function(){this.setAttribute('open','')};HTMLDialogElement.prototype.close=function(){this.removeAttribute('open')};Element.prototype.scrollIntoView=vi.fn()})
beforeEach(()=>{localStorage.clear();history.replaceState({},'','/travel/');request.mockReset();request.mockImplementation(async(path:string,options?:RequestInit)=>{if(path==='/api/v1/places')return [];if(path==='/api/v1/trips')return structuredClone(trips);if(path==='/api/v1/collections')return [];if(path.includes('/planner/status'))return {aiAvailable:false};if(path.includes('/maps/status'))return {searchAvailable:true};if(options?.method==='PUT')return {...structuredClone(trips[0]),...JSON.parse(String(options.body))};return []})})
afterEach(()=>{wrapper?.unmount();wrapper=undefined;vi.restoreAllMocks()})
async function start(){wrapper=mount(TravelApplication,{attachTo:document.body,global:{plugins:[createPinia()]}});await flushPromises();return wrapper}
function button(text:string){const found=wrapper!.findAll('button').find(node=>node.text()===text);if(!found)throw new Error('Missing button '+text);return found}
async function openTrip(){await button('杭州试验行程').trigger('click');await flushPromises()}
describe('Travel workspace component interactions (not browser automation)',()=>{
  it('renders dashboard and filters trips',async()=>{const w=await start();expect(w.text()).toContain('下一站，去哪里');await w.get('input[aria-label="搜索旅行"]').setValue('不存在');expect(w.text()).toContain('没有找到这趟旅行')})
  it('returns to the navigation root after opening a trip',async()=>{await start();await openTrip();expect(wrapper!.text()).toContain('出行清单');await button('我的旅行').trigger('click');expect(wrapper!.text()).toContain('下一站，去哪里')})
  it('opens three-step wizard and displays preference choices',async()=>{await start();await button('计划新旅行').trigger('click');await wrapper!.get('#t-destination').setValue('京都');await wrapper!.get('dialog form').trigger('submit');expect(wrapper!.text()).toContain('怎样的旅行');expect(wrapper!.findAll('.tw-style-options button')).toHaveLength(8)})
  it('mounts editing dialog from the itinerary edit action',async()=>{await start();await openTrip();await wrapper!.get('.tw-stop footer .tw-text').trigger('click');expect(wrapper!.get('#ts-title').element).toHaveProperty('value','步行活动')})
  it('shows hotel links with current trip context',async()=>{await start();await openTrip();const url=new URL(wrapper!.get('.tw-hotel-card a.tw-button').attributes('href')!);expect(url.searchParams.get('ss')).toBe('杭州');expect(url.searchParams.get('group_adults')).toBe('1');expect(url.searchParams.get('checkin')).toBe('2026-11-01')})
  it('never fetches weather before explicit search and selection',async()=>{await start();await openTrip();expect(request.mock.calls.some(call=>String(call[0]).includes('/weather'))).toBe(false);await wrapper!.get('.tw-service-search').trigger('submit');expect(request.mock.calls.some(call=>String(call[0]).includes('/destinations?'))).toBe(true)})
  it('disables route lookup for unknown coordinates',async()=>{await start();await openTrip();expect(button('查询道路路线').attributes('disabled')).toBeDefined()})
  it('opens place editor and switches dark appearance',async()=>{await start();await wrapper!.get('nav button:nth-child(2)').trigger('click');await button('收藏地点').trigger('click');expect(wrapper!.find('#tp-name').exists()).toBe(true);await wrapper!.get('select[aria-label="旅游应用外观"]').setValue('dark');expect(wrapper!.classes()).toContain('tw-theme-dark')})
  it('keeps original checklist unchanged when a save fails',async()=>{await start();await openTrip();const store=useTripsStore();const before=store.trips[0].preferences!.checklist.length;request.mockRejectedValueOnce(new Error('模拟写入失败'));await wrapper!.get('.tw-checklist-add input').setValue('失败记录');await wrapper!.get('.tw-checklist-add').trigger('submit');await flushPromises();expect(store.trips[0].preferences!.checklist).toHaveLength(before);expect(wrapper!.text()).toContain('模拟写入失败')})
  it('exposes place collection root with empty state',async()=>{await start();await wrapper!.get('nav button:nth-child(2)').trigger('click');expect(usePlacesStore().places).toHaveLength(0);expect(wrapper!.text()).toContain('还没有匹配的收藏')})
  it('discards an old itinerary draft after navigating away',async()=>{await start();await openTrip();const previous=request.getMockImplementation()!;let complete!:(value:unknown)=>void;request.mockImplementation((path:string,options?:RequestInit)=>path.endsWith('/draft')?new Promise(resolve=>{complete=resolve}):previous(path,options));await button('从收藏生成草稿').trigger('click');await button('我的旅行').trigger('click');complete({engine:'local',notes:[],stops:trips[0].stops});await flushPromises();expect(wrapper!.text()).toContain('下一站，去哪里');expect(wrapper!.find('dialog').exists()).toBe(false)})
})
