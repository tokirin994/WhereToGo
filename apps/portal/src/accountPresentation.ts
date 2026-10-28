import type {AccountProfile,AccountSession} from './accountApi'
const text=(value:unknown)=>typeof value==='string'?value:''
function object(value:unknown):Record<string,unknown>{return value&&typeof value==='object'&&!Array.isArray(value)?value as Record<string,unknown>:{}}
export function accountProfile(value:unknown):AccountProfile{
 const row=object(value)
 if(!text(row.id)||!text(row.username))throw new Error('账号资料格式异常，请刷新信息重试')
 return {id:text(row.id),username:text(row.username),email:text(row.email),firstName:text(row.firstName),lastName:text(row.lastName),emailVerified:row.emailVerified===true}
}
export function accountSessions(value:unknown):AccountSession[]{
 const rows=Array.isArray(value)?value:object(value).sessions
 if(!Array.isArray(rows))throw new Error('设备信息格式异常，请重试')
 return rows.flatMap(value=>{const row=object(value);if(!text(row.id))return []
  const clients=Array.isArray(row.clients)?row.clients.map(object).map(client=>({clientId:text(client.clientId),clientName:text(client.clientName)})):[]
  return [{id:text(row.id),ipAddress:text(row.ipAddress),browser:text(row.browser),current:row.current===true,
   started:row.started,lastAccess:row.lastAccess,expires:row.expires,clients} as AccountSession]
 })
}
export function accountDate(value?:string|number){
 if(value===undefined||value===null||value==='')return '—'
 const numeric=typeof value==='number'?value:/^\d+(?:\.\d+)?$/.test(value)?Number(value):NaN
 const stamp=Number.isFinite(numeric)?numeric<1e11?numeric*1000:numeric:Date.parse(String(value))
 if(!Number.isFinite(stamp)||Math.abs(stamp)>8.64e15)return '—'
 const date=new Date(stamp)
 return Number.isNaN(date.getTime())?'—':new Intl.DateTimeFormat('zh-CN',{dateStyle:'medium',timeStyle:'short'}).format(date)
}
