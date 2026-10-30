<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import type { User } from 'oidc-client-ts'
import { parseBillFile, type ImportCandidate, type OcrProgress } from './importers'
import { normalizeOcrName } from './ocrText'
import { applyImportDefaults } from './importDefaults'
import { downloadBookExport, type BookExportFormat } from './bookExport'
import { createImportSource, type ImportSource } from './importSources'
import { chooseLocalAfterConflict, chooseRemoteAfterConflict, fingerprint, getRemoteSnapshot, pushSnapshot, smartSync, type SyncConflict } from './cloudSync'
import { applyAutoCollectRules, linkedOffsets, offsetEdit, offsetDateMode, planOffsets, applyOffsetChanges, linkedOffsetSourceId, deleteTransactionRecords, cancelInstallment, payOffInstallment, updateTransaction, localDay, budgetSpent, categoryPath, createInitialSnapshot, createOffsetTransaction, createTransaction, flattenCategories, normalizeSnapshot, rangeForPreset, type LedgerSplitSettings, type Book, type Budget, type Category, type FlowType, type LedgerSnapshot, type Transaction, type OffsetEdit, type OffsetDraft, type OffsetDateMode } from './ledger'
import { readLocalSnapshot, readSyncMetadata, writeLocalSnapshot, writeSyncMetadata } from './storage'
import { backupToNutstore, clearNutstoreCredentials, deleteNutstoreCredentials, getNutstoreStatus, readNutstoreCredentials, restoreFromNutstore, testNutstore, writeNutstoreCredentials, type NutstoreCredentials, type NutstoreStatus } from './nutstoreSync'
import CategoryPicker from './CategoryPicker.vue'
import CategoryManager from './CategoryManager.vue'
import BookLibrary from './BookLibrary.vue'
import TransactionsPage from './TransactionsPage.vue'
import TransactionList from './TransactionList.vue'
import ActionMenu, { type MenuAction } from './ActionMenu.vue'
import UiIcon from './UiIcon.vue'
import CategoryIcon from './CategoryIcon.vue'
import CategoryIconPicker from './CategoryIconPicker.vue'
import BookAssignmentPicker from './BookAssignmentPicker.vue'
import InstallmentControls from './InstallmentControls.vue'
import OffsetManager from './OffsetManager.vue'
import OverviewDashboard from './OverviewDashboard.vue'
import OcrImportWorkbench from './OcrImportWorkbench.vue'
import OcrCandidateEditor from './OcrCandidateEditor.vue'
import ImportSourcePreview from './ImportSourcePreview.vue'
import PaymentChannelSettings from './PaymentChannelSettings.vue'
import AppSwitcher from './AppSwitcher.vue'
import ApiSecurityPanel from './ApiSecurityPanel.vue'
import { portalUrl, travelUrl, appBasePath, ledgerOnly } from './appLinks'
import { authorizedRequest } from './apiClient'
import { defaultTransactionFilters, type TransactionFilters } from './ledgerViewModels'

const props = defineProps<{ user: User; apiUrl: string; accountKey: string; bookId: string | null }>()
const snapshot = ref<LedgerSnapshot>(createInitialSnapshot())
const openSettings=new URLSearchParams(window.location.search).get('section')==='settings'
const activeTab = ref<'overview' | 'books' | 'transactions' | 'import' | 'entry' | 'more'>(openSettings?'more':'overview')
const morePage = ref<'menu' | 'budgets' | 'categories' | 'settings'>(openSettings?'settings':'menu')
const selectedBookId = ref<string | null>(null)
const bookId = ref<string | null>(props.bookId)
const loading = ref(true)
const busy = ref(false)
const toast = ref('')
const error = ref('')
const savingChannels = ref(false)
const channelError = ref('')
const syncConflict = ref<SyncConflict | null>(null)
const cloudRevision = ref(0)
const syncMessage = ref('')
const nutstoreCredentials = ref<NutstoreCredentials>(readNutstoreCredentials(props.accountKey))
const nutstoreStatus = ref<NutstoreStatus>({available:false,configured:false})
const nutstoreMessage = ref('')
let periodicSyncTimer: number | undefined
let midnightSyncTimer: number | undefined
const period = ref<'week' | 'month' | 'year'>('month')
const transactionFilters = ref<TransactionFilters>(defaultTransactionFilters())
const bookSearch = ref('')
const entryReturnTab = ref<typeof activeTab.value>('transactions')
const entryOpen = ref(false)
const editingId = ref<string | null>(null)
const entryBaseline = ref('')
const savingEntry = ref(false)
const entryInstallmentEnabled = ref(false)
const entryInstallmentStartDate = ref(localDay(new Date()))
const entryExplicitBooks = ref(false)
const entrySplitSettings = ref<Record<string, LedgerSplitSettings>>({})
const editingTransaction = computed(() => snapshot.value.transactions.find(tx => tx.id === editingId.value))
const entryOffsetEdits = ref<OffsetEdit[]>([])
const entryOffsetDrafts = ref<OffsetDraft[]>([])
const entryClearOffsetIds = ref<string[]>([])
const entryOffsetManager = ref<InstanceType<typeof OffsetManager>|null>(null)
const entryOffsetDateMode = ref<OffsetDateMode>('source')
const entryOffsetOriginalState = ref('')
const entryExistingOffsets = computed(()=>editingId.value?linkedOffsets(snapshot.value,editingId.value):[])
const entryRecordState = () => JSON.stringify({source:editingTransaction.value,offsets:[...entryExistingOffsets.value].sort((a,b)=>a.id.localeCompare(b.id))})
const entryLinkedSource = computed(()=>{const id=editingTransaction.value&&linkedOffsetSourceId(editingTransaction.value);return snapshot.value.transactions.find(tx=>tx.id===id)})
const entryEditorState = () => JSON.stringify({ draft:entryDraft.value, installment:entryInstallmentEnabled.value, start:entryInstallmentStartDate.value, explicit:entryExplicitBooks.value, splits:entrySplitSettings.value, offsetEdits:entryOffsetEdits.value, offsetDrafts:entryOffsetDrafts.value, offsetDateMode:entryOffsetDateMode.value })
const entryDraft = ref({ title: '', amount: '', kind: 'expense' as FlowType, happenedAt: new Date().toISOString().slice(0, 16), categoryId: '', bookIds: [] as string[], paymentMethod: '', merchant: '', note: '', installmentMonths: '1', originalAmount: '', discountAmount: '', premiumAmount: '', payer: '', splitParticipantIds: [] as string[], splitMode: 'equal' as 'equal'|'ratio'|'fixed', splitRatio: '50', splitAmount: '', offsetEnabled: false })
const bookOpen = ref(false)
const editingBookId = ref<string | null>(null)
const bookRuleMode = ref<'all'|'expense'|'income'|'categories'>('all')
const bookKeepExisting = ref(true)
const bookCollectMatching = ref(true)
const bookFormError = ref('')
const savingBook = ref(false)
const bookDraft = ref({ name: '', type: 'custom' as 'custom'|'general'|'trip', icon: '📘', color: '#4f8ef7', note: '', startDate: '', endDate: '', isPinned: false, autoCollectEnabled: false, autoCollectCategoryIds: [] as string[], budgetLimitAmount: '', participants: '' })
const budgetOpen = ref(false)
const editingBudgetId = ref<string | null>(null)
const budgetDraft = ref({ name: '', limitAmount: '', periodType: 'monthly' as 'monthly'|'range', year: new Date().getFullYear(), month: new Date().getMonth()+1, startDate: '', endDate: '', categoryIds: [] as string[], bookId: '' })
const categoryDraft = ref({ name: '', flowType: 'expense' as FlowType, parentId: '', icon: '🏷️', color: '#4f8ef7' })
const categoryPageFlow = ref<FlowType>('expense')
const categoryEditorOpen = ref(false)
const editingCategoryId = ref<string | null>(null)
const candidates = ref<ImportCandidate[]>([])
const candidateDraft = ref<ImportCandidate | null>(null)
const candidateError = ref('')
const importSources = ref<ImportSource[]>([])
const importBusy = ref(false)
const selectedCandidateIds = ref<string[]>([])
const previewSourceId = ref<string|null>(null)
const previewContext = ref<ImportCandidate|null>(null)
const previewSource = computed(()=>importSources.value.find(source=>source.id===previewSourceId.value))
let importSessionAlive=true
const savingCandidates = ref(new Set<string>())
const importStatus = ref('')
const importProgress = ref<number | null>(null)
const calendarMonth = ref(new Date(new Date().getFullYear(), new Date().getMonth(), 1))
const calendarDay = ref(localDateKey(new Date()))
const calendarOpen = ref(false)
function localDateKey(date:Date){const pad=(value:number)=>String(value).padStart(2,'0');return`${date.getFullYear()}-${pad(date.getMonth()+1)}-${pad(date.getDate())}`}
const calendarCells = computed(()=>{
  const year=calendarMonth.value.getFullYear(),month=calendarMonth.value.getMonth()
  const first=new Date(year,month,1),offset=(first.getDay()+6)%7,start=new Date(year,month,1-offset)
  return Array.from({length:42},(_,index)=>{const date=new Date(start);date.setDate(start.getDate()+index);const key=localDateKey(date);const rows=snapshot.value.transactions.filter(tx=>localDay(tx.happenedAt)===key);return{key,day:date.getDate(),inMonth:date.getMonth()===month,expense:rows.filter(tx=>tx.kind==='expense').reduce((sum,tx)=>sum+tx.amount,0),income:rows.filter(tx=>tx.kind==='income').reduce((sum,tx)=>sum+tx.amount,0)}})
})
const calendarSelectedTransactions = computed(()=>snapshot.value.transactions.filter(tx=>localDay(tx.happenedAt)===calendarDay.value).sort((a,b)=>b.happenedAt.localeCompare(a.happenedAt)))
const calendarMonthTotals = computed(()=>{const rows=snapshot.value.transactions.filter(tx=>{const date=new Date(tx.happenedAt);return date.getFullYear()===calendarMonth.value.getFullYear()&&date.getMonth()===calendarMonth.value.getMonth()});return{expense:rows.filter(tx=>tx.kind==='expense').reduce((sum,tx)=>sum+tx.amount,0),income:rows.filter(tx=>tx.kind==='income').reduce((sum,tx)=>sum+tx.amount,0),count:rows.length}})
const selectedBook = computed(() => (bookId.value||activeTab.value==='books'||(activeTab.value==='entry'&&entryReturnTab.value==='books')) ? snapshot.value.books.find(item=>item.id===(bookId.value||selectedBookId.value))||null : null)
const selectedBookTransactions = computed(() => selectedBook.value
  ? snapshot.value.transactions.filter(tx => tx.bookIds.includes(selectedBook.value!.id)).sort((a,b) => b.happenedAt.localeCompare(a.happenedAt))
  : [])
const selectedBookTotals = computed(() => {
  const rows = selectedBookTransactions.value
  const expenses = rows.filter(tx => tx.kind === 'expense')
  const income = rows.filter(tx => tx.kind === 'income')
  return {
    expenses: expenses.reduce((sum, tx) => sum + tx.amount, 0),
    income: income.reduce((sum, tx) => sum + tx.amount, 0),
    balance: income.reduce((sum, tx) => sum + tx.amount, 0) - expenses.reduce((sum, tx) => sum + tx.amount, 0),
    discounts: expenses.reduce((sum, tx) => sum + (tx.discountAmount || 0), 0),
    premiums: expenses.reduce((sum, tx) => sum + (tx.premiumAmount || 0), 0),
  }
})
const selectedBookBudgetRatio = computed(() => selectedBook.value?.budgetLimitAmount
  ? Math.min(100, selectedBookTotals.value.expenses / selectedBook.value.budgetLimitAmount * 100)
  : 0)
const flatCategories = computed(() => flattenCategories(snapshot.value.categories))
const overviewRange = computed(() => rangeForPreset(period.value))
const currency = (value: number) => new Intl.NumberFormat('zh-CN',{style:'currency',currency:'CNY'}).format(value)
const categoryName = (id: string|null) => id ? (flatCategories.value.find(item=>item.id===id)?.name || '已删除分类') : '未分类'
const bookName = (id: string) => snapshot.value.books.find(item=>item.id===id)?.name || '已删除账本'
const notify = (message: string) => { toast.value=message; window.setTimeout(()=>{if(toast.value===message)toast.value=''},2600) }

async function persist() {
  snapshot.value.updatedAt = new Date().toISOString()
  await writeLocalSnapshot(props.accountKey, snapshot.value)
  if (snapshot.value.settings.cloudSyncEnabled && snapshot.value.settings.cloudSyncSchedule === 'on_change') await syncNow(false)
}

async function savePaymentChannels(channels: string[]) {
  if(savingChannels.value)return
  const previous=[...snapshot.value.settings.paymentChannels]
  savingChannels.value=true;channelError.value=''
  try {
    snapshot.value.settings.paymentChannels=[...new Set(channels.map(channel=>channel.trim()).filter(Boolean))]
    await persist()
  } catch(cause) {
    snapshot.value.settings.paymentChannels=previous
    channelError.value=cause instanceof Error?cause.message:'保存支付渠道失败，请重试'
  } finally { savingChannels.value=false }
}

async function bootstrap() {
  loading.value=true; error.value=''
  try{
    nutstoreStatus.value=await getNutstoreStatus(props.apiUrl,props.user.access_token)
    if(nutstoreCredentials.value.username&&nutstoreCredentials.value.appPassword&&nutstoreStatus.value.available){
      if(!nutstoreStatus.value.configured||nutstoreStatus.value.needsUpdate)nutstoreStatus.value=await writeNutstoreCredentials(props.apiUrl,props.user.access_token,nutstoreCredentials.value)
      clearNutstoreCredentials(props.accountKey);nutstoreCredentials.value={username:'',appPassword:''}
      nutstoreMessage.value='旧版浏览器凭证已迁入服务器加密存储，本机明文配置已清除'
    }
  }catch(cause){nutstoreMessage.value=cause instanceof Error?cause.message:'读取加密凭证配置失败'}
  try {
    const local = await readLocalSnapshot(props.accountKey)
    if (local) snapshot.value=normalizeSnapshot(local)
    else {
      const remote = await getRemoteSnapshot(props.apiUrl, props.user.access_token)
      cloudRevision.value=remote.revision
      snapshot.value=remote.snapshot ? normalizeSnapshot(remote.snapshot) : createInitialSnapshot()
      if(remote.snapshot)writeSyncMetadata(props.accountKey,{revision:remote.revision,lastFingerprint:fingerprint(snapshot.value),lastSyncedAt:remote.updatedAt})
      if (!remote.snapshot) await writeLocalSnapshot(props.accountKey,snapshot.value)
    }
    const response=await authorizedRequest(props.apiUrl,props.user.access_token,'/api/v1/books')
    if (response.ok) {
      const remoteBooks=await response.json() as Array<{id:string;name:string;type:string;destination?:string;expenses?:number}>
      for (const remote of remoteBooks) if (!snapshot.value.books.some(book=>book.id===remote.id)) snapshot.value.books.push({
        id:remote.id,name:remote.name,type:(remote.type==='trip'?'trip':'custom'),icon:remote.type==='trip'?'✈️':'📘',color:'#4f8ef7',note:'',startDate:null,endDate:null,isPinned:false,autoCollectEnabled:false,autoCollectCategoryIds:[],budgetLimitAmount:null,budgetStartDate:null,budgetEndDate:null,participants:[],destination:remote.destination,
      })
    }
    if (props.bookId) {
      const response=await authorizedRequest(props.apiUrl,props.user.access_token,`/api/v1/books/${props.bookId}`)
      if (response.ok) {
        const remote=await response.json() as {id:string;name:string;tripName?:string;destination?:string;startsOn?:string;endsOn?:string}
        let book=snapshot.value.books.find(item=>item.id===remote.id)
        if (!book) { book={id:remote.id,name:remote.tripName||remote.name,type:'trip',icon:'✈️',color:'#f59e0b',note:'',startDate:remote.startsOn||null,endDate:remote.endsOn||null,isPinned:true,autoCollectEnabled:false,autoCollectCategoryIds:[],budgetLimitAmount:null,budgetStartDate:null,budgetEndDate:null,participants:[],destination:remote.destination}; snapshot.value.books.unshift(book) }
        selectedBookId.value=book.id
        activeTab.value='transactions'
      }
    }
    await writeLocalSnapshot(props.accountKey,snapshot.value)
    if(snapshot.value.settings.cloudSyncEnabled)await syncNow(false)
    if(periodicSyncTimer)window.clearInterval(periodicSyncTimer)
    periodicSyncTimer=window.setInterval(()=>{if(snapshot.value.settings.cloudSyncEnabled&&snapshot.value.settings.cloudSyncSchedule==='periodic')void syncNow(false)},15*60*1000)
    scheduleMidnightSync()
  } catch (cause) { error.value=cause instanceof Error?cause.message:'初始化账本失败' }
  finally { loading.value=false }
}
onMounted(bootstrap)
onUnmounted(()=>{importSessionAlive=false;for(const source of importSources.value)URL.revokeObjectURL(source.url);if(periodicSyncTimer)window.clearInterval(periodicSyncTimer);if(midnightSyncTimer)window.clearTimeout(midnightSyncTimer)})

function scheduleMidnightSync(){if(midnightSyncTimer)window.clearTimeout(midnightSyncTimer);if(!snapshot.value.settings.cloudSyncEnabled||!snapshot.value.settings.midnightSyncEnabled)return;const next=new Date();next.setHours(24,0,5,0);midnightSyncTimer=window.setTimeout(()=>{void syncNow(false).finally(scheduleMidnightSync)},Math.max(1000,next.getTime()-Date.now()))}

async function syncNow(showMessage=true) {
  if (!props.apiUrl || !props.user.access_token) return
  busy.value=true; syncMessage.value='正在比较本地与云端账本…'
  try {
    const result=await smartSync(props.apiUrl,props.user.access_token,props.accountKey,snapshot.value)
    cloudRevision.value=result.remote.revision
    if (result.conflict) { syncConflict.value=result.conflict; syncMessage.value='本地与云端都有新改动，请选择保留哪一份'; return }
    snapshot.value=normalizeSnapshot(result.snapshot)
    await writeLocalSnapshot(props.accountKey,snapshot.value)
    syncMessage.value=`同步完成 · revision ${result.remote.revision}`
    if(showMessage)notify('账本同步完成')
  } catch(cause) { syncMessage.value=cause instanceof Error?cause.message:'同步失败'; if(showMessage)notify(syncMessage.value) }
  finally { busy.value=false }
}
async function resolveSyncConflict(useLocal:boolean) {
  if(!syncConflict.value)return
  busy.value=true
  try {
    if(useLocal){const remote=await chooseLocalAfterConflict(props.apiUrl,props.user.access_token,props.accountKey,syncConflict.value);cloudRevision.value=remote.revision}
    else snapshot.value=normalizeSnapshot(chooseRemoteAfterConflict(props.accountKey,syncConflict.value))
    await writeLocalSnapshot(props.accountKey,snapshot.value);syncConflict.value=null;syncMessage.value='冲突已处理';notify(syncMessage.value)
  }catch(cause){syncMessage.value=cause instanceof Error?cause.message:'处理冲突失败'}finally{busy.value=false}
}
async function pushLocalNow(){busy.value=true;try{const remote=await pushSnapshot(props.apiUrl,props.user.access_token,props.accountKey,snapshot.value,readSyncMetadata(props.accountKey).revision);cloudRevision.value=remote.revision;syncMessage.value=`本地已推送 · revision ${remote.revision}`;notify('已推送到云端')}catch(cause){syncMessage.value=cause instanceof Error?cause.message:'推送失败';notify(syncMessage.value)}finally{busy.value=false}}
async function pullRemoteNow(){if(!window.confirm('采用云端快照会替换当前本地账本，确认继续？'))return;busy.value=true;try{const remote=await getRemoteSnapshot(props.apiUrl,props.user.access_token);if(!remote.snapshot)throw new Error('云端还没有账本快照');snapshot.value=normalizeSnapshot(remote.snapshot);writeSyncMetadata(props.accountKey,{revision:remote.revision,lastFingerprint:fingerprint(snapshot.value),lastSyncedAt:remote.updatedAt});await writeLocalSnapshot(props.accountKey,snapshot.value);syncMessage.value=`已从云端拉取 · revision ${remote.revision}`;notify('已从云端拉取')}catch(cause){syncMessage.value=cause instanceof Error?cause.message:'拉取失败';notify(syncMessage.value)}finally{busy.value=false}}

async function saveNutstoreConfig(){
  if(!nutstoreStatus.value.available)throw new Error('服务器尚未配置凭证加密密钥，请联系管理员')
  if(nutstoreStatus.value.needsUpdate&&!nutstoreCredentials.value.appPassword)throw new Error('已有凭证无法解密，请恢复原密钥或重新填写配置')
  const pending=nutstoreCredentials.value
  if(!pending.username&&!pending.appPassword&&nutstoreStatus.value.configured)return
  if(!pending.username.trim()||!pending.appPassword.trim())throw new Error('更新配置时请填写完整的坚果云账号邮箱和第三方应用密码')
  nutstoreStatus.value=await writeNutstoreCredentials(props.apiUrl,props.user.access_token,{username:pending.username.trim(),appPassword:pending.appPassword.replace(/\s+/g,'')})
  clearNutstoreCredentials(props.accountKey);nutstoreCredentials.value={username:'',appPassword:''}
  nutstoreMessage.value='账号和应用密码已加密保存到服务器，浏览器不再保存密码'
}
async function testNutstoreConnection(){busy.value=true;try{await saveNutstoreConfig();nutstoreMessage.value=await testNutstore(props.apiUrl,props.user.access_token)}catch(cause){nutstoreMessage.value=cause instanceof Error?cause.message:'坚果云连接失败'}finally{busy.value=false}}
async function saveNutstoreOnly(){busy.value=true;try{await saveNutstoreConfig()}catch(cause){nutstoreMessage.value=cause instanceof Error?cause.message:'保存配置失败'}finally{busy.value=false}}
async function backupNutstore(){busy.value=true;try{await saveNutstoreConfig();nutstoreMessage.value=await backupToNutstore(props.apiUrl,props.user.access_token,snapshot.value)}catch(cause){nutstoreMessage.value=cause instanceof Error?cause.message:'坚果云备份失败'}finally{busy.value=false}}
async function restoreNutstore(){if(!window.confirm('从坚果云恢复会替换当前本机账本，建议先备份当前数据。继续吗？'))return;busy.value=true;try{await saveNutstoreConfig();const restored=normalizeSnapshot(await restoreFromNutstore(props.apiUrl,props.user.access_token));restored.updatedAt=new Date().toISOString();snapshot.value=restored;await writeLocalSnapshot(props.accountKey,restored);nutstoreMessage.value='已从坚果云恢复到本机';notify(nutstoreMessage.value)}catch(cause){nutstoreMessage.value=cause instanceof Error?cause.message:'坚果云恢复失败'}finally{busy.value=false}}
async function removeNutstoreConfig(){busy.value=true;try{nutstoreStatus.value=await deleteNutstoreCredentials(props.apiUrl,props.user.access_token);clearNutstoreCredentials(props.accountKey);nutstoreCredentials.value={username:'',appPassword:''};nutstoreMessage.value='已删除服务器加密凭证及本机旧配置'}catch(cause){nutstoreMessage.value=cause instanceof Error?cause.message:'清除配置失败'}finally{busy.value=false}}

function toLocalDateTime(value?:string){if(!value)return '';const date=new Date(value);if(Number.isNaN(date.getTime()))return '';const pad=(n:number)=>String(n).padStart(2,'0');return `${localDay(date)}T${pad(date.getHours())}:${pad(date.getMinutes())}`}
function openEntry(transaction?:Transaction) {
  if(savingEntry.value||savingCandidates.value.size)return
  if(entryOpen.value&&entryBaseline.value!==entryEditorState()&&!window.confirm('当前流水尚未保存，放弃修改并继续吗？'))return
  if(activeTab.value!=='entry')entryReturnTab.value=activeTab.value
  editingId.value=transaction?.id||null
  const hasOffsets=transaction?linkedOffsets(snapshot.value,transaction.id).length>0:false
  const entryBook=selectedBook.value||(activeTab.value==='transactions'&&transactionFilters.value.bookId?snapshot.value.books.find(book=>book.id===transactionFilters.value.bookId):null)
  const newKind=activeTab.value==='transactions'&&transactionFilters.value.flow==='income'?'income':'expense'
  const newTime=toLocalDateTime(new Date().toISOString())
  entryDraft.value=transaction?{title:transaction.title,amount:String(transaction.amount),kind:transaction.kind,happenedAt:toLocalDateTime(transaction.happenedAt),categoryId:transaction.categoryId||'',bookIds:[...transaction.bookIds],paymentMethod:transaction.paymentMethod,merchant:transaction.merchant,note:transaction.note,installmentMonths:String(transaction.installmentMonths||1),originalAmount:transaction.originalAmount?String(transaction.originalAmount):'',discountAmount:transaction.discountAmount?String(transaction.discountAmount):'',premiumAmount:transaction.premiumAmount?String(transaction.premiumAmount):'',payer:transaction.paidByParticipantId||'我',splitParticipantIds:[...transaction.splitParticipantIds],splitMode:transaction.splitMode||'equal',splitRatio:String(transaction.splitRatio??50),splitAmount:transaction.splitAmount==null?'':String(transaction.splitAmount),offsetEnabled:hasOffsets}:{title:'',amount:'',kind:newKind,happenedAt:newTime,categoryId:'',bookIds:entryBook?[entryBook.id]:[],paymentMethod:'',merchant:'',note:'',installmentMonths:'1',originalAmount:'',discountAmount:'',premiumAmount:'',payer:'我',splitParticipantIds:entryBook?.participants.length?[entryBook.participants[0].id]:[],splitMode:'equal',splitRatio:'50',splitAmount:'',offsetEnabled:false}
  entryExplicitBooks.value=Boolean(transaction||entryBook)
  entrySplitSettings.value=JSON.parse(JSON.stringify(transaction?.ledgerSplitSettings||{}))
  entryInstallmentEnabled.value=Boolean(transaction?.installmentGroupId)
  entryInstallmentStartDate.value=localDay(transaction?.installmentStartMonth||transaction?.happenedAt||new Date())
  entryOffsetEdits.value=transaction?linkedOffsets(snapshot.value,transaction.id).map(row=>offsetEdit(row,transaction)):[]
  entryOffsetDrafts.value=[];entryClearOffsetIds.value=[]
  entryOffsetDateMode.value=transaction&&entryLinkedSource.value?offsetDateMode(transaction,entryLinkedSource.value):'source'
  entryOffsetOriginalState.value=entryRecordState()
  entryBaseline.value=entryEditorState()
  entryOpen.value=true;activeTab.value='entry'
}
function cancelEntry(){if(savingEntry.value)return;if(entryBaseline.value!==entryEditorState()&&!window.confirm('当前流水尚未保存，确定放弃吗？'))return;entryOpen.value=false;activeTab.value=entryReturnTab.value}
function setEntryOffsetsEnabled(enabled:boolean){entryDraft.value.offsetEnabled=enabled;if(enabled&&editingTransaction.value){entryOffsetEdits.value=entryExistingOffsets.value.map(row=>offsetEdit(row,editingTransaction.value!));entryClearOffsetIds.value=[]}}
function setEntryOffsetDateFollow(event:Event){const follow=(event.target as HTMLInputElement).checked;entryOffsetDateMode.value=follow?'source':'independent';if(follow&&entryLinkedSource.value)entryDraft.value.happenedAt=toLocalDateTime(entryLinkedSource.value.happenedAt)}
async function saveEntry() {
  if(savingEntry.value)return
  savingEntry.value=true;error.value=''
  let previousTransactions:Transaction[]|null=null
  let previousChannels:string[]|null=null
  try {
    if(editingId.value&&entryOffsetOriginalState.value!==entryRecordState())throw new Error('这笔流水或关联抵扣已更新，请重新打开编辑后再保存')
    const category=snapshot.value.categories.find(item=>item.id===entryDraft.value.categoryId)
    if(category&&category.flowType!==entryDraft.value.kind)throw new Error('分类类型与收支方向不一致')
    if(entryDraft.value.splitMode==='ratio'&&(Number(entryDraft.value.splitRatio)<0||Number(entryDraft.value.splitRatio)>100))throw new Error('本人分摊比例应为 0 至 100')
    if(entryDraft.value.splitMode==='fixed'&&(Number(entryDraft.value.splitAmount)<0||Number(entryDraft.value.splitAmount)>Number(entryDraft.value.amount)))throw new Error('本人固定分摊金额不能超过流水金额')
    const draft={title:entryDraft.value.title,amount:Number(entryDraft.value.amount),kind:entryDraft.value.kind,happenedAt:new Date(entryDraft.value.happenedAt).toISOString(),categoryId:entryDraft.value.categoryId||null,bookIds:entryDraft.value.bookIds,hasExplicitBookSelection:entryExplicitBooks.value,ledgerSplitSettings:entrySplitSettings.value,paymentMethod:entryDraft.value.paymentMethod,merchant:entryDraft.value.merchant,note:entryDraft.value.note,installmentMonths:entryInstallmentEnabled.value?Number(entryDraft.value.installmentMonths):1,installmentStartMonth:entryInstallmentEnabled.value?new Date(entryInstallmentStartDate.value+'T00:00:00').toISOString():null,originalAmount:Number(entryDraft.value.originalAmount)||null,discountAmount:Number(entryDraft.value.discountAmount)||null,premiumAmount:Number(entryDraft.value.premiumAmount)||null,paidByParticipantId:entryDraft.value.payer||null,splitParticipantIds:entryDraft.value.splitParticipantIds,splitMode:entryDraft.value.splitMode,splitRatio:entryDraft.value.splitMode==='ratio'?Number(entryDraft.value.splitRatio):null,splitAmount:entryDraft.value.splitMode==='fixed'?Number(entryDraft.value.splitAmount):null,source:editingTransaction.value?.source||'manual'}
    if(entryLinkedSource.value){Object.assign(draft,{offsetDateMode:entryOffsetDateMode.value});if(entryOffsetDateMode.value==='source')draft.happenedAt=entryLinkedSource.value.happenedAt}
    const baseline=fingerprint(snapshot.value)
    // Work on a detached snapshot: an open confirmation must never expose partial changes to sync.
    const working=JSON.parse(JSON.stringify(snapshot.value)) as LedgerSnapshot
    const created=editingId.value?updateTransaction(working,editingId.value,draft):createTransaction(working,draft)
    if(!editingId.value)working.transactions.unshift(...created)
    const source=created[0]!
    const existing=linkedOffsets(working,source.id)
    if(source.kind!=='expense'&&existing.length)throw new Error('请先关闭并保存全部抵扣，再将这笔支出改为收入')
    if(source.kind==='expense'){
      const baseAmount=editingId.value?source.amount:draft.amount
      if(entryDraft.value.offsetEnabled){
        const plan=planOffsets(working,source,entryOffsetEdits.value,entryOffsetDrafts.value,baseAmount)
        let normalize=false
        if(plan.overLimit){const choice=await entryOffsetManager.value?.confirmLimit(plan);if(!choice)return;normalize=choice==='normalize'}
        applyOffsetChanges(working,source,entryOffsetEdits.value,entryOffsetDrafts.value,baseAmount,normalize)
      }else if(existing.length){
        const ids=existing.map(row=>row.id).sort().join('|')
        if(ids!==[...entryClearOffsetIds.value].sort().join('|')&&!await entryOffsetManager.value?.confirmClearAll())return
        applyOffsetChanges(working,source,[],[],baseAmount)
      }
    }
    if(fingerprint(snapshot.value)!==baseline)throw new Error('账本在确认期间发生更新，请重新打开流水核对抵扣后再保存')
    previousTransactions=snapshot.value.transactions;previousChannels=[...snapshot.value.settings.paymentChannels]
    snapshot.value.transactions=working.transactions
    if(draft.paymentMethod&&!snapshot.value.settings.paymentChannels.includes(draft.paymentMethod))snapshot.value.settings.paymentChannels.push(draft.paymentMethod)
    await persist();entryOpen.value=false;activeTab.value=entryReturnTab.value;notify('流水已保存')
  }catch(cause){if(previousTransactions)snapshot.value.transactions=previousTransactions;if(previousChannels)snapshot.value.settings.paymentChannels=previousChannels;error.value=cause instanceof Error?cause.message:'保存流水失败'}finally{savingEntry.value=false}
}
// OCR creates a single initial offset; subsequent edits use OffsetManager's independent rows.
function syncOffset(source:Transaction,enabled:boolean,categoryId:string,ratio:number){if(!enabled){const ids=new Set(linkedOffsets(snapshot.value,source.id).map(row=>row.id));snapshot.value.transactions=snapshot.value.transactions.filter(row=>!ids.has(row.id));return}const category=snapshot.value.categories.find(item=>item.id===categoryId);if(!category)throw new Error('请选择有效的抵扣收入分类');snapshot.value.transactions.unshift(createOffsetTransaction(source,category,ratio))}
async function deleteTransaction(tx:Transaction){
  if(savingEntry.value)return
  const scope=tx.installmentGroupId?'仅删除当前这一期及其关联抵扣，其他分期会保留。':'同时删除这笔支出的关联抵扣。'
  if(!window.confirm('确定删除“'+tx.title+'”？'+scope+' 删除后不可恢复。'))return
  const previous=JSON.parse(JSON.stringify(snapshot.value.transactions)) as Transaction[]
  try{savingEntry.value=true;deleteTransactionRecords(snapshot.value,tx.id);await persist();notify('流水已删除')}catch(cause){snapshot.value.transactions=previous;error.value=cause instanceof Error?cause.message:'删除失败，已保留原流水'}finally{savingEntry.value=false}
}
async function removeTransactionFromBook(book:Book,tx:Transaction){
  if(savingEntry.value)return
  const offsets=linkedOffsets(snapshot.value,tx.id)
  if(!window.confirm(`从“${book.name}”移除“${tx.title}”${offsets.length?`及其 ${offsets.length} 笔关联抵扣`:''}？流水仍保留在全部流水及其他关联账本中。`))return
  const previous=JSON.parse(JSON.stringify(snapshot.value.transactions)) as Transaction[]
  try{savingEntry.value=true;for(const row of [tx,...offsets]){row.bookIds=row.bookIds.filter(id=>id!==book.id);if(row.ledgerSplitSettings)delete row.ledgerSplitSettings[book.id]}await persist();notify('已从当前账本移除')}
  catch(cause){snapshot.value.transactions=previous;error.value=cause instanceof Error?cause.message:'移除失败，已保留原账本关联'}finally{savingEntry.value=false}
}
function bookSettlement(book:Book){const members=new Map(book.participants.map(person=>[person.id,{id:person.id,name:person.name,paid:0,owed:0}]));if(!members.has('我'))members.set('我',{id:'我',name:'我',paid:0,owed:0});for(const tx of snapshot.value.transactions.filter(item=>item.bookIds.includes(book.id)&&item.kind==='expense'&&item.includeInStatistics)){const split=tx.ledgerSplitSettings?.[book.id]||tx;const ids=split.splitParticipantIds.length?split.splitParticipantIds:['我'];let selfShare=tx.amount/ids.length;if(split.splitMode==='ratio'&&split.splitRatio!=null)selfShare=tx.amount*split.splitRatio/100;if(split.splitMode==='fixed'&&split.splitAmount!=null)selfShare=split.splitAmount;const otherShare=ids.length>1?(tx.amount-selfShare)/(ids.length-1):0;for(const id of ids){const member=members.get(id)||{id,name:id,paid:0,owed:0};member.owed+=id==='我'?selfShare:otherShare;members.set(id,member)}const payer=split.paidByParticipantId||'我';const payerRow=members.get(payer)||{id:payer,name:payer,paid:0,owed:0};payerRow.paid+=tx.amount;members.set(payer,payerRow)}return[...members.values()].map(person=>({...person,net:person.paid-person.owed})).sort((a,b)=>a.name.localeCompare(b.name,'zh-CN'))}
async function createOrUpdateBook(){
  if(savingBook.value)return
  bookFormError.value=''
  let previousBooks:Book[]|null=null,previousTransactions:Transaction[]|null=null
  try {
    if(!bookDraft.value.name.trim())throw new Error('请填写账本名称')
    if(bookDraft.value.startDate&&bookDraft.value.endDate&&bookDraft.value.startDate>bookDraft.value.endDate)throw new Error('结束日期不能早于开始日期')
    if(bookDraft.value.autoCollectEnabled&&!bookDraft.value.startDate)throw new Error('自动归集需要先设置开始日期，结束日期可以不填写')
    if(bookDraft.value.autoCollectEnabled&&bookRuleMode.value==='categories'&&!bookDraft.value.autoCollectCategoryIds.length)throw new Error('请至少选择一个归集分类')
    savingBook.value=true
    previousBooks=JSON.parse(JSON.stringify(snapshot.value.books));previousTransactions=JSON.parse(JSON.stringify(snapshot.value.transactions))
    let book=snapshot.value.books.find(item=>item.id===editingBookId.value)
    if(!book){book={id:crypto.randomUUID(),name:'',type:'custom',icon:'book',color:'#4f8ef7',note:'',startDate:null,endDate:null,isPinned:false,autoCollectEnabled:false,autoCollectCategoryIds:[],budgetLimitAmount:null,budgetStartDate:null,budgetEndDate:null,participants:[],createdOrder:Math.max(0,...snapshot.value.books.map((item,index)=>item.createdOrder??index))+1};snapshot.value.books.push(book)}
    const names=[...new Set(bookDraft.value.participants.split(/[，,]/).map(name=>name.trim()).filter(Boolean))]
    if(names.length&&!names.includes('我'))names.unshift('我')
    const rules=bookRuleMode.value==='all'?[]:bookRuleMode.value==='expense'?['-1']:bookRuleMode.value==='income'?['-2']:bookDraft.value.autoCollectCategoryIds.filter(id=>!id.startsWith('-'))
    Object.assign(book,{name:bookDraft.value.name.trim(),type:bookDraft.value.type,icon:bookDraft.value.icon,color:bookDraft.value.color,note:bookDraft.value.note,startDate:bookDraft.value.startDate||null,endDate:bookDraft.value.endDate||null,isPinned:bookDraft.value.isPinned,autoCollectEnabled:bookDraft.value.autoCollectEnabled,autoCollectCategoryIds:rules,budgetLimitAmount:Number(bookDraft.value.budgetLimitAmount)||null,budgetStartDate:bookDraft.value.startDate||null,budgetEndDate:bookDraft.value.endDate||null,participants:names.map(name=>({id:name,name}))})
    const result=book.autoCollectEnabled?applyAutoCollectRules(snapshot.value,book,{keepExisting:bookKeepExisting.value,collectMatching:bookCollectMatching.value}):{added:0,removed:0}
    await persist();bookOpen.value=false;notify(`账本已保存${result.added||result.removed?` · 新增归集 ${result.added} 笔，移除关联 ${result.removed} 笔`:''}`)
  }catch(cause){if(previousBooks)snapshot.value.books=previousBooks;if(previousTransactions)snapshot.value.transactions=previousTransactions;bookFormError.value=cause instanceof Error?cause.message:'账本保存失败'}finally{savingBook.value=false}
}
function openBookForm(book?:Book){
  editingBookId.value=book?.id||null
  bookDraft.value=book?{name:book.name,type:book.type,icon:book.icon,color:book.color,note:book.note,startDate:book.startDate||'',endDate:book.endDate||'',isPinned:book.isPinned,autoCollectEnabled:book.autoCollectEnabled,autoCollectCategoryIds:[...(book.autoCollectCategoryIds||[])].filter(id=>!id.startsWith('-')),budgetLimitAmount:book.budgetLimitAmount?String(book.budgetLimitAmount):'',participants:book.participants.map(item=>item.name).join(', ')}:{name:'',type:'custom',icon:'book',color:'#4f8ef7',note:'',startDate:'',endDate:'',isPinned:false,autoCollectEnabled:false,autoCollectCategoryIds:[],budgetLimitAmount:'',participants:''}
  bookRuleMode.value=book?.autoCollectCategoryIds.includes('-1')?'expense':book?.autoCollectCategoryIds.includes('-2')?'income':book?.autoCollectCategoryIds.length?'categories':'all'
  bookKeepExisting.value=true;bookCollectMatching.value=true;bookFormError.value='';bookOpen.value=true
}
async function manageInstallment(action:'cancel'|'payoff'){
  if(!editingId.value||savingEntry.value)return
  if(entryBaseline.value!==entryEditorState()&&!window.confirm('当前修改尚未保存，放弃修改并执行分期操作吗？'))return
  const message=action==='cancel'?'将整组现存分期合并为一笔流水，关联报销会保留。确定取消分期吗？':'将所有未到期分期汇总为今天的一笔还清流水，并移除未来记录，确定继续吗？'
  if(!window.confirm(message))return
  const previousTransactions=JSON.parse(JSON.stringify(snapshot.value.transactions)) as Transaction[]
  try{savingEntry.value=true;const row=action==='cancel'?cancelInstallment(snapshot.value,editingId.value):payOffInstallment(snapshot.value,editingId.value);await persist();entryOpen.value=false;activeTab.value=entryReturnTab.value;notify(action==='cancel'?'已取消分期并合并流水':`已立即还清 ${currency(row.amount)}`)}catch(cause){snapshot.value.transactions=previousTransactions;error.value=cause instanceof Error?cause.message:'分期操作失败'}finally{savingEntry.value=false}
}
async function deleteBook(book:Book){if(!window.confirm(`删除账本“${book.name}”？流水会保留，只移除这个账本的关联。`))return;snapshot.value.books=snapshot.value.books.filter(item=>item.id!==book.id);snapshot.value.transactions.forEach(tx=>{tx.bookIds=tx.bookIds.filter(id=>id!==book.id);if(tx.ledgerSplitSettings)delete tx.ledgerSplitSettings[book.id]});snapshot.value.budgets=snapshot.value.budgets.filter(budget=>budget.bookId!==book.id);if(selectedBookId.value===book.id)selectedBookId.value=null;await persist()}
async function toggleBookPinned(book:Book){book.isPinned=!book.isPinned;await persist();notify(book.isPinned?'账本已置顶':'已取消置顶')}
function returnToBooks(){selectedBookId.value=null;if(bookId.value){bookId.value=null;window.history.replaceState({},document.title,appBasePath)}activeTab.value='books'}
const bookDetailActions=computed<MenuAction[]>(()=>selectedBook.value?[
  {id:'settings',label:'账本设置',icon:'edit'},
  {id:'pin',label:selectedBook.value.isPinned?'取消置顶':'置顶账本',icon:'pin'},
  {id:'export',label:'导出账本',icon:'export',children:[{id:'export:csv',label:'CSV 表格',icon:'list'},{id:'export:md',label:'Markdown 文档',icon:'book'},{id:'export:html',label:'HTML 报表',icon:'export'}]},
  {id:'delete',label:'删除账本',icon:'trash',danger:true},
]:[])
function onBookDetailAction(id:string){const book=selectedBook.value;if(!book)return;if(id==='settings')openBookForm(book);else if(id==='pin')void toggleBookPinned(book);else if(id==='delete')void deleteBook(book);else if(id.startsWith('export:'))exportBook(book,id.slice(7) as 'html'|'md'|'csv')}
function openBudgetForm(item?:Budget){editingBudgetId.value=item?.id||null;budgetDraft.value=item?{name:item.name,limitAmount:String(item.limitAmount),periodType:item.periodType,year:item.year,month:item.month||new Date().getMonth()+1,startDate:item.startDate||'',endDate:item.endDate||'',categoryIds:[...item.categoryIds],bookId:item.bookId||''}:{name:'',limitAmount:'',periodType:'monthly',year:new Date().getFullYear(),month:new Date().getMonth()+1,startDate:'',endDate:'',categoryIds:[],bookId:''};budgetOpen.value=true}
async function createBudget(){if(!budgetDraft.value.name.trim()||Number(budgetDraft.value.limitAmount)<=0)return;if(budgetDraft.value.periodType==='range'&&(!budgetDraft.value.startDate||!budgetDraft.value.endDate||budgetDraft.value.startDate>budgetDraft.value.endDate)){error.value='请检查预算起止日期';return}const item:Budget={id:editingBudgetId.value||crypto.randomUUID(),name:budgetDraft.value.name.trim(),limitAmount:Number(budgetDraft.value.limitAmount),periodType:budgetDraft.value.periodType,year:Number(budgetDraft.value.year),month:budgetDraft.value.periodType==='monthly'?Number(budgetDraft.value.month):null,startDate:budgetDraft.value.periodType==='range'?budgetDraft.value.startDate:null,endDate:budgetDraft.value.periodType==='range'?budgetDraft.value.endDate:null,categoryIds:[...budgetDraft.value.categoryIds],bookId:budgetDraft.value.bookId||null};const index=snapshot.value.budgets.findIndex(row=>row.id===item.id);if(index>=0)snapshot.value.budgets.splice(index,1,item);else snapshot.value.budgets.push(item);await persist();budgetOpen.value=false;editingBudgetId.value=null;notify(index>=0?'预算已更新':'预算已创建')}
function budgetWindow(item:Budget){if(item.periodType==='monthly')return{start:new Date(item.year,item.month!-1,1),end:new Date(item.year,item.month!,1)};return{start:new Date(item.startDate||`${item.year}-01-01`),end:new Date(new Date(item.endDate||`${item.year}-12-31`).getTime()+86400000)}}
function spentForBudget(item:Budget){const window=budgetWindow(item);return budgetSpent(snapshot.value,item,window.start,window.end)}
function printPage(){window.print()}
async function pinCurrentRange(){const start=localDay(overviewRange.value.start),end=localDay(new Date(overviewRange.value.end.getTime()-86400000));const name=window.prompt('为这个统计区间命名',`${start} 至 ${end}`);if(!name?.trim())return;snapshot.value.pinnedRanges.push({id:crypto.randomUUID(),name:name.trim(),startDate:start,endDate:end});await persist();notify('统计区间已置顶')}
function openPinnedRange(id:string){const range=snapshot.value.pinnedRanges.find(item=>item.id===id);if(!range)return;transactionFilters.value={...transactionFilters.value,dateScope:'custom',startDate:range.startDate,endDate:range.endDate};activeTab.value='transactions'}
function openCategoryForm(category?:Category,parent?:Category){editingCategoryId.value=category?.id||null;categoryDraft.value={name:category?.name||'',flowType:category?.flowType||parent?.flowType||categoryPageFlow.value,parentId:category?.parentId||parent?.id||'',icon:category?.icon||parent?.icon||'🏷️',color:category?.color||parent?.color||'#4f8ef7'};categoryEditorOpen.value=true}
async function addCategory(){const name=categoryDraft.value.name.trim();if(!name)return;const parent=categoryDraft.value.parentId?snapshot.value.categories.find(item=>item.id===categoryDraft.value.parentId):null;const editing=editingCategoryId.value?snapshot.value.categories.find(item=>item.id===editingCategoryId.value):null;if(snapshot.value.categories.some(item=>item.id!==editing?.id&&item.parentId===(editing?.parentId??parent?.id??null)&&item.name===name)){error.value='同一级分类名称不能重复';return}if(editing){Object.assign(editing,{name,icon:categoryDraft.value.icon,color:categoryDraft.value.color});}else{snapshot.value.categories.push({id:crypto.randomUUID(),name,flowType:parent?.flowType||categoryDraft.value.flowType,icon:categoryDraft.value.icon,color:categoryDraft.value.color,parentId:parent?.id||null,sortOrder:snapshot.value.categories.filter(item=>item.parentId===(parent?.id||null)).length})}await persist();categoryEditorOpen.value=false;editingCategoryId.value=null;notify(editing?'分类已更新':'分类已创建')}
async function deleteCategory(category:Category){if(!window.confirm(`删除分类“${category.name}”？原有流水会保留并变为未分类。`))return;const ids=new Set<string>([category.id]);let changed=true;while(changed){changed=false;for(const item of snapshot.value.categories)if(item.parentId&&ids.has(item.parentId)&&!ids.has(item.id)){ids.add(item.id);changed=true}}snapshot.value.categories=snapshot.value.categories.filter(item=>!ids.has(item.id));snapshot.value.transactions.forEach(tx=>{if(tx.categoryId&&ids.has(tx.categoryId))tx.categoryId=null});await persist()}
async function reorderCategoryIds(ids:string[]){
  const first=snapshot.value.categories.find(category=>category.id===ids[0])
  if(!first)return
  const siblings=snapshot.value.categories.filter(category=>category.parentId===first.parentId&&category.flowType===first.flowType)
  if(ids.length!==siblings.length||new Set(ids).size!==ids.length||!siblings.every(category=>ids.includes(category.id)))return
  siblings.forEach(category=>{category.sortOrder=ids.indexOf(category.id)})
  try{await persist()}catch(cause){error.value=cause instanceof Error?cause.message:'分类顺序保存失败'}
}
function exportBook(book: Book, format: BookExportFormat) { downloadBookExport(book, snapshot.value, format) }
function describeImportProgress(progress:OcrProgress){
  if(!importSessionAlive)return
  const labels:Record<string,string>={'loading tesseract core':'正在加载识别引擎','initializing tesseract':'正在初始化识别引擎','loading language traineddata':'正在加载中文识别模型','initializing api':'正在准备识别','recognizing text':'正在识别图片文字'}
  importStatus.value=labels[progress.status]||progress.status||'正在处理账单';importProgress.value=progress.progress??null
}
async function processImportSources(ids:string[]){
  if(importBusy.value)return
  importBusy.value=true;error.value='';importProgress.value=null
  try{
    for(const id of ids){
      const source=importSources.value.find(source=>source.id===id);if(!source||!importSessionAlive)continue
      source.status='processing';source.error='';importStatus.value=`正在处理：${source.name}`
      let addedCategoryIds: string[] = []
      try{
        const rows=await parseBillFile(source.file,describeImportProgress)
        if(!importSessionAlive)return
        const existingCategories=new Set(snapshot.value.categories.map(category=>category.id))
        for(const item of rows){
          item.sourceId=source.id;item.sourceName=source.name
          applyImportDefaults(item,snapshot.value)
        }
        addedCategoryIds=snapshot.value.categories.filter(category=>!existingCategories.has(category.id)).map(category=>category.id)
        if(addedCategoryIds.length)await persist()
        if(!importSessionAlive)return
        candidates.value.push(...rows);selectedCandidateIds.value.push(...rows.map(item=>item.id));source.candidateCount=rows.length;source.status='ready'
      }catch(cause){snapshot.value.categories=snapshot.value.categories.filter(category=>!addedCategoryIds.includes(category.id));if(!importSessionAlive)return;source.status='error';source.error=cause instanceof Error?cause.message:'识别失败，请预览原件后重试'}
    }
    importStatus.value=`处理完成，当前有 ${candidates.value.length} 条待确认流水`
  }finally{if(importSessionAlive){importBusy.value=false;importProgress.value=null}}
}
async function importFiles(files:File[]){
  if(importBusy.value||savingCandidates.value.size||!files.length)return
  const existing=new Set(importSources.value.map(source=>`${source.name}:${source.file.size}:${source.file.lastModified}`))
  const added=files.filter(file=>{const key=`${file.name}:${file.size}:${file.lastModified}`;if(existing.has(key))return false;existing.add(key);return true})
  if(!added.length){notify('这些文件已在本次导入中，可直接预览或重试');return}
  const sources=added.map(file=>createImportSource(file));importSources.value.push(...sources)
  await processImportSources(sources.map(source=>source.id))
}
async function retryImportSource(id:string){if(!importBusy.value)await processImportSources([id])}
function openImportPreview(id:string,candidate?:ImportCandidate){if(!importSources.value.some(source=>source.id===id))return;previewContext.value=candidate||null;previewSourceId.value=id}
function removeImportSource(id:string){
  if(importBusy.value||savingCandidates.value.size)return
  const pending=candidates.value.filter(item=>item.sourceId===id)
  if(pending.length&&!window.confirm(`移除此原件及其 ${pending.length} 条待确认结果？已经入账的流水会保留。`))return
  const source=importSources.value.find(source=>source.id===id);if(!source)return
  if(previewSourceId.value===id)previewSourceId.value=null
  if(candidateDraft.value?.sourceId===id)candidateDraft.value=null
  const ids=new Set(pending.map(item=>item.id));candidates.value=candidates.value.filter(item=>!ids.has(item.id));selectedCandidateIds.value=selectedCandidateIds.value.filter(id=>!ids.has(id))
  importSources.value=importSources.value.filter(source=>source.id!==id);URL.revokeObjectURL(source.url)
}
function clearImportSession(){
  if(importBusy.value||savingCandidates.value.size)return
  if(candidates.value.length&&!window.confirm('清空本次原件和待确认结果？已经入账的流水会保留。'))return
  previewSourceId.value=null;candidateDraft.value=null;candidates.value=[];selectedCandidateIds.value=[]
  for(const source of importSources.value)URL.revokeObjectURL(source.url)
  importSources.value=[];importStatus.value='';importProgress.value=null
}
function openCandidateEditor(candidate:ImportCandidate){
  try{
    candidateError.value=''
    const draft=JSON.parse(JSON.stringify(candidate)) as ImportCandidate
    draft.title=normalizeOcrName(candidate.title);draft.merchant=normalizeOcrName(candidate.merchant)
    if(draft.bookIds===undefined&&selectedBook.value){draft.bookIds=[selectedBook.value.id];draft.hasExplicitBookSelection=true}
    candidateDraft.value=draft
  }catch(cause){error.value=cause instanceof Error?`打开编辑失败：${cause.message}`:'打开编辑失败'}
}
function closeCandidateEditor(){if(!savingCandidates.value.size){candidateDraft.value=null;candidateError.value=''}}
function updateCandidate(candidate:ImportCandidate){const index=candidates.value.findIndex(item=>item.id===candidate.id);if(index>=0)candidates.value[index]=candidate;closeCandidateEditor();notify('修改已保留，请确认后入账')}
async function saveCandidate(candidate:ImportCandidate,dateInput=candidate.happenedAtLocal){
  if(savingCandidates.value.size||savingEntry.value)return false
  savingCandidates.value.add(candidate.id);candidateError.value=''
  let previousTransactions:Transaction[]|null=null
  try{
    const occurredAt=dateInput?new Date(dateInput):candidate.happenedAt?new Date(candidate.happenedAt):null
    if(!occurredAt||Number.isNaN(occurredAt.getTime()))throw new Error('请对照原件补全订单日期时间后再入账')
    if(!candidate.title?.trim()||!Number.isFinite(candidate.amount)||Number(candidate.amount)<=0)throw new Error('请补全流水名称和大于 0 的金额')
    if(candidate.offsetEnabled&&(candidate.kind==='income'||!snapshot.value.categories.some(category=>category.id===candidate.offsetCategoryId&&category.flowType==='income')||!Number.isFinite(candidate.offsetRatio)||Number(candidate.offsetRatio)<=0||Number(candidate.offsetRatio)>100))throw new Error('请选择有效的报销或退款分类，并核对抵扣比例')
    const months=candidate.installmentMonths||1
    const start=localDay(candidate.installmentStartMonth||candidate.happenedAt||new Date())
    const books=candidate.bookIds??(selectedBook.value?[selectedBook.value.id]:[])
    const explicit=candidate.hasExplicitBookSelection??Boolean(candidate.bookIds!==undefined||selectedBook.value)
    const created=createTransaction(snapshot.value,{title:candidate.title.trim(),amount:Number(candidate.amount),kind:candidate.kind||'expense',happenedAt:occurredAt.toISOString(),categoryId:candidate.categoryId||null,bookIds:books,hasExplicitBookSelection:explicit,ledgerSplitSettings:candidate.ledgerSplitSettings,paymentMethod:candidate.paymentMethod||'',merchant:candidate.merchant||'',note:candidate.note||'',installmentMonths:months,installmentStartMonth:months>1?new Date(start+'T00:00:00').toISOString():null,originalAmount:candidate.originalAmount??null,discountAmount:candidate.discountAmount??null,premiumAmount:candidate.premiumAmount??null,paidByParticipantId:candidate.paidByParticipantId||null,splitParticipantIds:candidate.splitParticipantIds||[],splitMode:candidate.splitMode||'equal',splitRatio:candidate.splitRatio??null,splitAmount:candidate.splitAmount??null,source:'ocr'})
    previousTransactions=JSON.parse(JSON.stringify(snapshot.value.transactions))
    snapshot.value.transactions.unshift(...created)
    if(candidate.offsetEnabled&&created[0])syncOffset(created[0],true,candidate.offsetCategoryId||'',candidate.offsetRatio||100)
    if(candidate.paymentMethod&&!snapshot.value.settings.paymentChannels.includes(candidate.paymentMethod))snapshot.value.settings.paymentChannels.push(candidate.paymentMethod)
    await persist();candidates.value=candidates.value.filter(item=>item.id!==candidate.id);selectedCandidateIds.value=selectedCandidateIds.value.filter(id=>id!==candidate.id)
    if(candidateDraft.value?.id===candidate.id)candidateDraft.value=null
    notify('已确认并记入流水');return true
  }catch(cause){
    if(previousTransactions)snapshot.value.transactions=previousTransactions
    const message=cause instanceof Error?cause.message:'确认入账失败'
    if(candidateDraft.value?.id!==candidate.id)openCandidateEditor(candidate)
    candidateError.value=message;return false
  }finally{savingCandidates.value.delete(candidate.id)}
}
async function saveSelectedCandidates(){
  if(importBusy.value||savingCandidates.value.size)return
  const selected=candidates.value.filter(item=>selectedCandidateIds.value.includes(item.id))
  const incomplete=selected.filter(item=>!item.title?.trim()||!Number.isFinite(item.amount)||Number(item.amount)<=0||!(item.happenedAtLocal||item.happenedAt)||Number.isNaN(new Date(item.happenedAtLocal||item.happenedAt!).getTime()))
  if(incomplete.length){openCandidateEditor(incomplete[0]);candidateError.value=`所选流水有 ${incomplete.length} 条名称、金额或日期未补全，请先核对；本次尚未批量入账。`;return}
  for(const item of selected)if(!await saveCandidate(item))break
}
async function generateDemo(){if(!window.confirm('将在当前账本中加入一批可删除的模拟流水，继续吗？'))return;const expenseCategories=flatCategories.value.filter(item=>item.flowType==='expense');const book=snapshot.value.books[0];for(const [index,title] of ['早餐','地铁出行','超市采购','咖啡','电影票','工资到账','水电缴费','打车','水果'].entries()){const category=expenseCategories[index%expenseCategories.length];const date=new Date();date.setDate(date.getDate()-index);snapshot.value.transactions.push(...createTransaction(snapshot.value,{title,amount:[18,5,86,24,58,8500,126,22,35][index],kind:title==='工资到账'?'income':'expense',happenedAt:date.toISOString(),categoryId:title==='工资到账'?null:category.id,bookIds:book?[book.id]:[],paymentMethod:index?'微信':'银行卡',note:'模拟数据',installmentMonths:1}))}await persist();notify('已生成模拟流水')}
async function chooseBackground(event:Event){const file=(event.target as HTMLInputElement).files?.[0];if(!file)return;if(file.size>5*1024*1024){error.value='背景图片不能超过 5 MB';return}const reader=new FileReader();reader.onload=async()=>{snapshot.value.settings.backgroundDataUrl=String(reader.result);await persist()};reader.readAsDataURL(file)}
function setTab(tab:typeof activeTab.value){if(savingEntry.value||savingCandidates.value.size)return false;if(activeTab.value==='entry'&&entryOpen.value&&entryBaseline.value!==entryEditorState()&&!window.confirm('当前流水尚未保存，放弃修改并离开吗？'))return false;if(bookId.value){selectedBookId.value=bookId.value;window.history.replaceState({},document.title,appBasePath);bookId.value=null}if(activeTab.value==='entry'&&tab!=='entry')entryOpen.value=false;activeTab.value=tab;if(tab!=='more')morePage.value='menu';if(tab==='entry')openEntry();return true}
function navigateTab(id: string) {
  if (!setTab(id as typeof activeTab.value)) return
  // Navigation always opens the section root, including a second tap on the active item.
  selectedBookId.value = null
  morePage.value = 'menu'
  nextTick(() => window.scrollTo({ top: 0, left: 0, behavior: 'instant' }))
}
function openCalendar(){calendarOpen.value=true}
watch(()=>entryDraft.value.kind,kind=>{if(entryDraft.value.categoryId&&snapshot.value.categories.find(item=>item.id===entryDraft.value.categoryId)?.flowType!==kind)entryDraft.value.categoryId=''})
watch(()=>[snapshot.value.settings.cloudSyncEnabled,snapshot.value.settings.midnightSyncEnabled],scheduleMidnightSync)
</script>

<template>
  <main class="ledger-app" :class="`theme-${snapshot.settings.appearanceMode}`" :style="snapshot.settings.backgroundDataUrl?{backgroundImage:`linear-gradient(var(--ledger-image-overlay),var(--ledger-image-overlay)),url(${snapshot.settings.backgroundDataUrl})`}:{}" @keydown.esc="calendarOpen=false">
    <aside class="ledger-sidebar"><a class="ledger-brand" href="/"><span>🐟</span><b>SmartLedger</b></a><nav><button v-for="item in [{id:'overview',label:'概览',icon:'overview'},{id:'books',label:'账本',icon:'book'},{id:'transactions',label:'流水',icon:'list'},{id:'import',label:'识图',icon:'scan'},{id:'more',label:'更多',icon:'more'}]" :key="item.id" :class="{active:activeTab===item.id}" @click="navigateTab(item.id)"><i><UiIcon :name="item.icon" :size="21"/></i>{{ item.label }}</button></nav><div class="sidebar-spacer"></div><div class="account-chip"><span class="avatar">{{ user.profile?.name?.toString().slice(0,1)||'我' }}</span><div><b>{{ user.profile?.name||'本地超管' }}</b><small>{{ user.profile?.email||'本地账户' }}</small></div></div></aside>
    <section class="ledger-main"><header class="ledger-topbar"><div><small>SMARTLEDGER / {{ selectedBook?.name||'个人空间' }}</small><h1>{{ bookId&&selectedBook?'旅行账本':activeTab==='overview'?'概览':activeTab==='books'?'账本':activeTab==='transactions'?'流水':activeTab==='import'?'识图导入':activeTab==='entry'?'记账':morePage==='menu'?'更多':morePage==='settings'?'设置':morePage==='categories'?'分类':'预算' }}</h1></div><div class="top-actions"><AppSwitcher/><button class="icon-button calendar-shortcut" title="收支日历" aria-label="收支日历" @click="openCalendar"><UiIcon name="calendar" :size="18"/></button><button class="icon-button" title="云同步" aria-label="云同步" @click="syncNow()"><UiIcon name="sync" :size="18"/><span>{{ syncMessage.includes('完成')?'已同步':'同步' }}</span></button><button class="primary-button" @click="openEntry()"><UiIcon name="plus" :size="17"/>记一笔</button></div></header>
      <div v-if="loading" class="loading-state">正在打开本地账本…</div>
      <div v-else-if="error" class="notice error-notice">{{ error }} <button @click="error=''">关闭</button></div>
      <section v-if="syncConflict" class="conflict-banner"><div><b>本地与云端都有更新</b><p>选择保留一侧，另一侧的数据会被替换。</p><small>本地 {{ syncConflict.local.transactions.length }} 笔 · 云端 {{ syncConflict.remote.snapshot?.transactions.length||0 }} 笔</small></div><button @click="resolveSyncConflict(false)">采用云端</button><button class="primary-button" @click="resolveSyncConflict(true)">保留本地</button></section>

      <OverviewDashboard v-if="activeTab==='overview'&&!bookId" v-model:period="period" :snapshot="snapshot" @calendar="openCalendar" @pin="pinCurrentRange" @range="openPinnedRange" @remove-range="snapshot.pinnedRanges=snapshot.pinnedRanges.filter(item=>item.id!==$event);persist()" @budgets="activeTab='more';morePage='budgets'" @create-budget="activeTab='more';morePage='budgets';budgetOpen=true" @entry="openEntry()" @import="navigateTab('import')" @transactions="navigateTab('transactions')" @edit="openEntry" />

      <section v-if="activeTab==='books'||(bookId&&activeTab==='transactions')" class="page-content">
        <BookLibrary v-show="!selectedBook" v-model:search="bookSearch" :books="snapshot.books" :transactions="snapshot.transactions" @open="selectedBookId=$event.id;activeTab='books'" @create="openBookForm()" @edit="openBookForm" @pin="toggleBookPinned" @delete="deleteBook" @export="exportBook" />
        <div v-if="selectedBook" class="book-detail ledger-view">
          <button class="bd-back" type="button" @click="returnToBooks"><UiIcon name="back" :size="16"/>所有账本</button>
          <section class="detail-hero" :style="{'--book-accent':selectedBook!.color||'#4f8ef7'}">
            <div class="detail-hero-main"><span class="detail-book-icon"><CategoryIcon :name="selectedBook!.icon||'book'" :color="selectedBook!.color" :size="30"/></span><div><small>{{ selectedBook!.type==='trip'?'旅行账本':'个人账本' }}<i v-if="selectedBook!.isPinned"> · 已置顶</i></small><h2>{{ selectedBook!.name }}</h2><p>{{ selectedBook!.destination||selectedBook!.note||'将相关流水归集在一起' }}</p><div class="detail-meta"><span v-if="selectedBook!.startDate||selectedBook!.endDate">◷ {{ selectedBook!.startDate||'不限开始' }}<template v-if="selectedBook!.endDate"> — {{ selectedBook!.endDate }}</template></span><span>{{ selectedBookTransactions.length }} 笔流水</span></div></div></div>
            <div class="bd-toolbar"><button class="lv-button primary" type="button" @click="openEntry()"><UiIcon name="plus" :size="16"/>记一笔</button><ActionMenu :actions="bookDetailActions" label="账本操作" @select="onBookDetailAction"><template #trigger><UiIcon name="more"/><span>账本操作</span></template></ActionMenu></div>
          </section>
          <section class="bd-summary" aria-label="账本收支汇总"><div><small>累计支出</small><strong class="lv-expense">{{ currency(selectedBookTotals.expenses) }}</strong></div><div><small>累计收入</small><strong class="lv-income">{{ currency(selectedBookTotals.income) }}</strong></div><div><small>账本净额</small><strong>{{ currency(selectedBookTotals.balance) }}</strong></div><footer v-if="selectedBookTotals.discounts||selectedBookTotals.premiums"><span v-if="selectedBookTotals.discounts">累计优惠 <b>{{ currency(selectedBookTotals.discounts) }}</b></span><span v-if="selectedBookTotals.premiums">额外溢价 <b>{{ currency(selectedBookTotals.premiums) }}</b></span></footer></section>
          <section v-if="selectedBook!.budgetLimitAmount" class="panel book-budget-panel"><div class="panel-heading"><div><h2>账本预算</h2><small>{{ selectedBook!.budgetStartDate||selectedBook!.startDate||'不限开始' }}<template v-if="selectedBook!.budgetEndDate||selectedBook!.endDate"> — {{ selectedBook!.budgetEndDate||selectedBook!.endDate }}</template></small></div><strong>{{ selectedBookBudgetRatio.toFixed(0) }}%</strong></div><div class="book-budget-track"><i :class="{over:selectedBookTotals.expenses>selectedBook!.budgetLimitAmount}" :style="{width:`${selectedBookBudgetRatio}%`}"></i></div><div class="book-budget-values"><span>已用 <b>{{ currency(selectedBookTotals.expenses) }}</b></span><span>预算 <b>{{ currency(selectedBook!.budgetLimitAmount) }}</b></span><span>剩余 <b>{{ currency(selectedBook!.budgetLimitAmount-selectedBookTotals.expenses) }}</b></span></div></section>
          <section v-if="selectedBook!.participants.length" class="panel participant-panel"><div class="panel-heading"><div><h2>分账成员</h2><small>{{ selectedBook!.participants.length }} 位参与者</small></div><button class="small-link" @click="openBookForm(selectedBook!)">管理成员 →</button></div><div class="participant-chips"><span v-for="person in selectedBook!.participants" :key="person.id"><i>{{ person.name.slice(0,1) }}</i>{{ person.name }}</span></div></section>
          <div v-if="selectedBook!.participants.length>1" class="panel settlement-panel"><div class="panel-heading"><div><h2>最终分账</h2><small>按已记录的付款人与分摊成员计算</small></div></div><div v-for="person in bookSettlement(selectedBook!)" :key="person.id"><b>{{ person.name }}</b><span>支付 {{ currency(person.paid) }} · 应承担 {{ currency(person.owed) }}</span><strong :class="person.net>=0?'income':'expense'">{{ person.net>=0?'应收 ':'应付 ' }}{{ currency(Math.abs(person.net)) }}</strong></div></div>
          <section class="detail-transactions"><div class="panel-heading"><div><h2>账本流水</h2><small>按时间倒序排列，可点开修改记录</small></div><span>{{ selectedBookTransactions.length }} 笔</span></div><TransactionList :transactions="selectedBookTransactions" :categories="flatCategories" :books="snapshot.books" delete-label="移出当前账本" @edit="openEntry" @delete="removeTransactionFromBook(selectedBook!, $event)"/></section>
        </div>
      </section>

<TransactionsPage v-if="activeTab==='transactions'&&!bookId" v-model="transactionFilters" :transactions="snapshot.transactions" :categories="flatCategories" :books="snapshot.books" :appearance-mode="snapshot.settings.appearanceMode" @create="openEntry()" @edit="openEntry" @delete="deleteTransaction" />
      <OcrImportWorkbench v-if="activeTab==='import'" v-model:selected-ids="selectedCandidateIds" :sources="importSources" :candidates="candidates" :snapshot="snapshot" :busy="importBusy" :saving="savingCandidates.size>0" :status="importStatus" :progress="importProgress" @files="importFiles" @preview="openImportPreview" @remove="removeImportSource" @retry="retryImportSource" @clear="clearImportSession" @edit="openCandidateEditor" @confirm="saveCandidate($event)" @confirm-selected="saveSelectedCandidates"/>
      <OcrCandidateEditor v-if="candidateDraft" :key="candidateDraft.id" :candidate="candidateDraft" :snapshot="snapshot" :source="importSources.find(source=>source.id===candidateDraft?.sourceId)" :saving="savingCandidates.size>0" :error="candidateError" @close="closeCandidateEditor" @update="updateCandidate" @confirm="saveCandidate($event)" @preview="openImportPreview($event.sourceId||'',$event)"/>
      <ImportSourcePreview v-if="previewSource" :source="previewSource" :initial-page="previewContext?.sourcePage" :initial-row="previewContext?.sourceRow" :initial-sheet="previewContext?.sourceSheet" @close="previewSourceId=null"/>

      <section v-if="activeTab==='entry'" class="page-content entry-page">
        <form class="entry-editor feature-form" @submit.prevent="saveEntry">
          <header class="feature-form-header"><div><span class="home-eyebrow">{{ editingId?'EDIT TRANSACTION':'NEW TRANSACTION' }}</span><h2>{{ editingId?'修改流水':'记录这一笔' }}</h2><p>整理账本、分类与分期，让每笔收支清清楚楚</p></div><button type="button" class="feature-icon-button" aria-label="关闭记账" @click="cancelEntry"><UiIcon name="close"/></button></header>
          <div v-if="entryOpen" class="entry-form-body">
            <section class="feature-section entry-basic"><div class="feature-fields"><label>收支类型<select v-model="entryDraft.kind"><option value="expense">支出</option><option value="income">收入</option></select></label><label>金额<input v-model="entryDraft.amount" type="number" min="0.01" step="0.01" required placeholder="0.00"/></label><label>名称<input v-model.trim="entryDraft.title" required maxlength="240" placeholder="这笔钱用在了哪里？"/></label><label>时间<input v-model="entryDraft.happenedAt" type="datetime-local" required @input="entryLinkedSource&&(entryOffsetDateMode='independent')"/><span v-if="entryLinkedSource" class="offset-date-follow"><input type="checkbox" :checked="entryOffsetDateMode==='source'" @change="setEntryOffsetDateFollow"/>日期跟随原支出</span></label><CategoryPicker v-model="entryDraft.categoryId" title="分类" placeholder="未分类" :allow-unassigned="true" :categories="flatCategories" :flow-type="entryDraft.kind" :appearance-mode="snapshot.settings.appearanceMode"/><label>支付渠道<input v-model.trim="entryDraft.paymentMethod" list="payment-channels" placeholder="微信、支付宝、银行卡…"/><datalist id="payment-channels"><option v-for="channel in snapshot.settings.paymentChannels" :key="channel" :value="channel"/></datalist></label></div></section>
            <BookAssignmentPicker v-model="entryDraft.bookIds" v-model:explicit="entryExplicitBooks" v-model:split-settings="entrySplitSettings" :snapshot="snapshot" :happened-at="entryDraft.happenedAt" :category-id="entryDraft.categoryId||null" :kind="entryDraft.kind" :editing="Boolean(editingId)"/>
            <InstallmentControls v-model:enabled="entryInstallmentEnabled" :months="Number(entryDraft.installmentMonths)||2" @update:months="entryDraft.installmentMonths=String($event)" v-model:start-date="entryInstallmentStartDate" :amount="Number(entryDraft.amount)" :existing="Boolean(editingTransaction?.installmentGroupId)" :index="editingTransaction?.installmentIndex" :original-total="editingTransaction?.installmentOriginalTotal" @update:enabled="($event) => { if($event&&Number(entryDraft.installmentMonths)<2)entryDraft.installmentMonths='2' }" @cancel="manageInstallment('cancel')" @payoff="manageInstallment('payoff')"/>
            <OffsetManager v-if="entryDraft.kind==='expense'" ref="entryOffsetManager" :enabled="entryDraft.offsetEnabled" @update:enabled="setEntryOffsetsEnabled" v-model:edits="entryOffsetEdits" v-model:drafts="entryOffsetDrafts" :existing="entryExistingOffsets" :amount="Number(entryDraft.amount)" :source-date="entryDraft.happenedAt" :editing="Boolean(editingId)" :categories="flatCategories" :appearance-mode="snapshot.settings.appearanceMode" :disabled="savingEntry" @clear="entryClearOffsetIds=$event"/>
            <details class="feature-section entry-advanced"><summary>更多信息 <span>商户、优惠、备注与个人分摊</span></summary><div class="feature-fields"><label>商户<input v-model.trim="entryDraft.merchant"/></label><label>原价<input v-model="entryDraft.originalAmount" type="number" min="0" step="0.01"/></label><label>优惠金额<input v-model="entryDraft.discountAmount" type="number" min="0" step="0.01"/></label><label>溢价金额<input v-model="entryDraft.premiumAmount" type="number" min="0" step="0.01"/></label><label>个人分摊方式<select v-model="entryDraft.splitMode"><option value="equal">平均分摊</option><option value="ratio">本人比例</option><option value="fixed">本人固定金额</option></select></label><label v-if="entryDraft.splitMode==='ratio'">本人比例（%）<input v-model="entryDraft.splitRatio" type="number" min="0" max="100"/></label><label v-if="entryDraft.splitMode==='fixed'">本人分摊金额<input v-model="entryDraft.splitAmount" type="number" min="0" :max="entryDraft.amount" step="0.01"/></label><label class="feature-full">备注<textarea v-model.trim="entryDraft.note" rows="3" placeholder="给这一笔留个备注"/></label></div></details>
            <p v-if="error" class="feature-error" role="alert">{{ error }}</p><footer class="feature-form-footer"><small>本地保存 · 按当前设置同步云端</small><button type="button" class="feature-button" :disabled="savingEntry" @click="cancelEntry">取消</button><button class="feature-button accent" :disabled="savingEntry">{{ savingEntry?'保存中…':'保存流水' }}</button></footer>
          </div>
        </form>
      </section>

      <section v-if="activeTab==='more'" class="page-content"><div v-if="morePage==='menu'" class="more-grid"><button @click="morePage='budgets'">💰<b>预算管理</b><small>设置月度或区间预算</small></button><button @click="morePage='categories'">🏷️<b>分类管理</b><small>维护收入和支出分类</small></button><button @click="morePage='settings'">⚙️<b>设置与云同步</b><small>外观、同步、支付渠道</small></button></div>
        <div v-else-if="morePage==='budgets'" class="panel management-page budget-management"><div class="panel-heading"><div><h2>预算管理</h2><small>支持月度预算和自定义区间，可关联分类与账本</small></div><button class="primary-button" @click="openBudgetForm()">＋ 新建预算</button></div><article v-for="budget in snapshot.budgets" :key="budget.id" class="manage-row"><div><b>{{ budget.name }}</b><small>{{ budget.periodType==='monthly'?`${budget.year}年${budget.month}月`:`${budget.startDate} 至 ${budget.endDate}` }} · {{ budget.categoryIds.map(categoryName).join('、')||'全部分类' }}</small></div><div><strong>{{ currency(spentForBudget(budget)) }}</strong><small> / {{ currency(budget.limitAmount) }}</small><progress :value="spentForBudget(budget)" :max="budget.limitAmount"/></div><button @click="openBudgetForm(budget)">编辑</button><button @click="snapshot.budgets=snapshot.budgets.filter(item=>item.id!==budget.id);persist()">删除</button></article><div v-if="!snapshot.budgets.length" class="budget-empty"><span><UiIcon name="budget" :size="26" /></span><b>还没有预算</b><p>点击“新建预算”，为每一笔支出留好计划。</p></div></div>
        <CategoryManager v-else-if="morePage==='categories'" v-model:flow-type="categoryPageFlow" :categories="snapshot.categories" @back="morePage='menu'" @create="openCategoryForm(undefined,$event)" @edit="openCategoryForm" @delete="deleteCategory" @reorder="reorderCategoryIds" />
        <div v-else-if="morePage==='settings'" class="settings-page">
          <div class="settings-intro"><span class="settings-kicker">PREFERENCES</span><h2>设置</h2><p>管理外观、本地偏好和云端备份方式。</p></div>
          <section class="settings-card"><header><span class="settings-icon">◐</span><div><h3>外观</h3><small>按你的设备和阅读习惯调整界面</small></div></header>
            <label class="setting-row"><span><b>主题模式</b><small>跟随系统、浅色或深色</small></span><select v-model="snapshot.settings.appearanceMode" @change="persist"><option value="system">跟随系统</option><option value="light">白天</option><option value="dark">夜间</option></select></label>
            <div class="setting-row"><span><b>背景图片</b><small>本地选择，不会上传到云端</small></span><div class="setting-row-actions"><label class="secondary-button file-pick">选择图片<input type="file" accept="image/*" @change="chooseBackground"/></label><button v-if="snapshot.settings.backgroundDataUrl" class="text-button" @click="snapshot.settings.backgroundDataUrl=null;persist()">恢复默认</button></div></div>
          </section>
          <section class="settings-card"><header><span class="settings-icon">⌁</span><div><h3>记账偏好</h3><small>决定新流水的默认行为</small></div></header>
            <label class="setting-row"><span><b>账本归属推荐</b><small>新流水自动推荐符合条件的账本</small></span><input v-model="snapshot.settings.bookAssignmentPromptEnabled" type="checkbox" @change="persist"/></label>
            <PaymentChannelSettings :channels="snapshot.settings.paymentChannels" :saving="savingChannels" :error="channelError" @change="savePaymentChannels"/>
          </section>
          <section class="settings-card"><header><span class="settings-icon">☁</span><div><h3>SmartLedger 云同步</h3><small>账号隔离的版本化快照，可在多设备间同步</small></div></header>
            <label class="setting-row"><span><b>启用云同步</b><small>保存流水时与 SmartLedger 服务同步</small></span><input v-model="snapshot.settings.cloudSyncEnabled" type="checkbox" @change="persist"/></label>
            <label class="setting-row"><span><b>同步策略</b><small>设置自动同步的触发方式</small></span><select v-model="snapshot.settings.cloudSyncSchedule" @change="persist"><option value="on_change">每次改动后</option><option value="periodic">定时 / 手动</option><option value="on_app_open">打开应用时</option></select></label>
            <label class="setting-row"><span><b>每日同步</b><small>每天午夜自动检查一次更新</small></span><input v-model="snapshot.settings.midnightSyncEnabled" type="checkbox" @change="persist"/></label>
            <div class="sync-status"><span>云端版本</span><b>revision {{ readSyncMetadata(accountKey).revision }}</b><small>{{ syncMessage||'尚未同步' }}</small></div>
            <div class="settings-actions"><button class="primary-button" :disabled="busy" @click="syncNow()">智能同步</button><button class="secondary-button" :disabled="busy" @click="pushLocalNow()">仅推送</button><button class="secondary-button" :disabled="busy" @click="pullRemoteNow()">仅拉取</button></div>
          </section>
          <ApiSecurityPanel :api-url="apiUrl" :token="user.access_token"/>
          <section class="settings-card nutstore-card"><header><span class="settings-icon">☁</span><div><h3>坚果云 WebDAV</h3><small>把当前账本快照备份到你的坚果云空间</small></div><span class="provider-badge">可选备份</span></header>
            <div class="nutstore-help">请先在坚果云的“安全选项 → 第三方应用管理”创建应用密码。这里填写坚果云注册邮箱和应用密码，不要填写登录密码。</div>
            <p class="nutstore-message">{{ nutstoreStatus.needsUpdate?'已有凭证需要恢复密钥或重新配置':nutstoreStatus.configured?`已加密保存 · ${nutstoreStatus.usernameMasked||'当前账号'}`:'尚未配置' }} · {{ nutstoreStatus.available?'AES-256-GCM 服务器加密存储':'服务器加密密钥未配置' }}</p>
            <label class="nutstore-field"><span>坚果云账号</span><input v-model.trim="nutstoreCredentials.username" type="email" autocomplete="off" :placeholder="nutstoreStatus.configured?'更换配置时填写完整邮箱':'name@example.com'"/></label>
            <label class="nutstore-field"><span>第三方应用密码</span><input v-model="nutstoreCredentials.appPassword" type="password" autocomplete="new-password" :placeholder="nutstoreStatus.configured?'已保存，留空继续使用；更新时重新填写':'坚果云生成的应用密码'"/></label>
            <p class="nutstore-endpoint">WebDAV 地址 <code>https://dav.jianguoyun.com/dav/</code></p>
            <p v-if="nutstoreStatus.backupPath" class="nutstore-endpoint">当前账号备份文件 <code style="overflow-wrap:anywhere;user-select:all">{{ nutstoreStatus.backupPath }}</code></p>
            <p class="nutstore-message">支持网页版和原 App v2 快照，恢复时自动转换分类与账本关联；覆盖前的旧文件保存在 SmartLedger/history/。</p>
            <div class="settings-actions"><button class="secondary-button" :disabled="busy" @click="saveNutstoreOnly">加密保存配置</button><button class="secondary-button" :disabled="busy" @click="testNutstoreConnection">测试连接并保存</button><button class="primary-button" :disabled="busy" @click="backupNutstore">立即备份</button><button class="secondary-button" :disabled="busy" @click="restoreNutstore">从坚果云恢复</button><button class="text-button" :disabled="busy" @click="removeNutstoreConfig">清除配置</button></div>
            <p v-if="nutstoreMessage" class="nutstore-message" role="status">{{ nutstoreMessage }}</p>
            <small class="privacy-note">账号与应用密码由服务器 AES-256-GCM 加密保存，浏览器不保存或回显密码，凭证不会进入账本快照。JSON 备份文件本身未加密。恢复操作会替换本机账本，请先保留本机备份。</small>
          </section>
          <section class="settings-card"><header><span class="settings-icon">✦</span><div><h3>本地数据</h3><small>演示数据只写入当前浏览器账本，可手动删除</small></div></header><div class="settings-actions"><button class="secondary-button" @click="generateDemo">生成模拟数据</button><span class="local-data-count">本机保存 {{ snapshot.transactions.length }} 笔流水 · {{ snapshot.books.length }} 本账</span></div></section>
        </div>
      </section>

      <div v-if="categoryEditorOpen" class="modal-shade category-editor-shade" @click.self="categoryEditorOpen=false"><form class="modal-card category-editor-card" @submit.prevent="addCategory"><header><div><small>CATEGORY DESIGN</small><h2>{{ editingCategoryId?'编辑分类':categoryDraft.parentId?'新建子分类':'新建分类' }}</h2></div><button type="button" aria-label="关闭" @click="categoryEditorOpen=false">×</button></header><label>分类名称<input v-model.trim="categoryDraft.name" autofocus maxlength="48" required placeholder="例如：餐饮、交通"/></label><div v-if="!editingCategoryId" class="category-editor-type"><span>收支类型</span><div class="category-management-tabs compact"><button type="button" :class="{selected:categoryDraft.flowType==='expense'}" @click="categoryDraft.flowType='expense';categoryDraft.parentId=''">↗ 支出</button><button type="button" :class="{selected:categoryDraft.flowType==='income'}" @click="categoryDraft.flowType='income';categoryDraft.parentId=''">↙ 收入</button></div></div><label v-if="!editingCategoryId">所属一级分类<select v-model="categoryDraft.parentId"><option value="">作为一级分类</option><option v-for="item in flatCategories.filter(c=>c.flowType===categoryDraft.flowType)" :key="item.id" :value="item.id">{{ categoryPath(snapshot.categories,item.id).map(node=>node.name).join(' / ') }}</option></select></label><div class="category-editor-label">图标</div><CategoryIconPicker v-model="categoryDraft.icon" :category-name="categoryDraft.name" :flow-type="categoryDraft.flowType" :color="categoryDraft.color"/><div class="category-editor-label">颜色</div><div class="category-color-options"><button v-for="color in ['#fa8b62','#efba4b','#4cae87','#55a3ed','#8e7de8','#e478a0','#58b9b0','#83929d']" :key="color" type="button" :class="{selected:categoryDraft.color===color}" :style="{background:color}" :aria-label="`选择颜色 ${color}`" @click="categoryDraft.color=color"></button></div><p v-if="error" class="error-notice">{{ error }}</p><footer><button class="secondary-button" type="button" @click="categoryEditorOpen=false">取消</button><button class="primary-button" type="submit">{{ editingCategoryId?'保存修改':'创建分类' }}</button></footer></form></div>
      <div v-if="calendarOpen" class="modal-shade calendar-modal-shade" role="presentation" @click.self="calendarOpen=false" @keydown.esc="calendarOpen=false"><section class="calendar-modal-card" role="dialog" aria-modal="true" aria-labelledby="calendar-modal-title" tabindex="-1"><header><div><small>FINANCE CALENDAR</small><h2 id="calendar-modal-title">收支日历</h2><p>按日查看账目，点击日期查看当天流水</p></div><button type="button" aria-label="关闭日历" @click="calendarOpen=false">×</button></header><div class="calendar-month-bar"><button type="button" aria-label="上个月" @click="calendarMonth=new Date(calendarMonth.getFullYear(),calendarMonth.getMonth()-1,1)">‹</button><div><b>{{ calendarMonth.getFullYear() }}年{{ calendarMonth.getMonth()+1 }}月</b><small>{{ calendarMonthTotals.count }} 笔流水</small></div><button type="button" aria-label="下个月" @click="calendarMonth=new Date(calendarMonth.getFullYear(),calendarMonth.getMonth()+1,1)">›</button><button type="button" class="calendar-today" @click="calendarMonth=new Date(new Date().getFullYear(),new Date().getMonth(),1);calendarDay=localDateKey(new Date())">今天</button></div><div class="calendar-month-summary"><div><small>本月支出</small><b class="expense">{{ currency(calendarMonthTotals.expense) }}</b></div><div><small>本月收入</small><b class="income">{{ currency(calendarMonthTotals.income) }}</b></div><div><small>本月结余</small><b>{{ currency(calendarMonthTotals.income-calendarMonthTotals.expense) }}</b></div></div><div class="calendar-modal-grid"><b v-for="day in ['一','二','三','四','五','六','日']" :key="day">{{ day }}</b><button v-for="cell in calendarCells" :key="cell.key" type="button" :class="{muted:!cell.inMonth,selected:calendarDay===cell.key,hasRecords:cell.expense>0||cell.income>0}" @click="calendarDay=cell.key"><span>{{ cell.day }}</span><i v-if="cell.expense>0" class="expense-mark"></i><i v-if="cell.income>0" class="income-mark"></i></button></div><section class="calendar-selected-day"><header><div><h3>{{ calendarDay }}</h3><small>{{ calendarSelectedTransactions.length }} 笔流水</small></div><div class="calendar-selected-totals"><span v-if="calendarSelectedTransactions.some(tx=>tx.kind==='expense')">支出 <b class="expense">{{ currency(calendarSelectedTransactions.filter(tx=>tx.kind==='expense').reduce((sum,tx)=>sum+tx.amount,0)) }}</b></span><span v-if="calendarSelectedTransactions.some(tx=>tx.kind==='income')">收入 <b class="income">{{ currency(calendarSelectedTransactions.filter(tx=>tx.kind==='income').reduce((sum,tx)=>sum+tx.amount,0)) }}</b></span></div></header><div v-if="calendarSelectedTransactions.length" class="calendar-transaction-list"><article v-for="tx in calendarSelectedTransactions" :key="tx.id"><i :class="tx.kind">{{ tx.kind==='expense'?'↗':'↙' }}</i><div><b>{{ tx.title }}</b><small>{{ new Date(tx.happenedAt).toLocaleTimeString('zh-CN',{hour:'2-digit',minute:'2-digit'}) }} · {{ categoryName(tx.categoryId) }}</small></div><strong :class="tx.kind">{{ tx.kind==='expense'?'−':'+' }}{{ currency(tx.amount) }}</strong></article></div><p v-else class="calendar-empty-day">这一天没有流水</p></section></section></div>
      <div v-if="bookOpen" class="modal-shade book-editor-shade" @click.self="() => { if(!savingBook)bookOpen=false }"><form class="modal-card feature-form book-editor-form" role="dialog" aria-modal="true" aria-labelledby="book-editor-title" @keydown.esc.stop.prevent="() => { if(!savingBook)bookOpen=false }" @submit.prevent="createOrUpdateBook"><header class="feature-form-header"><div><span class="home-eyebrow">LEDGER SETTINGS</span><h2 id="book-editor-title">{{ editingBookId?'账本设置':'创建一个账本' }}</h2><p>设定期间与归集规则，把相关记录放在一起</p></div><button type="button" class="feature-icon-button" aria-label="关闭账本设置" :disabled="savingBook" @click="bookOpen=false"><UiIcon name="close"/></button></header>
        <section class="feature-section"><div class="feature-fields"><label>账本名称<input v-model.trim="bookDraft.name" required maxlength="160" placeholder="例如：十月生活、杭州旅行"/></label><label>类型<select v-model="bookDraft.type"><option value="general">日常账本</option><option value="custom">主题账本</option><option value="trip">旅行账本</option></select></label><label>图标<input v-model="bookDraft.icon" maxlength="64" placeholder="book 或 emoji"/></label><label>颜色<input v-model="bookDraft.color" type="color"/></label><label class="feature-full">备注<input v-model.trim="bookDraft.note"/></label><label>开始日期<input v-model="bookDraft.startDate" type="date"/></label><label>结束日期<input v-model="bookDraft.endDate" type="date" :min="bookDraft.startDate"/></label><label>预算上限<input v-model="bookDraft.budgetLimitAmount" type="number" min="0" step="0.01" placeholder="可不填写"/></label><label>参与人<input v-model="bookDraft.participants" placeholder="我, 小明"/><small>使用逗号分隔，自动保留“我”</small></label></div></section>
        <section class="feature-section book-auto-rules"><header class="feature-heading"><div><h3>自动归集流水</h3><p>匹配账本期间内的流水，不影响其他账本的关联</p></div><label class="feature-switch"><input v-model="bookDraft.autoCollectEnabled" type="checkbox"/><span></span><b>启用</b></label></header><template v-if="bookDraft.autoCollectEnabled"><p v-if="!bookDraft.startDate" class="feature-help warning">先设置开始日期即可归集，结束日期可留空。<button type="button" class="feature-text-button" @click="bookDraft.startDate=localDay(new Date())">使用今天</button></p><div class="rule-mode-options" aria-label="自动归集范围"><button v-for="mode in [{id:'all',label:'全部收支'},{id:'expense',label:'全部支出'},{id:'income',label:'全部收入'},{id:'categories',label:'指定分类'}] as const" :key="mode.id" type="button" :class="{active:bookRuleMode===mode.id}" :aria-pressed="bookRuleMode===mode.id" @click="bookRuleMode=mode.id">{{ mode.label }}</button></div><CategoryPicker v-if="bookRuleMode==='categories'" v-model="bookDraft.autoCollectCategoryIds" title="归集分类" placeholder="请选择分类（包含子分类）" :categories="flatCategories" :multiple="true" :appearance-mode="snapshot.settings.appearanceMode"/><div class="book-history-options"><h4>如何处理已有流水</h4><label><input v-model="bookKeepExisting" type="checkbox"/><span><b>保留已归集的流水</b><small>关闭后，仅移除不再符合新规则的本账本关联</small></span></label><label><input v-model="bookCollectMatching" type="checkbox"/><span><b>归集全部匹配流水</b><small>可独立关闭，未来新流水仍按规则自动归集</small></span></label></div></template></section>
        <label class="feature-check-row"><input v-model="bookDraft.isPinned" type="checkbox"/><span>置顶这个账本</span></label><p v-if="bookFormError" class="feature-error" role="alert">{{ bookFormError }}</p><footer class="feature-form-footer"><button type="button" class="feature-button" :disabled="savingBook" @click="bookOpen=false">取消</button><button class="feature-button accent" :disabled="savingBook">{{ savingBook?'保存中…':'保存账本' }}</button></footer></form></div>
      <div v-if="budgetOpen" class="modal-shade" @click.self="budgetOpen=false"><form class="modal-card" @submit.prevent="createBudget"><header><h2>{{ editingBudgetId?'编辑预算':'新建预算' }}</h2><button type="button" @click="budgetOpen=false">×</button></header><label>预算名称<input v-model.trim="budgetDraft.name" required/></label><label>限额<input v-model="budgetDraft.limitAmount" type="number" min="0.01" step="0.01" required/></label><label>周期<select v-model="budgetDraft.periodType"><option value="monthly">按月</option><option value="range">按起止时间</option></select></label><div v-if="budgetDraft.periodType==='monthly'" class="form-grid"><label>年份<input v-model.number="budgetDraft.year" type="number"/></label><label>月份<input v-model.number="budgetDraft.month" type="number" min="1" max="12"/></label></div><div v-else class="form-grid"><label>开始<input v-model="budgetDraft.startDate" type="date"/></label><label>结束<input v-model="budgetDraft.endDate" type="date"/></label></div><CategoryPicker v-model="budgetDraft.categoryIds" title="分类范围" placeholder="全部支出分类" :categories="flatCategories" flow-type="expense" :multiple="true" :appearance-mode="snapshot.settings.appearanceMode" /><label>账本<select v-model="budgetDraft.bookId"><option value="">全部账本</option><option v-for="book in snapshot.books" :key="book.id" :value="book.id">{{ book.name }}</option></select></label><footer><button type="button" class="secondary-button" @click="budgetOpen=false">取消</button><button class="primary-button">保存预算</button></footer></form></div>
      <p v-if="toast" class="toast">{{ toast }}</p>
      <footer class="workspace-footer"><span>本地优先 · {{ snapshot.transactions.length }} 笔流水 · {{ snapshot.books.length }} 本账</span><nav v-if="!ledgerOnly" class="workspace-app-links" aria-label="其他应用"><a :href="portalUrl">个人门户</a><a :href="travelUrl">打开 WhereToGo</a></nav></footer>
    </section>
  </main>
</template>
