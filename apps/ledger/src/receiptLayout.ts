import { normalizeOcrText } from './ocrText'
import { normalizePaymentChannel } from './paymentChannels'

/** Correct field-label OCR only when the adjacent value has the expected shape. */
export function normalizeReceiptText(value: string): string {
  return normalizeOcrText(value).replace(/[−－—﹣‑]/g, '-').split('\n').map(line => {
    line = line.replace(/^[<《〈＞>]\s*/, '')
    if (/^账.详情$/.test(line)) return '账单详情'
    if (/^[支文]付时间(?=\s|[:：]|20\d{2})/.test(line)) return line.replace(/^[支文]付时间/, '支付时间')
    if (/^(?:付款|支付).{2}/.test(line) && normalizePaymentChannel(line.slice(4).replace(/^[:：]/, ''))) return '支付方式 ' + line.slice(4).replace(/^[:：]/, '')
    return line
  }).join('\n')
}

export function isWeChatDetail(lines: string[]): boolean {
  const text = lines.join('\n')
  return /转账时间|转账单号/.test(text) && /支付方式|付款方式/.test(text) && /当前状态|二维码付款|零钱明细/.test(text)
}

export function parseWeChatDetail(lines: string[]) {
  if (!isWeChatDetail(lines)) return null
  const labels = ['当前状态', '收款方备注', '收款方全称', '支付方式', '付款方式', '转账时间', '转账单号', '零钱余额', '账单服务', '收款方服务']
  const fields = new Map<string,string>()
  for (let index=0;index<lines.length;index++) {
    const label=labels.find(label=>lines[index]!.startsWith(label))
    if (!label) continue
    const inline=lines[index]!.slice(label.length).replace(/^\s*[:：]?\s*/,'')
    const next=lines[index+1]
    if(inline)fields.set(label,inline)
    else if(next&&!labels.some(label=>next.startsWith(label)))fields.set(label,next)
  }
  const boundary=lines.findIndex(line=>labels.some(label=>line.startsWith(label)))
  const header=lines.slice(0,boundary<0?lines.length:boundary)
  const amountLine=header.find(line=>/^[+-]\s*[¥￥]?\s*\d[\d,]*\.\d{1,2}$/.test(line))
  const value=amountLine?Math.abs(Number(amountLine.replace(/[¥￥,\s]/g,''))):undefined
  const title=header.find(line=>/二维码付款|扫码付款|转账-给/.test(line)) || [...header].reverse().find(line=>/[\p{Script=Han}]/u.test(line)&&!/账单|零钱明细|成功|状态/.test(line))
  const merchant=fields.get('收款方全称')||title?.replace(/^.*?(?:付款|转账)\s*-?\s*给/,'')
  const payment=fields.get('支付方式')||fields.get('付款方式')
  return {amount:value&&value>0?value:undefined,title,merchant,paymentMethod:normalizePaymentChannel(payment),kind:amountLine?.startsWith('+')?'income' as const:'expense' as const,details:[...fields].filter(([label])=>!['转账单号','账单服务','收款方服务'].includes(label)).map(([label,value])=>({label,value}))}
}
