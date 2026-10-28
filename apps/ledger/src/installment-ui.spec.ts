/// <reference types="node" />
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'
import { describe, expect, it, vi } from 'vitest'
import { cancelInstallment, createInitialSnapshot, createTransaction, deleteTransactionRecords, payOffInstallment } from './ledger'
const source=readFileSync(new URL('./LedgerWorkspace.vue',import.meta.url),'utf8').match(/<script setup lang="ts">([\s\S]*?)<\/script>/)![1]
const ast=ts.createSourceFile('LedgerWorkspace.ts',source,ts.ScriptTarget.Latest,true)
function environment(fail=false){
  const snapshot=createInitialSnapshot();const rows=createTransaction(snapshot,{title:'测试分期',amount:100,kind:'expense',happenedAt:new Date().toISOString(),installmentStartMonth:'2090-01-01T00:00:00Z',installmentMonths:3});snapshot.transactions=rows
  const context=vm.createContext({Error,snapshot:{value:snapshot},editingId:{value:rows[0].id},savingEntry:{value:false},entryBaseline:{value:'saved'},entryEditorState:()=> 'saved',entryOpen:{value:true},activeTab:{value:'entry'},entryReturnTab:{value:'transactions'},error:{value:''},window:{confirm:vi.fn(()=>true)},persist:fail?vi.fn(async()=>{throw Error('模拟保存失败')}):vi.fn(async()=>{}),notify:vi.fn(),currency:(amount:number)=>String(amount),cancelInstallment,payOffInstallment,deleteTransactionRecords})
  for(const name of ['manageInstallment','deleteTransaction']){const declaration=ast.statements.find(node=>ts.isFunctionDeclaration(node)&&node.name?.text===name)!;vm.runInContext(ts.transpileModule(declaration.getText(ast),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText,context)}
  return {context,snapshot,rows}
}
describe('Actual Vue installment action handlers',()=>{
  it('cancel action merges, persists and returns to the previous page',async()=>{const {context,snapshot}=environment();await context.manageInstallment('cancel');expect(snapshot.transactions).toHaveLength(1);expect(snapshot.transactions[0].amount).toBe(100);expect(context.persist).toHaveBeenCalledOnce();expect(context.activeTab.value).toBe('transactions');expect(context.entryOpen.value).toBe(false)})
  it('payoff action consolidates future periods',async()=>{const {context,snapshot}=environment();await context.manageInstallment('payoff');expect(snapshot.transactions).toHaveLength(1);expect(snapshot.transactions[0].source).toContain('installment_payoff:')})
  it('failed cancel restores transactions and keeps editor open',async()=>{const {context,snapshot,rows}=environment(true);const before=JSON.stringify(rows);await context.manageInstallment('cancel');expect(JSON.stringify(snapshot.transactions)).toBe(before);expect(context.entryOpen.value).toBe(true);expect(context.error.value).toBe('模拟保存失败')})
  it('failed payoff restores the full group',async()=>{const {context,snapshot}=environment(true);await context.manageInstallment('payoff');expect(snapshot.transactions).toHaveLength(3);expect(snapshot.transactions.every(row=>!!row.installmentGroupId)).toBe(true)})
  it('rejecting confirmation changes nothing',async()=>{const {context,snapshot}=environment();context.window.confirm.mockReturnValue(false);await context.manageInstallment('cancel');expect(snapshot.transactions).toHaveLength(3);expect(context.persist).not.toHaveBeenCalled()})
  it('failed order deletion restores the period',async()=>{const {context,snapshot,rows}=environment(true);await context.deleteTransaction(rows[1]);expect(snapshot.transactions).toHaveLength(3);expect(context.error.value).toBe('模拟保存失败')})
})
