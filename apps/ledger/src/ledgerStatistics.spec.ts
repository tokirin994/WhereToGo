import {describe,it,expect} from 'vitest'
import {createInitialSnapshot,createTransaction,createOffsetTransaction,dashboardSummary,statisticsSummary,transactionShareAmount,transactionInStatistics,rangeForPreset,type Category,type Transaction,type LedgerSplitSettings} from './ledger'
import {bookSummary,defaultTransactionFilters,filterLedgerTransactions} from './ledgerViewModels'
import {categoryDistribution,incomeExpenseTrend} from './ledgerStatistics'
const date=new Date(2026,9,12,12).toISOString(),start=new Date(2026,9,1),end=new Date(2026,10,1)
const tx=(amount=120,extra:Partial<Transaction>={}):Transaction=>({...createTransaction(createInitialSnapshot(),{title:'合成订单',amount,kind:'expense',happenedAt:date,bookIds:[]})[0]!,...extra})
const split=(extra:Partial<LedgerSplitSettings>={}):LedgerSplitSettings=>({paidByParticipantId:'我',splitParticipantIds:['我','同行者'],splitMode:'equal',splitRatio:null,splitAmount:null,...extra})
const cat=(id:string,name:string,parentId:string|null=null):Category=>({id,name,parentId,flowType:'expense',sortOrder:0,icon:'food',color:'#5693d7'})
const categories=[cat('food','餐饮'),cat('meal','日常吃饭','food'),cat('lunch','午餐','meal'),cat('coffee','咖啡','food'),cat('travel','交通'),cat('bus','公交','travel')]

describe('one statistics policy across ledger surfaces',()=>{
 it('uses equal, percentage and fixed personal shares, including zero participation',()=>{
  expect(transactionShareAmount(tx(300,{splitParticipantIds:['我','甲','乙']}))).toBe(100)
  expect(transactionShareAmount(tx(300,{splitParticipantIds:['我','甲'],splitMode:'ratio',splitRatio:35}))).toBe(105)
  expect(transactionShareAmount(tx(300,{splitParticipantIds:['我','甲'],splitMode:'fixed',splitAmount:80}))).toBe(80)
  expect(transactionShareAmount(tx(300,{splitParticipantIds:['甲','乙']}))).toBe(0)
  expect(transactionShareAmount(tx(300,{splitParticipantIds:['me-id','other'],splitParticipantNames:['我','甲']}))).toBe(150)
 })
 it('honors the global exclusion flag and the current ledger exclusion independently',()=>{
  const row=tx(120,{bookIds:['2','10'],ledgerSplitSettings:{'2':split({includeInStatistics:false}),'10':split({splitMode:'fixed',splitAmount:30})}})
  expect(transactionInStatistics(row)).toBe(false)
  expect(transactionShareAmount(row)).toBe(0)
  expect(transactionShareAmount(row,'10')).toBe(30)
  expect(transactionShareAmount({...row,includeInStatistics:false},'10')).toBe(0)
 })
 it('chooses the first linked ledger by numeric ID and never sums independent book shares',()=>{
  const row=tx(120,{bookIds:['10','2'],ledgerSplitSettings:{'10':split({splitMode:'fixed',splitAmount:80}),'2':split()}})
  expect(transactionShareAmount(row)).toBe(60)
  expect(transactionShareAmount({...row,bookIds:['2','10']})).toBe(60)
  expect(transactionShareAmount(row,'10')).toBe(80)
  expect(statisticsSummary([row])).toMatchObject({expense:60,count:1})
 })
 it('ignores removed links and accepts native split-disabled links and participant snapshots',()=>{
  const row=tx(120,{bookIds:['10'],ledgerSplitSettings:{'2':split({includeInStatistics:false}),'10':split({splitEnabled:false})}})
  expect(transactionShareAmount(row)).toBe(120)
  const native=tx(120,{bookIds:['10'],ledgerSplitSettings:{'10':split({splitParticipantIds:['uuid-me','uuid-other'],participantSnapshot:[{id:'uuid-me',name:'我'}]})}})
  expect(transactionShareAmount(native)).toBe(60)
 })
 it('accepts native fractional ratios without confusing an explicit web one-percent share',()=>{
  const native=tx(200,{bookIds:['2'],ledgerSplitSettings:{'2':split({splitEnabled:true,splitMode:'ratio',splitRatio:.5})}})
  expect(transactionShareAmount(native)).toBe(100)
  expect(transactionShareAmount({...native,ledgerSplitSettings:{'2':split({splitEnabled:true,splitMode:'ratio',splitRatio:1,splitRatioUnit:'percent'})}})).toBe(2)
 })
 it('keeps the dashboard, filtered list and book summary equal for the same scope',()=>{
  const snapshot=createInitialSnapshot(),book={...snapshot.books[0]!,id:'2'};snapshot.books=[book]
  snapshot.transactions=[tx(120,{bookIds:['2'],ledgerSplitSettings:{'2':split()}}),tx(20,{kind:'income'}),tx(900,{includeInStatistics:false})]
  const filters=defaultTransactionFilters(start),rows=filterLedgerTransactions(snapshot.transactions,snapshot.categories,filters,start)
  const overview=dashboardSummary(snapshot,start,end),list=statisticsSummary(rows)
  expect(list).toMatchObject({expense:60,income:20,balance:-40,count:3,includedCount:2})
  expect(overview.expenses).toBe(list.expense);expect(overview.income).toBe(list.income)
  expect(bookSummary(book,snapshot.transactions)).toMatchObject({expense:60,count:1})
 })
 it('keeps linked offset income distinct and balances it with the same personal share',()=>{
  const source=tx(120,{splitParticipantIds:['我','甲']}),incomeCategory={...cat('refund','退款'),flowType:'income' as const}
  const offset=createOffsetTransaction(source,incomeCategory,100)
  expect(offset.happenedAt).toBe(source.happenedAt)
  expect(statisticsSummary([source,offset])).toMatchObject({expense:60,income:60,balance:0})
 })
 it('includes only installments inside the same half-open calendar range',()=>{
  const snapshot=createInitialSnapshot();snapshot.transactions=createTransaction(snapshot,{title:'合成分期',amount:300,kind:'expense',happenedAt:new Date(2026,8,15,12).toISOString(),installmentMonths:3,bookIds:[],splitParticipantIds:['我','甲']})
  const overview=dashboardSummary(snapshot,start,end)
  expect(overview.expenses).toBe(50);expect(overview.transactionCount).toBe(1)
  expect(statisticsSummary(filterLedgerTransactions(snapshot.transactions,[],defaultTransactionFilters(start),start)).expense).toBe(50)
  expect(rangeForPreset('month',start)).toEqual({start,end})
 })
 it('excludes discounts and premiums on excluded or income records',()=>{
  expect(statisticsSummary([tx(10,{discountAmount:2,premiumAmount:1}),tx(20,{includeInStatistics:false,discountAmount:50}),tx(20,{kind:'income',discountAmount:30})])).toMatchObject({discount:2,premium:1})
 })
})
describe('category drill-down and interactive trend data',()=>{
 const rows=[tx(120,{categoryId:'lunch',splitParticipantIds:['我','甲']}),tx(20,{categoryId:'coffee'}),tx(10,{categoryId:'food'}),tx(30,{categoryId:'bus'}),tx(5,{categoryId:null}),tx(999,{categoryId:'lunch',includeInStatistics:false})]
 it('groups roots, children and deeper descendants without leaking another branch',()=>{
  expect(categoryDistribution(rows,categories).items.map(item=>[item.name,item.amount])).toEqual([['餐饮',90],['交通',30],['未分类',5]])
  const food=categoryDistribution(rows,categories,'food')
  expect(food.total).toBe(90);expect(food.items.map(item=>[item.name,item.amount])).toEqual([['日常吃饭',60],['咖啡',20],['本级直接记账',10]])
  expect(categoryDistribution(rows,categories,'meal').items).toMatchObject([{name:'午餐',amount:60}])
  expect(food.items.reduce((sum,item)=>sum+item.percent,0)).toBeCloseTo(100)
 })
 it('never collapses selectable categories into an opaque other bucket',()=>{
  const cats=Array.from({length:12},(_,i)=>cat(`c${i}`,`分类${i}`))
  expect(categoryDistribution(cats.map(category=>tx(10,{categoryId:category.id})),cats).items).toHaveLength(12)
 })
 it('applies independent book shares in distribution and trend',()=>{
  const row=tx(120,{categoryId:'lunch',bookIds:['2','10'],ledgerSplitSettings:{'2':split(),'10':split({splitMode:'fixed',splitAmount:80})}})
  expect(categoryDistribution([row],categories,null,'10').total).toBe(80)
  expect(incomeExpenseTrend([row],start,end,'week','10').reduce((sum,item)=>sum+item.expense,0)).toBe(80)
 })
 it('preserves totals through day/week/month trend bucketing and month boundaries',()=>{
  const boundary=[...rows,tx(7,{happenedAt:start.toISOString()}),tx(999,{happenedAt:end.toISOString()})]
  for(const grain of ['day','week','month'] as const){const trend=incomeExpenseTrend(boundary,start,end,grain);expect(trend.reduce((sum,item)=>sum+item.expense,0)).toBe(132);expect(trend[0]!.start).toEqual(start);expect(trend.at(-1)!.end).toEqual(end)}
 })
})
