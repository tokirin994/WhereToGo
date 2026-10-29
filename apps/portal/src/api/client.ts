import {timedFetch,authenticatedJsonHeaders} from '@personal/platform/http'
import {applicationAccessToken} from '../applicationAccess'
import {platform} from '../appLinks'
import {responseJson} from '../responseJson'
/** Portal control-plane adapter: no travel UI, store or router is imported. */
export async function apiRequest<T>(path:string,options:RequestInit={}):Promise<T>{
  const base=platform.application('travel').apiUrl.replace(/\/$/,'').replace(/\/api$/,'')
  const send=async(force=false)=>timedFetch(base+path,{...options,credentials:'omit',redirect:'error',cache:'no-store',
    headers:authenticatedJsonHeaders(await applicationAccessToken('travel',force),options,true)})
  let response=await send()
  if(response.status===401&&(!options.method||options.method.toUpperCase()==='GET'))response=await send(true)
  if(!response.ok){
    let message=`接口请求失败（HTTP ${response.status}）`
    try{const body=await response.json();if(body.message)message=body.message}catch{/* Do not expose HTML. */}
    const id=response.headers.get('X-Request-ID');throw new Error(message+(id?` [${id}]`:''))
  }
  return responseJson<T>(response)
}
