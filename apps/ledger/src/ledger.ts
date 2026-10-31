export type FlowType = 'expense' | 'income'
export type BookType = 'general' | 'custom' | 'trip'

export interface Category {
  id: string; name: string; flowType: FlowType; icon: string; color: string
  parentId: string | null; sortOrder: number
}
export {categoryIconText as categoryIcon} from './categoryIcons'
export interface Participant { id: string; name: string }
export interface Book {
  id: string; name: string; type: BookType; icon: string; color: string; note: string
  startDate: string | null; endDate: string | null; isPinned: boolean
  autoCollectEnabled: boolean; autoCollectCategoryIds: string[]
  budgetLimitAmount: number | null; budgetStartDate: string | null; budgetEndDate: string | null
  participants: Participant[]; externalTripId?: string; destination?: string
  createdOrder?: number
}
export interface LedgerSplitSettings {
  paidByParticipantId: string | null; splitParticipantIds: string[]
  splitMode: 'equal' | 'ratio' | 'fixed'; splitRatio: number | null; splitAmount: number | null
  includeInStatistics?: boolean; splitEnabled?: boolean; splitParticipantNames?: string[]
  participantSnapshot?: Array<{id:string;name:string}>
  splitRatioUnit?: 'percent'
}
export interface Transaction {
  id: string; title: string; amount: number; kind: FlowType; happenedAt: string; note: string
  merchant: string; paymentMethod: string; source: string; currency: string; categoryId: string | null
  bookIds: string[]; installmentGroupId: string | null; installmentIndex: number | null; installmentMonths: number | null
  installmentOriginalTotal: number | null; originalAmount: number | null; discountAmount: number | null; premiumAmount: number | null
  paidByParticipantId: string | null; splitParticipantIds: string[]; includeInStatistics: boolean
  splitMode?: 'equal' | 'ratio' | 'fixed'; splitRatio?: number | null; splitAmount?: number | null
  offsetSourceTransactionId?: string | null
  offsetDateMode?: 'source' | 'independent'
  installmentStartMonth?: string | null
  ledgerSplitSettings?: Record<string, LedgerSplitSettings>
  splitParticipantNames?: string[]
}
export type TransactionDraft = Partial<Transaction> & Pick<Transaction, 'title' | 'amount' | 'kind' | 'happenedAt'> & {
  hasExplicitBookSelection?: boolean
}
export type OffsetDateMode = 'source' | 'independent'
export interface OffsetEdit {id:string;amount:number;categoryId:string|null;happenedAt:string;dateMode:OffsetDateMode}
export interface OffsetDraft {id:string;categoryId:string|null;ratio:number;happenedAt:string;dateMode:OffsetDateMode}
export interface OffsetPlan {existingAmount:number;newAmount:number;totalAmount:number;ratio:number;overLimit:boolean;additions:Array<{draft:OffsetDraft;amount:number}>}
export interface Budget {
  id: string; name: string; limitAmount: number; periodType: 'monthly' | 'range'; year: number; month: number | null
  startDate: string | null; endDate: string | null; categoryIds: string[]; bookId: string | null
}
export interface PinnedRange { id: string; name: string; startDate: string; endDate: string }
export interface LedgerSettings {
  appearanceMode: 'system' | 'light' | 'dark'; backgroundDataUrl: string | null
  paymentChannels: string[]; bookAssignmentPromptEnabled: boolean; cloudSyncEnabled: boolean
  cloudSyncSchedule: 'on_change' | 'periodic' | 'on_app_open'; midnightSyncEnabled: boolean
}
export interface LedgerSnapshot {
  schemaVersion: number; updatedAt: string; categories: Category[]; books: Book[]; transactions: Transaction[]
  budgets: Budget[]; pinnedRanges: PinnedRange[]; settings: LedgerSettings
}

const roots: Array<[string, FlowType, string, string, string[]]> = [
  ['餐饮', 'expense', 'fork-knife', '#ef6c5b', ['早餐','午餐','晚餐','夜宵','外卖','咖啡茶饮','零食水果','聚餐','买菜食材','烘焙甜品','工作餐']],
  ['交通出行', 'expense', 'car', '#4f8ef7', ['公交地铁','打车','网约车','共享单车','加油','停车费','机票','火车票','租车']],
  ['居住', 'expense', 'house', '#68b984', ['房租','水费','电费','燃气','物业','宽带','家居用品','装修']],
  ['购物', 'expense', 'bag', '#f5a623', ['日用百货','生鲜食品','服饰鞋包','数码电器','美妆护肤','母婴用品','礼品']],
  ['医疗健康', 'expense', 'heart', '#e85d75', ['门诊','药品','体检','牙科','运动健身']],
  ['教育学习', 'expense', 'book', '#8167d9', ['书籍','课程','培训','软件订阅']],
  ['休闲娱乐', 'expense', 'game', '#c16ce6', ['电影演出','游戏','旅行','酒店住宿','运动健身']],
  ['人情往来', 'expense', 'gift', '#e977a6', ['红包','礼金','请客送礼','礼物']],
  ['金融支出', 'expense', 'credit-card', '#607d8b', ['信用卡还款','贷款还款','手续费','转账']],
  ['其他支出', 'expense', 'more', '#8b95a1', ['罚款','订阅服务','未分类']],
  ['工资收入', 'income', 'wallet', '#3aae6d', ['基本工资','奖金','补贴','报销','退款入账']],
  ['经营收入', 'income', 'store', '#27a8a1', ['销售','服务收入','佣金','稿费']],
  ['投资收入', 'income', 'chart', '#4f8ef7', ['理财收益','股息','基金收益']],
  ['其他收入', 'income', 'plus', '#7e8b9a', ['退款','礼金红包','二手出售','兼职']],
]

export const defaultCategories = (): Category[] => {
  const categories: Category[] = []
  for (const [root, flowType, icon, color, children] of roots) {
    const parentId = crypto.randomUUID()
    categories.push({ id: parentId, name: root, flowType, icon, color, parentId: null, sortOrder: categories.length })
    children.forEach((name, index) => categories.push({ id: crypto.randomUUID(), name, flowType, icon: name === '未分类' ? 'grid' : icon, color, parentId, sortOrder: index }))
  }
  return categories
}

export const defaultSettings = (): LedgerSettings => ({
  appearanceMode: 'system', backgroundDataUrl: null,
  paymentChannels: ['微信', '支付宝', '银行卡', '现金'], bookAssignmentPromptEnabled: true,
  cloudSyncEnabled: false, cloudSyncSchedule: 'on_app_open', midnightSyncEnabled: false,
})

export function createInitialSnapshot(now = new Date()): LedgerSnapshot {
  return {
    schemaVersion: 4, updatedAt: now.toISOString(), categories: defaultCategories(),
    books: [{ id: crypto.randomUUID(), name: '日常账本', type: 'general', icon: 'book', color: '#5b8def', note: '', startDate: null, endDate: null, isPinned: true, autoCollectEnabled: false, autoCollectCategoryIds: [], budgetLimitAmount: null, budgetStartDate: null, budgetEndDate: null, participants: [] }],
    transactions: [], budgets: [], pinnedRanges: [], settings: defaultSettings(),
  }
}

export function normalizeSnapshot(value: Partial<LedgerSnapshot> | null | undefined): LedgerSnapshot {
  const seed = createInitialSnapshot()
  if (!value) return seed
  return {
    ...seed, ...value,
    schemaVersion: 4,
    categories: Array.isArray(value.categories) ? value.categories : seed.categories,
    books: Array.isArray(value.books) ? value.books.map((book, index) => ({ ...book, createdOrder: book.createdOrder ?? index, autoCollectCategoryIds: (book.autoCollectCategoryIds || []).map(String) })) : seed.books,
    transactions: Array.isArray(value.transactions) ? value.transactions.map(tx => ({ ...tx, installmentStartMonth: tx.installmentStartMonth ?? null, ledgerSplitSettings: tx.ledgerSplitSettings ?? {} })) : [],
    budgets: Array.isArray(value.budgets) ? value.budgets : [],
    pinnedRanges: Array.isArray(value.pinnedRanges) ? value.pinnedRanges : [],
    settings: { ...seed.settings, ...(value.settings || {}) },
  }
}

export const flattenCategories = (items: Category[]) => {
  const result: Category[] = []
  const visit = (parentId: string | null) => {
    items.filter(item => item.parentId === parentId).sort((a, b) => a.sortOrder - b.sortOrder).forEach(item => { result.push(item); visit(item.id) })
  }
  visit(null)
  return result
}

export function categoryPath(categories: Category[], id: string | null): Category[] {
  const map = new Map(categories.map(item => [item.id, item]))
  const path: Category[] = []
  const seen = new Set<string>()
  let current = id ? map.get(id) : undefined
  while (current&&!seen.has(current.id)) { seen.add(current.id);path.unshift(current); current = current.parentId ? map.get(current.parentId) : undefined }
  return path
}

export function isCategoryWithin(categories: Category[], candidateId: string | null, selectedId: string): boolean {
  return categoryPath(categories, candidateId).some(item => item.id === selectedId)
}

export function localDay(value: string | Date): string {
  const date = value instanceof Date ? value : new Date(value)
  if (!Number.isFinite(date.getTime())) return ''
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

export function matchesBookDateRange(book: Book, happenedAt: string): boolean {
  const day = localDay(happenedAt)
  return Boolean(day && (book.startDate || book.endDate) && (!book.startDate || day >= book.startDate.slice(0, 10)) && (!book.endDate || day <= book.endDate.slice(0, 10)))
}

export function recommendedBooks(snapshot: LedgerSnapshot, happenedAt: string): Book[] {
  const span = (book: Book) => (book.endDate ? new Date(book.endDate).getTime() : 8640000000000000) - (book.startDate ? new Date(book.startDate).getTime() : -8640000000000000)
  const order = (book: Book) => book.createdOrder ?? (/^\d+$/.test(book.id) ? Number(book.id) : snapshot.books.indexOf(book))
  return snapshot.books.filter(book => matchesBookDateRange(book, happenedAt)).sort((a, b) => Number(b.autoCollectEnabled) - Number(a.autoCollectEnabled) || span(a) - span(b) || order(b) - order(a))
}

type CollectionInput = Pick<Transaction, 'happenedAt' | 'categoryId'> & Partial<Pick<Transaction, 'kind'>>
export function shouldAutoCollect(snapshot: LedgerSnapshot, book: Book, transaction: CollectionInput): boolean {
  if (!book.autoCollectEnabled || !matchesBookDateRange(book, transaction.happenedAt)) return false
  const rules = (book.autoCollectCategoryIds || []).map(String)
  return !rules.length || (rules.includes('-1') && transaction.kind === 'expense') || (rules.includes('-2') && transaction.kind === 'income') || rules.some(id => isCategoryWithin(snapshot.categories, transaction.categoryId, id))
}

export function assignAutoBooks(snapshot: LedgerSnapshot, transaction: CollectionInput): string[] {
  return recommendedBooks(snapshot, transaction.happenedAt).filter(book => shouldAutoCollect(snapshot, book, transaction)).map(book => book.id)
}

export function resolveTransactionBookIds(snapshot: LedgerSnapshot, draft: TransactionDraft): string[] {
  const selected = [...new Set(draft.bookIds || [])].filter(id => snapshot.books.some(book => book.id === id))
  // Legacy callers passing [] mean "no ledger"; new editors pass an explicit selection flag.
  if (draft.hasExplicitBookSelection === true && !selected.length) return []
  if (draft.hasExplicitBookSelection === undefined && draft.bookIds !== undefined) return selected
  if (snapshot.settings.bookAssignmentPromptEnabled && (draft.hasExplicitBookSelection || selected.length)) return selected
  return [...new Set([...selected, ...assignAutoBooks(snapshot, { ...draft, categoryId: draft.categoryId ?? null })])]
}

function resolveSplitSettings(snapshot: LedgerSnapshot, bookIds: string[], draft: TransactionDraft): Record<string, LedgerSplitSettings> {
  const result: Record<string, LedgerSplitSettings> = {}
  for (const id of bookIds) {
    const book = snapshot.books.find(item => item.id === id)!
    const supplied = draft.ledgerSplitSettings?.[id]
    if (!book.participants.length && !supplied) continue
    const own = book.participants.find(person => person.name === '我') || book.participants[0]
    const value: LedgerSplitSettings = supplied || {
      paidByParticipantId: draft.paidByParticipantId || own?.id || null,
      splitParticipantIds: draft.splitParticipantIds?.length ? [...draft.splitParticipantIds] : own ? [own.id] : [],
      splitMode: draft.splitMode || 'equal', splitRatio: draft.splitRatio ?? null, splitAmount: draft.splitAmount ?? null,
    }
    const members = new Set(book.participants.map(person => person.id))
    if (value.splitEnabled!==false&&book.participants.length > 1 && (!value.paidByParticipantId || !members.has(value.paidByParticipantId) || !value.splitParticipantIds.length || value.splitParticipantIds.some(person => !members.has(person)))) throw new Error(`请为“${book.name}”选择有效付款人和分账成员`)
    if (value.splitEnabled!==false&&value.splitMode === 'ratio' && (!Number.isFinite(value.splitRatio) || value.splitRatio! < 0 || value.splitRatio! > 100)) throw new Error(`“${book.name}”的本人比例应为 0 至 100`)
    if (value.splitEnabled!==false&&value.splitMode === 'fixed' && (!Number.isFinite(value.splitAmount) || value.splitAmount! < 0 || value.splitAmount! > draft.amount)) throw new Error(`“${book.name}”的本人金额不能超过流水金额`)
    result[id] = { ...value, splitParticipantIds: [...value.splitParticipantIds], splitParticipantNames:value.splitParticipantIds.map(person=>book.participants.find(member=>member.id===person)?.name||person) }
  }
  return result
}

export function applyAutoCollectRules(snapshot: LedgerSnapshot, book: Book, options: { keepExisting: boolean; collectMatching: boolean }): { added: number; removed: number } {
  let added = 0, removed = 0
  for (const tx of snapshot.transactions) {
    const matches = shouldAutoCollect(snapshot, book, tx)
    if (!matches && !options.keepExisting && tx.bookIds.includes(book.id)) {
      tx.bookIds = tx.bookIds.filter(id => id !== book.id)
      if (tx.ledgerSplitSettings) delete tx.ledgerSplitSettings[book.id]
      removed++
    }
    if (matches && options.collectMatching && !tx.bookIds.includes(book.id)) {
      tx.bookIds.push(book.id)
      if (book.participants.length && !tx.splitParticipantIds.length) {
        const own = book.participants.find(person => person.name === '我') || book.participants[0]
        tx.ledgerSplitSettings = { ...tx.ledgerSplitSettings, [book.id]: { paidByParticipantId: own.id, splitParticipantIds: [own.id], splitMode: 'equal', splitRatio: null, splitAmount: null } }
      }
      added++
    }
  }
  return { added, removed }
}

export function createTransaction(snapshot: LedgerSnapshot, draft: TransactionDraft): Transaction[] {
  if (!draft.title.trim() || !Number.isFinite(draft.amount) || draft.amount <= 0) throw new Error('请输入名称和大于 0 的金额')
  if (!Number.isFinite(new Date(draft.happenedAt).getTime())) throw new Error('请填写有效的流水日期')
  const category = snapshot.categories.find(item => item.id === draft.categoryId)
  if (draft.categoryId && category?.flowType !== draft.kind) throw new Error('分类收支类型与流水不一致')
  const bookIds = resolveTransactionBookIds(snapshot, draft)
  const ledgerSplitSettings = resolveSplitSettings(snapshot, bookIds, draft)
  const primarySplit = ledgerSplitSettings[bookIds[0]]
  const months = draft.installmentMonths ?? 1
  const maxMonths = draft.source === 'ocr' ? 24 : 36
  if (!Number.isInteger(months) || months < 1 || months > maxMonths) throw new Error(`分期月数必须是 1 至 ${maxMonths} 的整数`)
  const group = months > 1 ? crypto.randomUUID() : null
  const cents = Math.round(draft.amount * 100)
  const eachCents = Math.round(cents / months)
  if (months > 1 && cents < months) throw new Error('分期金额过小，请减少期数，确保每期至少 0.01 元')
  const lastCents = cents - eachCents * (months - 1)
  if (months > 1 && lastCents <= 0) throw new Error('该金额无法按所选期数分摊，请减少期数')
  const baseDate = months > 1 ? draft.installmentStartMonth || draft.happenedAt : draft.happenedAt
  if (!Number.isFinite(new Date(baseDate).getTime())) throw new Error('请填写有效的分期起始日期')
  return Array.from({ length: months }, (_, index) => ({
    id: crypto.randomUUID(), title: months > 1 ? `${draft.title}（分期 ${index + 1}/${months}）` : draft.title.trim(),
    amount: months > 1 ? (index === months - 1 ? lastCents : eachCents) / 100 : cents / 100,
    kind: draft.kind, happenedAt: months > 1 ? shiftMonth(baseDate, index) : draft.happenedAt,
    note: draft.note || '', merchant: draft.merchant || '', paymentMethod: draft.paymentMethod || '',
    source: draft.source || 'manual', currency: draft.currency || 'CNY', categoryId: draft.categoryId || null,
    bookIds: [...bookIds], installmentGroupId: group, installmentIndex: months > 1 ? index + 1 : null,
    installmentMonths: months > 1 ? months : null, installmentOriginalTotal: months > 1 ? draft.amount : null,
    originalAmount: draft.originalAmount ?? null, discountAmount: draft.discountAmount ?? null, premiumAmount: draft.premiumAmount ?? null,
    paidByParticipantId: primarySplit?.paidByParticipantId ?? draft.paidByParticipantId ?? null, splitParticipantIds: [...(primarySplit?.splitParticipantIds ?? draft.splitParticipantIds ?? [])],
    splitParticipantNames: [...(primarySplit?.splitParticipantNames ?? draft.splitParticipantNames ?? [])],
    includeInStatistics: draft.includeInStatistics ?? true, splitMode: primarySplit?.splitMode ?? draft.splitMode ?? 'equal', splitRatio: primarySplit?.splitRatio ?? draft.splitRatio ?? null, splitAmount: primarySplit?.splitAmount ?? draft.splitAmount ?? null,
    offsetSourceTransactionId: draft.offsetSourceTransactionId ?? null,
    ...(draft.offsetDateMode?{offsetDateMode:draft.offsetDateMode}:{}),
    installmentStartMonth: months > 1 ? baseDate : null,
    ledgerSplitSettings: structuredClone(ledgerSplitSettings),
  }))
}

export function updateTransaction(snapshot: LedgerSnapshot, id: string, draft: TransactionDraft): Transaction[] {
  const existing = snapshot.transactions.find(tx => tx.id === id)
  if (!existing) throw new Error('未找到要修改的流水')
  const converting = !existing.installmentGroupId && (draft.installmentMonths || 1) > 1
  const rows = createTransaction(snapshot, { ...existing, ...draft, installmentMonths: converting ? draft.installmentMonths : 1 })
  rows[0].id = existing.id
  if (existing.installmentGroupId) Object.assign(rows[0], {
    installmentGroupId: existing.installmentGroupId, installmentIndex: existing.installmentIndex,
    installmentMonths: existing.installmentMonths, installmentOriginalTotal: existing.installmentOriginalTotal,
    installmentStartMonth: existing.installmentStartMonth,
  })
  if(linkedOffsetSourceId(existing)&&!draft.offsetDateMode&&new Date(existing.happenedAt).getTime()!==new Date(rows[0].happenedAt).getTime())rows[0].offsetDateMode='independent'
  snapshot.transactions = snapshot.transactions.filter(tx => tx.id !== id).concat(rows).sort((a, b) => b.happenedAt.localeCompare(a.happenedAt))
  synchronizeLinkedOffsets(snapshot,existing,rows[0])
  return rows
}

/** Original iOS snapshots may encode the relation only in source: offset:<id>|<original>. */
export function linkedOffsetSourceId(tx: Pick<Transaction,'source'|'offsetSourceTransactionId'>):string|null {
  if(tx.offsetSourceTransactionId)return String(tx.offsetSourceTransactionId)
  if(!tx.source?.startsWith('offset:'))return null
  return tx.source.slice(7).split('|',1)[0]?.trim()||null
}
export function deleteTransactionRecords(snapshot:LedgerSnapshot,transactionId:string){
  if(!snapshot.transactions.some(tx=>tx.id===transactionId))throw new Error('未找到要删除的流水')
  // Like the native app, deleting a period removes that period and its generated offsets only.
  snapshot.transactions=snapshot.transactions.filter(tx=>tx.id!==transactionId&&linkedOffsetSourceId(tx)!==transactionId)
}
const installmentBaseTitle = (title: string) => title.replace(/\s*[（(]分期\s*\d+\s*\/\s*\d+[）)]\s*$/, '').trim()
export function cancelInstallment(snapshot: LedgerSnapshot, transactionId: string): Transaction {
  const current = snapshot.transactions.find(tx => tx.id === transactionId)
  if (!current?.installmentGroupId) throw new Error('这笔流水不是分期流水')
  const group = snapshot.transactions.filter(tx => tx.installmentGroupId === current.installmentGroupId).sort((a, b) => (a.installmentIndex || 0) - (b.installmentIndex || 0))
  if (group.length < 2) throw new Error('未找到可合并的分期记录')
  const ids = new Set(group.map(tx => tx.id))
  const merged: Transaction = { ...group[0], title: installmentBaseTitle(group[0].title), amount: group.reduce((sum, tx) => sum + Math.round(tx.amount * 100), 0) / 100,
    happenedAt: group.map(tx => tx.happenedAt).sort()[0], installmentGroupId: null, installmentIndex: null, installmentMonths: null, installmentOriginalTotal: null, installmentStartMonth: null }
  const remaining = snapshot.transactions.filter(tx => !ids.has(tx.id))
  for (const tx of remaining) {
    const sourceId=linkedOffsetSourceId(tx)
    if(sourceId&&ids.has(sourceId)&&sourceId!==merged.id){
      const previous=group.find(row=>row.id===sourceId)!
      tx.offsetDateMode=offsetDateMode(tx,previous)
      if(tx.offsetDateMode==='source')tx.happenedAt=merged.happenedAt
      tx.offsetSourceTransactionId=merged.id
      // Native offsetSourceMarker preserves the previous source after the separator.
      tx.source=`offset:${merged.id}|${tx.source}`
    }
  }
  snapshot.transactions = [...remaining, merged].sort((a, b) => b.happenedAt.localeCompare(a.happenedAt))
  return merged
}

export function payOffInstallment(snapshot: LedgerSnapshot, transactionId: string, now = new Date()): Transaction {
  const current = snapshot.transactions.find(tx => tx.id === transactionId)
  if (!current?.installmentGroupId) throw new Error('这笔流水不是分期流水')
  const marker = `installment_payoff:${current.installmentGroupId}`
  if (snapshot.transactions.some(tx => tx.source === marker)) throw new Error('这笔分期已经立即还清')
  const future = snapshot.transactions.filter(tx => tx.installmentGroupId === current.installmentGroupId && new Date(tx.happenedAt) > now)
  const cents = future.reduce((sum, tx) => sum + Math.round(tx.amount * 100), 0)
  if (cents <= 0) throw new Error('没有尚未到期的分期可立即还清')
  const ids = new Set(future.map(tx => tx.id))
  const payoff: Transaction = { ...current, id: crypto.randomUUID(), title: `${installmentBaseTitle(current.title)}（立即还清）`, amount: cents / 100,
    happenedAt: now.toISOString(), source: marker, note: [current.note, '分期立即还清'].filter(Boolean).join(' · '),
    installmentGroupId: null, installmentIndex: null, installmentMonths: null, installmentOriginalTotal: null, installmentStartMonth: null, offsetSourceTransactionId: null }
  snapshot.transactions = [...snapshot.transactions.filter(tx => !ids.has(tx.id) && !ids.has(linkedOffsetSourceId(tx) || '')), payoff].sort((a, b) => b.happenedAt.localeCompare(a.happenedAt))
  return payoff
}

export function createOffsetTransaction(source: Transaction, category: Category, ratio: number, id: string = crypto.randomUUID(), options:{happenedAt?:string;dateMode?:OffsetDateMode;amount?:number}={}): Transaction {
  if (source.kind !== 'expense' || category.flowType !== 'income' || !Number.isFinite(ratio) || ratio <= 0 || ratio > 200) throw new Error('抵扣收入需关联支出、收入分类及 0–200% 的有效比例')
  const amount=options.amount??Math.round((source.installmentOriginalTotal ?? source.amount) * ratio) / 100
  const happenedAt=options.happenedAt||source.happenedAt
  if(!Number.isFinite(amount)||amount<=0||!Number.isFinite(new Date(happenedAt).getTime()))throw new Error('抵扣金额或时间无效')
  return {
    id, title: installmentBaseTitle(source.title), amount,
    kind: 'income', happenedAt, note: source.note||'抵扣流水', merchant: source.merchant,
    paymentMethod: source.paymentMethod, source: `offset:${source.id}|${source.source}`, currency: source.currency, categoryId: category.id,
    bookIds: [...source.bookIds], installmentGroupId: null, installmentIndex: null, installmentMonths: null,
    installmentOriginalTotal: null, installmentStartMonth: null, originalAmount: null, discountAmount: null, premiumAmount: null,
    paidByParticipantId: source.paidByParticipantId, splitParticipantIds: [...source.splitParticipantIds], includeInStatistics: true,
    splitParticipantNames:[...(source.splitParticipantNames||[])],
    splitMode:source.splitMode,splitRatio:source.splitRatio,splitAmount:source.splitAmount,
    offsetSourceTransactionId: source.id,
    offsetDateMode:options.dateMode||'source',
    ledgerSplitSettings:JSON.parse(JSON.stringify(source.ledgerSplitSettings||{})),
  }
}

export function linkedOffsets(snapshot:LedgerSnapshot,sourceId:string){return snapshot.transactions.filter(tx=>tx.id!==sourceId&&linkedOffsetSourceId(tx)===sourceId)}
export function offsetDateMode(offset:Transaction,source:Transaction):OffsetDateMode {
  if(offset.offsetDateMode==='source'||offset.offsetDateMode==='independent')return offset.offsetDateMode
  return new Date(offset.happenedAt).getTime()===new Date(source.happenedAt).getTime()?'source':'independent'
}
export function offsetEdit(offset:Transaction,source:Transaction):OffsetEdit{return {id:offset.id,amount:offset.amount,categoryId:offset.categoryId,happenedAt:offset.happenedAt,dateMode:offsetDateMode(offset,source)}}
function synchronizeLinkedOffsets(snapshot:LedgerSnapshot,previous:Transaction,source:Transaction){
  const dateChanged=new Date(previous.happenedAt).getTime()!==new Date(source.happenedAt).getTime()
  for(const offset of linkedOffsets(snapshot,source.id)){
    if(offset.kind!=='income')continue
    const mode=offsetDateMode(offset,previous)
    Object.assign(offset,{title:source.title,note:source.note||'抵扣流水',merchant:source.merchant,paymentMethod:source.paymentMethod,
      bookIds:[...source.bookIds],paidByParticipantId:source.paidByParticipantId,splitParticipantIds:[...source.splitParticipantIds],
      splitParticipantNames:[...(source.splitParticipantNames||[])],splitMode:source.splitMode,splitRatio:source.splitRatio,splitAmount:source.splitAmount,
      ledgerSplitSettings:JSON.parse(JSON.stringify(source.ledgerSplitSettings||{})),offsetSourceTransactionId:source.id,source:`offset:${source.id}|${source.source}`,
      offsetDateMode:mode,...(mode==='source'&&dateChanged?{happenedAt:source.happenedAt}:{}),
      installmentGroupId:null,installmentIndex:null,installmentMonths:null,installmentOriginalTotal:null,installmentStartMonth:null})
  }
}
export function planOffsets(snapshot:LedgerSnapshot,source:Transaction,edits:OffsetEdit[],drafts:OffsetDraft[],baseAmount=source.amount,normalize=false):OffsetPlan {
  if(source.kind!=='expense'&&(edits.length||drafts.length))throw new Error('抵扣只能关联支出流水')
  if(!Number.isFinite(baseAmount)||baseAmount<=0)throw new Error('请先填写有效支出金额')
  const baseCents=Math.round(baseAmount*100)
  if(baseCents<1)throw new Error('支出金额至少为 0.01 元')
  const validCategory=(id:string|null)=>snapshot.categories.some(category=>category.id===id&&category.flowType==='income')
  const owned=new Set(linkedOffsets(snapshot,source.id).map(tx=>tx.id)),seen=new Set<string>()
  let existingCents=0
  for(const edit of edits){
    if(!owned.has(edit.id)||seen.has(edit.id))throw new Error('已有抵扣记录发生变化，请重新打开编辑')
    seen.add(edit.id)
    if(!validCategory(edit.categoryId)||!Number.isFinite(edit.amount)||Math.round(edit.amount*100)<1||!['source','independent'].includes(edit.dateMode)||!Number.isFinite(new Date(edit.happenedAt).getTime()))throw new Error('请核对已有抵扣的金额、收入分类和日期')
    existingCents+=Math.round(edit.amount*100)
  }
  const additions=drafts.map(draft=>{
    if(!validCategory(draft.categoryId)||!Number.isFinite(draft.ratio)||draft.ratio<0||draft.ratio>200||!['source','independent'].includes(draft.dateMode)||!Number.isFinite(new Date(draft.happenedAt).getTime()))throw new Error('请核对新增抵扣分类、日期和 0–200% 的比例')
    return {draft,amount:Math.round(baseCents*draft.ratio/100)/100}
  })
  const desired=additions.map(row=>Math.round(row.amount*100)),desiredTotal=desired.reduce((a,b)=>a+b,0)
  const available=Math.max(0,baseCents-existingCents)
  if(normalize&&desiredTotal>available){
    const allocated=desired.map(cents=>Math.floor(available*cents/desiredTotal))
    let rest=available-allocated.reduce((a,b)=>a+b,0)
    const order=desired.map((cents,index)=>({index,fraction:available*cents/desiredTotal-allocated[index]})).sort((a,b)=>b.fraction-a.fraction||a.index-b.index)
    for(const item of order){if(rest<=0)break;allocated[item.index]++;rest--}
    additions.forEach((row,index)=>{row.amount=allocated[index]/100})
  }
  const newCents=additions.reduce((sum,row)=>sum+Math.round(row.amount*100),0),total=existingCents+newCents
  return {existingAmount:existingCents/100,newAmount:newCents/100,totalAmount:total/100,ratio:total/baseCents*100,overLimit:total>baseCents,additions}
}
export function applyOffsetChanges(snapshot:LedgerSnapshot,source:Transaction,edits:OffsetEdit[],drafts:OffsetDraft[],baseAmount=source.amount,normalize=false){
  const plan=planOffsets(snapshot,source,edits,drafts,baseAmount,normalize),keep=new Set(edits.map(edit=>edit.id))
  const remove=new Set(linkedOffsets(snapshot,source.id).filter(tx=>!keep.has(tx.id)).map(tx=>tx.id))
  snapshot.transactions=snapshot.transactions.filter(tx=>!remove.has(tx.id)&&!remove.has(linkedOffsetSourceId(tx)||''))
  for(const edit of edits){const row=snapshot.transactions.find(tx=>tx.id===edit.id)!;Object.assign(row,{amount:Math.round(edit.amount*100)/100,categoryId:edit.categoryId,offsetDateMode:edit.dateMode,happenedAt:edit.dateMode==='source'?source.happenedAt:new Date(edit.happenedAt).toISOString()})}
  for(const item of plan.additions){if(item.amount<0.01)continue;const category=snapshot.categories.find(c=>c.id===item.draft.categoryId)!;snapshot.transactions.push(createOffsetTransaction(source,category,item.draft.ratio,undefined,{amount:item.amount,dateMode:item.draft.dateMode,happenedAt:item.draft.dateMode==='source'?source.happenedAt:new Date(item.draft.happenedAt).toISOString()}))}
  snapshot.transactions.sort((a,b)=>b.happenedAt.localeCompare(a.happenedAt))
  return plan
}

export function linkedOffsetRatio(source: Transaction, offset: Transaction): number {
  const total = source.installmentOriginalTotal ?? source.amount
  return total > 0 ? Math.max(0, Math.min(100, offset.amount / total * 100)) : 0
}

export function shiftMonth(dateValue: string, offset: number): string {
  const date = new Date(dateValue)
  const day = date.getDate()
  date.setDate(1); date.setMonth(date.getMonth() + offset)
  const last = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate()
  date.setDate(Math.min(day, last))
  return date.toISOString()
}

export function rangeForPreset(preset: 'week' | 'month' | 'year', now = new Date()): { start: Date; end: Date } {
  const start = new Date(now); start.setHours(0, 0, 0, 0)
  if (preset === 'week') { const day = (start.getDay() + 6) % 7; start.setDate(start.getDate() - day); const end = new Date(start); end.setDate(end.getDate() + 7); return { start, end } }
  if (preset === 'month') { start.setDate(1); const end = new Date(start); end.setMonth(end.getMonth() + 1); return { start, end } }
  start.setMonth(0, 1); const end = new Date(start); end.setFullYear(end.getFullYear() + 1); return { start, end }
}

export function dashboardSummary(snapshot: LedgerSnapshot, start: Date, end: Date) {
  const rows = snapshot.transactions.filter(tx => new Date(tx.happenedAt) >= start && new Date(tx.happenedAt) < end && transactionInStatistics(tx))
  const totals=statisticsSummary(rows)
  return { expenses:totals.expense, income:totals.income, balance:totals.balance, transactionCount: rows.length, rows }
}

/** Native analytics chooses the first linked ledger in ID order, once per transaction. */
export function transactionStatisticsSettings(value:Transaction,bookId?:string) {
  const primary=bookId||[...value.bookIds].filter(id=>Object.prototype.hasOwnProperty.call(value.ledgerSplitSettings||{},id)).sort((a,b)=>a.localeCompare(b,'en',{numeric:true}))[0]
  return primary?value.ledgerSplitSettings?.[primary]:undefined
}
export function transactionInStatistics(value:Transaction,bookId?:string){return value.includeInStatistics!==false&&transactionStatisticsSettings(value,bookId)?.includeInStatistics!==false}
/** Native links accept fractional ratios; web editor values explicitly use percentages. */
export function splitRatioPercent(value:Partial<Pick<LedgerSplitSettings,'splitRatio'|'splitRatioUnit'|'splitEnabled'>>){const ratio=value.splitRatio??0;return value.splitRatioUnit!=='percent'&&typeof value.splitEnabled==='boolean'&&ratio>0&&ratio<=1?ratio*100:ratio}
export function transactionShareAmount(value: Transaction, bookId?: string): number {
  if(!transactionInStatistics(value,bookId))return 0
  const settings=transactionStatisticsSettings(value,bookId)
  const transaction = settings ? { ...value, ...settings } : value
  if (settings?.splitEnabled===false||!transaction.splitParticipantIds?.length) return transaction.amount
  const participates=transaction.splitParticipantIds.includes('我')||transaction.splitParticipantNames?.includes('我')||settings?.participantSnapshot?.some(member=>member.name==='我'&&transaction.splitParticipantIds.includes(member.id))
  if (!participates) return 0
  if (transaction.splitMode === 'ratio' && transaction.splitRatio != null) return transaction.amount * Math.max(0,Math.min(100,settings?splitRatioPercent(settings):transaction.splitRatio)) / 100
  if (transaction.splitMode === 'fixed' && transaction.splitAmount != null) return Math.max(0,Math.min(transaction.amount,transaction.splitAmount))
  return transaction.amount / transaction.splitParticipantIds.length
}

/** All financial summaries use personal shares; record lists retain the full order amount. */
export function statisticsSummary(rows:Transaction[],bookId?:string){
  let expense=0,income=0,discount=0,premium=0,includedCount=0
  for(const tx of rows){if(!transactionInStatistics(tx,bookId))continue;includedCount++;const amount=transactionShareAmount(tx,bookId);if(tx.kind==='income')income+=amount;else{expense+=amount;discount+=tx.discountAmount||0;premium+=tx.premiumAmount||0}}
  return {expense,income,balance:income-expense,discount,premium,count:rows.length,includedCount}
}

export function budgetSpent(snapshot: LedgerSnapshot, budget: Budget, start: Date, end: Date): number {
  return snapshot.transactions.filter(tx => {
    const happened = new Date(tx.happenedAt)
    if (tx.kind !== 'expense' || !transactionInStatistics(tx,budget.bookId||undefined) || !(happened >= start && happened < end)) return false
    if (budget.bookId && !tx.bookIds.includes(budget.bookId)) return false
    if (!budget.categoryIds.length) return true
    return budget.categoryIds.some(id => isCategoryWithin(snapshot.categories, tx.categoryId, id))
  }).reduce((sum, tx) => sum + transactionShareAmount(tx, budget.bookId || undefined), 0)
}
