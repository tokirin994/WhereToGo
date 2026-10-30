/** Shared presentation mapping; imported category IDs and raw icons are never rewritten. */
export const categoryIconOptions = [
  {id:'food',label:'餐饮',group:'餐饮',emoji:'🍽️'}, {id:'breakfast',label:'早餐',group:'餐饮',emoji:'🌅'},
  {id:'night',label:'夜宵',group:'餐饮',emoji:'🌙'}, {id:'coffee',label:'咖啡茶饮',group:'餐饮',emoji:'☕'},
  {id:'takeout',label:'外卖',group:'餐饮',emoji:'🥡'}, {id:'dessert',label:'烘焙甜品',group:'餐饮',emoji:'🍰'},
  {id:'vegetables',label:'蔬菜食材',group:'餐饮',emoji:'🥕'}, {id:'basket',label:'买菜',group:'餐饮',emoji:'🥬'},
  {id:'fruit',label:'水果',group:'餐饮',emoji:'🍎'}, {id:'car',label:'汽车打车',group:'交通',emoji:'🚗'},
  {id:'bus',label:'公交',group:'交通',emoji:'🚌'}, {id:'bike',label:'骑行',group:'交通',emoji:'🚲'},
  {id:'fuel',label:'加油',group:'交通',emoji:'⛽'}, {id:'parking',label:'停车',group:'交通',emoji:'🅿️'},
  {id:'drive',label:'驾驶租车',group:'交通',emoji:'🚙'}, {id:'train',label:'火车高铁',group:'交通',emoji:'🚆'},
  {id:'subway',label:'地铁',group:'交通',emoji:'🚇'}, {id:'travel',label:'机票旅行',group:'交通',emoji:'✈️'},
  {id:'departure',label:'出发',group:'交通',emoji:'🛫'}, {id:'walk',label:'步行',group:'交通',emoji:'👣'},
  {id:'house',label:'居住',group:'居家',emoji:'🏠'}, {id:'building',label:'房租物业',group:'居家',emoji:'🏢'},
  {id:'water',label:'水费',group:'居家',emoji:'💧'}, {id:'electricity',label:'电费能源',group:'居家',emoji:'⚡'},
  {id:'wifi',label:'宽带网络',group:'居家',emoji:'📶'}, {id:'renovation',label:'装修',group:'居家',emoji:'🔨'},
  {id:'repair',label:'维修保养',group:'居家',emoji:'🔧'}, {id:'bed',label:'住宿',group:'居家',emoji:'🛏️'},
  {id:'furniture',label:'家具',group:'居家',emoji:'🛋️'}, {id:'bag',label:'购物',group:'购物',emoji:'🛍️'},
  {id:'cart',label:'日用百货',group:'购物',emoji:'🛒'}, {id:'clothes',label:'服饰',group:'购物',emoji:'👕'},
  {id:'phone',label:'数码通讯',group:'购物',emoji:'📱'}, {id:'beauty',label:'美妆护理',group:'购物',emoji:'😊'},
  {id:'pet',label:'宠物',group:'购物',emoji:'🐾'}, {id:'package',label:'快递包裹',group:'购物',emoji:'📦'},
  {id:'game',label:'游戏娱乐',group:'休闲',emoji:'🎮'}, {id:'movie',label:'电影',group:'休闲',emoji:'🍿'},
  {id:'music',label:'音乐演出',group:'休闲',emoji:'🎤'}, {id:'ticket',label:'门票',group:'休闲',emoji:'🎟️'},
  {id:'party',label:'聚会',group:'休闲',emoji:'🎉'}, {id:'fitness',label:'运动健身',group:'休闲',emoji:'🏃'},
  {id:'health',label:'医疗',group:'学习健康',emoji:'🩺'}, {id:'medicine',label:'药品',group:'学习健康',emoji:'💊'},
  {id:'heart',label:'健康关爱',group:'学习健康',emoji:'❤️'}, {id:'study',label:'教育学习',group:'学习健康',emoji:'🎓'},
  {id:'book',label:'书籍',group:'学习健康',emoji:'📚'}, {id:'course',label:'课程笔记',group:'学习健康',emoji:'📝'},
  {id:'gift',label:'礼物人情',group:'人情',emoji:'🎁'}, {id:'envelope',label:'红包礼金',group:'人情',emoji:'🧧'},
  {id:'people',label:'亲友聚餐',group:'人情',emoji:'👥'}, {id:'card',label:'银行卡',group:'收支',emoji:'💳'},
  {id:'money',label:'工资补贴',group:'收支',emoji:'💰'}, {id:'wallet',label:'钱包',group:'收支',emoji:'👛'},
  {id:'store',label:'经营收入',group:'收支',emoji:'🏪'}, {id:'chart',label:'投资理财',group:'收支',emoji:'📈'},
  {id:'refund',label:'退款返还',group:'收支',emoji:'↩️'}, {id:'income',label:'收入入账',group:'收支',emoji:'↙️'},
  {id:'receipt',label:'账单报销',group:'收支',emoji:'🧾'}, {id:'star',label:'奖金奖励',group:'收支',emoji:'⭐'},
  {id:'plus',label:'其他收入',group:'收支',emoji:'➕'}, {id:'tag',label:'通用分类',group:'通用',emoji:'🏷️'},
  {id:'grid',label:'分类目录',group:'通用',emoji:'▦'},
] as const
export type CategoryIconId = typeof categoryIconOptions[number]['id']
export const categoryIconGroups = [...new Set(categoryIconOptions.map(option=>option.group))]
const options=new Map<string,typeof categoryIconOptions[number]>(categoryIconOptions.map(option=>[option.id,option]))
const emojiAliases=new Map<string,CategoryIconId>(categoryIconOptions.map(option=>[option.emoji.replace(/\uFE0F/g,''),option.id]))
const aliases:Record<string,CategoryIconId> = {
  'fork-knife':'food','fork.knife':'food','fork-knife-circle-fill':'food',utensils:'food',
  sunrise:'breakfast',moon:'night','moon.stars':'night','birthday.cake':'dessert',cake:'dessert',
  'takeoutbag.and.cup.and.straw':'takeout','cup.and.saucer':'coffee',carrot:'vegetables',
  'car-side':'car','car.side':'car',bicycle:'bike',fuelpump:'fuel',parkingsign:'parking',
  steeringwheel:'drive',airplane:'travel','airplane.departure':'departure',plane:'travel',
  'train.side.front.car':'train',tram:'subway','tram.front':'subway',home:'house','building.2':'building',
  drop:'water',bolt:'electricity',hammer:'renovation','bed.double':'bed',sofa:'furniture',
  'wrench.and.screwdriver':'repair',wrench:'repair',tshirt:'clothes','t-shirt':'clothes',
  iphone:'phone','face.smiling':'beauty',pawprint:'pet',shippingbox:'package',
  gamecontroller:'game',popcorn:'movie','music.mic':'music','party.popper':'party','figure.run':'fitness',
  'cross.case':'health',pills:'medicine',graduationcap:'study','book.closed':'book','books.vertical':'book',
  folder:'book','rectangle.and.pencil.and.ellipsis':'course','envelope.open':'envelope','person.2':'people',
  'credit-card':'card',creditcard:'card',banknote:'money','wallet.pass':'wallet',storefront:'store',
  'chart.bar':'chart','chart.line.uptrend.xyaxis':'chart','doc.text':'receipt',
  'arrow.uturn.backward':'refund','arrow.down.left':'income',
  more:'receipt',ellipsis:'receipt','square.grid.2x2':'grid','circle.grid.2x2':'grid',
}
const decoration=/\.(?:fill|circle|square|rectangle|rounded|inset\.filled)$/
const aliasLookup=new Map<string,CategoryIconId>(Object.entries(aliases))
function knownIcon(value:string):CategoryIconId|undefined {
  const exact=value.trim().toLowerCase().replace(/^(?:sfsymbols?:|sf:)/,'')
  if(options.has(exact))return exact as CategoryIconId
  if(aliasLookup.has(exact))return aliasLookup.get(exact)
  let base=exact;while(decoration.test(base))base=base.replace(decoration,'')
  return options.has(base)?base as CategoryIconId:aliasLookup.get(base)
}
export type ResolvedCategoryIcon={kind:'svg';key:CategoryIconId;label:string}|{kind:'emoji';value:string;label:string}
const semanticRules:Array<[RegExp,CategoryIconId]> = [
  [/退款|退货|返还|refund/i,'refund'],[/咖啡|奶茶|茶饮|coffee/i,'coffee'],[/早餐|早饭|breakfast/i,'breakfast'],[/夜宵|宵夜/,'night'],[/蛋糕|甜品|烘焙|dessert/i,'dessert'],[/外卖|takeout/i,'takeout'],[/水果|fruit/i,'fruit'],[/食材|买菜|生鲜|蔬菜/,'basket'],[/餐饮|午餐|晚餐|聚餐|工作餐|food|dining/i,'food'],
  [/地铁|轨道|subway/i,'subway'],[/火车|高铁|train/i,'train'],[/公交|巴士|bus/i,'bus'],[/骑行|单车|自行车|bicycle/i,'bike'],[/机票|飞机|航班|flight/i,'travel'],[/停车|泊车|parking/i,'parking'],[/加油|燃油|fuel/i,'fuel'],[/打车|网约车|出租车|租车|汽车|交通|taxi/i,'car'],
  [/水费|用水/,'water'],[/电费|燃气|能源/,'electricity'],[/宽带|网络|wifi/i,'wifi'],[/装修/,'renovation'],[/维修|保养/,'repair'],[/酒店|住宿|旅馆|hotel/i,'bed'],[/房租|物业/,'building'],[/家居|家具|沙发/,'furniture'],[/居住|住房/,'house'],
  [/宠物|pet/i,'pet'],[/服饰|服装|鞋包|clothes/i,'clothes'],[/手机|数码|通讯|话费/,'phone'],[/美妆|护肤|美容/,'beauty'],[/快递|邮寄|包裹/,'package'],[/购物|百货|shopping/i,'bag'],
  [/药品|药费|medicine/i,'medicine'],[/医疗|门诊|体检|牙科|health/i,'health'],[/健身|运动|fitness/i,'fitness'],[/电影|movie/i,'movie'],[/音乐|演唱|music/i,'music'],[/门票|ticket/i,'ticket'],[/游戏|娱乐|game/i,'game'],[/书籍|图书|book/i,'book'],[/课程|培训|笔记/,'course'],[/教育|学习|学费/,'study'],
  [/红包|礼金/,'envelope'],[/礼物|送礼|gift/i,'gift'],[/工资|补贴|补助|薪|salary/i,'money'],[/奖金|奖励/,'star'],[/报销|账单/,'receipt'],[/理财|投资|收益|股息/,'chart'],[/经营|销售|佣金/,'store'],[/信用卡|银行卡|还款|手续费/,'card'],
]
export function resolveCategoryIcon(icon:string|null|undefined,context:{name?:string;flowType?:'expense'|'income'}={}):ResolvedCategoryIcon {
  const value=typeof icon==='string'?icon.trim():''
  const known=knownIcon(value)||emojiAliases.get(value.replace(/\uFE0F/g,''))
  if(known)return {kind:'svg',key:known,label:options.get(known)!.label}
  // Punctuation, private-use font glyphs and unknown SF names are not emoji.
  if(value.length<=32&&!/[\uE000-\uF8FF]/u.test(value)&&/\p{Extended_Pictographic}|\p{Regional_Indicator}|[0-9#*]\uFE0F?\u20E3/u.test(value))return {kind:'emoji',value,label:context.name||'自定义图标'}
  const key=semanticRules.find(([pattern])=>pattern.test(context.name||''))?.[1]||(context.flowType==='income'?'income':'tag')
  return {kind:'svg',key,label:options.get(key)!.label}
}
/** Backwards compatible text helper, backed by the same registry as SVG rendering. */
export function categoryIconText(icon:string|null|undefined,flowType:'expense'|'income'='expense'){
  const resolved=resolveCategoryIcon(icon,{flowType});return resolved.kind==='emoji'?resolved.value:options.get(resolved.key)!.emoji
}
