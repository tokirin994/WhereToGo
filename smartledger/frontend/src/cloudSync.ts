import type { LedgerSnapshot } from './ledger'
import { readSyncMetadata, writeSyncMetadata } from './storage'

export interface RemoteSnapshot {
  schemaVersion: number; revision: number; contentHash: string | null
  snapshot: LedgerSnapshot | null; updatedAt: string | null
}
export interface SyncConflict { local: LedgerSnapshot; remote: RemoteSnapshot }

export function fingerprint(snapshot: LedgerSnapshot): string {
  const source = JSON.stringify({ ...snapshot, updatedAt: '' })
  let hash = 2166136261
  for (let i = 0; i < source.length; i++) hash = Math.imul(hash ^ source.charCodeAt(i), 16777619)
  return (hash >>> 0).toString(16)
}

export async function getRemoteSnapshot(apiUrl: string, token: string): Promise<RemoteSnapshot> {
  const response = await fetch(`${apiUrl}/api/v1/sync/snapshot`, { headers: { Authorization: `Bearer ${token}` } })
  if (!response.ok) throw new Error(`读取云端账本失败（HTTP ${response.status}）`)
  return await response.json() as RemoteSnapshot
}

export async function pushSnapshot(apiUrl: string, token: string, accountKey: string, snapshot: LedgerSnapshot, expectedRevision?: number): Promise<RemoteSnapshot> {
  const metadata = readSyncMetadata(accountKey)
  const remote = await getRemoteSnapshot(apiUrl, token)
  const response = await fetch(`${apiUrl}/api/v1/sync/snapshot`, {
    method: 'PUT', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ schemaVersion: snapshot.schemaVersion, expectedRevision: expectedRevision ?? remote.revision, snapshot }),
  })
  if (response.status === 409) throw new Error('云端版本已经变化，请先执行智能同步并处理冲突。')
  if (!response.ok) throw new Error(`推送云端账本失败（HTTP ${response.status}）`)
  const result = await response.json() as RemoteSnapshot
  writeSyncMetadata(accountKey, { revision: result.revision, lastFingerprint: fingerprint(snapshot), lastSyncedAt: result.updatedAt })
  void metadata
  return result
}

export async function smartSync(apiUrl: string, token: string, accountKey: string, local: LedgerSnapshot): Promise<{ snapshot: LedgerSnapshot; conflict: SyncConflict | null; remote: RemoteSnapshot }> {
  const [remote, metadata] = await Promise.all([getRemoteSnapshot(apiUrl, token), Promise.resolve(readSyncMetadata(accountKey))])
  const localFingerprint = fingerprint(local)
  const localChanged = metadata.lastFingerprint !== '' && localFingerprint !== metadata.lastFingerprint
  if (!remote.snapshot) {
    const saved = await pushSnapshot(apiUrl, token, accountKey, local, remote.revision)
    return { snapshot: local, conflict: null, remote: saved }
  }
  const remoteChanged = metadata.revision > 0 && remote.revision !== metadata.revision
  const localHasWork = local.transactions.length > 0 || local.budgets.length > 0 || local.books.length > 1 || local.pinnedRanges.length > 0
  if ((localChanged && remoteChanged) || (metadata.revision === 0 && localHasWork && remote.snapshot)) return { snapshot: local, conflict: { local, remote }, remote }
  if (remote.revision === metadata.revision && !localChanged) return { snapshot: local, conflict: null, remote }
  if (localChanged || metadata.revision === 0 && !remote.snapshot) {
    const saved = await pushSnapshot(apiUrl, token, accountKey, local, remote.revision)
    return { snapshot: local, conflict: null, remote: saved }
  }
  const pulled = remote.snapshot
  if (!pulled) return { snapshot: local, conflict: null, remote }
  writeSyncMetadata(accountKey, { revision: remote.revision, lastFingerprint: fingerprint(pulled), lastSyncedAt: remote.updatedAt })
  return { snapshot: pulled, conflict: null, remote }
}

export function chooseLocalAfterConflict(apiUrl: string, token: string, accountKey: string, conflict: SyncConflict) {
  return pushSnapshot(apiUrl, token, accountKey, conflict.local, conflict.remote.revision)
}

export function chooseRemoteAfterConflict(accountKey: string, conflict: SyncConflict): LedgerSnapshot {
  if (!conflict.remote.snapshot) return conflict.local
  writeSyncMetadata(accountKey, { revision: conflict.remote.revision, lastFingerprint: fingerprint(conflict.remote.snapshot), lastSyncedAt: conflict.remote.updatedAt })
  return conflict.remote.snapshot
}
