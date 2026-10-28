import {browserPlatform} from '@personal/platform'
export const platform=browserPlatform(import.meta.env)
export const portalUrl=platform.portalUrl
export const travelUrl=platform.application('travel').url
export const smartLedgerUrl=platform.application('ledger').url
export const accountUrl=platform.accountUrl
