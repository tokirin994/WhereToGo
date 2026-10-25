const origin = window.location.origin
const local = ['localhost', '127.0.0.1', '[::1]'].includes(window.location.hostname)
const ledgerFallback = new URL(local ? '/' : '/ledger/', origin)
if (local) ledgerFallback.port = '5174'

export const portalUrl = new URL('/', origin).toString()
export const travelUrl = new URL('/travel/', origin).toString()
export const smartLedgerUrl = new URL(import.meta.env.VITE_SMARTLEDGER_PUBLIC_URL || ledgerFallback.toString(), origin).toString()
