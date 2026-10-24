import type { LedgerSnapshot } from './ledger'

export interface NutstoreCredentials {
  username: string
  appPassword: string
}

const settingsKey = (accountKey: string) => `smartledger-nutstore:${accountKey}`

export function readNutstoreCredentials(accountKey: string): NutstoreCredentials {
  try {
    const value = JSON.parse(localStorage.getItem(settingsKey(accountKey)) || '{}') as Partial<NutstoreCredentials>
    return { username: value.username || '', appPassword: value.appPassword || '' }
  } catch {
    return { username: '', appPassword: '' }
  }
}

export function writeNutstoreCredentials(accountKey: string, credentials: NutstoreCredentials): void {
  localStorage.setItem(settingsKey(accountKey), JSON.stringify(credentials))
}

export function clearNutstoreCredentials(accountKey: string): void {
  localStorage.removeItem(settingsKey(accountKey))
}

async function post<T>(apiUrl: string, token: string, endpoint: string, credentials: NutstoreCredentials, snapshot?: LedgerSnapshot): Promise<T> {
  const response = await fetch(`${apiUrl}/api/v1/sync/nutstore/${endpoint}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(snapshot ? { credentials, snapshot } : credentials),
  })
  if (!response.ok) {
    let message = `坚果云请求失败（${response.status}）`
    try {
      const body = await response.json() as { message?: string; error?: string }
      message = body.message || body.error || message
    } catch { /* keep status fallback */ }
    throw new Error(message)
  }
  return await response.json() as T
}

export async function testNutstore(apiUrl: string, token: string, credentials: NutstoreCredentials): Promise<string> {
  const result = await post<{ message: string }>(apiUrl, token, 'test', credentials)
  return result.message
}

export async function backupToNutstore(apiUrl: string, token: string, credentials: NutstoreCredentials, snapshot: LedgerSnapshot): Promise<string> {
  const result = await post<{ message: string }>(apiUrl, token, 'upload', credentials, snapshot)
  return result.message
}

export async function restoreFromNutstore(apiUrl: string, token: string, credentials: NutstoreCredentials): Promise<LedgerSnapshot> {
  return await post<LedgerSnapshot>(apiUrl, token, 'download', credentials)
}
