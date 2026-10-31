// @vitest-environment jsdom
import {afterEach,describe,expect,it,vi} from 'vitest'
import {mount} from '@vue/test-utils'
import CategoryStatistics from './CategoryStatistics.vue'
import TransactionsPage from './TransactionsPage.vue'
import OverviewDashboard from './OverviewDashboard.vue'
import {createInitialSnapshot,createTransaction,type Category} from './ledger'
import {defaultTransactionFilters,money} from './ledgerViewModels'
const wrappers:Array<ReturnType<typeof mount>>=[]
afterEach(()=>{wrappers.forEach(wrapper=>wrapper.unmount());wrappers.length=0;vi.useRealTimers()})
function fixture(){
 const snapshot=createInitialSnapshot(),category=(id:string,name:string,parentId:string|null=null):Category=>({id,name,parentId,flowType:'expense',icon:'food',color:'#5799dd',sortOrder:0})
 snapshot.categories=[category('food','餐饮'),category('meal','日常吃饭','food'),category('lunch','午餐','meal'),category('bus','公交')]
 const time=new Date().toISOString()
 snapshot.transactions=[...createTransaction(snapshot,{title:'合成聚餐',amount:300,kind:'expense',happenedAt:time,categoryId:'lunch',bookIds:[],splitParticipantIds:['我','甲','乙']}),...createTransaction(snapshot,{title:'合成收入',amount:20,kind:'income',happenedAt:time,bookIds:[]}),...createTransaction(snapshot,{title:'排除记录',amount:1000,kind:'expense',happenedAt:time,includeInStatistics:false,bookIds:[]})]
 return snapshot
}
describe('statistics interactions',()=>{
 it('drills down repeatedly and returns through breadcrumbs without losing the total',async()=>{
  const snapshot=fixture(),wrapper=mount(CategoryStatistics,{props:{transactions:snapshot.transactions,categories:snapshot.categories}});wrappers.push(wrapper)
  await wrapper.get('.cs-row').trigger('click');expect(wrapper.get('.cs-breadcrumb').text()).toContain('餐饮');expect(wrapper.get('.cs-list').text()).toContain('日常吃饭')
  await wrapper.get('.cs-row').trigger('click');expect(wrapper.get('.cs-list').text()).toContain('午餐');expect(wrapper.get('.cs-footnote').text()).toContain(money(100))
  await wrapper.get('[aria-label="返回上一级分类统计"]').trigger('click');expect(wrapper.get('.cs-list').text()).toContain('日常吃饭')
 })
 it('switches diagram and metric independently, and selects donut values with keyboard',async()=>{
  const snapshot=fixture(),wrapper=mount(CategoryStatistics,{props:{transactions:snapshot.transactions,categories:snapshot.categories}});wrappers.push(wrapper)
  await wrapper.get('.cs-sector').trigger('keydown',{key:'Enter'});expect(wrapper.get('.cs-donut-center strong').text()).toBe('100.0%')
  const controls=wrapper.findAll('.cs-segments button');await controls[3]!.trigger('click');expect(wrapper.get('.cs-donut-center strong').text()).toBe(money(100))
  await controls[1]!.trigger('click');expect(wrapper.find('.cs-donut').exists()).toBe(false);expect(wrapper.find('.cs-bar').exists()).toBe(true)
 })
 it('shows identical personal totals on overview and transactions, with full order values explained',()=>{
  const snapshot=fixture(),overview=mount(OverviewDashboard,{props:{snapshot,period:'month'}}),list=mount(TransactionsPage,{props:{modelValue:defaultTransactionFilters(),transactions:snapshot.transactions,categories:snapshot.categories,books:snapshot.books,appearanceMode:'dark'}});wrappers.push(overview,list)
  expect(overview.get('.home-expense-card>strong').text()).toBe(money(100))
  expect(list.get('.tp-summary .lv-expense').text()).toBe(money(100))
  expect(list.get('.tp-summary .lv-income').text()).toBe(money(20))
  expect(list.get('.tl-personal-share').text()).toContain(money(100));expect(list.text()).toContain('不计统计')
 })
 it('changes the date filter and uses the selected book personal share',async()=>{
  const snapshot=fixture(),row=snapshot.transactions[0]!,book=snapshot.books[0]!
  row.bookIds=[book.id];row.ledgerSplitSettings={[book.id]:{paidByParticipantId:'我',splitParticipantIds:['我','甲'],splitMode:'fixed',splitRatio:null,splitAmount:80}}
  const wrapper=mount(TransactionsPage,{props:{modelValue:{...defaultTransactionFilters(),bookId:book.id},transactions:snapshot.transactions,categories:snapshot.categories,books:snapshot.books,appearanceMode:'light'}});wrappers.push(wrapper)
  expect(wrapper.get('.tp-summary .lv-expense').text()).toBe(money(80));expect(wrapper.get('.tl-day-totals').text()).toContain(money(80))
  await wrapper.findAll('.tp-date-chips button')[3]!.trigger('click');expect(wrapper.emitted('update:modelValue')?.[0]?.[0]).toMatchObject({dateScope:'year',bookId:book.id})
 })
})
