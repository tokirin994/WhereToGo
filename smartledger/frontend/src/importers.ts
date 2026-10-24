import readXlsxFile from 'read-excel-file/browser'
import { createWorker, PSM } from 'tesseract.js'
import type { FlowType, Transaction } from './ledger'
import { normalizeOcrName, normalizeOcrText, parseCsv, readBillText } from './ocrText'
import { loadPdfJs, pdfOptions } from './pdfRuntime'

export interface ImportCandidate extends Partial<Transaction> {
  id: string; confidence: number; rawText: string; details: Array<{ label: string; value: string }>
  categoryPath?: string[]; categoryKeyword?: string; suggestedSource?: string
  presetKey?: 'meituan_enterprise_meal'; categorySuggestion?: string
  happenedAtLocal?: string
  hasExplicitBookSelection?: boolean
  sourceId?: string; sourceName?: string; sourcePage?: number; sourceRow?: number; sourceSheet?: string
  offsetEnabled?: boolean; offsetCategoryId?: string | null; offsetRatio?: number
  unboundSplitCount?: number
}

const parseAmount = (text: string): number | null => {
  const normalized = text.replace(/[，,](?=\d{3}(?:\D|$))/g, '').replace(/[ＯＯ]/g, '0')
  const matches = [...normalized.matchAll(/[¥￥$]?[\s]*([+-]?)\s*(\d{1,9}(?:\.\d{1,2})?)/g)]
  const value = matches.map(match => (match[1] === '-' ? -1 : 1) * Number(match[2])).find(amount => Number.isFinite(amount) && amount !== 0)
  return value == null ? null : Math.abs(value)
}

const amountFromLine = (line: string): number | null => {
  const normalized = line.replace(/[ＯＯ]/g, '0').replace(/[，,](?=\d{3}(?:\D|$))/g, '')
  const matches = [...normalized.matchAll(/[¥￥$]\s*([+-]?)\s*(\d{1,9}(?:\.\d{1,2})?)|([+-])\s*[¥￥$]?\s*(\d{1,9}(?:\.\d{1,2})?)/g)]
  if (matches.length) {
    const match = matches[matches.length - 1]
    const amount = Number(match[2] || match[4])
    return Number.isFinite(amount) && amount > 0 ? amount : null
  }
  const nums = [...normalized.matchAll(/(?:^|[^\d])([+-]?\d{1,9}\.\d{1,2})(?:元)?(?:$|[^\d])/g)]
  const amount = nums.length ? Number(nums[nums.length - 1][1]) : NaN
  return Number.isFinite(amount) && amount > 0 ? amount : null
}

const labelledPaymentAmount = (lines: string[]): { line: string; amount: number } | undefined => {
  const paymentLabel = /(?:实际支付(?:金额)?|本次支付(?:金额)?|实付(?:款)?(?:金额)?|支付金额|付款金额|交易金额|支出金额|收入金额|应付金额|合计|总计|订单金额)/
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index]
    if (!paymentLabel.test(line)) continue
    const inline = line.match(/(?:实际支付(?:金额)?|本次支付(?:金额)?|实付(?:款)?(?:金额)?|支付金额|付款金额|交易金额|支出金额|收入金额|应付金额|合计|总计|订单金额)\s*[:：]?\s*[¥￥$]?\s*(\d[\d,]*(?:\.\d{1,2})?)/)
    if (inline) {
      const amount = Number(inline[1].replaceAll(',', ''))
      if (Number.isFinite(amount) && amount > 0) return { line, amount }
    }
    for (const next of lines.slice(index + 1, index + 3)) {
      if (/^(?:原价|优惠|折扣|立减|订单号|交易单号)/.test(next)) break
      const standalone = next.match(/^[¥￥$]?\s*(\d[\d,]*(?:\.\d{1,2})?)\s*(?:元)?$/)
      if (!standalone) continue
      const amount = Number(standalone[1].replaceAll(',', ''))
      if (Number.isFinite(amount) && amount > 0) return { line: `${line} ${next}`, amount }
    }
  }
  return undefined
}

function parseDate(text: string): string | undefined {
  const normalized = text.replace(/[ＯＯ]/g, '0').replace(/[：﹕]/g, ':').replace(/[．。]/g, '.')
  const lines = normalized.split(/\n+/).map(line => line.trim()).filter(Boolean)
  const datePattern = /(20\d{2})\s*[年./-]\s*(\d{1,2})\s*[月./-]\s*(\d{1,2})\s*日?\s*(?:(\d{1,2})\s*[:.时点]\s*(\d{2})(?:\s*[:.]\s*(\d{2}))?)?/
  const shortPattern = /(?:^|\D)(\d{1,2})\s*[月./-]\s*(\d{1,2})\s*日?\s+(\d{1,2})\s*[:.]\s*(\d{2})/
  const dateLabels = /支付时间|交易时间|订单时间|下单时间|下单|付款时间|消费时间|完成时间|记账时间/
  const labelledLines = lines.flatMap((line, index) => dateLabels.test(line) ? [line, lines[index + 1] || ''] : [])
  const candidates = [...labelledLines, normalized]
  if (/今天/.test(normalized) || /昨天/.test(normalized) || /前天/.test(normalized)) {
    const offset = /前天/.test(normalized) ? -2 : /昨天/.test(normalized) ? -1 : 0
    const date = new Date(); date.setDate(date.getDate() + offset)
    const time = normalized.match(/(\d{1,2})\s*[:.]\s*(\d{2})/)
    if (time) date.setHours(Number(time[1]), Number(time[2]), 0, 0)
    return date.toISOString()
  }
  for (const candidate of candidates) {
    const full = candidate.match(datePattern)
    const short = full ? null : candidate.match(shortPattern)
  if (full) {
    const [, year, month, day, hour, minute, second] = full
    const date = new Date(Number(year), Number(month)-1, Number(day), Number(hour ?? 12), Number(minute ?? 0), Number(second ?? 0))
      if (date.getFullYear() === Number(year) && date.getMonth() === Number(month)-1 && date.getDate() === Number(day) && Number(hour ?? 0) <= 23 && Number(minute ?? 0) <= 59) return date.toISOString()
  }
  if (short) {
    const date = new Date(new Date().getFullYear(), Number(short[1])-1, Number(short[2]), Number(short[3]), Number(short[4]))
      if (date.getMonth() === Number(short[1])-1 && date.getDate() === Number(short[2]) && Number(short[3]) <= 23 && Number(short[4]) <= 59) return date.toISOString()
    }
  }
  return undefined
}

function parseMeituanOrderList(lines: string[]): ImportCandidate[] {
  const orderDates = lines.flatMap((line, index) => parseDate(line) && (/下单|订单时间|支付时间/.test(line) || (index > 0 && /下单|订单时间|支付时间/.test(lines[index - 1]))) ? [index] : [])
  const candidates: ImportCandidate[] = []
  for (const [orderIndex, dateIndex] of orderDates.entries()) {
    const start = orderIndex === 0 ? Math.max(0, dateIndex - 8) : orderDates[orderIndex - 1] + 1
    const end = orderDates[orderIndex + 1] ?? Math.min(lines.length, dateIndex + 5)
    const rowLines = lines.slice(start, Math.min(end, dateIndex + 4))
    const dateLine = lines[dateIndex]
    const dateWithAdjacentTime = `${dateLine} ${lines[dateIndex + 1] || ''}`
    const timestampPattern = /20\d{2}\s*[年./-]\s*\d{1,2}\s*[月./-]\s*\d{1,2}\s*日?\s*(?:\d{1,2}\s*[:.]\s*\d{2}(?:\s*[:.]\s*\d{2})?)?/
    const timestamp = dateLine.match(timestampPattern)
    const trailing = timestamp?.index == null ? '' : dateLine.slice(timestamp.index + timestamp[0].length)
    const explicitAmount = rowLines.map(line => line.match(/(?:实付款?|实际支付|支付金额|订单金额|合计)\s*[:：]?\s*[¥￥]?\s*([\d,]+(?:\.\d{1,2})?)/)?.[1])
      .find(Boolean)
    const amount = (explicitAmount ? Number(explicitAmount.replaceAll(',', '')) : null) ?? amountFromLine(trailing)
      ?? rowLines.filter((line, index) => index !== dateIndex - start && (/[¥￥$]/.test(line) || /^[·•]\s*[\d,]+(?:\.\d{1,2})?$/.test(line))).map(amountFromLine).find((value): value is number => value != null)
    const clean = (line: string) => line.replace(/[＞>→]+/g, ' ').replace(/已完成|订单完成|待评价|去付款|再来一单|更多|发票/g, '').trim()
    const preceding = lines.slice(start, dateIndex).map(clean).filter(line => line.length > 1 && !/^(我的订单|全部订单|待付款|待收货|待评价|退款|筛选|订单信息|订单状态)$/.test(line) && !parseDate(line) && !/[¥￥$]\s*\d/.test(line))
    const merchant = [...preceding].reverse().find(line => /店|站|商店|超市|餐厅|餐馆|咖啡|美团/.test(line)) || preceding.at(-1)
    const title = merchant || preceding.at(-1) || '美团订单'
    if (!title && amount == null) continue
    const candidate = parseReceiptText(rowLines.join('\n'))
    candidate.id = crypto.randomUUID()
    candidate.title = normalizeOcrName(title)
    candidate.merchant = normalizeOcrName(merchant || title)
    candidate.amount = amount ?? candidate.amount
    candidate.kind = 'expense'
    candidate.happenedAt = parseDate(dateWithAdjacentTime) || parseDate(dateLine)
    candidate.rawText = rowLines.join('\n')
    candidate.details = [{ label: '导入来源', value: '美团订单列表' }, ...(candidate.details || [])]
    candidate.confidence = candidate.amount != null && candidate.happenedAt ? 0.9 : candidate.amount != null || candidate.happenedAt ? 0.66 : 0.42
    candidates.push(candidate)
  }
  return candidates
}

export function parseReceiptText(rawText: string): ImportCandidate {
  const text = normalizeOcrText(rawText).replace(/[−－—]/g, '-')
  const lines = text.split(/\n+/).map(line => line.trim()).filter(Boolean)
  const fieldValue = (labels: string[]) => {
    for (const label of labels) {
      const index = lines.findIndex(line => line.includes(label))
      if (index < 0) continue
      const inline = lines[index].replace(new RegExp(`^.*?${label}\\s*[:：]?\\s*`), '').trim()
      if (inline && !/^[¥￥$\-\d.,]+$/.test(inline)) return inline
      const next = lines.slice(index + 1).find(line => line && !/^(当前状态|支付成功|交易成功|订单编号|支付方式|付款方式|收单机构|交易单号|转账单号)$/.test(line))
      if (next) return next
    }
    return undefined
  }
  const labelledAmount = labelledPaymentAmount(lines)
  const amountLine = labelledAmount?.line
  const signedLine = lines.find(line => !/\d{4}[年./-]\d{1,2}[月./-]\d{1,2}|\d{1,2}:\d{2}|订单号|交易单号|转账单号/.test(line) && /[−-]\s*[¥￥]?\s*\d[\d,]*\.\d{1,2}/.test(line))
  // Prefer explicitly labelled payment totals; never fall back to unrelated numbers
  // (order IDs, original prices, discounts) when a payment label is present.
  const hasAmountLabel = lines.some(line => /实际支付|本次支付|实付|支付金额|付款金额|交易金额|支出金额|收入金额|应付金额|合计|总计|订单金额/.test(line))
  const currencyLines = lines.filter(line => /[¥￥$]\s*\d/.test(line) && !/\d{4}[年./-]\d{1,2}[月./-]\d{1,2}|订单号|交易单号|转账单号/.test(line))
  const fallbackAmountLine = currencyLines.at(-1) || lines.filter(line => /\d[\d,]*\.\d{1,2}/.test(line) && !/\d{4}[年./-]\d{1,2}[月./-]\d{1,2}|\d{1,2}:\d{2}|订单号|交易单号|转账单号/.test(line)).at(-1)
  const amount = labelledAmount?.amount ?? (signedLine ? amountFromLine(signedLine) : hasAmountLabel ? null : fallbackAmountLine ? parseAmount(fallbackAmountLine) ?? amountFromLine(fallbackAmountLine) : null)
  const happenedAt = parseDate(text)
  const merchant = fieldValue(['消费商家','商户全称','商家','商户','收款方全称','收款方','店铺'])?.replace(/\s+-\s+.*$/, '').trim()
  const product = fieldValue(['商品名称','商品说明','商品','消费项目'])?.replace(/-美团.*$/, '').replace(/-美团App.*$/, '').trim()
  const signedAmount = signedLine?.match(/[−-]\s*[¥￥]?\s*([\d,]+\.\d{1,2})/)
  const explicitOut = /转出|支出|付款成功|付款金额|支付成功/.test(text) || Boolean(signedAmount)
  const income = !explicitOut && (/收入金额|转入|转账收入|退款入账|退款成功|工资到账|到账/.test(text) || (/转账成功/.test(text) && !/转出/.test(text)) || (/收款成功/.test(text) && !/付款方/.test(text)))
  const kind: FlowType = income ? 'income' : 'expense'
  const paymentMethod = fieldValue(['支付方式','付款方式','支付渠道']) || ['零钱','花呗','信用卡','银行卡','云闪付','支付宝','微信','现金'].find(channel => text.includes(channel))
  const title = product || merchant || lines.find(line => line.length > 1 && !/[¥￥$\d]{2,}/.test(line) && !/账单|交易详情|支付成功|微信支付|支付宝/.test(line)) || '识别流水'
  const details = lines.filter(line => /优惠|原价|折扣|支付方式|支付渠道|交易时间|订单号/.test(line)).map(line => ({ label: line.split(/[:：]/)[0] || '明细', value: line }))
  const originalAmount = parseAmount(fieldValue(['原价']) || lines.find(line => line.includes('原价')) || '')
  const explicitDiscount = lines.filter(line => /优惠|立减|折扣/.test(line)).map(parseAmount).filter((value): value is number => value !== null).reduce((sum, value) => sum + value, 0)
  const discountAmount = explicitDiscount || (originalAmount && amount && originalAmount > amount ? Math.round((originalAmount-amount)*100)/100 : undefined)
  const context=`${title} ${merchant||''} ${text}`
  const hour=happenedAt?new Date(happenedAt).getHours():12
  const mealCategory=hour<10?'早餐':hour<15?'午餐':hour<21?'晚餐':'夜宵'
  const categoryRules: Array<[RegExp,string[]]> = [
    [/咖啡|奶茶|拿铁|茶饮/,['餐饮','咖啡茶饮']],
    [/零食|水果|果切|坚果/,['餐饮','零食水果']],[/买菜|食材|菜市场/,['餐饮','买菜食材']],[/蛋糕|烘焙|甜品|面包/,['餐饮','烘焙甜品']],
    [/地铁|公交/,['交通出行','公交地铁']],[/滴滴|网约车|打车|出租车/,['交通出行','打车']],[/火车|高铁|铁路/,['交通出行','火车票']],[/机票|航空|航班/,['交通出行','机票']],[/加油/,['交通出行','加油']],[/停车/,['交通出行','停车费']],
    [/超市|购物|淘宝|京东|日用品|便利店/,['购物','日用百货']],[/服饰|鞋包|衣服/,['购物','服饰鞋包']],
    [/房租/,['居住','房租']],[/水费/,['居住','水费']],[/电费/,['居住','电费']],[/物业/,['居住','物业']],[/宽带/,['居住','宽带']],
    [/医院|挂号|门诊/,['医疗健康','门诊']],[/药房|药店|买药/,['医疗健康','药品']],[/酒店|宾馆|民宿|住宿/,['休闲娱乐','酒店住宿']],
    [/工资|奖金|补贴/,['工资收入','基本工资']],[/退款|退回/,['其他收入','退款']],[/收款成功|转入|朋友转账/,['其他收入','礼金红包']]
  ]
  const enterpriseMeal = /工作餐|企业订单|企业用餐/.test(text) && /消费商家|商家|商户/.test(text) && /订单时间|下单时间|支付时间/.test(text) && /消费记录详情|企业订单|大象|企业用餐|企业支付/.test(text)
  const categoryPath = enterpriseMeal ? ['餐饮',happenedAt?mealCategory:'日常吃饭'] : categoryRules.find(([pattern])=>pattern.test(context))?.[1] || (/火锅|餐厅|餐饮|外卖|美团|饭|包子|汉堡|披萨|海底捞|餐|牛肉汤|麻辣烫|米粉|米线|面馆|面条|饺子|馄饨|烧烤|小吃|粥铺/.test(context)?['餐饮',mealCategory]:undefined)
  const confidence = Math.min(0.99, (amount != null ? (amountLine ? 0.48 : 0.36) : 0) + (happenedAt ? 0.2 : 0) + (merchant ? 0.18 : 0) + (paymentMethod ? 0.1 : 0) + (categoryPath ? 0.04 : 0))
  return { id: crypto.randomUUID(), title: normalizeOcrName(enterpriseMeal ? merchant || title : title), amount: amount ?? undefined, kind: enterpriseMeal?'expense':kind, happenedAt, merchant: merchant ? normalizeOcrName(merchant) : undefined, paymentMethod: enterpriseMeal?'公司补贴':paymentMethod ? normalizeOcrName(paymentMethod) : undefined, confidence, rawText, details: enterpriseMeal?[{label:'识别场景',value:'大象 / 美团企业工作餐'},...details]:details, categoryPath, categoryKeyword: categoryPath?.[1], originalAmount, discountAmount, source: 'ocr', ...(enterpriseMeal?{presetKey:'meituan_enterprise_meal' as const,offsetEnabled:true,offsetRatio:100}:{}) }
}

export function parseReceiptTextBatch(rawText: string): ImportCandidate[] {
  const normalized=normalizeOcrText(rawText)
  const lines=normalized.replace(/[−－—]/g,'-').split(/\r?\n/).map(line=>line.trim()).filter(Boolean)
  const receipt = parseReceiptText(rawText)
  if(receipt.presetKey)return [receipt]
  if(/交易详情|账单详情|微信支付账单详情|消费记录详情|订单详情/.test(normalized))return [parseReceiptText(rawText)]
  if(/我的订单|全部订单|待收货\/待使用/.test(normalized) && /下单|订单时间|实付款|实付/.test(normalized)) {
    const orders = parseMeituanOrderList(lines)
    if (orders.length) return orders
  }
  // A screenshot is one receipt by default. Splitting on every OCR'd amount
  // mistakes original price, discount, card balance, and dates for extra rows.
  // Multi-order extraction is reserved for an explicitly recognized order list.
  return [receipt]
}

export interface OcrProgress {
  status: string
  progress?: number
}

async function makeEnhancedImage(file: File): Promise<Blob | null> {
  try {
    const bitmap = await createImageBitmap(file)
    const scale = Math.min(2.2, Math.max(1.4, 1800 / Math.max(bitmap.width, bitmap.height)))
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(bitmap.width * scale)
    canvas.height = Math.round(bitmap.height * scale)
    const context = canvas.getContext('2d', { willReadFrequently: true })
    if (!context) { bitmap.close(); return null }
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
    bitmap.close()
    const image = context.getImageData(0, 0, canvas.width, canvas.height)
    const data = image.data
    for (let i = 0; i < data.length; i += 4) {
      const gray = data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114
      // Mild contrast keeps thin Chinese glyph strokes while improving pale receipt print.
      const enhanced = Math.max(0, Math.min(255, (gray - 128) * 1.28 + 128))
      data[i] = data[i + 1] = data[i + 2] = enhanced
    }
    context.putImageData(image, 0, 0)
    return await new Promise(resolve => canvas.toBlob(resolve, 'image/png'))
  } catch { return null }
}

function candidateQuality(candidates: ImportCandidate[]): number {
  if (!candidates.length) return 0
  return candidates.reduce((sum, candidate) => sum + candidate.confidence + (candidate.amount ? 0.15 : 0) + (candidate.happenedAt ? 0.08 : 0) + (candidate.merchant ? 0.05 : 0), 0) / candidates.length
}

export async function recognizeImage(file: File, onProgress?: (progress: OcrProgress) => void): Promise<ImportCandidate[]> {
  const worker = await createWorker('chi_sim+eng', 1, {
    workerPath: '/tesseract/worker.min.js',
    corePath: '/tesseract/tesseract-core-simd-lstm.wasm.js',
    langPath: '/tesseract/lang',
    logger: event => onProgress?.({ status: event.status, progress: event.progress }),
  })
  try {
    onProgress?.({ status: '正在增强图片清晰度', progress: 0 })
    const enhanced = await makeEnhancedImage(file)
    onProgress?.({ status: '正在识别原图', progress: 0.08 })
    await worker.setParameters({ tessedit_pageseg_mode: PSM.AUTO, preserve_interword_spaces: '0' })
    const originalResult = await worker.recognize(file)
    const originalCandidates = [parseReceiptText(originalResult.data.text)]
    if (!enhanced) return originalCandidates
    onProgress?.({ status: '正在识别增强图片并校对结果', progress: 0.52 })
    // A single-column pass works better for long mobile payment screenshots and receipts.
    await worker.setParameters({ tessedit_pageseg_mode: PSM.SINGLE_COLUMN })
    const enhancedResult = await worker.recognize(enhanced)
    const enhancedCandidates = [parseReceiptText(enhancedResult.data.text)]
    return candidateQuality(enhancedCandidates) >= candidateQuality(originalCandidates) ? enhancedCandidates : originalCandidates
  } finally { await worker.terminate() }
}

function candidateFromRow(row: Record<string, unknown>): ImportCandidate | null {
  const entries=Object.entries(row).map(([key,value])=>[normalizeOcrText(key).replace(/\s+/g,''),value] as const)
  const cell=(value:unknown)=>value instanceof Date?value.toISOString():String(value??'').trim()
  const field=(pattern:RegExp)=>entries.find(([key,value])=>pattern.test(key)&&cell(value)!=='')?.[1]
  const amountEntry=entries.find(([key,value])=>/^(?:实付金额|实际支付|交易金额|收支金额|支出金额|收入金额|金额)(?:[（(]?元[）)]?)?$/.test(key)&&parseAmount(cell(value))!==null)
  const amountValue=amountEntry?.[1]
  const amount=amountValue==null?null:parseAmount(cell(amountValue))
  if(!amount)return null
  const rawText=entries.map(([key,value])=>`${key}：${cell(value)}`).join('\n')
  const candidate=parseReceiptText(rawText)
  const direction=cell(field(/^(?:收支|收\/支|收支类型|交易方向|资金方向|类型)$/))
  const title=cell(field(/^(?:商品名称|商品说明|商品|标题|名称|交易对方|商户名称|商户|收款方)$/))
  const date=field(/^(?:交易时间|支付时间|付款时间|订单时间|交易日期|日期|时间)$/)
  const channel=cell(field(/^(?:支付方式|支付渠道|付款方式|收付款方式)$/))
  candidate.amount=amount
  if(/支出|转出/.test(direction)||amountEntry?.[0].startsWith('支出')||Number(cell(amountValue).replace(/[¥￥,]/g,''))<0)candidate.kind='expense'
  else if(/收入|转入/.test(direction)||amountEntry?.[0].startsWith('收入'))candidate.kind='income'
  if(title)candidate.title=normalizeOcrName(title)
  if(date instanceof Date)candidate.happenedAt=date.toISOString()
  else if(date)candidate.happenedAt=parseDate(cell(date))||candidate.happenedAt
  if(channel)candidate.paymentMethod=normalizeOcrName(channel)
  candidate.note=cell(field(/^(?:备注|说明)$/))
  candidate.confidence=Math.max(candidate.confidence||0,0.7)
  return candidate
}

function candidatesFromTable(rows: unknown[][], sheet?: string): ImportCandidate[] {
  const headerIndex=rows.findIndex(row=>row.some(value=>/^(?:实付金额|实际支付|交易金额|收支金额|支出金额|收入金额|金额)(?:[（(]?元[）)]?)?$/.test(normalizeOcrText(String(value??'')).replace(/\s+/g,''))))
  if(headerIndex<0)return []
  const headers=rows[headerIndex].map((value,index)=>String(value??`列${index+1}`))
  return rows.slice(headerIndex+1).flatMap((values,index)=>{
    const item=candidateFromRow(Object.fromEntries(headers.map((header,column)=>[header,values[column]??''])))
    return item?[{...item,sourceRow:headerIndex+index+2,sourceSheet:sheet}]:[]
  })
}

function pdfPageText(items: Array<unknown>): string {
  const lines:Array<{y:number;items:Array<{x:number;text:string}>}>=[]
  for(const item of items){
    if(!item||typeof item!=='object'||!('str' in item)||!('transform' in item))continue
    const value=item as {str:string;transform:number[]}
    const y=value.transform[5],x=value.transform[4]
    let line=lines.find(line=>Math.abs(line.y-y)<3)
    if(!line){line={y,items:[]};lines.push(line)}
    line.items.push({x,text:value.str})
  }
  return lines.sort((a,b)=>b.y-a.y).map(line=>line.items.sort((a,b)=>a.x-b.x).map(item=>item.text).join(' ')).join('\n')
}

export async function parseBillFile(file: File, onProgress?: (progress: OcrProgress) => void): Promise<ImportCandidate[]> {
  const extension=file.name.split('.').pop()?.toLowerCase()
  if(extension==='txt'||extension==='csv'){
    const content=await readBillText(file)
    return extension==='txt'?parseReceiptTextBatch(content).filter(item=>item.amount!=null):candidatesFromTable(parseCsv(content))
  }
  if(extension==='xlsx'){
    const sheets=await readXlsxFile(file)
    return sheets.flatMap(sheet=>candidatesFromTable(sheet.data,sheet.sheet))
  }
  if(extension==='pdf'||file.type==='application/pdf'){
    const pdfjs=await loadPdfJs()
    const loadingTask=pdfjs.getDocument({...pdfOptions,data:await file.arrayBuffer()})
    try{
      const pdfDocument=await loadingTask.promise
      const candidates:ImportCandidate[]=[]
      for(let pageNumber=1;pageNumber<=pdfDocument.numPages;pageNumber++){
        onProgress?.({status:`正在读取 PDF 第 ${pageNumber} / ${pdfDocument.numPages} 页`})
        const page=await pdfDocument.getPage(pageNumber)
        const content=await page.getTextContent()
        const text=pdfPageText(content.items)
        let rows:ImportCandidate[]=[]
        if(text.trim())rows=parseReceiptTextBatch(text).filter(item=>item.amount!=null)
        else{
          const viewport=page.getViewport({scale:1.8}),canvas=document.createElement('canvas')
          canvas.width=viewport.width;canvas.height=viewport.height
          const context=canvas.getContext('2d')
          if(context){
            await page.render({canvas,canvasContext:context,viewport}).promise
            const blob=await new Promise<Blob|null>(resolve=>canvas.toBlob(resolve,'image/png'))
            if(blob)rows=await recognizeImage(new File([blob],`page-${pageNumber}.png`,{type:'image/png'}),onProgress)
          }
          canvas.width=canvas.height=0
        }
        candidates.push(...rows.map(item=>({...item,sourcePage:pageNumber})))
        page.cleanup()
      }
      return candidates
    }finally{await loadingTask.destroy()}
  }
  if(file.type.startsWith('image/')||/^(png|jpe?g|webp|gif|bmp|tiff?|avif)$/.test(extension||''))return await recognizeImage(file,onProgress)
  throw new Error('支持 PNG/JPG 等图片、CSV、TXT、XLSX 和 PDF；旧版 XLS 请先另存为 XLSX')
}

export function confirmCandidate(candidate: ImportCandidate, defaults: { currency?: string; categoryId?: string | null; bookIds?: string[] }): Transaction {
  if (!candidate.title?.trim() || !candidate.amount || candidate.amount <= 0) throw new Error('请补全识别候选的名称和金额后再确认')
  return {
    id: crypto.randomUUID(), title: candidate.title.trim(), amount: candidate.amount,
    kind: candidate.kind || 'expense', happenedAt: candidate.happenedAt || new Date().toISOString(),
    note: '', merchant: candidate.merchant || '', paymentMethod: candidate.paymentMethod || '', source: 'ocr',
    currency: defaults.currency || 'CNY', categoryId: defaults.categoryId || candidate.categoryId || null,
    bookIds: defaults.bookIds || [], installmentGroupId: null, installmentIndex: null, installmentMonths: null,
    installmentOriginalTotal: null, originalAmount: candidate.originalAmount ?? null, discountAmount: candidate.discountAmount ?? null, premiumAmount: candidate.premiumAmount ?? null,
    paidByParticipantId: null, splitParticipantIds: [], includeInStatistics: true,
  }
}
