import {browserPlatform} from '@personal/platform'
export const platform=browserPlatform(import.meta.env)
export const portalUrl=platform.portalUrl
export const travelUrl=platform.application('travel').url
export const ledgerOnly=import.meta.env.VITE_LEDGER_ONLY==='true'||platform.authMode==='standalone'
export const accountUrl=ledgerOnly?new URL((import.meta.env.VITE_OIDC_AUTHORITY||'').replace(/\/$/,'')+'/account/',window.location.origin).toString():new URL('account/',portalUrl).toString()

export const appBasePath=new URL(import.meta.env.BASE_URL||'/',window.location.origin).pathname
export function appRoutePath(pathname=window.location.pathname){return pathname.startsWith(appBasePath)?'/'+pathname.slice(appBasePath.length):''}
