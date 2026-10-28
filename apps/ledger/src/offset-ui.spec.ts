/// <reference types="node" />
import 'fake-indexeddb/auto'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'
import { computed, nextTick, reactive, ref } from 'vue'
import { describe, expect, it, vi } from 'vitest'
import * as ledger from './ledger'
import { fingerprint } from './cloudSync'

const script=(file:string)=>readFileSync(new URL(file,import.meta.url),'utf8').match(/<script setup lang="ts">([\s\S]*?)<\/script>/)![1]
const ast=ts.createSourceFile('workspace.ts',script('./LedgerWorkspace.vue'),ts.ScriptTarget.Latest,true)
const compile=(source:string)=>ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText
const simpleRef=(value:unknown)=>({value})
function fixture(){
  const snapshot=ledger.createInitialSnapshot(),book=snapshot.books[0]!
  snapshot.books.push({...book,id:'other-book'})
  const category=snapshot.categories.find(row=>row.name==='报销')!
  const [source]=ledger.createTransaction(snapshot,{title:'原订单',amount:100,kind:'expense',happenedAt:'2026-10-20T04:00:00.000Z',bookIds:[book.id,'other-book'],hasExplicitBookSelection:true})
  const offsets=[ledger.createOffsetTransaction(source!,category,30),ledger.createOffsetTransaction(source!,category,20,undefined,{dateMode:'independent',happenedAt:'2026-10-23T04:00:00.000Z'})]
  snapshot.transactions=[source!,...offsets]
  const draft=(ratio=80):ledger.OffsetDraft=>({id:crypto.randomUUID(),categoryId:category.id,ratio,happenedAt:'2026-10-25T04:00:00.000Z',dateMode:'independent'})
  return {snapshot,source:source!,offsets,book,category,draft}
}
function workspace(f=fixture()){
  const context=vm.createContext({...ledger,Error,Date,crypto,fingerprint,
    snapshot:simpleRef(f.snapshot),editingId:simpleRef(null),activeTab:simpleRef('transactions'),entryReturnTab:simpleRef('transactions'),entryOpen:simpleRef(false),entryBaseline:simpleRef(''),savingEntry:simpleRef(false),entryDraft:simpleRef({}),entryExplicitBooks:simpleRef(false),entrySplitSettings:simpleRef({}),entryInstallmentEnabled:simpleRef(false),entryInstallmentStartDate:simpleRef('2026-10-20'),entryOffsetEdits:simpleRef([]),entryOffsetDrafts:simpleRef([]),entryClearOffsetIds:simpleRef([]),entryOffsetDateMode:simpleRef('source'),entryOffsetOriginalState:simpleRef(''),entryOffsetManager:simpleRef({confirmLimit:vi.fn(async()=> 'keep'),confirmClearAll:vi.fn(async()=>true)}),
    savingCandidates:simpleRef(new Set()),selectedBook:simpleRef(null),transactionFilters:simpleRef({flow:'all',bookId:null}),flatCategories:simpleRef(f.snapshot.categories),error:simpleRef(''),window:{confirm:vi.fn(()=>true)},notify:vi.fn(),persist:vi.fn(async()=>{}),computed:(getter:()=>unknown)=>({get value(){return getter()}}),
  })
  for(const name of ['editingTransaction','entryExistingOffsets','entryLinkedSource','entryRecordState','entryEditorState']){
    const statement=ast.statements.find(node=>ts.isVariableStatement(node)&&node.declarationList.declarations.some(decl=>decl.name.getText(ast)===name)) as ts.VariableStatement
    const declaration=statement.declarationList.declarations.find(decl=>decl.name.getText(ast)===name)!
    vm.runInContext(compile(`globalThis.${name}=${declaration.initializer!.getText(ast)}`),context)
  }
  for(const name of ['toLocalDateTime','openEntry','saveEntry','setEntryOffsetsEnabled','setEntryOffsetDateFollow','removeTransactionFromBook','deleteTransaction']){
    const declaration=ast.statements.find(node=>ts.isFunctionDeclaration(node)&&node.name?.text===name)!
    vm.runInContext(compile(declaration.getText(ast)),context)
  }
  context.openEntry(f.source)
  return {...f,context}
}

describe('Actual expense editor handlers with independent offsets',()=>{
  it('loads all offset records and preserves actual amounts after editing expense',async()=>{const f=workspace();expect(f.context.entryOffsetEdits.value).toHaveLength(2);f.context.entryDraft.value.amount='200';await f.context.saveEntry();expect(f.context.error.value).toBe('');expect(ledger.linkedOffsets(f.snapshot,f.source.id).map(row=>row.amount).sort((a,b)=>a-b)).toEqual([20,30]);expect(f.context.entryOpen.value).toBe(false)})
  it('changing original date moves only following rows',async()=>{const f=workspace();f.context.entryDraft.value.happenedAt='2026-11-02T12:00';await f.context.saveEntry();const source=f.snapshot.transactions.find(row=>row.id===f.source.id)!;expect(f.snapshot.transactions.find(row=>row.id===f.offsets[0]!.id)!.happenedAt).toBe(source.happenedAt);expect(f.snapshot.transactions.find(row=>row.id===f.offsets[1]!.id)!.happenedAt).toBe('2026-10-23T04:00:00.000Z')})
  it('cancelling cumulative confirmation does not mutate live data or save',async()=>{const f=workspace();const before=JSON.stringify(f.snapshot);f.context.entryOffsetDrafts.value=[f.draft()];f.context.entryOffsetManager.value.confirmLimit.mockResolvedValue(null);await f.context.saveEntry();expect(JSON.stringify(f.snapshot)).toBe(before);expect(f.context.persist).not.toHaveBeenCalled();expect(f.context.entryOpen.value).toBe(true);expect(f.context.savingEntry.value).toBe(false)})
  it('keep choice appends without overwriting any existing income',async()=>{const f=workspace();f.context.entryOffsetDrafts.value=[f.draft()];await f.context.saveEntry();expect(f.context.entryOffsetManager.value.confirmLimit).toHaveBeenCalledOnce();expect(ledger.linkedOffsets(f.snapshot,f.source.id).map(row=>row.amount).sort((a,b)=>a-b)).toEqual([20,30,80])})
  it('normalize choice adjusts only newly added amounts',async()=>{const f=workspace();f.context.entryOffsetDrafts.value=[f.draft(90),f.draft(30)];f.context.entryOffsetManager.value.confirmLimit.mockResolvedValue('normalize');await f.context.saveEntry();expect(ledger.linkedOffsets(f.snapshot,f.source.id).map(row=>row.amount).sort((a,b)=>a-b)).toEqual([12.5,20,30,37.5])})
  it('turning off clears all offsets after confirmation',async()=>{const f=workspace();f.context.entryDraft.value.offsetEnabled=false;await f.context.saveEntry();expect(f.context.entryOffsetManager.value.confirmClearAll).toHaveBeenCalledOnce();expect(ledger.linkedOffsets(f.snapshot,f.source.id)).toHaveLength(0);expect(f.snapshot.transactions).toHaveLength(1)})
  it('already confirmed full list is not asked twice when saving',async()=>{const f=workspace();f.context.entryDraft.value.offsetEnabled=false;f.context.entryClearOffsetIds.value=f.offsets.map(row=>row.id);f.context.entryOffsetEdits.value=[];await f.context.saveEntry();expect(f.context.entryOffsetManager.value.confirmClearAll).not.toHaveBeenCalled();expect(f.snapshot.transactions).toHaveLength(1)})
  it('rejecting clear confirmation preserves all records',async()=>{const f=workspace();const before=JSON.stringify(f.snapshot);f.context.entryDraft.value.offsetEnabled=false;f.context.entryOffsetManager.value.confirmClearAll.mockResolvedValue(false);await f.context.saveEntry();expect(JSON.stringify(f.snapshot)).toBe(before);expect(f.context.persist).not.toHaveBeenCalled()})
  it('saving failure restores original transactions and channels',async()=>{const f=workspace();const before=JSON.stringify(f.snapshot.transactions),channels=[...f.snapshot.settings.paymentChannels];f.context.entryDraft.value.paymentMethod='测试新渠道';f.context.entryOffsetDrafts.value=[f.draft(20)];f.context.persist.mockRejectedValue(Error('本地写入失败'));await f.context.saveEntry();expect(JSON.stringify(f.snapshot.transactions)).toBe(before);expect(f.snapshot.settings.paymentChannels).toEqual(channels);expect(f.context.entryOpen.value).toBe(true);expect(f.context.error.value).toBe('本地写入失败')})
  it('no partial source edit is visible while confirmation is pending',async()=>{const f=workspace();let resolve!:(value:string)=>void;f.context.entryDraft.value.title='新标题';f.context.entryOffsetDrafts.value=[f.draft()];f.context.entryOffsetManager.value.confirmLimit.mockImplementation(()=>new Promise(done=>{resolve=done}));const pending=f.context.saveEntry();expect(f.snapshot.transactions.find(row=>row.id===f.source.id)!.title).toBe('原订单');expect(f.context.persist).not.toHaveBeenCalled();resolve('keep');await pending;expect(f.snapshot.transactions.find(row=>row.id===f.source.id)!.title).toBe('新标题')})
  it('refuses stale saves if cloud adds an offset before submit',async()=>{const f=workspace();f.snapshot.transactions.push(ledger.createOffsetTransaction(f.source,f.category,10));f.context.entryDraft.value.offsetEnabled=false;await f.context.saveEntry();expect(f.context.error.value).toContain('已更新');expect(ledger.linkedOffsets(f.snapshot,f.source.id)).toHaveLength(3);expect(f.context.persist).not.toHaveBeenCalled()})
  it('refuses overwrite if snapshot changes during confirmation',async()=>{const f=workspace();f.context.entryOffsetDrafts.value=[f.draft()];f.context.entryOffsetManager.value.confirmLimit.mockImplementation(async()=>{f.snapshot.transactions.push(ledger.createOffsetTransaction(f.source,f.category,10));return 'keep'});await f.context.saveEntry();expect(f.context.error.value).toContain('确认期间发生更新');expect(ledger.linkedOffsets(f.snapshot,f.source.id)).toHaveLength(3);expect(f.context.persist).not.toHaveBeenCalled()})
  it('re-enabling before save restores existing rows without duplicating them',()=>{const f=workspace();f.context.entryOffsetEdits.value=[];f.context.entryClearOffsetIds.value=f.offsets.map(row=>row.id);f.context.setEntryOffsetsEnabled(true);expect(f.context.entryOffsetEdits.value.map((row:ledger.OffsetEdit)=>row.id)).toEqual(f.offsets.map(row=>row.id));expect(f.context.entryClearOffsetIds.value).toEqual([])})
  it('editing linked income amount preserves follow policy',async()=>{const f=workspace();f.context.openEntry(f.offsets[0]);f.context.entryDraft.value.amount='31';await f.context.saveEntry();expect(f.context.error.value).toBe('');expect(f.snapshot.transactions.find(row=>row.id===f.offsets[0]!.id)).toMatchObject({amount:31,offsetDateMode:'source'})})
  it('explicitly restores date following in standalone income editor',async()=>{const f=workspace();f.context.openEntry(f.offsets[1]);f.context.setEntryOffsetDateFollow({target:{checked:true}});await f.context.saveEntry();expect(f.snapshot.transactions.find(row=>row.id===f.offsets[1]!.id)).toMatchObject({happenedAt:f.source.happenedAt,offsetDateMode:'source'})})
  it('new expense with multiple offsets uses original amount',async()=>{const f=workspace();f.context.entryOpen.value=false;f.context.openEntry();Object.assign(f.context.entryDraft.value,{title:'新订单',amount:'200',happenedAt:'2026-10-25T12:00',offsetEnabled:true});f.context.entryOffsetDrafts.value=[{...f.draft(20),dateMode:'source'},f.draft(30)];await f.context.saveEntry();expect(f.context.error.value).toBe('');const source=f.snapshot.transactions.find(row=>row.title==='新订单'&&row.kind==='expense')!;expect(ledger.linkedOffsets(f.snapshot,source.id).map(row=>row.amount).sort((a,b)=>a-b)).toEqual([40,60])})
})

describe('User-selected web book removal scope',()=>{
  it('removes original and all offsets from just this book',async()=>{const f=workspace();await f.context.removeTransactionFromBook(f.book,f.source);expect(f.context.window.confirm).toHaveBeenCalledWith(expect.stringContaining('2 笔关联抵扣'));for(const row of f.snapshot.transactions){expect(row.bookIds).toEqual(['other-book']);expect(row.ledgerSplitSettings?.[f.book.id]).toBeUndefined()}expect(f.snapshot.transactions).toHaveLength(3)})
  it('cancel leaves every membership unchanged',async()=>{const f=workspace();const before=JSON.stringify(f.snapshot);f.context.window.confirm.mockReturnValue(false);await f.context.removeTransactionFromBook(f.book,f.source);expect(JSON.stringify(f.snapshot)).toBe(before)})
  it('failed persistence restores all source and offset memberships',async()=>{const f=workspace();const before=JSON.stringify(f.snapshot.transactions);f.context.persist.mockRejectedValue(Error('保存失败'));await f.context.removeTransactionFromBook(f.book,f.source);expect(JSON.stringify(f.snapshot.transactions)).toBe(before);expect(f.context.error.value).toBe('保存失败')})
})

function manager(editing=true){
  const f=fixture(),props=reactive({enabled:true,existing:f.offsets,edits:f.offsets.map(row=>ledger.offsetEdit(row,f.source)),drafts:[] as ledger.OffsetDraft[],amount:100,sourceDate:f.source.happenedAt,editing,categories:f.snapshot.categories,appearanceMode:'dark'})
  const emitted=vi.fn((event:string,value:unknown)=>{if(event==='update:enabled')props.enabled=value as boolean;if(event==='update:edits')props.edits=value as ledger.OffsetEdit[];if(event==='update:drafts')props.drafts=value as ledger.OffsetDraft[]})
  let cleanup:()=>void=()=>{}
  const context=vm.createContext({Date,Intl,crypto,computed,nextTick,ref,defineProps:()=>props,defineEmits:()=>emitted,defineExpose:()=>{},onBeforeUnmount:(callback:()=>void)=>{cleanup=callback}})
  const source=script('./OffsetManager.vue'),componentAst=ts.createSourceFile('manager.ts',source,ts.ScriptTarget.Latest,true)
  vm.runInContext(compile(componentAst.statements.filter(node=>!ts.isImportDeclaration(node)).map(node=>node.getText(componentAst)).join('\n')),context)
  const api=vm.runInContext('({toggle,addDraft,patchEdit,patchDraft,removeEdit,confirmClearAll,confirmLimit,choose,dialog,confirmationRows,expanded})',context)
  api.dialog.value={showModal:vi.fn(),close:vi.fn()}
  return {f,props,emitted,api,cleanup:()=>cleanup()}
}

describe('Actual OffsetManager interaction handlers (isolated dialog)',()=>{
  it('later append uses current independent date and the remaining percentage',()=>{const m=manager();m.api.addDraft();expect(m.props.drafts[0]).toMatchObject({ratio:50,dateMode:'independent'});expect(new Date(m.props.drafts[0]!.happenedAt).getTime()).toBeGreaterThan(Date.now()-5000)})
  it('initial creation defaults to source date and 100 percent',async()=>{const m=manager(false);m.props.existing=[];m.props.edits=[];m.props.enabled=false;await m.api.toggle({target:{checked:true}});expect(m.props.drafts[0]).toMatchObject({ratio:100,dateMode:'source',happenedAt:m.props.sourceDate})})
  it('close confirmation lists every existing and pending offset before any change',async()=>{const m=manager();m.api.addDraft();const pending=m.api.toggle({target:{checked:false}});await nextTick();expect(m.api.confirmationRows.value.map((row:{id:string})=>row.id)).toEqual([...m.f.offsets.map(row=>row.id),m.props.drafts[0]!.id]);expect(m.props.enabled).toBe(true);expect(m.props.edits).toHaveLength(2);m.api.choose(null);await pending;expect(m.props.enabled).toBe(true);expect(m.props.edits).toHaveLength(2)})
  it('confirmed close clears all staged rows and emits all existing IDs',async()=>{const m=manager();const pending=m.api.toggle({target:{checked:false}});await nextTick();m.api.choose('confirm');await pending;expect(m.props.enabled).toBe(false);expect(m.props.edits).toEqual([]);expect(m.props.drafts).toEqual([]);expect(m.emitted).toHaveBeenCalledWith('clear',m.f.offsets.map(row=>row.id));expect(m.f.snapshot.transactions).toHaveLength(3)})
  it('individual removal confirms only the selected row',async()=>{const m=manager(),id=m.props.edits[0]!.id;const pending=m.api.removeEdit(m.props.edits[0]);await nextTick();expect(m.api.confirmationRows.value.map((row:{id:string})=>row.id)).toEqual([id]);m.api.choose('confirm');await pending;expect(m.props.edits.map(row=>row.id)).toEqual([m.f.offsets[1]!.id])})
  it('cancelling one-row deletion preserves the row',async()=>{const m=manager();const pending=m.api.removeEdit(m.props.edits[0]);await nextTick();m.api.choose(null);await pending;expect(m.props.edits).toHaveLength(2)})
  it('dialog keep and normalize choices reach the expense editor',async()=>{const m=manager();for(const choice of ['keep','normalize']){const pending=m.api.confirmLimit({existingAmount:50,newAmount:80,totalAmount:130,ratio:130,overLimit:true,additions:[]});await nextTick();m.api.choose(choice);expect(await pending).toBe(choice)}})
  it('unmount cancels a pending confirmation without approving deletion',async()=>{const m=manager();const pending=m.api.confirmClearAll();await nextTick();m.cleanup();expect(await pending).toBe(false)})
})
