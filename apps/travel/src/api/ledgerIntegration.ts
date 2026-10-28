import { smartLedgerUrl } from '../appLinks'

export interface TravelLedgerContext {
  id: string
  name: string
  destination?: string | null
  startsOn?: string | null
  endsOn?: string | null
}

interface OpenTripBookResponse {
  bookId: string
  url: string
}

const ledgerApiUrl = import.meta.env.VITE_SMARTLEDGER_API_URL?.replace(/\/$/, '')
const smartLedgerPublicUrl = smartLedgerUrl

/** Resolve this WhereToGo trip to the signed-in user's SmartLedger book and navigate there. */
export async function openTravelLedger(trip: TravelLedgerContext, accessToken: string): Promise<void> {
  if (!ledgerApiUrl) throw new Error('SmartLedger API 地址尚未配置')

  const response = await fetch(
    `${ledgerApiUrl}/api/v1/integrations/wheretogo/trips/${encodeURIComponent(trip.id)}/open`,
    {
      method: 'POST',
      credentials: 'omit', redirect: 'error', cache: 'no-store', signal: AbortSignal.timeout(90000),
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        tripName: trip.name,
        destination: trip.destination,
        startsOn: trip.startsOn,
        endsOn: trip.endsOn,
      }),
    },
  )

  if (!response.ok) throw new Error(`打开旅行账本失败（HTTP ${response.status}）`)
  const result = (await response.json()) as OpenTripBookResponse
  const destination = new URL(result.url)
  if (smartLedgerPublicUrl && destination.origin !== new URL(smartLedgerPublicUrl).origin) {
    throw new Error('SmartLedger 返回了未配置的页面地址')
  }
  if (destination.protocol !== 'https:' && !['localhost','127.0.0.1','[::1]'].includes(destination.hostname)) {
    throw new Error('SmartLedger 页面必须使用 HTTPS')
  }
  window.location.assign(destination.toString())
}

/** Hand off trip context to SmartLedger; the access token stays inside SmartLedger. */
export function openTripLedgerEntry(trip: TravelLedgerContext): void {
  if (!smartLedgerPublicUrl) throw new Error('SmartLedger 页面地址尚未配置')
  const destination = new URL(smartLedgerPublicUrl)
  destination.search = ''
  destination.hash = ''
  if (destination.protocol !== 'https:' && !['localhost','127.0.0.1','[::1]'].includes(destination.hostname)) {
    throw new Error('SmartLedger 页面必须使用 HTTPS')
  }
  destination.searchParams.set('travelTripId', trip.id)
  destination.searchParams.set('travelTripName', trip.name)
  if (trip.destination) destination.searchParams.set('travelDestination', trip.destination)
  if (trip.startsOn) destination.searchParams.set('travelStartsOn', trip.startsOn)
  if (trip.endsOn) destination.searchParams.set('travelEndsOn', trip.endsOn)
  window.location.assign(destination.toString())
}
