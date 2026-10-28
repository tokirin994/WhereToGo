import {createWebAuth} from '@personal/identity/vue'
import {platform} from './appLinks'
const authority=import.meta.env.VITE_OIDC_AUTHORITY||''
const session=createWebAuth({authority,clientId:import.meta.env.VITE_OIDC_CLIENT_ID||'travel-web',audience:'wheretogo-api',
  basePath:import.meta.env.BASE_URL||'/',allowLoopback:import.meta.env.DEV,
  registrationEnabled:import.meta.env.VITE_REGISTRATION_ENABLED!=='false',localMockAuth:import.meta.env.VITE_LOCAL_MOCK_AUTH==='true',
  returnPath:path=>path==='/',
  ...(platform.authMode==='portal'?{loginUrl:(intent:'login'|'register',returnTo:string)=>platform.loginUrl('travel',returnTo,intent)}:{}),
})
export const {registrationEnabled,localMockAuth,currentUser,authError,authAction,identity,accountConsoleUrl,initializeAuth,accessToken,signIn,register,signOut}=session
let cacheIdentity='anonymous'
export function travelCacheKey(name:string){
  if(currentUser.value)cacheIdentity=`${authority}:${currentUser.value.profile.sub}`
  const key=`wheretogo:${encodeURIComponent(cacheIdentity)}:${name}`
  if(currentUser.value?.profile.sub==='local-demo-user'&&import.meta.env.DEV){
    const previous=name==='places'?'travelatlas.demo.places':name==='trips'?'travelatlas.trips':null
    if(previous)try{const data=localStorage.getItem(previous);if(data&&!localStorage.getItem(key)){localStorage.setItem(key,data);localStorage.removeItem(previous)}}catch{/* Migration is best effort. */}
  }
  return key
}
