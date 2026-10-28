let sessionToken:((force?:boolean)=>Promise<string>)|undefined
export function setSessionTokenProvider(provider?:typeof sessionToken){sessionToken=provider}
export async function authorizedRequest(apiUrl:string,token:string,path:string,options:RequestInit={}):Promise<Response>{
  const send=async(force=false)=>fetch(`${apiUrl.replace(/\/$/,'')}${path}`,{
    ...options,credentials:'omit',redirect:'error',cache:'no-store',signal:options.signal||AbortSignal.timeout(90000),
    headers:{...Object.fromEntries(new Headers(options.headers)),Authorization:`Bearer ${sessionToken?await sessionToken(force):token}`,...(options.body?{'Content-Type':'application/json'}:{})},
  })
  let response=await send()
  // A read may retry once after renewal; mutations must never be replayed.
  if(response.status===401&&sessionToken&&(!options.method||options.method.toUpperCase()==='GET'))response=await send(true)
  if(response.status===401)window.dispatchEvent(new Event('smartledger-session-expired'))
  return response
}
export async function apiError(response:Response,fallback:string){
  let message=`${fallback}（HTTP ${response.status}）`
  try{const body=await response.json() as {message?:string};if(body.message)message=body.message}catch{/* Never expose raw provider HTML or stack traces. */}
  const id=response.headers.get('X-Request-ID')
  return new Error(`${message}${id?` [${id}]`:''}`)
}
