import type { ImportCandidate } from './importers'
import { normalizeOcrName } from './ocrText'
import { normalizePaymentChannel } from './paymentChannels'
import { normalizeReceiptText } from './receiptLayout'

export type ReceiptBox = { x0: number; y0: number; x1: number; y1: number }
export type ReceiptRow = { text: string; bbox: ReceiptBox }
type Field = 'amount' | 'date' | 'merchant' | 'channel' | 'original' | 'discount' | 'premium' | 'subsidy'
export interface OcrFieldIssue {
  field: Field
  message: string
  region?: ReceiptBox
}

const labels: ReadonlyArray<[Field, RegExp]> = [
  ['amount', /^(?:实际支付(?:金额)?|本次支付(?:金额)?|实付(?:款)?(?:金额)?|实收(?:金额)?|付款金额|支付金额|交易金额|收入金额|支出金额)/],
  ['date', /^(?:支付时间|交易时间|订单时间|下单时间|付款时间|转账时间|消费时间)/],
  ['merchant', /^(?:消费商家|商户名称|商家名称|商户全称|商户(?!单号|订单号)|商家(?!单号|订单号)|店铺名称|收款方全称)/],
  ['channel', /^(?:付款方式|支付方式|支付渠道|付款渠道)/],
  ['original', /^(?:原价|原始金额|订单金额)/],
  ['discount', /^(?:优惠金额|优惠合计|共优惠|总优惠)/],
  ['premium', /^(?:溢价金额|加价金额)/],
  ['subsidy', /^(?:业务场景|企业支付|公司补贴)/],
]

function cents(value: string) {
  const match = value.match(/^[+-]?\s*[¥￥$]?\s*((?:\d{1,8}|\d{1,3}(?:,\d{3}){1,2})(?:\.\d{1,2})?)\s*元?$/)
  return match ? Math.round(Number(match[1]!.replaceAll(',', '')) * 100) : undefined
}

const centre = (box: ReceiptBox) => (box.y0 + box.y1) / 2
const height = (box: ReceiptBox) => box.y1 - box.y0
const union = (a: ReceiptBox, b: ReceiptBox): ReceiptBox => ({
  x0: Math.min(a.x0, b.x0), y0: Math.min(a.y0, b.y0), x1: Math.max(a.x1, b.x1), y1: Math.max(a.y1, b.y1),
})

function readValue(field: Field, text: string): string | number | undefined {
  if (field === 'channel') return normalizePaymentChannel(text)
  if (field === 'date') return /20\d{2}\s*[-年/.]\s*\d{1,2}\s*[-月/.]\s*\d{1,2}\s*日?\s+\d{1,2}\s*[:：]\s*\d{2}/.test(text) ? text : undefined
  if (field === 'merchant') {
    return /[\p{Script=Han}A-Za-z]/u.test(text) && !/[*＊]|^(?:交易成功|已支付|支付成功|收钱码收款)$/.test(text)
      && !labels.some(([, label]) => label.test(text)) ? normalizeOcrName(text) : undefined
  }
  return field === 'subsidy' ? undefined : cents(text)
}

export function inspectReceiptRows(passes: ReceiptRow[][]) {
  const observed = new Map<Field, Array<{ value: string | number; region: ReceiptBox; rank?: number }>>()
  const regions = new Map<Field, ReceiptBox>()
  let unreadAmountLabel: ReceiptBox | undefined
  for (const pass of passes) {
    const rows = pass.map(row => ({ ...row, text: normalizeReceiptText(row.text) }))
    for (const row of rows) {
      const entry = labels.find(([, label]) => label.test(row.text))
      if (!entry) continue
      const [field, label] = entry
      if (!regions.has(field)) regions.set(field, row.bbox)
      const inline = row.text.replace(label, '').replace(/^\s*[:：]\s*/, '').trim()
      let value = readValue(field, inline), valueBox: ReceiptBox | undefined
      if (!inline) {
        // A separate OCR box only belongs to this label when it is beside it
        // on the same physical row, before any other box.
        const right = rows.filter(other => other.bbox.x0 >= row.bbox.x1
          && Math.abs(centre(row.bbox) - centre(other.bbox)) <= Math.min(height(row.bbox), height(other.bbox)) * .45)
          .sort((a, b) => a.bbox.x0 - b.bbox.x0)[0]
        if (right) {
          value = readValue(field, right.text)
          valueBox = right.bbox
        } else if (field === 'amount') {
          unreadAmountLabel ??= row.bbox
        }
      }
      if (value == null) continue
      const region = valueBox ? union(row.bbox, valueBox) : row.bbox
      const values = observed.get(field) ?? []
      const rank = field === 'date' ? (/^(?:支付时间|付款时间|转账时间)/.test(row.text) ? 2 : /^(?:交易时间|订单时间|下单时间)/.test(row.text) ? 1 : 0) : undefined
      values.push({ value, region, rank })
      observed.set(field, values)
      regions.set(field, region)
    }
  }
  return { observed, regions, unreadAmountLabel }
}

type ReceiptEvidence = ReturnType<typeof inspectReceiptRows>

export function applyReceiptEvidence(
  candidate: ImportCandidate, evidence: ReceiptEvidence, parseDate: (text: string) => string | undefined,
) {
  const { observed, regions } = evidence
  const issues: OcrFieldIssue[] = []
  function flag(field: Field, message: string) {
    issues.push({ field, message, region: regions.get(field) })
  }
  const values = (field: Field) => [...new Set(observed.get(field)?.map(item => item.value) ?? [])]
  const [amount, otherAmount] = values('amount') as number[]
  if (otherAmount != null || (amount != null && candidate.amount && amount !== Math.round(candidate.amount * 100))) {
    candidate.amount = undefined
    const amounts = observed.get('amount')!
    regions.set('amount', amounts.map(item => item.region).reduce(union))
    flag('amount', '实付金额的识别结果不一致，请核对后填写。')
  } else if (!candidate.amount && amount != null && amount > 0) {
    candidate.amount = amount / 100
  }
  if (!candidate.amount && !issues.length) flag('amount', '未能确认实付金额。')

  const [merchant, otherMerchant] = values('merchant') as string[]
  if (!candidate.merchant && merchant && !otherMerchant) {
    candidate.merchant = merchant
    if (!candidate.title || /^(?:识别流水|支付宝账单)$/.test(candidate.title)) candidate.title = merchant
  }
  if (otherMerchant) flag('merchant', '商户名称的识别结果不一致。')
  else if (!candidate.merchant) flag('merchant', '未能确认商户名称。')

  const [channel, otherChannel] = values('channel') as string[]
  if (!candidate.presetKey && otherChannel) {
    candidate.paymentMethod = undefined
    flag('channel', '支付渠道的识别结果不一致。')
  } else if (!candidate.presetKey && channel && (!candidate.paymentMethod || candidate.paymentMethodNeedsReview)) {
    candidate.paymentMethod = channel
    candidate.paymentMethodNeedsReview = false
  }
  if (!candidate.paymentMethod && !otherChannel) flag('channel', '未能确认支付渠道。')

  const dated = observed.get('date') ?? []
  const dateRank = Math.max(...dated.map(item => item.rank ?? 0))
  const dateReads = dated.filter(item => item.rank === dateRank)
  const dates = [...new Set(dateReads.map(item => parseDate(String(item.value))).filter(Boolean))]
  if (dates.length > 1) {
    regions.set('date', dateReads[0]!.region)
    flag('date', '账单上读到了不同的时间，请核对订单时间。')
  } else if (!candidate.happenedAt) {
    candidate.happenedAt = dates[0]
    if (!candidate.happenedAt) flag('date', '未能确认订单时间。')
  }

  // Check independently read values. The parser may have calculated a
  // discount by subtraction, which cannot cross-check the paid amount.
  const [original] = values('original')
  const [discount] = values('discount')
  const [premium] = values('premium')
  if (candidate.amount && typeof original === 'number' && typeof discount === 'number'
      && values('original').length === 1 && values('discount').length === 1 && values('premium').length <= 1
      && original - discount + Number(premium ?? 0) !== Math.round(candidate.amount * 100)) {
    flag('discount', '原价、优惠与实付金额未能核对一致，请检查补充信息。')
  }
  if (candidate.enterpriseMealNeedsReview && !candidate.offsetEnabled) flag('subsidy', '企业订单的工作餐场景待核对。')
  candidate.ocrIssues = issues
}
