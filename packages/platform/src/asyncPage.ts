import {defineAsyncComponent,h,type AsyncComponentLoader} from 'vue'
import PageState from './PageState.vue'
/** Visible waiting state, bounded loading and an explicit recovery action. */
export function asyncPage(loader:AsyncComponentLoader,appName='个人空间'){
  return defineAsyncComponent({loader,delay:0,timeout:20000,
    loadingComponent:{render:()=>h(PageState,{appName})},
    errorComponent:{render:()=>h(PageState,{kind:'error',appName})},
  })
}
