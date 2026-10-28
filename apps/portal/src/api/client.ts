import {applicationAccessToken} from '../applicationAccess'
import {platform} from '../appLinks'
/** Portal control-plane adapter: no travel UI, store or router is imported. */
export async function apiRequest<T>(path:string,options:RequestInit={}):Promise<T>{
  const base=platform.application('travel').apiUrl.replace(/\/$/,'').replace(/\/api$/,'')
  const send=async(force=false)=>fetch(base+path,{...options,credentials:'omit',redirect:'error',cache:'no-store',signal:options.signal||AbortSignal.timeout(90000),
    headers:{...Object.fromEntries(new Headers(options.headers)),Authorization:'Bearer '+await applicationAccessToken('travel',force),...(options.body?{'Content-Type':'application/json'}:{})}})
  let response=await send()
  if(response.status===401&&(!options.method||options.method.toUpperCase()==='GET'))response=await send(true)
  if(!response.ok){
    let message=`接口请求失败（HTTP ${response.status}）`
    try{const body=await response.json();if(body.message)message=body.message}catch{/* Do not expose HTML. */}
    const id=response.headers.get('X-Request-ID');throw new Error(message+(id?` [${id}]`:''))
  }
  return response.status===204?undefined as T:await response.json() as T
}
