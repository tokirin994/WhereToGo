import { describe, expect, it, vi } from 'vitest'
vi.mock('../api/client',()=>({apiRequest:vi.fn()}))
import { bookingLink, defaultCheckout, navigationLink, weatherLabel } from './services'
describe('Travel service links and labels',()=>{
  it('encodes destination, dates and adults without credentials',()=>{const url=new URL(bookingLink('京都 & Osaka','2026-11-01','2026-11-04',2)!);expect(url.hostname).toBe('www.booking.com');expect(url.searchParams.get('ss')).toBe('京都 & Osaka');expect(url.searchParams.get('checkin')).toBe('2026-11-01');expect(url.searchParams.get('group_adults')).toBe('2');expect(url.searchParams.has('token')).toBe(false)})
  it('rejects zero nights and invalid party sizes',()=>{expect(bookingLink('杭州','2026-11-01','2026-11-01',2)).toBeNull();expect(bookingLink('杭州','2026-11-01','2026-11-02',0)).toBeNull();expect(defaultCheckout('2026-12-31',null)).toBe('2027-01-01')})
  it('uses explicit WGS84 pairs and mode for navigation',()=>{const url=new URL(navigationLink([{latitude:30,longitude:120},{latitude:31,longitude:121}],'transit')!);expect(url.searchParams.get('origin')).toBe('30,120');expect(url.searchParams.get('travelmode')).toBe('transit')})
  it('does not silently omit long-route waypoints',()=>{expect(navigationLink(Array.from({length:6},(_,i)=>({latitude:30+i,longitude:120})),'drive')).toBeNull();expect(navigationLink([{latitude:null,longitude:120},{latitude:31,longitude:121}],'walk')).toBeNull()})
  it('labels missing weather honestly',()=>{expect(weatherLabel(null)).toBe('暂无天气');expect(weatherLabel(0)).toBe('晴');expect(weatherLabel(95)).toBe('雷雨')})
})
