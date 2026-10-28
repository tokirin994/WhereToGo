import {mount,flushPromises} from '@vue/test-utils'
import {defineComponent,h} from 'vue'
import {describe,it,expect,vi,afterEach} from 'vitest'
import ApplicationBoundary from '@personal/platform/ApplicationBoundary.vue'
import {asyncPage} from '@personal/platform/async-page'
afterEach(()=>vi.useRealTimers())
describe('application loading and recovery UI',()=>{
 it('renders healthy application content',()=>{const w=mount(ApplicationBoundary,{slots:{default:()=>h('p','我的应用')}});expect(w.text()).toContain('我的应用');w.unmount()})
 it('replaces a rendering exception with visible recovery actions and no raw secret',async()=>{const Broken=defineComponent({setup(){return ()=>{throw Error('dummy-sensitive-error-content')}}});const w=mount(ApplicationBoundary,{slots:{default:()=>h(Broken)}});await flushPromises();expect(w.text()).toContain('页面暂时没有打开');expect(w.text()).toContain('重新加载页面');expect(w.text()).not.toContain('dummy-sensitive-error-content');expect(w.find('a[href="/"]').exists()).toBe(true);w.unmount()})
 it('handles a missing application chunk without an automatic reload loop',async()=>{const w=mount(ApplicationBoundary,{slots:{default:()=>h('p','正常内容')}});const event=new Event('vite:preloadError',{cancelable:true});window.dispatchEvent(event);await flushPromises();expect(event.defaultPrevented).toBe(true);expect(w.text()).toContain('页面暂时没有打开');w.unmount()})
 it('shows progress while waiting for an async view and then displays its content',async()=>{vi.useFakeTimers();let resolve!:(value:ReturnType<typeof defineComponent>)=>void;const Page=asyncPage(()=>new Promise(done=>{resolve=done}),'账号中心');const w=mount(ApplicationBoundary,{slots:{default:()=>h(Page)}});await vi.advanceTimersByTimeAsync(151);expect(w.text()).toContain('正在打开账号中心');resolve(defineComponent({render:()=>h('p','账号页已就绪')}));await flushPromises();expect(w.text()).toContain('账号页已就绪');w.unmount()})
})
