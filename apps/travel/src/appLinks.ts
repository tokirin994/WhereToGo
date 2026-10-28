import {browserPlatform} from '@personal/platform'
export const platform=browserPlatform(import.meta.env)
export const portalUrl=platform.portalUrl
export const travelUrl=platform.application('travel').url
export const smartLedgerUrl=platform.application('ledger').url
export const accountUrl=platform.authMode==='standalone'?new URL((import.meta.env.VITE_OIDC_AUTHORITY||'').replace(/\/$/,'')+'/account/',window.location.origin).href:platform.accountUrl
export const appBasePath=import.meta.env.BASE_URL||'/'
