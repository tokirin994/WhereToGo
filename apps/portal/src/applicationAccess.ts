import {createIdentitySession} from './identitySession'
import {currentUser} from './auth'
import {platform} from './appLinks'
const sessions=new Map<string,ReturnType<typeof createIdentitySession>>()
const pending=new Map<string,Promise<string>>()
/** The portal obtains a separate, subject-checked token for each managed service. */
export async function applicationAccessToken(id:string,force=false){
  if(pending.has(id))return pending.get(id)!
  const task=(async()=>{
    const expected=currentUser.value?.profile.sub
    if(!expected)throw new Error('请先登录统一账号')
    const app=platform.application(id),authority=import.meta.env.VITE_OIDC_AUTHORITY||''
    if(!authority)throw new Error('统一账号服务尚未配置')
    let session=sessions.get(id)
    if(!session){
      session=createIdentitySession({authority,clientId:app.clientId,audience:app.audience,basePath:new URL(platform.portalUrl).pathname,callbackBaseUrl:platform.portalUrl,
        allowLoopback:import.meta.env.DEV,monitor:false,returnPath:path=>path==='/',changed:()=>{}})
      sessions.set(id,session)
    }
    await session.initialize()
    const token=await session.accessToken(force)
    if(currentUser.value?.profile.sub!==expected||session.current?.profile.sub!==expected)throw new Error('子应用登录账号不一致，请重新登录')
    return token
  })()
  pending.set(id,task)
  try{return await task}finally{pending.delete(id)}
}
