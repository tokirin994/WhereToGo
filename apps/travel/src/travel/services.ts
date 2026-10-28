import { apiRequest } from '../api/client'
import { addDays } from './model'
export interface Destination{id:number;name:string;country?:string;admin1?:string;latitude:number;longitude:number;timezone?:string}
export interface Weather{timezone:string;source:string;fetchedAt:string;current:{temperature_2m?:number;weather_code?:number;time?:string};daily:{time:string[];weather_code:Array<number|null>;temperature_2m_max:Array<number|null>;temperature_2m_min:Array<number|null>;precipitation_probability_max:Array<number|null>}}
export interface RoadRoute{mode:'walk'|'drive';geometry:{type:'LineString';coordinates:[number,number][]};distance:number;duration:number;legs:Array<{distance:number;duration:number}>;source:string;trafficAware:false}
export const findDestinations=(query:string)=>apiRequest<Destination[]>('/api/v1/travel-services/destinations?'+new URLSearchParams({query}))
export const fetchWeather=(latitude:number,longitude:number)=>apiRequest<Weather>('/api/v1/travel-services/weather?'+new URLSearchParams({latitude:String(latitude),longitude:String(longitude)}))
export const fetchRoadRoute=(id:string,date:string,mode:'walk'|'drive')=>apiRequest<RoadRoute>(`/api/v1/travel-services/trips/${encodeURIComponent(id)}/route`,{method:'POST',body:JSON.stringify({date,mode})})
export function weatherLabel(code:number|null|undefined){if(code==null)return '暂无天气';if(code===0)return '晴';if(code<=3)return '多云';if(code<=48)return '雾';if(code<=57)return '毛毛雨';if(code<=67)return '雨';if(code<=77)return '雪';if(code<=82)return '阵雨';if(code<=86)return '阵雪';return '雷雨'}
function validDate(value:string){const date=new Date(value+'T12:00:00Z');return /^\d{4}-\d{2}-\d{2}$/.test(value)&&Number.isFinite(date.getTime())&&date.toISOString().slice(0,10)===value}
export function bookingLink(destination:string,checkin:string,checkout:string,adults:number){
  if(!destination.trim()||!validDate(checkin)||!validDate(checkout)||checkout<=checkin||!Number.isInteger(adults)||adults<1||adults>30)return null
  return 'https://www.booking.com/searchresults.zh-cn.html?'+new URLSearchParams({ss:destination.trim(),checkin,checkout,group_adults:String(adults),no_rooms:'1',group_children:'0'})
}
export function defaultCheckout(start:string,end:string|null){return end&&end>start?end:addDays(start,1)}
export function navigationLink(points:Array<{latitude?:number|null;longitude?:number|null}>,mode:'walk'|'drive'|'transit'){
  if(points.length<2||points.some(p=>!Number.isFinite(p.latitude)||!Number.isFinite(p.longitude)))return null
  const coordinate=(p:(typeof points)[number])=>`${p.latitude},${p.longitude}`
  const params=new URLSearchParams({api:'1',dir_action:'navigate',origin:coordinate(points[0]!),destination:coordinate(points.at(-1)!),travelmode:mode==='walk'?'walking':mode==='drive'?'driving':'transit'})
  // Google Maps URLs have platform-dependent waypoint limits; longer days use per-leg links.
  if(points.length>2&&points.length<=5&&mode!=='transit')params.set('waypoints',points.slice(1,-1).map(coordinate).join('|'))
  if(points.length>5||mode==='transit'&&points.length>2)return null
  return 'https://www.google.com/maps/dir/?'+params
}
