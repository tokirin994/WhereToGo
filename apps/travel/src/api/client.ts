import { accessToken, currentUser } from '../auth'
const base=(import.meta.env.VITE_API_BASE_URL||'').replace(/\/$/,'').replace(/\/api$/,'')
export async function apiRequest<T>(path:string,options:RequestInit={}):Promise<T>{
  const token=await accessToken()
  const response=await fetch(`${base}${path}`,{...options,credentials:'omit',redirect:'error',cache:'no-store',signal:options.signal||AbortSignal.timeout(90000),headers:{...Object.fromEntries(new Headers(options.headers)),Authorization:`Bearer ${token}`,...(options.body?{'Content-Type':'application/json'}:{})}})
  if(!response.ok){
    let message=`接口请求失败（HTTP ${response.status}）`
    try{const body=await response.json() as {message?:string};if(body.message)message=body.message}catch{/* Do not surface raw server HTML or stack traces. */}
    if(response.status===401)currentUser.value=null
    const requestId=response.headers.get('X-Request-ID')
    throw new Error(`${message}${requestId?` [${requestId}]`:''}`)
  }
  return response.status===204?undefined as T:await response.json() as T
}
