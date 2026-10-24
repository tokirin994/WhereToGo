import { categoryPath, type Category, type LedgerSnapshot } from './ledger'
import type { ImportCandidate } from './importers'

const normalize = (text: string) => text.normalize('NFKC').toLocaleLowerCase().replace(/[\s\p{P}\p{S}]/gu, '')
const aliases = [
  ['餐饮','餐饮美食','餐饮食品','吃喝','美食','餐饮支出'],
  ['日常吃饭','吃饭','三餐','用餐','正餐'],
  ['早餐','早饭'], ['午餐','午饭'], ['晚餐','晚饭'], ['夜宵','宵夜'],
  ['咖啡茶饮','咖啡','奶茶','饮品','饮料'], ['工作餐','企业餐','员工餐'],
  ['交通出行','交通','出行'], ['公交地铁','公共交通','公交','地铁'],
  ['打车','网约车','出租车'], ['火车票','高铁','火车'], ['机票','航空'],
  ['购物','购物消费','购物支出'], ['日用百货','日用品','百货','生活用品'],
  ['居住','住房','居家'], ['酒店住宿','住宿','酒店'],
  ['基本工资','工资','薪资','薪水'], ['补贴','公司补贴','餐补','企业补贴'],
  ['报销','报销收入'], ['退款','退款入账','退回'],
]
const canonical = (text: string) => {
  const value=normalize(text)
  return aliases.find(group=>group.some(word=>normalize(word)===value))?.[0] || value
}

export function suggestImportCategory(item: ImportCandidate, snapshot: LedgerSnapshot): { category: Category; reason: string } | null {
  const categories=snapshot.categories.filter(category=>category.flowType===(item.kind||'expense'))
  const usable=new Set(categories.map(category=>category.id))
  const query=(item.categoryPath||[]).filter(Boolean)
  if(item.categoryKeyword&&!query.includes(item.categoryKeyword))query.push(item.categoryKeyword)
  const normalizedPath=query.map(normalize).join('/')
  const exact=categories.find(category=>normalizedPath&&categoryPath(snapshot.categories,category.id).map(node=>normalize(node.name)).join('/')===normalizedPath)
  if(exact)return {category:exact,reason:'按分类路径匹配'}

  // User corrections on the same merchant/title take priority over generic OCR guesses.
  const history=new Map<string,number>()
  for(const transaction of [...snapshot.transactions].sort((a,b)=>b.happenedAt.localeCompare(a.happenedAt)).slice(0,500)){
    if(transaction.source==='offset'||!transaction.categoryId||!usable.has(transaction.categoryId)||transaction.kind!==(item.kind||'expense'))continue
    const sameTitle=normalize(item.title||'').length>=2&&normalize(item.title||'')===normalize(transaction.title)
    const sameMerchant=normalize(item.merchant||'').length>=2&&normalize(item.merchant||'')===normalize(transaction.merchant)
    if(sameTitle||sameMerchant)history.set(transaction.categoryId,(history.get(transaction.categoryId)||0)+(sameTitle?3:1))
  }
  const previous=[...history].sort((a,b)=>b[1]-a[1])[0]
  if(previous)return {category:categories.find(category=>category.id===previous[0])!,reason:'参考同商户或同名流水'}

  const context=normalize(`${item.title||''} ${item.merchant||''}`)
  const ranked=categories.map(category=>{
    const path=categoryPath(snapshot.categories,category.id)
    const leaf=normalize(category.name), target=normalize(query.at(-1)||'')
    let score=0
    if(target&&leaf===target)score+=100
    else if(target&&canonical(leaf)===canonical(target))score+=75
    else if(target&&leaf.length>=2&&target.length>=2&&(leaf.includes(target)||target.includes(leaf)))score+=45
    for(const [index,word] of query.entries()){
      if(path.some(node=>canonical(node.name)===canonical(word)))score+=index===query.length-1?25:15
    }
    // Literal user category names can also match custom merchant/title wording.
    if(leaf.length>=2&&!/其他|未分类/.test(leaf)&&context.includes(leaf))score+=55
    return {category,score,depth:path.length}
  }).sort((a,b)=>b.score-a.score||a.depth-b.depth||a.category.sortOrder-b.category.sortOrder)
  const best=ranked[0]
  return best&&best.score>=15?{category:best.category,reason:'按分类名称与近似路径匹配'}:null
}

/** Only called for fresh recognition; saved user edits are never overwritten. */
export function applyImportDefaults(item: ImportCandidate, snapshot: LedgerSnapshot) {
  if(!item.categoryId){
    const match=suggestImportCategory(item,snapshot)
    if(match){item.categoryId=match.category.id;item.categorySuggestion=match.reason}
  }
  if(item.presetKey!=='meituan_enterprise_meal')return
  item.kind='expense';item.paymentMethod='公司补贴';item.offsetEnabled=true;item.offsetRatio=100
  const income=snapshot.categories.filter(category=>category.flowType==='income')
  let subsidy=income.find(category=>category.name==='公司补贴')||income.find(category=>/补贴|餐补/.test(category.name))
  if(!subsidy){
    subsidy={id:crypto.randomUUID(),name:'公司补贴',flowType:'income',icon:'wallet',color:'#3aae6d',parentId:null,sortOrder:snapshot.categories.length}
    snapshot.categories.push(subsidy)
  }
  item.offsetCategoryId=subsidy.id
}
