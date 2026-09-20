import { clear, createStore, del, entries, get, set, type UseStore } from 'idb-keyval'

/**
 * IndexedDB, but never fatal. Private browsing, a blocked origin or a quota error must
 * degrade to "history is not saved", not to a broken trainer, so every call resolves.
 */

export const storageAvailable = { value: true }

function makeStore(name: string): UseStore | null {
  try {
    if (typeof indexedDB === 'undefined') return null
    return createStore(`80in8-${name}`, 'kv')
  } catch {
    return null
  }
}

export const runsStore = makeStore('runs')
export const profilesStore = makeStore('profiles')

export async function idbGet<T>(store: UseStore | null, key: string): Promise<T | undefined> {
  if (!store) return undefined
  try {
    return await get<T>(key, store)
  } catch {
    storageAvailable.value = false
    return undefined
  }
}

export async function idbSet(store: UseStore | null, key: string, value: unknown): Promise<boolean> {
  if (!store) {
    storageAvailable.value = false
    return false
  }
  try {
    await set(key, value, store)
    return true
  } catch {
    storageAvailable.value = false
    return false
  }
}

export async function idbEntries<T>(store: UseStore | null): Promise<[string, T][]> {
  if (!store) {
    storageAvailable.value = false
    return []
  }
  try {
    return (await entries<string, T>(store)) as [string, T][]
  } catch {
    storageAvailable.value = false
    return []
  }
}

export async function idbDelete(store: UseStore | null, key: string): Promise<void> {
  if (!store) return
  try {
    await del(key, store)
  } catch {
    storageAvailable.value = false
  }
}

export async function idbClear(store: UseStore | null): Promise<void> {
  if (!store) return
  try {
    await clear(store)
  } catch {
    storageAvailable.value = false
  }
}

/**
 * Ask the browser to keep our data when it starts evicting. Requested after the first
 * completed run rather than on load, so the prompt (where there is one) follows a
 * reason the person can recognise.
 */
export async function requestPersistence(): Promise<boolean> {
  try {
    if (!navigator.storage?.persist) return false
    if (await navigator.storage.persisted()) return true
    return await navigator.storage.persist()
  } catch {
    return false
  }
}

export async function storagePersisted(): Promise<boolean> {
  try {
    return (await navigator.storage?.persisted?.()) ?? false
  } catch {
    return false
  }
}

export async function storageEstimate(): Promise<{ usage: number; quota: number } | null> {
  try {
    if (!navigator.storage?.estimate) return null
    const estimate = await navigator.storage.estimate()
    return { usage: estimate.usage ?? 0, quota: estimate.quota ?? 0 }
  } catch {
    return null
  }
}
