import { describe, expect, it } from 'vitest'
import { parseReceiptText } from './importers'
import { applyReceiptEvidence, inspectReceiptRows, type ReceiptRow } from './receiptEvidence'

function row(text: string, x0: number, y0: number, x1: number): ReceiptRow {
  return { text, bbox: { x0, y0, x1, y1: y0 + 20 } }
}

describe('receipt evidence by field', () => {
  it('pairs separate value boxes horizontally and ignores unrelated numbers below', () => {
    const candidate = parseReceiptText('识别流水')
    const evidence = inspectReceiptRows([[
      row('实付金额', 12, 50, 100), row('订单号', 12, 85, 100),
      row('2026101012345600000', 240, 85, 420), row('¥12.80', 250, 51, 310),
      row('支付方式', 12, 120, 100), row('花呗', 260, 122, 310),
      row('商户名称 合成商铺', 12, 150, 230),
    ]])
    applyReceiptEvidence(candidate, evidence, () => undefined)
    expect(candidate).toMatchObject({ amount: 12.8, paymentMethod: '花呗', merchant: '合成商铺' })
    expect(candidate.ocrIssues?.map(issue => issue.field)).toEqual(['date'])
  })

  it('leaves competing paid amounts blank and exposes the source box', () => {
    const candidate = parseReceiptText('实付金额 ¥9.50')
    const evidence = inspectReceiptRows([
      [row('实付金额 ¥9.50', 12, 20, 210)],
      [row('实付金额 ¥8.50', 14, 22, 220)],
    ])
    applyReceiptEvidence(candidate, evidence, () => undefined)
    expect(candidate.amount).toBeUndefined()
    expect(candidate.ocrIssues?.[0]).toMatchObject({ field: 'amount', region: { x0: 12, y0: 20, x1: 220, y1: 42 } })
  })

  it('flags independent arithmetic mismatches without changing a read amount', () => {
    const candidate = parseReceiptText('实付金额 ¥12.80')
    const evidence = inspectReceiptRows([[
      row('实付金额 ¥12.80', 12, 20, 210),
      row('原价 ¥16.00', 12, 50, 200),
      row('优惠金额 ¥2.00', 12, 80, 210),
    ]])
    applyReceiptEvidence(candidate, evidence, () => undefined)
    expect(candidate.amount).toBe(12.8)
    expect(candidate.ocrIssues?.find(issue => issue.field === 'discount')).toBeDefined()
  })

  it('does not confuse a payment timestamp with the consumption time', () => {
    const candidate = parseReceiptText('识别流水')
    applyReceiptEvidence(candidate, inspectReceiptRows([[
      row('消费时间 2026-01-10 10:05:00', 12, 80, 400),
      row('支付时间 2026-01-10 10:08:00', 12, 110, 400),
    ]]), text => text)
    expect(candidate.happenedAt).toBe('2026-01-10 10:08:00')
    expect(candidate.ocrIssues?.some(issue => issue.field === 'date')).toBe(false)
  })
})
