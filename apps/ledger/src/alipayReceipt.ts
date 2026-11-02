import type { ImportCandidate } from './importers'
import { normalizeOcrName } from './ocrText'

// Keep the compact Alipay bill separate from generic receipts: its header is
// the paid amount, while “订单金额” and “商品说明” have different meanings.
const labels = ['收款方全称', '收款方全名', '商户全称', '支付时间', '交易时间', '付款时间', '付款方式', '支付方式', '支付渠道', '商品说明', '商品名称', '订单金额', '原价', '当前状态', '扣款说明', '交易单号', '商户单号', '订单号', '支付奖励', '服务推荐', '账单管理', '账单分类', '标签', '更多']
const benefit = /^(?:优惠|支付遇财神|遇财神|支付优惠|银行卡优惠|红包优惠|银行卡立减|红包|立减|摇优惠|折扣)/
const promotion = /积分|领取|最高|推荐|开通|贴纸|兑换|可享|待领取/
const moneyOnly = /^[+\-]?\s*[¥￥$]?\s*\d[\d,]*(?:\.\d{1,2})?\s*(?:元)?$/
const clean = (value: string) => value.replace(/[⌄∨▽﹀>＞]+/g, '').trim()
const fieldLabel = (line: string) => labels.find(label => line.startsWith(label))
const money = (value: string | undefined): number | undefined => {
  if (!value) return undefined
  const match = clean(value).match(/^[+\-]?\s*[¥￥$]?\s*(\d[\d,]*(?:\.\d{1,2})?)\s*(?:元)?$/)
  if (!match) return undefined
  const amount = Number(match[1]!.replaceAll(',', ''))
  return Number.isFinite(amount) ? amount : undefined
}

export function parseAlipayDetail(lines: string[], happenedAt?: string): Partial<ImportCandidate> | null {
  if (!lines.some(line => /账单详情/.test(line)) || !lines.some(line => /付款方式|商品说明|收款方全称|支付遇财神/.test(line))) return null
  const fields = new Map<string, string>()
  for (let index = 0; index < lines.length; index++) {
    const label = fieldLabel(lines[index]!)
    if (!label) continue
    const inline = clean(lines[index]!.slice(label.length).replace(/^\s*[:：]\s*/, ''))
    if (inline) { fields.set(label, inline); continue }
    // OCR may read a whole column of labels before the corresponding values.
    const group = [label]
    let cursor = index + 1
    while (cursor < lines.length && labels.includes(lines[cursor]!)) group.push(lines[cursor++]!)
    for (const key of group) {
      const value = lines[cursor]
      if (!value || fieldLabel(value) || benefit.test(value) || promotion.test(value)) break
      fields.set(key, clean(value)); cursor++
    }
    index += group.length - 1
  }
  const firstField = lines.findIndex(line => Boolean(fieldLabel(line)) || benefit.test(line))
  const header = lines.slice(0, firstField < 0 ? lines.length : firstField)
  const amountIndex = header.findIndex(line => moneyOnly.test(line) && /^[+\-¥￥$]/.test(line))
  const amountLine = amountIndex < 0 ? undefined : header[amountIndex]
  const amount = money(amountLine) ?? (lines.some(line => benefit.test(line)) ? undefined : money(fields.get('订单金额')))
  const title = amountIndex < 0 ? undefined : [...header.slice(0, amountIndex)].reverse().find(line =>
    /[\p{Script=Han}A-Za-z]/u.test(line) && !/账单详情|交易详情|支付宝|交易成功|支付成功|已完成|\d{1,2}:\d{2}|5G|4G|LTE/.test(line) && !promotion.test(line))
  const merchant = fields.get('收款方全称') || fields.get('收款方全名') || fields.get('商户全称') || title
  const product = fields.get('商品名称') || fields.get('商品说明')
  const paymentMethod = fields.get('付款方式') || fields.get('支付方式') || fields.get('支付渠道')
  const paymentMethodNeedsReview = !paymentMethod || !/花呗|余额|零钱|银行|信用卡|储蓄卡|借记卡|数字人民币|先用后付|芝麻信用|支付宝|网联|银联|现金/.test(paymentMethod)
  const originalAmount = money(fields.get('原价')) ?? money(fields.get('订单金额'))
  const discounts: Array<{ label: string; value: string; amount: number }> = []
  const footer = lines.findIndex(line => /^(?:服务推荐|账单管理)/.test(line))
  for (let index = 0; index < (footer < 0 ? lines.length : footer); index++) {
    const line = lines[index]!
    if (!benefit.test(line) || promotion.test(line)) continue
    const match = line.match(/^(.*?)[\s:：]*([+\-]?\s*[¥￥$]?\s*\d[\d,]*\.\d{1,2}\s*(?:元)?)$/)
    const next = lines[index + 1]
    const value = match?.[2] || (next && moneyOnly.test(next) ? next : undefined)
    const amount = money(value)
    if (value && amount != null) discounts.push({ label: clean(match?.[1] || line), value: clean(value), amount })
  }
  const totalDiscount = discounts.find(item => /^(?:优惠|支付优惠|优惠金额|共优惠|已优惠)$/.test(item.label))
  const explicitDiscount = totalDiscount?.amount ?? (discounts.length ? Math.round(discounts.reduce((sum, item) => sum + item.amount, 0) * 100) / 100 : undefined)
  const difference = originalAmount != null && amount != null && originalAmount >= amount ? Math.round((originalAmount - amount) * 100) / 100 : undefined
  const discountAmount = difference != null && explicitDiscount != null && explicitDiscount > difference ? difference : explicitDiscount ?? difference
  const details: ImportCandidate['details'] = []
  const dateValue = fields.get('支付时间') || fields.get('交易时间') || fields.get('付款时间')
  if (dateValue || happenedAt) details.push({ label: '支付时间', value: dateValue || new Date(happenedAt!).toLocaleString('zh-CN', { hour12: false }) })
  if (paymentMethod) details.push({ label: paymentMethodNeedsReview ? '付款方式（待核对）' : '付款方式', value: normalizeOcrName(paymentMethod) })
  const deductionIndex = lines.findIndex(line => /先用后付|芝麻分/.test(line))
  const deductionLines: string[] = []
  if (deductionIndex >= 0) for (const line of lines.slice(deductionIndex, deductionIndex + 3)) {
    if (deductionLines.length && (fieldLabel(line) || benefit.test(line) || promotion.test(line))) break
    deductionLines.push(line)
  }
  const deduction = fields.get('扣款说明') || deductionLines.join('')
  if (deduction) details.push({ label: '扣款说明', value: deduction })
  if (product) details.push({ label: '商品说明', value: product })
  if (discounts.length) details.push({ label: '优惠说明', value: discounts.map(item => `${item.label} ${item.value}`).join('；') })
  return {
    title: normalizeOcrName(title || (product && !/^(?:收钱码收款|二维码收款|商家收款|扫码支付)$/.test(product) ? product : merchant) || '支付宝账单'),
    merchant: merchant ? normalizeOcrName(merchant) : undefined,
    amount, paymentMethod: paymentMethod && !paymentMethodNeedsReview ? normalizeOcrName(paymentMethod) : undefined, paymentMethodNeedsReview,
    kind: amountLine?.startsWith('+') || /退款成功|退款入账/.test(lines.join('\n')) ? 'income' : 'expense',
    originalAmount, discountAmount: discountAmount || undefined, details,
  }
}
