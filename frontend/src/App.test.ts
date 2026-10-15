import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App.vue'

describe('TravelAtlas map workspace', () => {
  let wrapper: VueWrapper
  let fetchMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    localStorage.clear()
    fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === 'POST') {
        const body = JSON.parse(String(init.body))
        return new Response(JSON.stringify({ ...body, id: 'database-place-1', longitude: null, latitude: null, coordinateSystem: null, coordinateStatus: 'PENDING', coordinateSource: null }), { status: 201 })
      }
      return new Response('[]', { status: 200 })
    })
    vi.stubGlobal('fetch', fetchMock)
    const pinia = createPinia()
    setActivePinia(pinia)
    wrapper = mount(App, { global: { plugins: [pinia] } })
  })

  afterEach(() => {
    wrapper.unmount()
    vi.restoreAllMocks()
  })

  it('filters the place collection from the global search', async () => {
    await wrapper.get('.global-search input').setValue('灵隐寺')

    expect(wrapper.findAll('.places-panel .place-row')).toHaveLength(1)
    expect(wrapper.find('.places-panel').text()).toContain('灵隐寺与飞来峰')
    expect(wrapper.find('.places-panel').text()).not.toContain('楼外楼')
  })

  it('saves a manually entered place without assigning a map position', async () => {
    await wrapper.get('.floating-add').trigger('click')
    await wrapper.get('#place-name').setValue('待定位测试点')
    await wrapper.get('.add-dialog').trigger('submit')
    await flushPromises()

    expect(wrapper.text()).toContain('待定位测试点')
    expect(JSON.parse(localStorage.getItem('travelatlas.demo.places') ?? '[]'))
      .toEqual(expect.arrayContaining([expect.objectContaining({ name: '待定位测试点', mapPosition: null })]))
  })

  it('writes a new place to the backend when the API is available', async () => {
    await wrapper.get('.floating-add').trigger('click')
    await wrapper.get('#place-name').setValue('数据库地点')
    await wrapper.get('#place-city').setValue('杭州')
    await wrapper.get('.add-dialog').trigger('submit')
    await flushPromises()

    const write = fetchMock.mock.calls.find(([, init]) => init?.method === 'POST')
    expect(write).toBeDefined()
    expect(JSON.parse(String(write?.[1]?.body))).toMatchObject({ name: '数据库地点', city: '杭州', category: '景点' })
    expect(wrapper.text()).toContain('数据库地点')
    expect(JSON.parse(localStorage.getItem('travelatlas.demo.places') ?? '[]'))
      .toEqual(expect.arrayContaining([expect.objectContaining({ id: 'database-place-1', name: '数据库地点', mapPosition: null })]))
  })

  it('opens the mobile place drawer from the main navigation', async () => {
    const placesLink = wrapper.findAll('.nav-link').find((link) => link.text() === '我的地点')
    await placesLink?.trigger('click')

    expect(wrapper.find('.mobile-sheet').exists()).toBe(true)
    expect(wrapper.find('.mobile-sheet').text()).toContain('西湖边的日落')
    expect(wrapper.find('.mobile-sheet').text()).toContain('灵隐寺与飞来峰')
  })
})
