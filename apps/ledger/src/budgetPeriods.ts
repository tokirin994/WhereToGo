import {budgetSpent,localDay,type Budget,type LedgerSnapshot} from './ledger'

export type BudgetPeriodState='active'|'upcoming'|'ended'|'invalid'
export const budgetStateLabels:Record<BudgetPeriodState,string>={active:'进行中',upcoming:'未开始',ended:'已结束',invalid:'日期待完善'}
/** Date controls use calendar days; native exports may carry an ISO timestamp. */
export function budgetDateInput(value:string|null|undefined):string {
  if(!value)return ''
  if(/^\d{4}-\d{2}-\d{2}$/.test(value)){
    const [year,month,day]=value.split('-').map(Number),date=new Date(year!,month!-1,day)
    return localDay(date)===value?value:''
  }
  if(!/^\d{4}-\d{2}-\d{2}T/.test(value))return ''
  const date=new Date(value);return Number.isFinite(date.getTime())?localDay(date):''
}
function boundary(value:string|null|undefined){const day=budgetDateInput(value);return day?new Date(`${day}T00:00:00`):null}
function nextDay(value:Date){const result=new Date(value);result.setDate(result.getDate()+1);return result}
const invalidPeriod=()=>({start:new Date(NaN),end:new Date(NaN),state:'invalid' as BudgetPeriodState,periodText:'请编辑并完善预算日期',recurring:false})
export function resolveBudgetPeriod(budget:Budget,now=new Date()){
  const year=Number(budget.year),validYear=Number.isInteger(year)&&year>=1900&&year<=9999
  const configuredStart=boundary(budget.startDate),configuredEnd=boundary(budget.endDate)
  if((budget.startDate&&!configuredStart)||(budget.endDate&&!configuredEnd)||!Number.isFinite(now.getTime()))return invalidPeriod()
  let start:Date,end:Date,recurring=false
  if(budget.periodType==='monthly'){
    if(!validYear)return invalidPeriod()
    if(budget.month==null){
      recurring=true
      const first=configuredStart||new Date(year,0,1),last=configuredEnd?nextDay(configuredEnd):null
      if(last&&last<=first)return invalidPeriod()
      const anchor=now<first?first:last&&now>=last?new Date(last.getTime()-1):now
      start=new Date(anchor.getFullYear(),anchor.getMonth(),1);end=new Date(anchor.getFullYear(),anchor.getMonth()+1,1)
      if(first>start)start=first;if(last&&last<end)end=last
    }else{
      const month=Number(budget.month);if(!Number.isInteger(month)||month<1||month>12)return invalidPeriod()
      start=new Date(year,month-1,1);end=new Date(year,month,1)
      if(configuredStart&&configuredStart>start)start=configuredStart
      if(configuredEnd&&nextDay(configuredEnd)<end)end=nextDay(configuredEnd)
    }
  }else if(budget.periodType==='range'){
    if(!configuredStart&&!validYear)return invalidPeriod()
    start=configuredStart||new Date(year,0,1);end=configuredEnd?nextDay(configuredEnd):new Date(8640000000000000)
  }else return invalidPeriod()
  if(!(start<end))return invalidPeriod()
  const state:BudgetPeriodState=now<start?'upcoming':now>=end?'ended':'active'
  const periodText=budget.periodType==='monthly'?`${start.getFullYear()}年${start.getMonth()+1}月${recurring?' · 每月重复':''}`:`${localDay(start).replaceAll('-','.')} — ${configuredEnd?localDay(configuredEnd).replaceAll('-','.'):'不限结束'}`
  return {start,end,state,periodText,recurring}
}
export function budgetProgress(snapshot:LedgerSnapshot,budget:Budget,now=new Date()){
  const period=resolveBudgetPeriod(budget,now),spent=period.state==='invalid'?0:budgetSpent(snapshot,budget,period.start,period.end)
  const ratio=budget.limitAmount>0?spent/budget.limitAmount*100:0
  return {...budget,...period,spent,ratio,remaining:budget.limitAmount-spent}
}
