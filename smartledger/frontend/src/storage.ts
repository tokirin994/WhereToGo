import type { LedgerSnapshot } from './ledger'

const databaseName = 'smartledger-local'
const storeName = 'snapshots'

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(databaseName, 1)
    request.onupgradeneeded = () => request.result.createObjectStore(storeName)
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error || new Error('无法打开本地账本存储'))
  })
}

export async function readLocalSnapshot(accountKey: string): Promise<LedgerSnapshot | null> {
  const db = await openDatabase()
  return new Promise((resolve, reject) => {
    const request = db.transaction(storeName, 'readonly').objectStore(storeName).get(`snapshot:${accountKey}`)
    request.onsuccess = () => { db.close(); resolve((request.result as LedgerSnapshot | undefined) || null) }
    request.onerror = () => { db.close(); reject(request.error || new Error('无法读取本地账本')) }
  })
}

export async function writeLocalSnapshot(accountKey: string, snapshot: LedgerSnapshot): Promise<void> {
  // Vue deeply wraps refs in reactive proxies; IndexedDB structured cloning cannot clone them.
  // Ledger snapshots are JSON data, so persist a detached plain-data copy instead.
  let plainSnapshot: LedgerSnapshot
  try { plainSnapshot = JSON.parse(JSON.stringify(snapshot)) as LedgerSnapshot }
  catch { throw new Error('账本快照无法序列化，尚未写入本地存储') }

  const db = await openDatabase()
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(storeName, 'readwrite')
    try { transaction.objectStore(storeName).put(plainSnapshot, `snapshot:${accountKey}`) }
    catch (cause) { db.close(); reject(cause); return }
    transaction.oncomplete = () => { db.close(); resolve() }
    transaction.onerror = () => { db.close(); reject(transaction.error || new Error('无法保存本地账本')) }
    transaction.onabort = () => { db.close(); reject(transaction.error || new Error('保存本地账本失败')) }
  })
}

interface SyncMetadata { revision: number; lastFingerprint: string; lastSyncedAt: string | null }
export function readSyncMetadata(accountKey: string): SyncMetadata {
  try { return JSON.parse(localStorage.getItem(`smartledger-sync:${accountKey}`) || '{"revision":0,"lastFingerprint":"","lastSyncedAt":null}') as SyncMetadata }
  catch { return { revision: 0, lastFingerprint: '', lastSyncedAt: null } }
}
export function writeSyncMetadata(accountKey: string, value: SyncMetadata): void {
  localStorage.setItem(`smartledger-sync:${accountKey}`, JSON.stringify(value))
}
