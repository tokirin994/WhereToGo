/** AbortSignal.timeout is missing on older Safari. Always release the fallback
 * timer after the request; caller-provided cancellation retains precedence.
 */
export async function timedFetch(input:RequestInfo|URL,options:RequestInit={},timeout=90000):Promise<Response>{
  if(options.signal)return fetch(input,options)
  const controller=new AbortController()
  const timer=setTimeout(()=>controller.abort(),timeout)
  try{return await fetch(input,{...options,signal:controller.signal})}
  finally{clearTimeout(timer)}
}
