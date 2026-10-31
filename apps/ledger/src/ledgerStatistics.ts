import {categoryPath,transactionShareAmount,type Category,type Transaction} from './ledger'

export function categoryDistribution(transactions:Transaction[],categories:Category[],parentId:string|null=null,bookId?:string){
  const groups=new Map<string,{id:string;categoryId:string|null;name:string;icon:string;color:string;amount:number;count:number;canDrill:boolean}>()
  for(const tx of transactions){
    if(tx.kind!=='expense')continue
    const amount=transactionShareAmount(tx,bookId);if(!(amount>0))continue
    const path=categoryPath(categories,tx.categoryId),parentIndex=parentId?path.findIndex(category=>category.id===parentId):-1
    if(parentId&&parentIndex<0)continue
    const category=path[parentIndex+1]
    const direct=!!parentId&&!category,id=category?.id||(direct?`direct:${parentId}`:'unassigned')
    const item=groups.get(id)||{id,categoryId:category?.id||null,name:category?.name||(direct?'本级直接记账':'未分类'),icon:category?.icon||'tag',color:category?.color||'#8a9bb5',amount:0,count:0,canDrill:!!category&&categories.some(child=>child.parentId===category.id)}
    item.amount+=amount;item.count++;groups.set(id,item)
  }
  const items=[...groups.values()].sort((a,b)=>b.amount-a.amount||a.name.localeCompare(b.name,'zh-CN')),total=items.reduce((sum,item)=>sum+item.amount,0)
  const palette=['#729fe7','#62baa8','#e4a16a','#b29ae4','#df8fa8','#77b7d4','#bdba70','#a7a5db']
  const usedColors=new Set<string>()
  let cursor=0
  return {total,items:items.map((item,index)=>{const percent=total?item.amount/total*100:0,start=cursor;cursor+=percent;const color=usedColors.has(item.color.toLowerCase())?palette.find(candidate=>!usedColors.has(candidate))||palette[index%palette.length]!:item.color;usedColors.add(color.toLowerCase());return {...item,color,percent,start,end:cursor}})}
}

export type TrendGranularity='day'|'week'|'month'
export function incomeExpenseTrend(transactions:Transaction[],start:Date,end:Date,granularity:TrendGranularity,bookId?:string){
  const points:Array<{key:string;label:string;start:Date;end:Date;income:number;expense:number}>=[]
  const dayKey=(date:Date)=>`${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`
  let cursor=new Date(start)
  // A guard prevents malformed imported dates from creating unbounded chart data.
  while(cursor<end&&points.length<400){
    const next=new Date(cursor)
    if(granularity==='month'){next.setDate(1);next.setMonth(next.getMonth()+1)}else next.setDate(next.getDate()+(granularity==='week'?7-(next.getDay()+6)%7:1))
    if(next>end)next.setTime(end.getTime())
    const label=granularity==='month'?`${cursor.getMonth()+1}月`:granularity==='week'?`${cursor.getMonth()+1}/${cursor.getDate()}起`:`${cursor.getMonth()+1}/${cursor.getDate()}`
    points.push({key:dayKey(cursor),label,start:new Date(cursor),end:next,income:0,expense:0});cursor=next
  }
  for(const tx of transactions){const date=new Date(tx.happenedAt),point=points.find(item=>date>=item.start&&date<item.end);if(point)point[tx.kind]+=transactionShareAmount(tx,bookId)}
  return points
}

export function chartAxisMaximum(value:number){if(!(value>0))return 1;const power=10**Math.floor(Math.log10(value)),unit=power/2;return Math.ceil(value/unit)*unit}
