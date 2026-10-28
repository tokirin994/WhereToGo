import type { TripInput, TripPreferences, TripRecord, TripStopInput, TripStopRecord } from '../api/trips'
import type { Place } from '../stores/places'

export const styles=[{id:'culture',name:'人文艺术',icon:'🏛️'},{id:'food',name:'当地风味',icon:'🍜'},{id:'nature',name:'自然山野',icon:'🌿'},{id:'family',name:'亲子同行',icon:'🪁'},{id:'city',name:'城市漫游',icon:'🏙️'},{id:'wellness',name:'放松疗愈',icon:'☕'},{id:'photography',name:'风景摄影',icon:'📷'},{id:'adventure',name:'户外探索',icon:'🥾'}]
export const paceLabels={relaxed:'慢慢玩',balanced:'刚刚好',packed:'充实一点'}
export const statusLabels:Record<string,string>={planning:'计划中',upcoming:'计划中',ongoing:'进行中',completed:'已完成',archived:'已归档'}
export const categoryColors:Record<string,string>={'景点':'#8571b2','美食':'#d28b51','咖啡':'#9b7a67','住宿':'#588ea3','交通':'#6f91aa','活动':'#4d8b7c'}
export function localDate(date=new Date()){return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`}
export function addDays(value:string,amount:number){const date=new Date(value+'T12:00:00');date.setDate(date.getDate()+amount);return localDate(date)}
export function daysBetween(start:string|null,end:string|null){if(!start)return [];const result:string[]=[];let cursor=start;const last=end||start;while(cursor<=last&&result.length<60){result.push(cursor);cursor=addDays(cursor,1)}return result}
export function defaultPreferences():TripPreferences{return {pace:'balanced',budgetLevel:'standard',budgetAmount:0,travelers:1,transport:'transit',departure:'',styles:[],mustDo:'',avoid:'',checklist:['确认身份证件与预约','检查交通和住宿订单','查看目的地天气','准备充电器与常用物品'].map(text=>({id:crypto.randomUUID(),text,done:false}))}}
export function preferences(trip?:TripRecord|null):TripPreferences{return {...defaultPreferences(),...trip?.preferences,styles:[...(trip?.preferences?.styles||[])],checklist:(trip?.preferences?.checklist||[]).map(item=>({...item}))}}
export function tripInput(trip:TripRecord):TripInput{return {name:trip.name,destination:trip.destination,startsOn:trip.startsOn,endsOn:trip.endsOn,notes:trip.notes||'',status:trip.status,preferences:preferences(trip)}}
export function stopInput(stop:TripStopRecord):TripStopInput{return {id:stop.id,placeId:stop.placeId,dayDate:stop.dayDate,placeName:stop.placeName,category:stop.category,startsAt:stop.startsAt,durationMinutes:stop.durationMinutes,note:stop.note||'',sortOrder:stop.sortOrder,estimatedCost:Number(stop.estimatedCost||0),completed:!!stop.completed}}
export const money=(value:number)=>new Intl.NumberFormat('zh-CN',{style:'currency',currency:'CNY',maximumFractionDigits:2}).format(value)
export function dateLabel(value:string|null,options:Intl.DateTimeFormatOptions={month:'long',day:'numeric'}){return value?new Date(value+'T12:00:00').toLocaleDateString('zh-CN',options):'日期待定'}
export function hasCoordinates(value:{longitude?:number|null;latitude?:number|null}){return Number.isFinite(value.longitude)&&Number.isFinite(value.latitude)&&Math.abs(value.longitude!)<=180&&Math.abs(value.latitude!)<=90}
export function straightDistance(a:Place,b:Place){if(!hasCoordinates(a)||!hasCoordinates(b))return null;const rad=Math.PI/180;const x=(b.latitude!-a.latitude!)*rad,y=(b.longitude!-a.longitude!)*rad;return 6371*2*Math.asin(Math.min(1,Math.sqrt(Math.sin(x/2)**2+Math.cos(a.latitude!*rad)*Math.cos(b.latitude!*rad)*Math.sin(y/2)**2)))}
export function scheduleWarnings(stops:TripStopRecord[]){const warnings:string[]=[];let end=0;for(const stop of stops){const [h=0,m=0]=stop.startsAt.split(':').map(Number);const start=h*60+m;if(start<end)warnings.push(`${stop.placeName} 与上一项时间重叠`);end=start+stop.durationMinutes;if(end>1440)warnings.push(`${stop.placeName} 超过当天午夜`)}return warnings}
export function safeSource(value:string|undefined|null){try{const url=new URL(value||'');return url.protocol==='https:'&&!url.username&&!url.password?url.toString():null}catch{return null}}
export function escapeHtml(value:string){return value.replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]!))}
export function download(name:string,content:string,type:string){const url=URL.createObjectURL(new Blob([content],{type}));const link=document.createElement('a');link.href=url;link.download=name.replace(/[\\/:*?"<>|]/g,'_');link.click();setTimeout(()=>URL.revokeObjectURL(url),1500)}
export function exportTrip(trip:TripRecord,format:'html'|'json'|'ics'){
  const days=daysBetween(trip.startsOn,trip.endsOn);const ordered=[...trip.stops].sort((a,b)=>a.dayDate.localeCompare(b.dayDate)||a.sortOrder-b.sortOrder)
  if(format==='json'){download(trip.name+'.json',JSON.stringify({type:'wheretogo.trip',version:1,trip:{...tripInput(trip),stops:ordered.map(stopInput)}},null,2),'application/json');return}
  if(format==='ics'){
    const esc=(text:string)=>text.replace(/\\/g,'\\\\').replace(/\r?\n/g,'\\n').replace(/;/g,'\\;').replace(/,/g,'\\,')
    const lines=['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//WhereToGo//Trip Planner//ZH','CALSCALE:GREGORIAN']
    for(const stop of ordered){const [h=0,m=0]=stop.startsAt.split(':').map(Number);const date=new Date(stop.dayDate+'T00:00:00');date.setMinutes(h*60+m+stop.durationMinutes);const finish=localDate(date).replaceAll('-','')+'T'+String(date.getHours()).padStart(2,'0')+String(date.getMinutes()).padStart(2,'0')+'00';lines.push('BEGIN:VEVENT','UID:'+stop.id+'@wheretogo','DTSTAMP:'+new Date().toISOString().replace(/[-:]/g,'').replace(/\.\d{3}/,''),'DTSTART:'+stop.dayDate.replaceAll('-','')+'T'+stop.startsAt.replace(':','')+'00','DTEND:'+finish,'SUMMARY:'+esc(stop.placeName),'DESCRIPTION:'+esc((stop.note||'')+'\n行程本地时间，请核对目的地时区。'),'END:VEVENT')}
    lines.push('END:VCALENDAR');const folded=lines.flatMap(line=>{const segments:string[]=[];let current='';for(const char of line){if(new TextEncoder().encode(current+char).length>72){segments.push(current);current=' '+char}else current+=char}segments.push(current);return segments});download(trip.name+'.ics',folded.join('\r\n')+'\r\n','text/calendar;charset=utf-8');return
  }
  const content=`<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(trip.name)}</title><style>body{max-width:820px;margin:45px auto;padding:0 24px;font:15px/1.8 system-ui;color:#293f4c}h1{border-bottom:2px solid #db8a74;padding-bottom:16px}section{break-inside:avoid;margin:28px 0}li{padding:10px 0;border-bottom:1px solid #eee}small{color:#70808b}pre{white-space:pre-wrap;font:inherit}@media print{body{margin:10mm}}</style><h1>${escapeHtml(trip.name)}</h1><p>${escapeHtml(trip.destination||'')} · ${escapeHtml(trip.startsOn||'日期待定')} — ${escapeHtml(trip.endsOn||'日期待定')}</p><p>${preferences(trip).travelers} 人 · 预算 ${money(preferences(trip).budgetAmount)} · 计划费用 ${money(ordered.reduce((sum,item)=>sum+Number(item.estimatedCost||0),0))}</p>${days.map(date=>`<section><h2>${escapeHtml(dateLabel(date,{month:'long',day:'numeric',weekday:'long'}))}</h2><ol>${ordered.filter(stop=>stop.dayDate===date).map(stop=>`<li><b>${escapeHtml(stop.startsAt)} ${escapeHtml(stop.placeName)}</b> <small>${stop.durationMinutes} 分钟 · ${escapeHtml(stop.category)} · 估算 ${money(Number(stop.estimatedCost||0))}</small>${stop.note?`<pre>${escapeHtml(stop.note)}</pre>`:''}</li>`).join('')}</ol></section>`).join('')}${trip.notes?`<h2>旅行备忘</h2><pre>${escapeHtml(trip.notes)}</pre>`:''}<p><small>由 WhereToGo 导出；请核对预约、营业时间和实际交通。</small></p></html>`
  download(trip.name+'-行程.html',content,'text/html;charset=utf-8')
}
export function parseTripFile(value:unknown,ownedPlaces:Place[]):{input:TripInput;stops:TripStopInput[]}{
  if(!value||typeof value!=='object'||!('type' in value)||value.type!=='wheretogo.trip'||!('trip' in value))throw new Error('请选择 WhereToGo 导出的行程 JSON')
  const data=value.trip as TripRecord
  if(typeof data?.name!=='string'||!data.name.trim()||data.name.length>180||!Array.isArray(data.stops)||data.stops.length>300)throw new Error('行程内容格式不正确或超过数量限制')
  const validDate=(v:unknown)=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v)&&localDate(new Date(v+'T12:00:00'))===v
  if(!validDate(data.startsOn)||!validDate(data.endsOn)||data.startsOn!>data.endsOn!)throw new Error('导入行程需要有效的起止日期')
  if(addDays(data.startsOn!,59)<data.endsOn!)throw new Error('单个行程最多 60 天')
  const stops=data.stops.map((stop,index)=>{
    if(typeof stop.placeName!=='string'||!stop.placeName.trim()||stop.placeName.length>180||!validDate(stop.dayDate)||stop.dayDate<data.startsOn!||stop.dayDate>data.endsOn!||!/^([01]\d|2[0-3]):[0-5]\d$/.test(stop.startsAt)||!Number.isInteger(stop.durationMinutes)||stop.durationMinutes<1||stop.durationMinutes>1440)throw new Error('导入文件含有无效的日程点')
    const cost=Number(stop.estimatedCost||0);if(!Number.isFinite(cost)||cost<0||cost>999999999)throw new Error('导入费用无效')
    return {...stopInput(stop),placeId:ownedPlaces.some(place=>place.id===stop.placeId)?stop.placeId:null,sortOrder:index,category:String(stop.category||'活动').slice(0,80),note:String(stop.note||'').slice(0,500),estimatedCost:cost}
  })
  const pref=preferences(data);if(!Number.isFinite(pref.budgetAmount)||pref.budgetAmount<0||!Number.isInteger(pref.travelers)||pref.travelers<1||pref.travelers>30||!['relaxed','balanced','packed'].includes(pref.pace)||!['economy','standard','comfort'].includes(pref.budgetLevel)||!['walk','transit','drive'].includes(pref.transport)||!Array.isArray(pref.styles)||pref.styles.some(style=>!styles.some(item=>item.id===style))||!Array.isArray(pref.checklist)||pref.checklist.length>80)throw new Error('导入偏好格式无效')
  pref.checklist=pref.checklist.map(item=>{if(typeof item.text!=='string'||!item.text.trim()||item.text.length>180)throw new Error('出行清单格式无效');return {id:crypto.randomUUID(),text:item.text,done:!!item.done}})
  return {input:{name:data.name,destination:String(data.destination||'').slice(0,180),startsOn:data.startsOn,endsOn:data.endsOn,notes:String(data.notes||'').slice(0,10000),status:['planning','ongoing','completed'].includes(data.status)?data.status:'planning',preferences:pref},stops}
}

export const inspirationTemplates=[
  {id:'city',title:'城市的另一面',subtitle:'街巷、展馆与一杯好咖啡',days:3,styles:['city','culture'],pace:'balanced' as const,tone:'blue',description:'给城市留一点步行的时间，把想看的展览与附近的街区排在一起。',checklist:['检查展馆开放日','收藏住处附近的餐馆','留出一段自由漫步时间']},
  {id:'nature',title:'去山野，慢一点',subtitle:'把时间还给自然',days:4,styles:['nature','photography'],pace:'relaxed' as const,tone:'green',description:'每天安排少量地点，留足停留与往返时间。天气、步道和预约请在出发前确认。',checklist:['核对天气与步道开放情况','准备户外装备和饮水','向同行人分享行程']},
  {id:'food',title:'用味蕾认识一座城',subtitle:'市场、街头小店与当地风味',days:3,styles:['food','city'],pace:'balanced' as const,tone:'peach',description:'从收藏过的餐馆开始，搭配附近的城市体验。营业时间、过敏原和排队情况记在备注里。',checklist:['确认饮食禁忌与过敏原','核对餐馆营业时间','给热门餐馆预留预约时间']},
  {id:'family',title:'一家人的小假期',subtitle:'轻松、有趣，也给休息留位',days:3,styles:['family','nature'],pace:'relaxed' as const,tone:'sand',description:'降低每日安排密度，给午间休息和临时调整留出空间。把亲子设施与住宿注意事项提前记下。',checklist:['确认住宿与亲子设施','准备常用物品与药品','给每天留一段休息时间']},
]
