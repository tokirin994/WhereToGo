import 'fake-indexeddb/auto'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { assignAutoBooks, budgetSpent, categoryPath, createInitialSnapshot, createOffsetTransaction, createTransaction, dashboardSummary, flattenCategories, isCategoryWithin, normalizeSnapshot, rangeForPreset, shiftMonth, transactionShareAmount, type Budget } from './ledger'
import { fingerprint, smartSync } from './cloudSync'
import { parseBillFile, parseReceiptText, parseReceiptTextBatch } from './importers'
import { readLocalSnapshot, readSyncMetadata, writeLocalSnapshot, writeSyncMetadata } from './storage'

afterEach(()=>vi.unstubAllGlobals())

describe('SmartLedger core data and account rules', () => {
  it('seeds a complete default category tree and one daily book', () => {
    const snapshot = createInitialSnapshot(new Date('2026-10-22T00:00:00Z'))
    expect(snapshot.books).toHaveLength(1)
    expect(snapshot.books[0].name).toBe('日常账本')
    expect(snapshot.categories.some(item => item.flowType === 'income')).toBe(true)
    expect(snapshot.categories.filter(item => item.parentId === null).length).toBeGreaterThan(5)
  })

  it('resolves a category hierarchy and parent category membership', () => {
    const snapshot = createInitialSnapshot()
    const root = snapshot.categories.find(item => item.name === '餐饮')!
    const child = snapshot.categories.find(item => item.name === '午餐')!
    expect(categoryPath(snapshot.categories, child.id).map(item => item.name)).toEqual(['餐饮', '午餐'])
    expect(isCategoryWithin(snapshot.categories, child.id, root.id)).toBe(true)
    expect(flattenCategories(snapshot.categories)).toContainEqual(child)
  })

  it('auto-collects only books matching dates and selected category descendants', () => {
    const snapshot = createInitialSnapshot()
    const root = snapshot.categories.find(item => item.name === '餐饮')!
    const child = snapshot.categories.find(item => item.name === '午餐')!
    snapshot.books.push({ ...snapshot.books[0], id: 'trip', name: '旅行', type: 'trip', startDate: '2026-10-20', endDate: '2026-10-30', autoCollectEnabled: true, autoCollectCategoryIds: [root.id] })
    expect(assignAutoBooks(snapshot, { happenedAt: '2026-10-22T08:00:00Z', categoryId: child.id })).toEqual(['trip'])
    expect(assignAutoBooks(snapshot, { happenedAt: '2026-11-01T08:00:00Z', categoryId: child.id })).toEqual([])
  })

  it('splits installment amounts to cents and preserves the original total', () => {
    const snapshot = createInitialSnapshot()
    const rows = createTransaction(snapshot, { title: '电脑', amount: 1000.01, kind: 'expense', happenedAt: '2026-01-31T12:00:00Z', installmentMonths: 3 })
    expect(rows).toHaveLength(3)
    expect(rows.reduce((sum, item) => sum + item.amount, 0)).toBe(1000.01)
    expect(rows.map(item => item.installmentIndex)).toEqual([1, 2, 3])
    expect(rows[0].installmentGroupId).toBe(rows[2].installmentGroupId)
    expect(new Date(rows[1].happenedAt).getMonth()).toBe(1)
  })

  it('rejects invalid amount, title and a category of the wrong flow type', () => {
    const snapshot = createInitialSnapshot()
    const income = snapshot.categories.find(item => item.flowType === 'income')!
    expect(() => createTransaction(snapshot, { title: '', amount: 1, kind: 'expense', happenedAt: new Date().toISOString() })).toThrow()
    expect(() => createTransaction(snapshot, { title: '坏账', amount: 0, kind: 'expense', happenedAt: new Date().toISOString() })).toThrow()
    expect(() => createTransaction(snapshot, { title: '方向错误', amount: 1, kind: 'expense', happenedAt: new Date().toISOString(), categoryId: income.id })).toThrow()
  })

  it('computes dashboard and category/book scoped budget progress', () => {
    const snapshot = createInitialSnapshot()
    const root = snapshot.categories.find(item => item.name === '餐饮')!
    const child = snapshot.categories.find(item => item.name === '午餐')!
    const [one] = createTransaction(snapshot, { title: '午餐', amount: 120, kind: 'expense', happenedAt: '2026-10-05T12:00:00Z', categoryId: child.id, bookIds: [snapshot.books[0].id] })
    const [two] = createTransaction(snapshot, { title: '工资', amount: 5000, kind: 'income', happenedAt: '2026-10-06T12:00:00Z' })
    snapshot.transactions.push(one, two)
    const range = { start: new Date('2026-10-01'), end: new Date('2026-11-01') }
    expect(dashboardSummary(snapshot, range.start, range.end)).toMatchObject({ expenses: 120, income: 5000, balance: 4880, transactionCount: 2 })
    const budget: Budget = { id: 'b', name: '餐饮', limitAmount: 500, periodType: 'monthly', year: 2026, month: 10, startDate: null, endDate: null, categoryIds: [root.id], bookId: snapshot.books[0].id }
    expect(budgetSpent(snapshot, budget, range.start, range.end)).toBe(120)
  })

  it('counts only the current user share of a split transaction in statistics', () => {
    const snapshot = createInitialSnapshot()
    const [shared] = createTransaction(snapshot, { title: '聚餐', amount: 300, kind: 'expense', happenedAt: '2026-10-05T12:00:00Z', splitParticipantIds: ['我', '小明', '小红'] })
    expect(transactionShareAmount(shared)).toBe(100)
    expect(transactionShareAmount({ ...shared, splitParticipantIds: ['小明', '小红'] })).toBe(0)
    expect(transactionShareAmount({ ...shared, splitParticipantIds: ['我','小明'], splitMode:'ratio', splitRatio:35 })).toBe(105)
    expect(transactionShareAmount({ ...shared, splitParticipantIds: ['我','小明'], splitMode:'fixed', splitAmount:80 })).toBe(80)
  })

  it('creates a linked reimbursement income row with cent precision', () => {
    const snapshot=createInitialSnapshot()
    const [expense]=createTransaction(snapshot,{title:'酒店',amount:88.88,kind:'expense',happenedAt:'2026-10-10T10:00:00Z'})
    const reimbursement=snapshot.categories.find(item=>item.name==='报销')!
    const offset=createOffsetTransaction(expense,reimbursement,35)
    expect(offset).toMatchObject({amount:31.11,kind:'income',source:`offset:${expense.id}|manual`,categoryId:reimbursement.id,offsetSourceTransactionId:expense.id})
    expect(()=>createOffsetTransaction(expense,snapshot.categories.find(item=>item.flowType==='expense')!,100)).toThrow()
  })

  it('resolves calendar boundaries and end-of-month installment dates', () => {
    expect(shiftMonth('2026-01-31T12:00:00Z', 1).slice(0, 10)).toBe('2026-02-28')
    const range = rangeForPreset('month', new Date('2026-10-22T12:00:00Z'))
    expect([range.start.getFullYear(), range.start.getMonth()+1, range.start.getDate()]).toEqual([2026,10,1])
    expect([range.end.getFullYear(), range.end.getMonth()+1, range.end.getDate()]).toEqual([2026,11,1])
  })

  it('parses receipt fields while leaving missing values for user confirmation', () => {
    const candidate = parseReceiptText('商户：海底捞\n实付金额：¥238.50\n支付时间：2026-10-21 19:20\n微信支付')
    expect(candidate.amount).toBe(238.5)
    expect(candidate.kind).toBe('expense')
    expect(candidate.happenedAt).toContain('2026-10-21')
    expect(candidate.paymentMethod).toBe('微信')
    expect(candidate.confidence).toBeGreaterThan(0.5)
  })

  it('matches the original WeChat detail, transfer and Meituan enterprise meal cases', () => {
    const wechat=parseReceiptText('微信支付\n付款成功\n收款方：瑞幸咖啡\n商品说明：生椰拿铁\n支付方式：零钱\n支付金额：¥24.00')
    expect(wechat).toMatchObject({amount:24,kind:'expense',merchant:'瑞幸咖啡',paymentMethod:'零钱',categoryPath:['餐饮','咖啡茶饮']})
    const incoming=parseReceiptText('转账成功\n收款方：张三\n收入金额：500.00\n备注：朋友转账')
    expect(incoming.kind).toBe('income')
    const meituan=parseReceiptText('消费记录详情\n已支付\n¥20.00\n企业订单\n订单时间\n2026-10-08 17:57:55\n消费商家\n云南味道\n业务场景\n工作餐')
    expect(meituan).toMatchObject({amount:20,kind:'expense',title:'云南味道',merchant:'云南味道',categoryPath:['餐饮','晚餐'],offsetEnabled:true,offsetRatio:100,paymentMethod:'公司补贴'})
  })

  it('extracts original price and combined discounts from detail screenshots', () => {
    const parsed=parseReceiptText('交易详情\n-34.06\n美团\n原价\n¥35.50\n优惠 信用卡减¥0.24\n摇优惠立减¥1.20\n支付时间\n2026年09月25日 19:04:14\n商品\n村上一屋鳗鱼饭\n商户全称\n村上一屋')
    expect(parsed.amount).toBe(34.06)
    expect(parsed.originalAmount).toBe(35.5)
    expect(parsed.discountAmount).toBe(1.44)
    expect(parsed.title).toBe('村上一屋鳗鱼饭')
  })

  it('parses compact Alipay bill rows, relative dates and signed outgoing QR payments', () => {
    const list=parseReceiptTextBatch('搜索交易记录\n9月\n收钱码收款-给早阳包子 -5.88\n餐饮美食\n今天 09:41\n扫收钱码付款-给瑞豹自行车地⋯-2,998.92\n爱车养车\n09-19 14:24')
    expect(list).toHaveLength(2)
    expect(list[0]).toMatchObject({title:'收钱码收款-给早阳包子',amount:5.88,kind:'expense'})
    expect(list[0].happenedAt).toBeTruthy()
    expect(list[1]).toMatchObject({amount:2998.92,kind:'expense'})
    const outgoing=parseReceiptText('微信支付账单详情\n扫二维码付款-给刘海龙\n-4.50\n当前状态 支付成功\n收款方全称\n刘海龙\n付款方式\n中国银行储蓄卡\n转账时间\n2026年10月8日 09:46:47')
    expect(outgoing).toMatchObject({amount:4.5,kind:'expense',merchant:'刘海龙'})
  })

  it('parses multiple dated rows and bill CSV files without committing candidates', async () => {
    const rows=parseReceiptTextBatch('LEGO乐高\n购物\n2026-10-12 15:42\n-24.15\n力士植萃\n购物\n2026-10-11 09:30\n-37.80')
    expect(rows).toHaveLength(2)
    expect(rows.map(item=>item.amount)).toEqual([24.15,37.8])
    expect(rows.map(item=>item.title)).toEqual(['LEGO乐高','力士植萃'])
    const csv=new File(['交易对方,金额,交易时间,收支\n便利店,12.50,2026-10-21 09:00,支出'],'statement.csv',{type:'text/csv'})
    const imported=await parseBillFile(csv)
    expect(imported).toHaveLength(1)
    expect(imported[0].amount).toBe(12.5)
  })

  it('migrates older snapshots without losing their existing collections', () => {
    const original = createInitialSnapshot()
    original.schemaVersion = 1
    original.transactions.push(...createTransaction(original, { title: '已有流水', amount: 10, kind: 'expense', happenedAt: new Date().toISOString() }))
    const normalized = normalizeSnapshot(original)
    expect(normalized.schemaVersion).toBe(4)
    expect(normalized.transactions[0].title).toBe('已有流水')
    expect(normalized.settings.cloudSyncEnabled).toBe(false)
  })

  it('does not treat a timestamp-only update as a content edit for sync', () => {
    const first = createInitialSnapshot(new Date('2026-10-20T00:00:00Z'))
    const second = { ...first, updatedAt: '2026-10-22T00:00:00Z' }
    expect(fingerprint(first)).toBe(fingerprint(second))
  })

  it('persists an account-scoped snapshot in IndexedDB', async () => {
    const account=`test-${crypto.randomUUID()}`
    const snapshot=createInitialSnapshot()
    await writeLocalSnapshot(account,snapshot)
    const loaded=await readLocalSnapshot(account)
    expect(loaded?.books[0].name).toBe('日常账本')
    expect(await readLocalSnapshot(`${account}-other`)).toBeNull()
  })

  it('surfaces a sync conflict when local and remote both changed since the last agreement', async () => {
    const account=`sync-${crypto.randomUUID()}`
    const local=createInitialSnapshot()
    vi.stubGlobal('localStorage',{getItem:(key:string)=>windowLocal.get(key)||null,setItem:(key:string,value:string)=>windowLocal.set(key,value)})
    writeSyncMetadata(account,{revision:4,lastFingerprint:'stale-local-hash',lastSyncedAt:'2026-10-01T00:00:00Z'})
    const remote=createInitialSnapshot()
    const remoteResponse={schemaVersion:3,revision:5,contentHash:'remote-hash',snapshot:remote,updatedAt:'2026-10-22T00:00:00Z'}
    vi.stubGlobal('fetch',vi.fn().mockResolvedValue(new Response(JSON.stringify(remoteResponse),{status:200,headers:{'content-type':'application/json'}})))
    const result=await smartSync('http://localhost:8090','token',account,local)
    expect(result.conflict?.remote.revision).toBe(5)
    expect(result.snapshot).toBe(local)
  })
})

const windowLocal=new Map<string,string>()
