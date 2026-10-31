import {describe,it,expect} from 'vitest'
import {createInitialSnapshot,createTransaction,createOffsetTransaction,updateTransaction,statisticsSummary,transactionShareAmount,budgetSpent,type Budget} from './ledger'
import {createBookExport} from './bookExport'
import {money} from './ledgerViewModels'
function fixture(){const snapshot=createInitialSnapshot(),book=snapshot.books[0]!;book.id='2';book.participants=[{id:'我',name:'我'},{id:'甲',name:'甲'},{id:'乙',name:'乙'}];const happenedAt=new Date(2026,9,12,12).toISOString();snapshot.transactions=[...createTransaction(snapshot,{title:'合成分账订单',amount:300,kind:'expense',happenedAt,bookIds:['2'],splitParticipantIds:['我','甲','乙']}),...createTransaction(snapshot,{title:'合成收入',amount:20,kind:'income',happenedAt,bookIds:['2']}),...createTransaction(snapshot,{title:'排除记录',amount:900,kind:'expense',happenedAt,includeInStatistics:false,bookIds:['2']})];return{snapshot,book,happenedAt}}
describe('book statistics and linked data regressions',()=>{
 it('exports the same personal totals in HTML and Markdown, while preserving full order rows',()=>{
  const {snapshot,book}=fixture(),html=createBookExport(book,snapshot,'html').content,md=createBookExport(book,snapshot,'md').content
  expect(html).toContain(`总支出</span><strong>${money(100)}`);expect(html).toContain('本人份额');expect(html).toContain('不计统计')
  expect(md).toContain(`- 支出：${money(100)}`);expect(md).toContain(`- 收入：${money(20)}`);expect(md).toContain(money(300))
 })
 it('exports both order and personal amounts with explicit inclusion in CSV',()=>{
  const {snapshot,book}=fixture(),csv=createBookExport(book,snapshot,'csv').content
  expect(csv).toContain('"金额","本人统计金额","计入统计"');expect(csv).toContain('"300.00","100.00","是"');expect(csv).toContain('"900.00","0.00","否"')
 })
 it('keeps legacy participant names when generating and updating reimbursements',()=>{
  const snapshot=createInitialSnapshot(),incomeCategory=snapshot.categories.find(category=>category.flowType==='income')!
  const [source]=createTransaction(snapshot,{title:'合成支出',amount:120,kind:'expense',happenedAt:new Date().toISOString(),bookIds:[],splitParticipantIds:['uuid-me','uuid-other'],splitParticipantNames:['我','同行者']})
  const offset=createOffsetTransaction(source!,incomeCategory,100);snapshot.transactions=[source!,offset]
  expect(transactionShareAmount(offset)).toBe(60)
  updateTransaction(snapshot,source!.id,{...source!,splitMode:'ratio',splitRatio:25})
  expect(statisticsSummary(snapshot.transactions)).toMatchObject({expense:30,income:30,balance:0})
 })
 it('allows an imported disabled split to save without selecting unused participants',()=>{
  const {snapshot,happenedAt}=fixture()
  const [row]=createTransaction(snapshot,{title:'无需分摊',amount:120,kind:'expense',happenedAt,bookIds:['2'],ledgerSplitSettings:{'2':{paidByParticipantId:null,splitParticipantIds:[],splitMode:'equal',splitRatio:null,splitAmount:null,splitEnabled:false}}})
  expect(transactionShareAmount(row!,'2')).toBe(120)
 })
 it('uses current book statistics flags and shares for budget spending',()=>{
  const {snapshot}=fixture(),budget:Budget={id:'budget',name:'合成预算',limitAmount:500,periodType:'monthly',year:2026,month:10,startDate:null,endDate:null,categoryIds:[],bookId:'2'}
  expect(budgetSpent(snapshot,budget,new Date(2026,9,1),new Date(2026,10,1))).toBe(100)
  snapshot.transactions[0]!.ledgerSplitSettings!['2']!.includeInStatistics=false
  expect(budgetSpent(snapshot,budget,new Date(2026,9,1),new Date(2026,10,1))).toBe(0)
 })
})
