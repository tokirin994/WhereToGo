export type FlowType = 'expense' | 'income'
export type BookType = 'general' | 'custom' | 'trip'

export interface Category {
  id: string; name: string; flowType: FlowType; icon: string; color: string
  parentId: string | null; sortOrder: number
}
const categoryIconAliases: Record<string, string> = {
  'fork-knife':'🍽️','fork.knife':'🍽️','fork-knife-circle-fill':'🍽️',
  car:'🚗','car.fill':'🚗','car-side':'🚙',house:'🏠','house.fill':'🏠',
  bag:'🛍️','bag.fill':'🛍️','heart':'❤️','heart.fill':'❤️',book:'📚','book.fill':'📚',
  game:'🎮','gamecontroller.fill':'🎮',gift:'🎁','gift.fill':'🎁',
  'credit-card':'💳','creditcard.fill':'💳',more:'🧾',ellipsis:'🧾',
  wallet:'👛','wallet.pass.fill':'👛',store:'🏪','storefront.fill':'🏪',
  chart:'📈','chart.bar.fill':'📈',plus:'➕',grid:'▦','square.grid.2x2.fill':'▦',
  airplane:'✈️','airplane.fill':'✈️','bus.fill':'🚌','tram.fill':'🚇',
  'cup.and.saucer.fill':'☕','takeoutbag.and.cup.and.straw.fill':'🥡',
  'cross.case.fill':'🩺','pills.fill':'💊','graduationcap.fill':'🎓',
  'ticket.fill':'🎟️','bed.double.fill':'🛏️','cart.fill':'🛒',
}
export function categoryIcon(icon: string | null | undefined, flowType: FlowType = 'expense') {
  if (!icon) return flowType === 'income' ? '↙' : '↗'
  const alias = categoryIconAliases[icon]
  if (alias) return alias
  // Stored emoji and pictographs are already display-ready; legacy SF Symbol names are not.
  if (!/^[\p{L}\p{N}._-]+$/u.test(icon)) return icon
  return flowType === 'income' ? '↙' : '↗'
}
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
}
export interface Transaction {
  id: string; title: string; amount: number; kind: FlowType; happenedAt: string; note: string
  merchant: string; paymentMethod: string; source: string; currency: string; categoryId: string | null
  bookIds: string[]; installmentGroupId: string | null; installmentIndex: number | null; installmentMonths: number | null
  installmentOriginalTotal: number | null; originalAmount: number | null; discountAmount: number | null; premiumAmount: number | null
  paidByParticipantId: string | null; splitParticipantIds: string[]; includeInStatistics: boolean
  splitMode?: 'equal' | 'ratio' | 'fixed'; splitRatio?: number | null; splitAmount?: number | null
  offsetSourceTransactionId?: string | null
  installmentStartMonth?: string | null
  ledgerSplitSettings?: Record<string, LedgerSplitSettings>
}
export type TransactionDraft = Partial<Transaction> & Pick<Transaction, 'title' | 'amount' | 'kind' | 'happenedAt'> & {
  hasExplicitBookSelection?: boolean
}
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
  let current = id ? map.get(id) : undefined
  while (current) { path.unshift(current); current = current.parentId ? map.get(current.parentId) : undefined }
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
    if (book.participants.length > 1 && (!value.paidByParticipantId || !members.has(value.paidByParticipantId) || !value.splitParticipantIds.length || value.splitParticipantIds.some(person => !members.has(person)))) throw new Error(`请为“${book.name}”选择有效付款人和分账成员`)
    if (value.splitMode === 'ratio' && (!Number.isFinite(value.splitRatio) || value.splitRatio! < 0 || value.splitRatio! > 100)) throw new Error(`“${book.name}”的本人比例应为 0 至 100`)
    if (value.splitMode === 'fixed' && (!Number.isFinite(value.splitAmount) || value.splitAmount! < 0 || value.splitAmount! > draft.amount)) throw new Error(`“${book.name}”的本人金额不能超过流水金额`)
    result[id] = { ...value, splitParticipantIds: [...value.splitParticipantIds] }
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
    includeInStatistics: draft.includeInStatistics ?? true, splitMode: primarySplit?.splitMode ?? draft.splitMode ?? 'equal', splitRatio: primarySplit?.splitRatio ?? draft.splitRatio ?? null, splitAmount: primarySplit?.splitAmount ?? draft.splitAmount ?? null,
    offsetSourceTransactionId: draft.offsetSourceTransactionId ?? null,
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
  snapshot.transactions = snapshot.transactions.filter(tx => tx.id !== id).concat(rows).sort((a, b) => b.happenedAt.localeCompare(a.happenedAt))
  for (const offset of snapshot.transactions.filter(tx => tx.offsetSourceTransactionId === id)) offset.bookIds = [...rows[0].bookIds]
  return rows
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
  for (const tx of remaining) if (tx.offsetSourceTransactionId && ids.has(tx.offsetSourceTransactionId)) tx.offsetSourceTransactionId = merged.id
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
  snapshot.transactions = [...snapshot.transactions.filter(tx => !ids.has(tx.id) && !ids.has(tx.offsetSourceTransactionId || '')), payoff].sort((a, b) => b.happenedAt.localeCompare(a.happenedAt))
  return payoff
}

export function createOffsetTransaction(source: Transaction, category: Category, ratio: number, id: string = crypto.randomUUID()): Transaction {
  if (source.kind !== 'expense' || category.flowType !== 'income' || !Number.isFinite(ratio) || ratio <= 0 || ratio > 100) throw new Error('抵扣收入需关联支出、收入分类和有效比例')
  return {
    id, title: `抵扣 · ${source.title}`, amount: Math.round((source.installmentOriginalTotal ?? source.amount) * ratio) / 100,
    kind: 'income', happenedAt: source.happenedAt, note: '关联支出抵扣/报销', merchant: source.merchant,
    paymentMethod: source.paymentMethod, source: 'offset', currency: source.currency, categoryId: category.id,
    bookIds: [...source.bookIds], installmentGroupId: null, installmentIndex: null, installmentMonths: null,
    installmentOriginalTotal: null, originalAmount: null, discountAmount: null, premiumAmount: null,
    paidByParticipantId: source.paidByParticipantId, splitParticipantIds: [], includeInStatistics: true,
    offsetSourceTransactionId: source.id,
  }
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
  const rows = snapshot.transactions.filter(tx => new Date(tx.happenedAt) >= start && new Date(tx.happenedAt) < end && tx.includeInStatistics)
  const expenses = rows.filter(tx => tx.kind === 'expense').reduce((sum, tx) => sum + transactionShareAmount(tx), 0)
  const income = rows.filter(tx => tx.kind === 'income').reduce((sum, tx) => sum + transactionShareAmount(tx), 0)
  return { expenses, income, balance: income - expenses, transactionCount: rows.length, rows }
}

export function transactionShareAmount(value: Transaction, bookId?: string): number {
  const transaction = bookId && value.ledgerSplitSettings?.[bookId] ? { ...value, ...value.ledgerSplitSettings[bookId] } : value
  if (!transaction.splitParticipantIds.length) return transaction.amount
  if (!transaction.splitParticipantIds.includes('我')) return 0
  if (transaction.splitMode === 'ratio' && transaction.splitRatio != null) return transaction.amount * Math.max(0,Math.min(100,transaction.splitRatio)) / 100
  if (transaction.splitMode === 'fixed' && transaction.splitAmount != null) return Math.max(0,Math.min(transaction.amount,transaction.splitAmount))
  return transaction.amount / transaction.splitParticipantIds.length
}

export function budgetSpent(snapshot: LedgerSnapshot, budget: Budget, start: Date, end: Date): number {
  return snapshot.transactions.filter(tx => {
    const happened = new Date(tx.happenedAt)
    if (tx.kind !== 'expense' || !tx.includeInStatistics || happened < start || happened >= end) return false
    if (budget.bookId && !tx.bookIds.includes(budget.bookId)) return false
    if (!budget.categoryIds.length) return true
    return budget.categoryIds.some(id => isCategoryWithin(snapshot.categories, tx.categoryId, id))
  }).reduce((sum, tx) => sum + transactionShareAmount(tx, budget.bookId || undefined), 0)
}
