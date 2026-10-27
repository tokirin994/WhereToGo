const local=['localhost','127.0.0.1','[::1]'].includes(window.location.hostname)
const portalFallback=new URL('/',window.location.origin)
if(local)portalFallback.port='5173'
export const portalUrl=new URL(import.meta.env.VITE_PORTAL_PUBLIC_URL||portalFallback.toString(),window.location.origin).toString()
export const travelUrl=new URL(import.meta.env.VITE_WHERE_TO_GO_PUBLIC_URL||'travel/',portalUrl).toString()
export const ledgerOnly=import.meta.env.VITE_LEDGER_ONLY==='true'
export const accountUrl=ledgerOnly?new URL((import.meta.env.VITE_OIDC_AUTHORITY||'').replace(/\/$/,'')+'/account/',window.location.origin).toString():new URL('account/',portalUrl).toString()

export const appBasePath=new URL(import.meta.env.BASE_URL||'/',window.location.origin).pathname
export function appRoutePath(pathname=window.location.pathname){return pathname.startsWith(appBasePath)?'/'+pathname.slice(appBasePath.length):''}
