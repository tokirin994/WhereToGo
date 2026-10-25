const local=['localhost','127.0.0.1','[::1]'].includes(window.location.hostname)
const portalFallback=new URL('/',window.location.origin)
if(local)portalFallback.port='5173'
export const portalUrl=new URL(import.meta.env.VITE_PORTAL_PUBLIC_URL||portalFallback.toString(),window.location.origin).toString()
export const travelUrl=new URL(import.meta.env.VITE_WHERE_TO_GO_PUBLIC_URL||'travel/',portalUrl).toString()
export const accountUrl=new URL('account/',portalUrl).toString()
