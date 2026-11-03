import { normalizeOcrName } from './ocrText'

/** Normalize text read from the payment field, never infer from the whole bill. */
export function normalizePaymentChannel(value?: string): string | undefined {
  let text = normalizeOcrName(value).replace(/^(?:付款方式|支付方式|支付渠道|付款渠道)\s*[:：]?/, '').replace(/[>＞⌄∨▽﹀]+/g, '').trim()
  for (const [from, to] of [['花唄','花呗'],['銀行','银行'],['儲蓄','储蓄'],['中國','中国'],['郵政','邮政'],['餘額','余额'],['餘額寶','余额宝'],['零錢','零钱'],['雲閃付','云闪付'],['數字人民幣','数字人民币']]) text = text.replaceAll(from!, to!)
  // A bank/card description may contain an account suffix. Preserve all of it.
  if (/银行/.test(text)) text = text.replace(/储[著蓄薯]卡/g, '储蓄卡')
  if (/银行|信用卡|储蓄卡|借记卡|银行卡/.test(text)) return text
  if (/微信零钱通/.test(text)) return '微信零钱通'
  if (/微信零钱/.test(text)) return '微信零钱'
  if (/余额宝/.test(text)) return '余额宝'
  if (/支付宝余额/.test(text)) return '支付宝余额'
  if (/花呗/.test(text)) return '花呗'
  if (/云闪付/.test(text)) return '云闪付'
  if (/微信支付/.test(text)) return '微信支付'
  if (/数字人民币/.test(text)) return '数字人民币'
  if (/^(?:余额|零钱通|零钱|支付宝|银联|现金|先用后付|芝麻信用)$/.test(text)) return text
  return undefined
}
