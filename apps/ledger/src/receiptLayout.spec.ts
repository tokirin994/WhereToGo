import {describe,it,expect} from 'vitest'
import {parseReceiptText} from './importers'
import {normalizeReceiptText,parseWeChatDetail} from './receiptLayout'
import {normalizePaymentChannel} from './paymentChannels'

// Synthetic fixtures only: private screenshot text and images are not committed.
describe('payment receipt layout regression',()=>{
  it('uses the WeChat header instead of a remark or footer as the title',()=>{
    const parsed=parseReceiptText('账单\n扫二维码付款-给合成商户\n-8.37\n当前状态 支付成功\n收款方备注 二维码收款\n支付方式 合成银行储蓄卡(9876)\n转账时间 2025年6月7日 10:11:12\n转账单号 1234567890\n账单服务\n收款方服务')
    expect(parsed).toMatchObject({title:'扫二维码付款-给合成商户',merchant:'合成商户',amount:8.37,kind:'expense',paymentMethod:'合成银行储蓄卡(9876)'})
    expect(parsed.happenedAt).toBe(new Date(2025,5,7,10,11,12).toISOString())
  })
  it('recognizes WeChat without an OCR-readable page title',()=>{
    const parsed=parseReceiptText('扫二维码付款-给合成商户\n-11.25\n当前状态 支付成功\n支付方式 合成银行储著卡(9876)\n转账时间 2025-06-07 10:11:12\n转账单号 1234567890')
    expect(parsed).toMatchObject({title:'扫二维码付款-给合成商户',amount:11.25,paymentMethod:'合成银行储蓄卡(9876)'})
  })
  it('does not convert a zero OCR amount or transaction ID into an expense',()=>{
    const parsed=parseWeChatDetail(['扫二维码付款-给合成商户','-0.00','当前状态 支付成功','支付方式 余额','转账单号 1234567890'])
    expect(parsed?.amount).toBeUndefined()
  })
  it('preserves the direction of incoming WeChat transfers',()=>{
    const parsed=parseWeChatDetail(['合成好友','+18.25','当前状态 收款成功','支付方式 零钱','转账时间 2025-06-07 10:11:12'])
    expect(parsed).toMatchObject({amount:18.25,kind:'income'})
  })
  it('corrects labels using adjacent values and prefers payment over consumption time',()=>{
    const parsed=parseReceiptText('账辕详情\n合成零售公司\n-12.40\n自动扣款成功\n文付时间 2025-06-07 10:11:12\n付款万陈 合成银行信用卡(9876)\n商品说明 矿泉水 消费时间:2025-06-07 10:00:00')
    expect(parsed).toMatchObject({title:'合成零售公司',amount:12.4,paymentMethod:'合成银行信用卡(9876)'})
    expect(parsed.happenedAt).toBe(new Date(2025,5,7,10,11,12).toISOString())
  })
  it('does not rewrite an unrecognized payment value based on prefix alone',()=>{
    expect(normalizeReceiptText('付款万陈 未知内容')).toBe('付款万陈未知内容')
    expect(normalizePaymentChannel('合成银行储著卡(9876)')).toBe('合成银行储蓄卡(9876)')
    expect(normalizePaymentChannel('伦中')).toBeUndefined()
  })
  it('keeps original price out of the paid amount when the header is absent',()=>{
    const parsed=parseReceiptText('账单详情\n商品说明 收钱码收款\n订单金额 17.00\n支付方式 花呗')
    expect(parsed.amount).toBeUndefined()
    expect(parsed.originalAmount).toBe(17)
  })
})
