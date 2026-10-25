export async function authorizedRequest(apiUrl:string,token:string,path:string,options:RequestInit={}):Promise<Response>{
  const response=await fetch(`${apiUrl.replace(/\/$/,'')}${path}`,{
    ...options,credentials:'omit',redirect:'error',cache:'no-store',signal:options.signal||AbortSignal.timeout(90000),
    headers:{...Object.fromEntries(new Headers(options.headers)),Authorization:`Bearer ${token}`,...(options.body?{'Content-Type':'application/json'}:{})},
  })
  if(response.status===401)window.dispatchEvent(new Event('smartledger-session-expired'))
  return response
}
export async function apiError(response:Response,fallback:string){
  let message=`${fallback}（HTTP ${response.status}）`
  try{const body=await response.json() as {message?:string};if(body.message)message=body.message}catch{/* Never expose raw provider HTML or stack traces. */}
  const id=response.headers.get('X-Request-ID')
  return new Error(`${message}${id?` [${id}]`:''}`)
}
