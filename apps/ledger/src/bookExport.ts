import { categoryPath, statisticsSummary, transactionShareAmount, transactionInStatistics, splitRatioPercent, type Book, type LedgerSnapshot, type Transaction } from './ledger'
import { money } from './ledgerViewModels'
import reportCss from './book-report.css?inline'

export type BookExportFormat = 'html' | 'md' | 'csv'
const escape = (value: unknown) => String(value??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#39;')
const markdown = (value: unknown) => String(value??'').replaceAll('\\','\\\\').replaceAll('|','\\|').replace(/[\r\n]+/g,' ').replaceAll('<','&lt;').replaceAll('>','&gt;')
const dateText = (value: string) => {
  const date=new Date(value.length===10?`${value}T00:00:00`:value)
  return Number.isNaN(date.getTime())?value:date.toLocaleString('zh-CN',{year:'numeric',month:'2-digit',day:'2-digit',...(value.length===10?{}:{hour:'2-digit',minute:'2-digit'})})
}

function shares(transaction: Transaction, book: Book) {
  const saved=transaction.ledgerSplitSettings?.[book.id]||transaction
  const split={...saved,splitMode:saved.splitMode||'equal'}
  const ids=split.splitParticipantIds
  const amounts=new Map<string,number>()
  if(transaction.kind!=='expense'||!ids.length)return {split,amounts}
  const total=Math.round(transaction.amount*100)
  // Allocate in cents so member amounts always sum to the transaction total.
  let remaining=total
  const selfId=book.participants.find(person=>person.name==='我')?.id||'我'
  const own=ids.includes(selfId)&&split.splitMode!=='equal'
    ?split.splitMode==='ratio'?Math.round(total*Math.max(0,Math.min(100,splitRatioPercent(split)))/100):Math.min(total,Math.max(0,Math.round((split.splitAmount??0)*100)))
    :null
  if(own!==null){amounts.set(selfId,own/100);remaining-=own}
  const rest=own!==null?ids.filter(id=>id!==selfId):ids
  rest.forEach((id,index)=>{const cents=Math.floor(remaining/(rest.length-index));amounts.set(id,cents/100);remaining-=cents})
  return {split,amounts}
}

function splitDescription(transaction: Transaction, book: Book) {
  if(!transactionInStatistics(transaction,book.id))return '不计统计'
  const {split,amounts}=shares(transaction,book)
  if(!amounts.size)return '—'
  const name=(id:string)=>book.participants.find(person=>person.id===id)?.name||id
  const values=split.paidByParticipantId?[`付款：${name(split.paidByParticipantId)}`]:[]
  values.push(`参与：${[...amounts].map(([id,amount])=>`${name(id)} ${money(amount,transaction.currency)}`).join('、')}${split.splitMode==='equal'?'（均分）':''}`)
  if(amounts.size)values.push(`本人承担：${money(transactionShareAmount(transaction,book.id),transaction.currency)}`)
  return values.join('；')
}

/** Port of the native app's BookExportDocument report layout and sections. */
export function createBookExport(book: Book, snapshot: LedgerSnapshot, format: BookExportFormat, now=new Date()) {
  const rows=snapshot.transactions.filter(transaction=>transaction.bookIds.includes(book.id)).sort((a,b)=>b.happenedAt.localeCompare(a.happenedAt))
  const {expense,income,balance,discount,premium}=statisticsSummary(rows,book.id)
  const period=book.startDate?book.endDate?`${dateText(book.startDate)} - ${dateText(book.endDate)}`:`自 ${dateText(book.startDate)} 起`:'未限定'
  const category=(row:Transaction)=>categoryPath(snapshot.categories,row.categoryId).map(item=>item.name).join(' / ')||'未分类'
  const signed=(row:Transaction)=>`${row.kind==='expense'?'-':'+'}${money(row.amount,row.currency)}`
  let content:string,mime:string
  if(format==='md'){
    content=`# ${markdown(book.name)}\n\n> 账本期间：${markdown(period)}\n\n## 汇总\n\n> 按当前账本本人份额统计；流水金额为整笔订单金额。\n\n- 支出：${money(expense)}\n- 收入：${money(income)}\n- 净额：${money(balance)}\n- 优惠：${money(discount)}\n- 溢价：${money(premium)}\n\n## 流水\n\n| 时间 | 标题 | 分类 | 金额 | 付款人 / 分账成员及金额 | 备注 |\n|---|---|---|---:|---|---|\n${rows.map(row=>`| ${[dateText(row.happenedAt),row.title,category(row),signed(row),splitDescription(row,book),row.note].map(markdown).join(' | ')} |`).join('\n')}\n`
    mime='text/markdown;charset=utf-8'
  }else if(format==='csv'){
    const cell=(value:unknown)=>{const text=String(value??'');return `"${(/^[\s]*[=+\-@]/.test(text)?`'${text}`:text).replaceAll('"','""')}"`}
    content='\uFEFF'+[['时间','类型','标题','金额','本人统计金额','计入统计','分类','商户','支付渠道','付款人 / 分账成员及金额','备注'],...rows.map(row=>[dateText(row.happenedAt),row.kind==='expense'?'支出':'收入',row.title,row.amount.toFixed(2),transactionShareAmount(row,book.id).toFixed(2),transactionInStatistics(row,book.id)?'是':'否',category(row),row.merchant,row.paymentMethod,splitDescription(row,book),row.note])].map(row=>row.map(cell).join(',')).join('\r\n')
    mime='text/csv;charset=utf-8'
  }else{
    const grouped=new Map<string,number>()
    rows.filter(row=>row.kind==='expense').forEach(row=>grouped.set(category(row),(grouped.get(category(row))||0)+transactionShareAmount(row,book.id)))
    const categories=[...grouped].sort((a,b)=>b[1]-a[1]).slice(0,8),max=Math.max(1,categories[0]?.[1]||0)
    const categoryRows=categories.map(([name,amount])=>`<div class="category-row"><div class="category-label"><span>${escape(name)}</span><strong>${money(amount)}</strong></div><div class="bar"><i style="width:${Math.round(amount/max*100)}%"></i></div></div>`).join('')
    const memberRows=book.participants.map(member=>{
      let paid=0,owed=0
      for(const row of rows){if(row.kind!=='expense'||!transactionInStatistics(row,book.id))continue;const allocation=shares(row,book);if(allocation.split.paidByParticipantId===member.id)paid+=row.amount;owed+=allocation.amounts.get(member.id)||0}
      return `<div class="member-row"><span>${escape(member.name)}</span><span>已支付 <b>${money(paid)}</b></span><span>应承担 <b>${money(owed)}</b></span></div>`
    }).join('')
    const transactionRows=rows.map(row=>{
      const adjustments=[row.discountAmount?`优惠 ${money(row.discountAmount,row.currency)}`:'',row.premiumAmount?`溢价 ${money(row.premiumAmount,row.currency)}`:''].filter(Boolean).join(' · ')
      return `<tr><td>${escape(dateText(row.happenedAt))}</td><td><strong>${escape(row.title)}</strong><small>${escape(row.note)}</small></td><td><span class="tag">${escape(category(row))}</span></td><td class="split-info">${escape(splitDescription(row,book))}</td><td class="amount ${row.kind}">${escape(signed(row))}${adjustments?`<small>${escape(adjustments)}</small>`:''}</td></tr>`
    }).join('')
    content=`<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escape(book.name)} · 账本报告</title><style>${reportCss}</style></head><body><main class="page"><header class="hero"><div class="eyebrow">SMART LEDGER · FINANCIAL REPORT</div><h1>${escape(book.name)}</h1><p>账本期间：${escape(period)} · 共 ${rows.length} 笔流水</p><p>收支按本人份额统计；流水表金额为整笔订单金额。</p></header><section class="grid"><div class="card expense"><span>总支出</span><strong>${money(expense)}</strong></div><div class="card income"><span>总收入</span><strong>${money(income)}</strong></div><div class="card balance"><span>净额</span><strong>${money(balance)}</strong></div><div class="card"><span>优惠 / 溢价</span><strong>${money(discount)} / ${money(premium)}</strong></div></section><section class="section"><h2>分类支出</h2>${categoryRows||'<p class="muted">暂无支出分类</p>'}</section>${memberRows?`<section class="section"><h2>分账概览</h2>${memberRows}</section>`:''}<section class="section"><h2>流水明细</h2><div class="table-wrap"><table><thead><tr><th>时间</th><th>标题 / 备注</th><th>分类</th><th>付款人 / 分账成员及金额</th><th class="amount">金额</th></tr></thead><tbody>${transactionRows||'<tr><td colspan="5">暂无流水</td></tr>'}</tbody></table></div></section><div class="footer">由 Smart Ledger 生成 · ${escape(dateText(now.toISOString()))}</div></main></body></html>`
    mime='text/html;charset=utf-8'
  }
  return {content,mime,filename:`${book.name.replace(/[<>:"/\\|?*\u0000-\u001f]/g,'_').replace(/[. ]+$/g,'')||'账本'}.${format}`}
}

export function downloadBookExport(book: Book, snapshot: LedgerSnapshot, format: BookExportFormat) {
  const result=createBookExport(book,snapshot,format)
  const url=URL.createObjectURL(new Blob([result.content],{type:result.mime}))
  const link=document.createElement('a');link.href=url;link.download=result.filename
  document.body.append(link);link.click();link.remove()
  window.setTimeout(()=>URL.revokeObjectURL(url),1000)
}
