import { apiRequest } from '../api/client'
import type { CreatePlaceInput, PlaceRecord } from '../api/places'
import { safeSource } from './model'

export const routeModes = { hiking: '徒步', cycling: '骑行', citywalk: '城市漫步', drive: '自驾' }
export const routeShapes = { unknown: '待确认', 'point-to-point': '穿越线', loop: '环线', 'out-and-back': '原路往返' }
export const difficulties = { unknown: '待确认', easy: '轻松', moderate: '适中', hard: '有挑战' }
export interface SavedRouteInput {
  name:string;city:string;mode:keyof typeof routeModes;shape:keyof typeof routeShapes;difficulty:keyof typeof difficulties
  distanceKm:number|null;durationMinutes:number|null;ascentM:number|null
  description:string;tips:string;tags:string[];waypoints:Array<{name:string;note:string}>
  sourceUrl:string;sourceLabel:string;evidence:string;favorite:boolean;completed:boolean
}
export interface SavedRoute extends SavedRouteInput {id:string;updatedAt?:string}
export const emptyRoute=():SavedRouteInput=>({name:'',city:'',mode:'hiking',shape:'unknown',difficulty:'unknown',distanceKm:null,durationMinutes:null,ascentM:null,description:'',tips:'',tags:[],waypoints:[{name:'',note:''},{name:'',note:''}],sourceUrl:'',sourceLabel:'手动收藏',evidence:'',favorite:false,completed:false})
export function routeInput(route:SavedRouteInput):SavedRouteInput { const {name,city,mode,shape,difficulty,distanceKm,durationMinutes,ascentM,description,tips,tags,waypoints,sourceUrl,sourceLabel,evidence,favorite,completed}=route;return {name:name.trim(),city:city.trim(),mode,shape,difficulty,distanceKm,durationMinutes,ascentM,description,tips,tags,waypoints:waypoints.map(w=>({name:w.name.trim(),note:w.note})),sourceUrl,sourceLabel,evidence,favorite,completed} }
export const fetchRoutes=()=>apiRequest<SavedRoute[]>('/api/v1/library/routes')
export const saveRoute=(value:SavedRouteInput,id?:string)=>apiRequest<SavedRoute>('/api/v1/library/routes'+(id?'/'+encodeURIComponent(id):''),{method:id?'PUT':'POST',body:JSON.stringify(routeInput(value))})
export const removeRoute=(id:string)=>apiRequest<void>('/api/v1/library/routes/'+encodeURIComponent(id),{method:'DELETE'})
export const materialStatus=()=>apiRequest<{aiAvailable:boolean;rednoteAvailable:boolean}>('/api/v1/library/materials/status')
export const parseMaterial=(text:string,city:string)=>apiRequest<unknown>('/api/v1/library/materials/parse',{method:'POST',body:JSON.stringify({text,city})})
export const resolveRednote=(url:string)=>apiRequest<{text:string;sourceUrl:string;title:string}>('/api/v1/library/materials/rednote',{method:'POST',body:JSON.stringify({url})})
export const saveMaterial=(places:CreatePlaceInput[],routes:SavedRouteInput[])=>apiRequest<{places:PlaceRecord[];routes:SavedRoute[]}>('/api/v1/library/imports',{method:'POST',body:JSON.stringify({places,routes:routes.map(routeInput)})})
export type PlaceDraft=CreatePlaceInput & {draftId:string;selected:boolean;evidence:string;sourceLabel:string}
export type RouteDraft=SavedRouteInput & {draftId:string;selected:boolean}
export interface MaterialDraft {places:PlaceDraft[];routes:RouteDraft[];warnings:string[]}
export interface MaterialPage {label:string;text:string;sourceUrl:string}
const str=(value:unknown,max:number)=>typeof value==='string'?value.trim().slice(0,max):''
const member=<T extends string>(value:unknown,allowed:Record<T,string>,fallback:NoInfer<T>):T=>typeof value==='string'&&Object.prototype.hasOwnProperty.call(allowed,value)?value as T:fallback
const amount=(value:unknown,max:number,integer=false)=>typeof value==='number'&&Number.isFinite(value)&&value>=0&&value<=max&&(!integer||Number.isInteger(value))?value:null
/** All parser output is untrusted, including AI; coordinates are never inferred here. */
export function normalizeMaterial(raw:unknown,page:MaterialPage,city:string):MaterialDraft {
  const data=raw&&typeof raw==='object'?raw as Record<string,unknown>:{},places:PlaceDraft[]=[],routes:RouteDraft[]=[]
  if(Array.isArray(data.places))for(const item of data.places.slice(0,80)){
    if(!item||typeof item!=='object')continue;const p=item as Record<string,unknown>,name=str(p.name,180);if(!name)continue
    const quote=str(p.evidence,800),evidence=quote&&page.text.includes(quote)?quote:''
    places.push({draftId:crypto.randomUUID(),selected:true,name,city:str(p.city,120)||city,address:str(p.address,300),category:member(p.category,{'景点':'','美食':'','咖啡':'','住宿':''},'景点'),tags:[],notes:str(p.notes,3500),sourceUrl:safeSource(page.sourceUrl)||'',sourceLabel:page.label,evidence})
  }
  if(Array.isArray(data.routes))for(const item of data.routes.slice(0,20)){
    if(!item||typeof item!=='object')continue;const r=item as Record<string,unknown>,name=str(r.name,180);if(!name||!Array.isArray(r.waypoints))continue
    const waypoints=r.waypoints.slice(0,80).flatMap(w=>w&&typeof w==='object'&&str(w.name,180)?[{name:str(w.name,180),note:str(w.note,300)}]:[]);if(waypoints.length<2)continue
    const quote=str(r.evidence,800)
    routes.push({...emptyRoute(),draftId:crypto.randomUUID(),selected:true,name,city:str(r.city,120)||city,mode:member(r.mode,routeModes,'hiking'),shape:member(r.shape,routeShapes,'unknown'),difficulty:member(r.difficulty,difficulties,'unknown'),distanceKm:amount(r.distanceKm,10000),durationMinutes:amount(r.durationMinutes,43200,true),ascentM:amount(r.ascentM,20000,true),description:str(r.description,5000),tips:str(r.tips,3000),waypoints,sourceUrl:safeSource(page.sourceUrl)||'',sourceLabel:page.label,evidence:quote&&page.text.includes(quote)?quote:''})
  }
  return {places,routes,warnings:[]}
}
export function rednoteUrl(text:string):string|null {
  const links=text.match(/https:\/\/[^\s<>"，。]+/g)||[]
  for(const value of links){try{const url=new URL(value.replace(/[)）\]】]+$/,''));if(!url.username&&!url.password&&['xiaohongshu.com','www.xiaohongshu.com','xhslink.com','www.xhslink.com'].includes(url.hostname)&&url.port==='')return url.href}catch{/* Not a link. */}}
  return null
}
/** Conservative local grammar: explicit lists and arrow-separated routes only. */
export function extractLocal(page:MaterialPage,city:string):MaterialDraft {
  const places:Array<Record<string,unknown>>=[],routes:Array<Record<string,unknown>>=[]
  const lines=page.text.replace(/\r/g,'').split('\n').map(x=>x.trim()).filter(Boolean)
  for(let index=0;index<lines.length;index++){
    const line=lines[index]!,clean=line.replace(/^\s*(?:[-*•·]|\d+[.、)）])\s*/,'')
    const routeLine=clean.replace(/([\u3400-\u9fff])-(?=[\u3400-\u9fff])/g,'$1→').replace(/\s+-\s+/g,' → ')
    if(/(?:→|➜|➝|->|—>|➡|—|－)/.test(routeLine)){
      const context=lines.slice(Math.max(0,index-1),index+3).join('\n'),mode=/骑行|单车|自行车/.test(context)?'cycling':/自驾|公路旅行/.test(context)?'drive':/city\s*walk|城市漫步|街区漫步/i.test(context)?'citywalk':'hiking'
      const path=routeLine.replace(/^(?:路线|线路|途经|行程|徒步路线|骑行路线)\s*[:：]\s*/,'').split(/[，,；;](?=\s*(?:全程|里程|距离|耗时|用时|时长|爬升))/)[0]!,waypoints=path.split(/\s*(?:→|➜|➝|->|—>|➡|—|－)\s*/).map(name=>({name:name.trim().replace(/[。；;]$/,''),note:''})).filter(w=>w.name&&w.name.length<=180)
      if(waypoints.length<2||waypoints.length>80)continue
      const distance=context.match(/(?:全程|里程|距离)\s*[:：约]?\s*(\d+(?:\.\d+)?)\s*(?:公里|km)/i),ascent=context.match(/(?:累计)?爬升\s*[:：约]?\s*(\d+)\s*(?:米|m)/i),hours=context.match(/(?:用时|耗时|时长)\s*[:：约]?\s*(\d+(?:\.\d+)?)\s*(?:小时|h)/i),minutes=context.match(/(?:用时|耗时|时长)\s*[:：约]?\s*(\d+)\s*(?:分钟|min)/i)
      const prior=lines[index-1]||'',title=prior.length<=80&&!/[|→]/.test(prior)&&/徒步|骑行|漫步|路线|环线/.test(prior)?prior:`${waypoints[0]!.name} → ${waypoints.at(-1)!.name}`
      routes.push({name:title,city,mode,shape:/环线/.test(context)?'loop':/原路往返/.test(context)?'out-and-back':'unknown',waypoints,distanceKm:distance?Number(distance[1]):null,ascentM:ascent?Number(ascent[1]):null,durationMinutes:hours?Math.round(Number(hours[1])*60):minutes?Number(minutes[1]):null,evidence:line,description:context});continue
    }
    const fields=clean.split(/[|｜]/).map(s=>s.trim())
    if(fields.length>=2&&fields.length<=5&&fields[0]&&!/^https?:/.test(fields[0])){places.push({name:fields[0],city:fields[1]||city,category:fields[2]||'景点',address:fields[3]||'',evidence:line});continue}
    const labeled=clean.match(/^(景点|美食|咖啡|住宿)\s*[:：]\s*(.{1,180})$/)
    if(labeled)places.push({name:labeled[2],city,category:labeled[1],evidence:line})
  }
  const result=normalizeMaterial({places,routes},page,city)
  result.warnings.push('本地提取识别“名称 | 城市 | 分类 | 地址”、分类标签和箭头路线；自由游记可选择 AI 整理，或先手动整理原文。')
  return result
}
export function placePayload(p:PlaceDraft):CreatePlaceInput {return {name:p.name.trim(),city:p.city.trim(),address:p.address,category:p.category,tags:p.tags,sourceUrl:p.sourceUrl||'',notes:[p.notes,`来源：${p.sourceLabel}`,p.evidence?`原文：${p.evidence}`:''].filter(Boolean).join('\n').slice(0,5000)}}
export function validateRoute(route:SavedRouteInput):string {
  if(!route.name.trim()||!route.city.trim())return '请补全路线名称和城市'
  if(route.waypoints.length<2||route.waypoints.length>80||route.waypoints.some(w=>!w.name.trim()))return '路线需要 2 至 80 个有名称的途经点'
  if(route.distanceKm!=null&&(!Number.isFinite(route.distanceKm)||route.distanceKm<=0||route.distanceKm>10000))return '里程需大于 0，且不超过 10000 km'
  if(route.durationMinutes!=null&&(!Number.isInteger(route.durationMinutes)||route.durationMinutes<1||route.durationMinutes>43200))return '时长需为 1 至 43200 分钟'
  if(route.ascentM!=null&&(!Number.isInteger(route.ascentM)||route.ascentM<0||route.ascentM>20000))return '爬升需为 0 至 20000 米'
  if(route.sourceUrl&&!safeSource(route.sourceUrl))return '来源链接需要有效的 HTTPS 地址'
  return ''
}
