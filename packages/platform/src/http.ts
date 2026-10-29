/** Headers are case insensitive. Spreading normalized lowercase names into an
 * object and adding Authorization again combines two Bearer credentials on wire.
 */
export function authenticatedJsonHeaders(token:string,options:RequestInit={},acceptJson=false):Headers{
  const headers=new Headers(options.headers)
  headers.set('Authorization',`Bearer ${token}`)
  if(options.body)headers.set('Content-Type','application/json')
  if(acceptJson)headers.set('Accept','application/json')
  return headers
}
let departing=false
if(typeof window!=='undefined'){
  window.addEventListener('pagehide',()=>{departing=true})
  window.addEventListener('pageshow',()=>{departing=false})
}
/** AbortSignal.timeout is missing on older Safari. Always release the fallback
 * timer after the request; caller-provided cancellation retains precedence.
 */
export async function timedFetch(input:RequestInfo|URL,options:RequestInit={},timeout=90000):Promise<Response>{
  if(departing)throw new DOMException('页面已离开，取消请求','AbortError')
  if(options.signal)return fetch(input,options)
  const controller=new AbortController()
  const timer=setTimeout(()=>controller.abort(),timeout)
  const leaving=()=>controller.abort()
  const lifecycle=typeof window!=='undefined'?window:undefined
  lifecycle?.addEventListener?.('pagehide',leaving,{once:true})
  try{return await fetch(input,{...options,signal:controller.signal})}
  finally{clearTimeout(timer);lifecycle?.removeEventListener?.('pagehide',leaving)}
}
