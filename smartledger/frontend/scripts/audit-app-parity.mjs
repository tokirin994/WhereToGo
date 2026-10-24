// Audit the current web implementation against rules read from the local iOS source.
// Run with Node 24: node scripts/audit-app-parity.mjs
// A difference is an audit result, not an assertion that the app has been fixed.
import 'fake-indexeddb/auto'
import fs from 'node:fs'
import vm from 'node:vm'
import assert from 'node:assert/strict'
import ts from 'typescript'
import * as ledger from '../src/ledger.ts'
import { readLocalSnapshot, writeLocalSnapshot } from '../src/storage.ts'

const source = fs.readFileSync(new URL('../src/LedgerWorkspace.vue', import.meta.url), 'utf8')
const script = source.match(/<script setup lang="ts">([\s\S]*?)<\/script>/)[1]
const ast = ts.createSourceFile('workspace.ts', script, ts.ScriptTarget.Latest, true)
const results = []
function check(id, expected, actual) {
  let matches = true
  try { assert.deepEqual(JSON.parse(JSON.stringify(actual)), JSON.parse(JSON.stringify(expected))) } catch { matches = false }
  results.push({ id, status: matches ? 'matches' : 'difference', expected, actual })
}
const ref = value => ({ value })
function fixture() {
  const snapshot = ledger.createInitialSnapshot()
  const root = snapshot.categories.find(c => c.name === '餐饮')
  const child = snapshot.categories.find(c => c.name === '午餐')
  snapshot.books = [{ ...snapshot.books[0], id: 'auto', autoCollectEnabled: true,
    startDate: '2026-10-01', endDate: '2026-10-31', autoCollectCategoryIds: [root.id] }]
  return { snapshot, root, child }
}
function handlers(snapshot, confirm = true) {
  const context = vm.createContext({ ...ledger, crypto, Date, Error, console,
    snapshot: ref(snapshot), error: ref(''), editingId: ref(null), editingBookId: ref('auto'),
    entryDraft: ref({}), bookDraft: ref({}), entryOpen: ref(true), bookOpen: ref(true),
    activeTab: ref('entry'), entryReturnTab: ref('transactions'),
    window: { confirm: () => confirm }, persist: async () => {}, notify: () => {}, syncOffset: () => {},
    savingEntry: ref(false), savingBook: ref(false), bookFormError: ref(''),
    entryExplicitBooks: ref(false), entrySplitSettings: ref({}), editingTransaction: ref(undefined),
    entryInstallmentEnabled: ref(false), entryInstallmentStartDate: ref('2026-10-22'),
    bookRuleMode: ref('categories'), bookKeepExisting: ref(true), bookCollectMatching: ref(true),
    savingCandidates: ref(new Set()), candidateExplicitBooks: ref(false), candidateSplitSettings: ref({}),
    candidateError: ref(''), selectedCandidateIds: ref([]),
  })
  for (const name of ['saveEntry', 'createOrUpdateBook', 'saveCandidate']) {
    const declaration = ast.statements.find(n => ts.isFunctionDeclaration(n) && n.name.text === name)
    vm.runInContext(ts.transpileModule(declaration.getText(ast), {
      compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
    }).outputText, context)
  }
  context.entryDraft.value = { title: '午餐', amount: '100', kind: 'expense', happenedAt: '2026-10-22T12:00',
    categoryId: snapshot.categories.find(c => c.name === '午餐').id, bookIds: [], paymentMethod: '',
    merchant: '', note: '', installmentMonths: '1', originalAmount: '', discountAmount: '', premiumAmount: '',
    payer: '我', splitParticipantIds: [], splitMode: 'equal', splitRatio: '50', splitAmount: '', offsetEnabled: false }
  const book = snapshot.books[0]
  context.bookDraft.value = { ...book, participants: '', budgetLimitAmount: '' }
  return context
}

{
  const { snapshot, child } = fixture()
  check('collect-category-descendant', ['auto'], ledger.assignAutoBooks(snapshot, {
    happenedAt: '2026-10-22T04:00:00Z', categoryId: child.id }))
  check('collect-outside-date-range', [], ledger.assignAutoBooks(snapshot, {
    happenedAt: '2026-11-02T04:00:00Z', categoryId: child.id }))
  snapshot.books[0].startDate = snapshot.books[0].endDate = null
  check('collect-requires-date-bound', [], ledger.assignAutoBooks(snapshot, {
    happenedAt: '2026-10-22T04:00:00Z', categoryId: child.id }))
}
{
  const { snapshot, child } = fixture()
  snapshot.books[0].startDate = '2026-10-22'
  check('collect-local-midnight-hong-kong', ['auto'], ledger.assignAutoBooks(snapshot, {
    happenedAt: '2026-10-21T16:30:00Z', categoryId: child.id }))
  snapshot.books[0].autoCollectCategoryIds = ['-1']
  check('collect-all-expenses-token', ['auto'], ledger.assignAutoBooks(snapshot, {
    happenedAt: '2026-10-22T04:00:00Z', categoryId: child.id, kind: 'expense' }))
  snapshot.books[0].autoCollectCategoryIds = ['-2']
  check('collect-all-income-token', ['auto'], ledger.assignAutoBooks(snapshot, {
    happenedAt: '2026-10-22T04:00:00Z', categoryId: snapshot.categories.find(c => c.flowType === 'income').id, kind: 'income' }))
}
{
  const { snapshot } = fixture()
  // openEntry starts with no book when category-restricted collection cannot match categoryId=null.
  const context = handlers(snapshot)
  await context.saveEntry()
  assert.equal(context.error.value, '')
  check('manual-default-prompt-select-category-then-save', ['auto'], snapshot.transactions[0].bookIds)
}
{
  const { snapshot } = fixture()
  snapshot.settings.bookAssignmentPromptEnabled = false
  snapshot.books.push({ ...snapshot.books[0], id: 'manual', autoCollectEnabled: false })
  const context = handlers(snapshot)
  context.entryDraft.value.bookIds = ['manual']
  await context.saveEntry()
  assert.equal(context.error.value, '')
  check('manual-prompt-off-append-auto-to-selected-book', ['auto', 'manual'], [...snapshot.transactions[0].bookIds].sort())
}
{
  const { snapshot } = fixture()
  snapshot.books[0].autoCollectEnabled = false
  const context = handlers(snapshot, false)
  context.bookDraft.value.autoCollectEnabled = true
  context.bookCollectMatching.value = false
  await context.createOrUpdateBook()
  check('decline-history-backfill-keeps-future-collection', true, snapshot.books[0].autoCollectEnabled)
}
{
  const { snapshot, child } = fixture()
  snapshot.transactions = ledger.createTransaction(snapshot, { title: '午餐', amount: 10, kind: 'expense',
    happenedAt: '2026-10-22T04:00:00Z', categoryId: child.id, bookIds: [] })
  const context = handlers(snapshot)
  context.bookDraft.value.endDate = '2026-10-25'
  await context.createOrUpdateBook()
  check('changed-enabled-rules-can-collect-history', ['auto'], snapshot.transactions[0].bookIds)
}
{
  const { snapshot } = fixture()
  const rows = ledger.createTransaction(snapshot, { title: '电脑', amount: 100, kind: 'expense',
    happenedAt: '2026-01-31T04:00:00Z', installmentMonths: 3, bookIds: [] })
  check('installment-native-rounding-last-adjusts', [33.33, 33.33, 33.34], rows.map(r => Number(r.amount.toFixed(2))))
  check('installment-total-and-metadata', { cents: 10000, indices: [1, 2, 3], groupCount: 1, total: 100 }, {
    cents: rows.reduce((sum, r) => sum + Math.round(r.amount * 100), 0),
    indices: rows.map(r => r.installmentIndex), groupCount: new Set(rows.map(r => r.installmentGroupId)).size,
    total: rows[0].installmentOriginalTotal })
  check('installment-month-end-clamp', [31, 28, 31], rows.map(r => new Date(r.happenedAt).getUTCDate()))
  const delayed = ledger.createTransaction(snapshot, { title: '电脑', amount: 100, kind: 'expense',
    happenedAt: '2026-01-31T04:00:00Z', installmentMonths: 3, installmentStartMonth: '2026-03-01T04:00:00Z' })
  check('installment-independent-start-month', '2026-03-01', delayed[0].happenedAt.slice(0, 10))
  const incomeCategory = snapshot.categories.find(c => c.flowType === 'income')
  check('installment-reimbursement-50pct-of-total', 50, ledger.createOffsetTransaction(rows[0], incomeCategory, 50).amount)
  check('editing-installment-keeps-original-reimbursement-ratio', 50, ledger.linkedOffsetRatio(rows[0],ledger.createOffsetTransaction(rows[0],incomeCategory,50)))
  snapshot.transactions = rows
  const accountKey = `parity-audit-${crypto.randomUUID()}`
  await writeLocalSnapshot(accountKey, snapshot)
  const restored = await readLocalSnapshot(accountKey)
  check('indexeddb-installment-and-book-rules-roundtrip', snapshot, restored)
  // Summarize this large comparison in the report after asserting equality.
  const storageResult = results.at(-1)
  storageResult.expected = 'all snapshot fields preserved'
  storageResult.actual = storageResult.status === 'matches' ? 'all snapshot fields preserved' : 'snapshot differs'
}

{
  const { snapshot } = fixture()
  const context = handlers(snapshot)
  context.persist = async () => { throw new Error('simulated storage failure') }
  await context.saveEntry()
  check('failed-manual-local-write-does-not-leave-duplicate-rows', {count:0,error:'simulated storage failure',busy:false}, {count:snapshot.transactions.length,error:context.error.value,busy:context.savingEntry.value})
}
{
  const { snapshot } = fixture()
  snapshot.books[0].autoCollectEnabled=false
  const context=handlers(snapshot)
  context.bookDraft.value.autoCollectEnabled=true
  context.persist=async()=>{throw new Error('simulated storage failure')}
  await context.createOrUpdateBook()
  check('failed-book-local-write-rolls-back-rule-changes', {enabled:false,error:'simulated storage failure',busy:false},{enabled:snapshot.books[0].autoCollectEnabled,error:context.bookFormError.value,busy:context.savingBook.value})
}
{
  const { snapshot, child } = fixture()
  snapshot.transactions = ledger.createTransaction(snapshot, { title: '电脑', amount: 100, kind: 'expense',
    happenedAt: '2026-10-22T04:00:00Z', categoryId: child.id })
  const context = handlers(snapshot)
  context.editingId.value = snapshot.transactions[0].id
  context.entryInstallmentEnabled.value = true
  context.entryDraft.value.installmentMonths = '3'
  await context.saveEntry()
  assert.equal(context.error.value, '')
  check('edit-existing-transaction-converts-to-installments', 3, snapshot.transactions.length)
}

{
  const { snapshot } = fixture()
  snapshot.books = [
    { ...snapshot.books[0], id: 'wide', startDate: '2026-01-01', endDate: '2026-12-31', createdOrder: 1 },
    { ...snapshot.books[0], id: 'narrow-old', startDate: '2026-10-20', endDate: '2026-10-25', createdOrder: 2 },
    { ...snapshot.books[0], id: 'narrow-new', startDate: '2026-10-20', endDate: '2026-10-25', createdOrder: 3 },
    { ...snapshot.books[0], id: 'manual-only', autoCollectEnabled: false, createdOrder: 4 },
    { ...snapshot.books[0], id: 'no-range', startDate: null, endDate: null },
  ]
  check('recommend-date-span-auto-priority-and-creation-order', ['narrow-new','narrow-old','wide','manual-only'], ledger.recommendedBooks(snapshot,'2026-10-22T04:00:00Z').map(book=>book.id))
  check('recommendation-not-restricted-by-collection-category', 4, ledger.recommendedBooks(snapshot,'2026-10-22T04:00:00Z').length)
}
{
  const { snapshot, child } = fixture()
  snapshot.books.push({ ...snapshot.books[0], id: 'other', autoCollectEnabled: false })
  snapshot.transactions = ledger.createTransaction(snapshot,{title:'午餐',amount:10,kind:'expense',happenedAt:'2026-10-22T04:00:00Z',categoryId:child.id,bookIds:['auto','other']})
  snapshot.books[0].endDate = '2026-10-20'
  const change = ledger.applyAutoCollectRules(snapshot,snapshot.books[0],{keepExisting:false,collectMatching:true})
  check('reapply-rules-removes-only-target-book-link', {removed:1,added:0,books:['other']}, {...change,books:snapshot.transactions[0].bookIds})
}
{
  const { snapshot } = fixture()
  const rows = ledger.createTransaction(snapshot,{title:'电脑',amount:100,kind:'expense',happenedAt:'2026-01-01T04:00:00Z',installmentMonths:3,bookIds:[]})
  snapshot.transactions = rows
  const income = snapshot.categories.find(category=>category.flowType==='income')
  const offset = ledger.createOffsetTransaction(rows[2],income,10)
  snapshot.transactions.push(offset)
  const merged = ledger.cancelInstallment(snapshot,rows[1].id)
  check('cancel-installments-merges-and-relinks-offset', {count:2,amount:100,group:null,title:'电脑',source:rows[0].id}, {count:snapshot.transactions.length,amount:merged.amount,group:merged.installmentGroupId,title:merged.title,source:offset.offsetSourceTransactionId})
}
{
  const { snapshot } = fixture()
  const rows = ledger.createTransaction(snapshot,{title:'电脑',amount:100,kind:'expense',happenedAt:'2026-01-01T04:00:00Z',installmentMonths:3,bookIds:[]})
  snapshot.transactions = rows
  const payoff = ledger.payOffInstallment(snapshot,rows[0].id,new Date('2026-01-15T04:00:00Z'))
  check('payoff-sums-future-and-removes-future-rows', {amount:66.67,count:2,pastKept:true,futureRemoved:true}, {amount:payoff.amount,count:snapshot.transactions.length,pastKept:snapshot.transactions.some(tx=>tx.id===rows[0].id),futureRemoved:!snapshot.transactions.some(tx=>tx.id===rows[1].id||tx.id===rows[2].id)})
  let message=''
  try { ledger.payOffInstallment(snapshot,rows[0].id,new Date('2026-01-15T04:00:00Z')) } catch(error) { message=error.message }
  check('payoff-repeated-action-is-rejected', '这笔分期已经立即还清', message)
}
{
  const { snapshot } = fixture()
  const rows = ledger.createTransaction(snapshot,{title:'电脑',amount:100,kind:'expense',happenedAt:'2026-01-01T04:00:00Z',installmentMonths:3,bookIds:[]})
  snapshot.transactions = rows
  ledger.updateTransaction(snapshot,rows[1].id,{...rows[1],title:'修改本期',amount:30,installmentMonths:5})
  check('editing-one-installment-does-not-resplit', {count:3,months:3,index:2,group:rows[0].installmentGroupId}, {count:snapshot.transactions.length,months:snapshot.transactions.find(tx=>tx.id===rows[1].id).installmentMonths,index:snapshot.transactions.find(tx=>tx.id===rows[1].id).installmentIndex,group:snapshot.transactions.find(tx=>tx.id===rows[1].id).installmentGroupId})
}
{
  const { snapshot } = fixture()
  snapshot.books[0].participants=[{id:'我',name:'我'},{id:'小明',name:'小明'}]
  snapshot.books.push({...snapshot.books[0],id:'second'})
  const settings={auto:{paidByParticipantId:'我',splitParticipantIds:['我','小明'],splitMode:'ratio',splitRatio:30,splitAmount:null},second:{paidByParticipantId:'小明',splitParticipantIds:['我','小明'],splitMode:'fixed',splitRatio:null,splitAmount:45}}
  const [row]=ledger.createTransaction(snapshot,{title:'合餐',amount:100,kind:'expense',happenedAt:'2026-10-22T04:00:00Z',bookIds:['auto','second'],ledgerSplitSettings:settings})
  check('independent-splits-for-each-linked-ledger', [30,45], [ledger.transactionShareAmount(row,'auto'),ledger.transactionShareAmount(row,'second')])
  snapshot.transactions=[row]
  const key=`parity-split-${crypto.randomUUID()}`
  await writeLocalSnapshot(key,snapshot)
  const restored=await readLocalSnapshot(key)
  check('per-ledger-splits-persist-through-local-storage', settings,restored.transactions[0].ledgerSplitSettings)
}
{
  const { snapshot, child } = fixture()
  const context = handlers(snapshot)
  context.selectedBook = ref(null)
  context.candidateDraft = ref(null)
  context.candidates = ref([{ id: 'candidate' }])
  context.closeCandidateEditor = () => {}
  await context.saveCandidate({ id: 'candidate', title: '午餐', amount: 10, kind: 'expense',
    happenedAt: '2026-10-22T04:00:00Z', categoryId: child.id, bookIds: [] })
  assert.equal(context.error.value, '')
  check('ocr-explicit-no-book-stays-unassigned', [], snapshot.transactions[0].bookIds)
}

const report = {
  date: '2026-10-24', timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  method: 'Execute current TypeScript core and extracted Vue handlers with isolated in-memory fixtures; native expectations from local Swift source. IndexedDB uses fake-indexeddb. No browser or real cloud login.',
  counts: { total: results.length, matches: results.filter(r => r.status === 'matches').length,
    differences: results.filter(r => r.status === 'difference').length }, results,
}
fs.writeFileSync(new URL('../../../docs/smartledger-parity-audit-results.json', import.meta.url), JSON.stringify(report, null, 2) + '\n')
console.log(JSON.stringify({ ...report, results: results.map(({ id, status, expected, actual }) => ({ id, status, expected, actual })) }, null, 2))
if (report.counts.differences) process.exitCode = 1
