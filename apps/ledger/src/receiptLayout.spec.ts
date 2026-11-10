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
  it('uses the displayed Alipay merchant instead of a masked personal payee',()=>{
    const bill='账单详情\n合成餐馆\n-6.73\n交易成功\n订单金额 8.00\n收款方全称 **张(个人)\n付款方式 花呗'
    expect(parseReceiptText(bill)).toMatchObject({title:'合成餐馆',merchant:'合成餐馆',amount:6.73})
  })
  it('recovers the paid amount from one signed Alipay discount when the header is absent',()=>{
    const bill = '账单详情\n交易成功\n订单金额 8.00\n支付遇财神 -1.27\n付款方式 花呗'
    expect(parseReceiptText(bill)).toMatchObject({amount:6.73,originalAmount:8,discountAmount:1.27,paymentMethod:'花呗'})
    expect(parseReceiptText(bill.replace('交易成功', '-6.50\n交易成功')).amount).toBe(6.50)
    expect(parseReceiptText(bill.replace('-1.27', '1.27')).amount).toBeUndefined()
    expect(parseReceiptText(bill+'\n优惠 -0.25').amount).toBeUndefined()
  })
  it('recognizes a paid Meituan work meal when OCR omits the left-hand labels',()=>{
    const bill = 'X企业版\n已支付\n¥18.25\n【开票信息】该订单为企业订单，发票由美团统一收取\n2025-06-07 12:13:14\n1234567890123456\n合成 餐馆(示例店)\n工作 餐'
    expect(parseReceiptText(bill)).toMatchObject({
      title:'合成餐馆(示例店)',merchant:'合成餐馆(示例店)',amount:18.25,
      paymentMethod:'公司补贴',offsetEnabled:true,offsetRatio:100,
    })
    expect(parseReceiptText(bill.replace('工作 餐', '个人用餐')).offsetEnabled).toBeUndefined()
    expect(parseReceiptText(bill.replace('2025-06-07', '2025 / 06 / 07').replace('1234567890123456', '12345678 90123456')).offsetRatio).toBe(100)
    const missedOrderId=bill.replace('1234567890123456\n','')
    expect(parseReceiptText(missedOrderId)).toMatchObject({paymentMethod:'公司补贴',offsetRatio:100})
    const unclear=parseReceiptText(missedOrderId.replace('工作 餐','THRE'))
    expect(unclear.enterpriseMealNeedsReview).toBe(true)
    expect(unclear.offsetEnabled).toBeUndefined()
  })
})
