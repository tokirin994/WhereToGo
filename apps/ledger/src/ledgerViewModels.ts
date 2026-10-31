import type { Book, Category, FlowType, Transaction } from './ledger'
import {statisticsSummary} from './ledger'
export interface TransactionFilters {
  flow: 'all' | FlowType
  dateScope: '7days' | '30days' | 'month' | 'year' | 'custom'
  startDate: string
  endDate: string
  categoryId: string | null
  bookId: string | null
  search: string
}
export function localDay(date:Date){const pad=(n:number)=>String(n).padStart(2,'0');return `${date.getFullYear()}-${pad(date.getMonth()+1)}-${pad(date.getDate())}`}
export function defaultTransactionFilters(now=new Date()):TransactionFilters{return{flow:'all',dateScope:'month',startDate:localDay(new Date(now.getFullYear(),now.getMonth(),1)),endDate:localDay(now),categoryId:null,bookId:null,search:''}}
export function money(amount:number,currency='CNY'){try{return new Intl.NumberFormat('zh-CN',{style:'currency',currency}).format(amount)}catch{return new Intl.NumberFormat('zh-CN',{style:'currency',currency:'CNY'}).format(amount)}}
export function bookSummary(book:Book,transactions:Transaction[]){return statisticsSummary(transactions.filter(tx=>tx.bookIds.includes(book.id)),book.id)}
export function categoryTrail(categories:Category[],id:string|null){const result:Category[]=[];const seen=new Set<string>();let current=categories.find(cat=>cat.id===id);while(current&&!seen.has(current.id)){seen.add(current.id);result.unshift(current);current=categories.find(cat=>cat.id===current?.parentId)}return result}
export function transactionDateRange(filters:TransactionFilters,now=new Date()){
  if(filters.dateScope==='custom')return{start:filters.startDate,end:filters.endDate}
  const end=new Date(now.getFullYear(),now.getMonth(),now.getDate())
  const start=filters.dateScope==='year'?new Date(now.getFullYear(),0,1):filters.dateScope==='month'?new Date(now.getFullYear(),now.getMonth(),1):new Date(now.getFullYear(),now.getMonth(),now.getDate()-(filters.dateScope==='7days'?6:29))
  // Month/year scopes include the entire calendar period, including future records.
  if(filters.dateScope==='month')end.setFullYear(now.getFullYear(),now.getMonth()+1,0)
  if(filters.dateScope==='year')end.setFullYear(now.getFullYear(),11,31)
  return{start:localDay(start),end:localDay(end)}
}
export function filterLedgerTransactions(transactions:Transaction[],categories:Category[],filters:TransactionFilters,now=new Date()){
  const range=transactionDateRange(filters,now),query=filters.search.trim().toLocaleLowerCase()
  if(!range.start||!range.end||range.start>range.end)return[]
  return transactions.filter(tx=>{
    if(filters.flow!=='all'&&tx.kind!==filters.flow)return false
    if(filters.bookId&&!tx.bookIds.includes(filters.bookId))return false
    const trail=categoryTrail(categories,tx.categoryId)
    if(filters.categoryId&&!trail.some(category=>category.id===filters.categoryId))return false
    if(query&&![tx.title,tx.merchant,tx.note,tx.paymentMethod,...trail.map(cat=>cat.name)].some(value=>value?.toLocaleLowerCase().includes(query)))return false
    const happened=new Date(tx.happenedAt)
    if(Number.isNaN(happened.getTime()))return false
    const date=localDay(happened)
    return date>=range.start&&date<=range.end
  }).sort((a,b)=>b.happenedAt.localeCompare(a.happenedAt))
}
