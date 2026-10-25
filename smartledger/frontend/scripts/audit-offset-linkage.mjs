// Read-only parity audit. Executes production core and extracted Vue handlers on disposable fixtures.
// App source plus the user's 2026-10-25 overrides: source-following default dates and book-removal cascade.
// Reports differences; deliberately does not change production logic or actual account data.
import 'fake-indexeddb/auto'
import fs from 'node:fs'
import vm from 'node:vm'
import assert from 'node:assert/strict'
import ts from 'typescript'
import * as ledger from '../src/ledger.ts'
import {readLocalSnapshot,writeLocalSnapshot} from '../src/storage.ts'
// Extract the dependency-free production fingerprint without Node resolving Vite extensionless imports.
const syncAst=ts.createSourceFile('sync.ts',fs.readFileSync(new URL('../src/cloudSync.ts',import.meta.url),'utf8'),ts.ScriptTarget.Latest,true)
const fingerprintNode=syncAst.statements.find(node=>ts.isFunctionDeclaration(node)&&node.name?.text==='fingerprint')
const fingerprint=vm.runInNewContext('('+ts.transpileModule(fingerprintNode.getText(syncAst).replace(/^export /,''),{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText+')')
const source=fs.readFileSync(new URL('../src/LedgerWorkspace.vue',import.meta.url),'utf8').match(/<script setup lang="ts">([\s\S]*?)<\/script>/)[1]
const ast=ts.createSourceFile('workspace.ts',source,ts.ScriptTarget.Latest,true),results=[],observations=[]
const ref=value=>({value})
const plain=value=>JSON.parse(JSON.stringify(value))
function check(name,expected,actual){let same=true;try{assert.deepEqual(plain(actual),plain(expected))}catch{same=false}results.push({name,status:same?'matches':'differs',expected:plain(expected),actual:plain(actual)});console.log((same?'MATCH ':'DIFF  ')+name)}
function fixture(legacy=false){
  const snapshot=ledger.createInitialSnapshot(),first=snapshot.books[0];first.id='book-a'
  snapshot.books.push({...first,id:'book-b',name:'第二账本'})
  const category=snapshot.categories.find(c=>c.flowType==='income'&&c.name==='报销')
  const [expense]=ledger.createTransaction(snapshot,{title:'原订单',amount:100,kind:'expense',happenedAt:'2026-10-20T04:00:00Z',bookIds:['book-a','book-b'],hasExplicitBookSelection:true,merchant:'原商家',paymentMethod:'微信',note:'原备注'})
  expense.id='expense-a'
  const offsets=[30,20].map((amount,index)=>{const tx=ledger.createOffsetTransaction(expense,category,amount,'offset-'+index);tx.title=expense.title;tx.offsetDateMode='independent';tx.happenedAt=`2026-10-${21+index}T04:00:00Z`;tx.note=expense.note;tx.source=`offset:${expense.id}|manual`;if(legacy)tx.offsetSourceTransactionId=null;return tx})
  const [other]=ledger.createTransaction(snapshot,{title:'原订单',amount:100,kind:'expense',happenedAt:'2026-10-20T04:00:00Z',bookIds:['book-b'],hasExplicitBookSelection:true});other.id='unrelated-same-title'
  snapshot.transactions=[expense,...offsets,other]
  return {snapshot,expense,offsets,other,category,book:first}
}
function environment(snapshot,fail=false){
  const context=vm.createContext({Error,JSON,Date,...ledger,fingerprint,entryLinkedSource:ref(undefined),entryOffsetOriginalState:ref(''),entryRecordState:()=>JSON.stringify(snapshot.transactions),entryExistingOffsets:{get value(){return ledger.linkedOffsets(snapshot,context.editingId.value)}},entryOffsetEdits:ref([]),entryOffsetDrafts:ref([]),entryClearOffsetIds:ref([]),entryOffsetDateMode:ref('source'),entryOffsetManager:ref({confirmLimit:async()=> 'keep',confirmClearAll:async()=>true}),snapshot:ref(snapshot),activeTab:ref('transactions'),entryReturnTab:ref('transactions'),editingId:ref(null),editingTransaction:ref(undefined),entryOpen:ref(false),entryDraft:ref({}),entryExplicitBooks:ref(false),entrySplitSettings:ref({}),entryInstallmentEnabled:ref(false),entryInstallmentStartDate:ref('2026-10-20'),entryBaseline:ref(''),entryEditorState:()=>'',savingEntry:ref(false),savingCandidates:ref(new Set()),selectedBook:ref(null),selectedBookId:ref(null),transactionFilters:ref({bookId:null,flow:'all'}),flatCategories:ref(ledger.flattenCategories(snapshot.categories)),bookId:ref(null),error:ref(''),window:{confirm:()=>true,history:{replaceState:()=>{}}},document:{title:'isolated test'},notify:()=>{},currency:String,persist:async()=>{if(fail)throw Error('模拟保存失败')}})
  for(const name of ['toLocalDateTime','openEntry','syncOffset','saveEntry','deleteTransaction','removeTransactionFromBook','deleteBook','manageInstallment']){
    const declaration=ast.statements.find(node=>ts.isFunctionDeclaration(node)&&node.name.text===name)
    if(!declaration)throw Error('Missing production handler '+name)
    vm.runInContext(ts.transpileModule(declaration.getText(ast),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText,context)
  }
  return context
}
function linked(snapshot,id){return snapshot.transactions.filter(row=>ledger.linkedOffsetSourceId(row)===id)}

for(const legacy of [false,true]){
  {const {snapshot,expense,other}=fixture(legacy);ledger.deleteTransactionRecords(snapshot,expense.id);check(`delete-source-and-all-offsets-${legacy?'legacy':'explicit'}`,[other.id],snapshot.transactions.map(row=>row.id))}
  {const {snapshot,expense,offsets}=fixture(legacy);ledger.deleteTransactionRecords(snapshot,offsets[0].id);check(`delete-one-offset-keeps-source-and-other-offset-${legacy?'legacy':'explicit'}`,{source:true,offsetIds:[offsets[1].id]}, {source:snapshot.transactions.some(row=>row.id===expense.id),offsetIds:linked(snapshot,expense.id).map(row=>row.id)})}
}
{const {snapshot,offsets}=fixture();snapshot.transactions=snapshot.transactions.filter(tx=>tx.id!=='expense-a');ledger.deleteTransactionRecords(snapshot,offsets[0].id);check('delete-orphan-offset-independently',false,snapshot.transactions.some(tx=>tx.id===offsets[0].id))}
{const {snapshot,expense}=fixture();const ctx=environment(snapshot);await ctx.deleteTransaction(expense);check('actual-delete-handler-deletes-all-linked-offsets',1,snapshot.transactions.length)}
{const {snapshot,expense}=fixture();const before=plain(snapshot.transactions),ctx=environment(snapshot,true);await ctx.deleteTransaction(expense);check('delete-handler-local-save-failure-rolls-back',before,snapshot.transactions)}
{const {snapshot,expense}=fixture();const ctx=environment(snapshot);ctx.window.confirm=()=>false;await ctx.deleteTransaction(expense);check('delete-cancelled-confirmation-keeps-all-records',4,snapshot.transactions.length)}
{const {snapshot,book,expense}=fixture();const ctx=environment(snapshot);await ctx.deleteBook(book);check('delete-book-keeps-source-and-offset-records',{count:4,sourceBooks:['book-b'],offsetBooks:[['book-b'],['book-b']]},{count:snapshot.transactions.length,sourceBooks:expense.bookIds,offsetBooks:linked(snapshot,expense.id).map(row=>row.bookIds)})}
for(const legacy of [false,true]){
  const {snapshot,book,expense}=fixture(legacy),ctx=environment(snapshot);await ctx.removeTransactionFromBook(book,expense)
  check(`user-rule-remove-source-from-book-cascades-offset-memberships-${legacy?'legacy':'explicit'}`,{sourceBooks:['book-b'],offsetBooks:[['book-b'],['book-b']]},{sourceBooks:expense.bookIds,offsetBooks:linked(snapshot,expense.id).map(row=>row.bookIds)})
}
{const {snapshot,expense,offsets}=fixture();const ctx=environment(snapshot);ctx.editingTransaction.value=expense;ctx.openEntry(expense);ctx.entryDraft.value.amount='200';await ctx.saveEntry();check('editing-source-amount-keeps-existing-refund-amounts',[30,20],offsets.map(tx=>snapshot.transactions.find(row=>row.id===tx.id)?.amount))}
{const {snapshot,expense,offsets}=fixture();snapshot.transactions=snapshot.transactions.filter(row=>row.id!==offsets[1].id);const ctx=environment(snapshot);ctx.editingTransaction.value=expense;ctx.openEntry(expense);ctx.entryDraft.value.amount='200';await ctx.saveEntry();check('editing-source-with-one-offset-keeps-its-actual-refund-amount',30,linked(snapshot,expense.id)[0].amount)}
{const {snapshot,expense,offsets}=fixture();const expected=offsets.map(row=>new Date(row.happenedAt).toISOString()),ctx=environment(snapshot);ctx.editingTransaction.value=expense;ctx.openEntry(expense);await ctx.saveEntry();check('saving-source-keeps-independent-refund-dates',expected,offsets.map(tx=>new Date(snapshot.transactions.find(row=>row.id===tx.id)?.happenedAt).toISOString()))}
{const {snapshot,expense,offsets}=fixture();const ctx=environment(snapshot);ctx.editingTransaction.value=expense;ctx.openEntry(expense);Object.assign(ctx.entryDraft.value,{title:'更新标题',merchant:'更新商户',note:'更新备注'});await ctx.saveEntry();check('source-descriptive-fields-propagate-to-all-offsets',offsets.map(()=>({title:'更新标题',merchant:'更新商户',note:'更新备注'})),offsets.map(tx=>{const row=snapshot.transactions.find(row=>row.id===tx.id);return {title:row.title,merchant:row.merchant,note:row.note}}))}
{const {expense,category}=fixture();let actual;try{actual=ledger.createOffsetTransaction(expense,category,150).amount}catch(error){actual=error.message}check('native-allowed-over-100-percent-after-confirmation',150,actual)}
for(const legacy of [false,true]){
  const {snapshot,category}=fixture();const rows=ledger.createTransaction(snapshot,{title:'分期订单',amount:100,kind:'expense',happenedAt:'2026-01-01T04:00:00Z',installmentMonths:3});snapshot.transactions=rows
  const refund=ledger.createOffsetTransaction(rows[2],category,20);if(legacy){refund.source=`offset:${rows[2].id}|manual`;refund.offsetSourceTransactionId=null}snapshot.transactions.push(refund)
  const merged=ledger.cancelInstallment(snapshot,rows[1].id);ledger.deleteTransactionRecords(snapshot,merged.id);check(`cancel-installment-then-delete-removes-relinked-offset-${legacy?'legacy':'explicit'}`,0,snapshot.transactions.length)
}
{const {snapshot,category}=fixture();const rows=ledger.createTransaction(snapshot,{title:'分期订单',amount:100,kind:'expense',happenedAt:'2026-01-01T04:00:00Z',installmentMonths:3});const past=ledger.createOffsetTransaction(rows[0],category,20),future=ledger.createOffsetTransaction(rows[2],category,20);snapshot.transactions=[...rows,past,future];ledger.payOffInstallment(snapshot,rows[0].id,new Date('2026-01-15T00:00:00Z'));check('payoff-removes-only-future-period-offsets',{past:true,future:false},{past:snapshot.transactions.some(tx=>tx.id===past.id),future:snapshot.transactions.some(tx=>tx.id===future.id)})}
{const {snapshot,expense}=fixture();ledger.deleteTransactionRecords(snapshot,expense.id);const account='audit-offset-'+crypto.randomUUID();await writeLocalSnapshot(account,snapshot);check('deleted-relations-stay-deleted-after-json-and-indexeddb-roundtrip',['unrelated-same-title'],(await readLocalSnapshot(account)).transactions.map(tx=>tx.id))}

{const {snapshot,expense}=fixture(),ctx=environment(snapshot);ctx.editingTransaction.value=expense;ctx.openEntry(expense);ctx.entryDraft.value.offsetEnabled=false;await ctx.saveEntry();check('confirmed-disable-clears-all-offsets',[],linked(snapshot,expense.id))}
{const {snapshot,book,expense}=fixture(),ctx=environment(snapshot,true);const before=plain(snapshot.transactions);await ctx.removeTransactionFromBook(book,expense);check('failed-book-removal-restores-all-memberships',before,snapshot.transactions)}

const report={date:new Date().toISOString(),nativeSource:'W:/SmartLedger/client/ios/SmartLedger/Core/LedgerStore.swift; repository 84bb767',adoptedRules:'App independent incomes and multi-offset amounts; user overrides default dates to follow source and book removals to cascade all offsets. Historical pre-fix audit retained separately.',method:'Production TypeScript and extracted Vue handlers, isolated fixtures and fake-indexeddb. Expected behavior derived from Swift source plus explicit user overrides; native runtime/browser/cloud were not executed. No production logic or user records changed.',counts:{total:results.length,matches:results.filter(r=>r.status==='matches').length,differences:results.filter(r=>r.status==='differs').length},results,observations}
fs.writeFileSync(new URL('../../../docs/smartledger-offset-rules-acceptance.json',import.meta.url),JSON.stringify(report,null,2)+'\n')
console.log('COUNTS '+JSON.stringify(report.counts))

if(report.counts.differences)process.exitCode=1
