/** A successful HTTP response can still be a login page or SPA fallback. */
export async function responseJson<T>(response:Response):Promise<T>{
 if(response.status===204)return undefined as T
 const content=await response.text()
 if(response.headers.get('content-type')?.includes('text/html')||content.trimStart().startsWith('<'))throw new Error('服务返回了网页，未能读取账号数据。请重新登录或稍后重试。')
 try{return JSON.parse(content) as T}catch{throw new Error('服务返回的数据无法读取，请稍后重试。')}
}
