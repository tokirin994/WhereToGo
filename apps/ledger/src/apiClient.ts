import {timedFetch,authenticatedJsonHeaders} from '@personal/platform/http'
let sessionToken:((force?:boolean)=>Promise<string>)|undefined
export function setSessionTokenProvider(provider?:typeof sessionToken){sessionToken=provider}
export interface ApiSessionIssue {status:number;method:string;route:string;requestId:string;at:string}
async function rejected(response:Response,method:string,path:string,provider:typeof sessionToken){
  // A resource-server rejection is not an IdP logout. In particular, an old
  // in-flight request must not log out a newer session after token rotation.
  if(provider!==sessionToken)return
  const detail:ApiSessionIssue={status:response.status,method,route:path.split(/[?#]/)[0]!.replace(/[0-9a-f]{8}-[0-9a-f-]{27,}/gi,':id'),requestId:(response.headers.get('X-Request-ID')||'').replace(/[^a-zA-Z0-9-]/g,'').slice(0,80),at:new Date().toISOString()}
  window.dispatchEvent(new CustomEvent<ApiSessionIssue>('smartledger-api-session-issue',{detail}))
}
export async function authorizedRequest(apiUrl:string,token:string,path:string,options:RequestInit={}):Promise<Response>{
  const provider=sessionToken,method=(options.method||'GET').toUpperCase()
  const send=async(force=false)=>timedFetch(`${apiUrl.replace(/\/$/,'')}${path}`,{
    ...options,credentials:'omit',redirect:'error',cache:'no-store',
    headers:authenticatedJsonHeaders(provider?await provider(force):token,options),
  })
  let response=await send()
  // A read may retry once after renewal; mutations must never be replayed.
  if(response.status===401&&provider&&provider===sessionToken&&method==='GET')response=await send(true)
  if(response.status===401)await rejected(response,method,path,provider)
  return response
}
export async function apiError(response:Response,fallback:string){
  let message=`${fallback}（HTTP ${response.status}）`
  try{const body=await response.json() as {message?:string};if(body.message)message=body.message}catch{/* Never expose raw provider HTML or stack traces. */}
  const id=response.headers.get('X-Request-ID')
  return new Error(`${message}${id?` [${id}]`:''}`)
}
