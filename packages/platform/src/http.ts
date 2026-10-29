/** AbortSignal.timeout is missing on older Safari. Always release the fallback
 * timer after the request; caller-provided cancellation retains precedence.
 */
let departing=false
if(typeof window!=='undefined'){
  window.addEventListener('pagehide',()=>{departing=true})
  window.addEventListener('pageshow',()=>{departing=false})
}
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
