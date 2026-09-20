import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * IndexedDB, but never fatal: every wrapper resolves, and a failure flips the
 * `storageAvailable` flag rather than throwing into the app.
 */

const keyval = {
  createStore: vi.fn(() => ({ store: true })),
  get: vi.fn(),
  set: vi.fn(),
  entries: vi.fn(),
  del: vi.fn(),
  clear: vi.fn(),
}
vi.mock('idb-keyval', () => keyval)

async function load() {
  vi.resetModules()
  return import('./idb.js')
}

beforeEach(() => {
  for (const fn of Object.values(keyval)) fn.mockReset()
  keyval.createStore.mockReturnValue({ store: true })
  vi.stubGlobal('indexedDB', {})
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('the wrappers', () => {
  it('pass through to idb-keyval when it works', async () => {
    keyval.get.mockResolvedValue('value')
    keyval.set.mockResolvedValue(undefined)
    keyval.entries.mockResolvedValue([['k', 'v']])
    keyval.del.mockResolvedValue(undefined)
    keyval.clear.mockResolvedValue(undefined)
    const idb = await load()
    expect(keyval.createStore).toHaveBeenCalledWith('80in8-runs', 'kv')
    expect(keyval.createStore).toHaveBeenCalledWith('80in8-profiles', 'kv')
    expect(await idb.idbGet(idb.runsStore, 'k')).toBe('value')
    expect(await idb.idbSet(idb.runsStore, 'k', 'v')).toBe(true)
    expect(await idb.idbEntries(idb.runsStore)).toEqual([['k', 'v']])
    await idb.idbDelete(idb.runsStore, 'k')
    await idb.idbClear(idb.runsStore)
    expect(keyval.del).toHaveBeenCalledOnce()
    expect(keyval.clear).toHaveBeenCalledOnce()
    expect(idb.storageAvailable.value).toBe(true)
  })

  it('resolve and mark storage unavailable when idb-keyval throws', async () => {
    const boom = new DOMException('quota', 'QuotaExceededError')
    for (const fn of [keyval.get, keyval.set, keyval.entries, keyval.del, keyval.clear])
      fn.mockRejectedValue(boom)
    const idb = await load()
    expect(await idb.idbGet(idb.runsStore, 'k')).toBeUndefined()
    expect(idb.storageAvailable.value).toBe(false)
    idb.storageAvailable.value = true
    expect(await idb.idbSet(idb.runsStore, 'k', 'v')).toBe(false)
    expect(idb.storageAvailable.value).toBe(false)
    idb.storageAvailable.value = true
    expect(await idb.idbEntries(idb.runsStore)).toEqual([])
    expect(idb.storageAvailable.value).toBe(false)
    idb.storageAvailable.value = true
    await idb.idbDelete(idb.runsStore, 'k')
    expect(idb.storageAvailable.value).toBe(false)
    idb.storageAvailable.value = true
    await idb.idbClear(idb.runsStore)
    expect(idb.storageAvailable.value).toBe(false)
  })

  it('have no store at all without IndexedDB, or when opening it throws', async () => {
    vi.stubGlobal('indexedDB', undefined)
    let idb = await load()
    expect(idb.runsStore).toBeNull()
    expect(await idb.idbGet(idb.runsStore, 'k')).toBeUndefined()
    expect(await idb.idbSet(idb.runsStore, 'k', 'v')).toBe(false)
    expect(await idb.idbEntries(idb.runsStore)).toEqual([])
    await idb.idbDelete(idb.runsStore, 'k')
    await idb.idbClear(idb.runsStore)
    expect(idb.storageAvailable.value).toBe(false)

    vi.stubGlobal('indexedDB', {})
    keyval.createStore.mockImplementation(() => {
      throw new DOMException('denied', 'SecurityError')
    })
    idb = await load()
    expect(idb.profilesStore).toBeNull()
  })
})

describe('the Storage API', () => {
  it('asks for persistence once history exists, and reports what the browser said', async () => {
    const persist = vi.fn().mockResolvedValue(true)
    const persisted = vi.fn().mockResolvedValue(false)
    const estimate = vi.fn().mockResolvedValue({ usage: 1024, quota: 4096 })
    vi.stubGlobal('navigator', { storage: { persist, persisted, estimate } })
    const idb = await load()
    expect(await idb.requestPersistence()).toBe(true)
    expect(persist).toHaveBeenCalledOnce()
    persisted.mockResolvedValue(true)
    expect(await idb.requestPersistence()).toBe(true)
    expect(persist).toHaveBeenCalledOnce()
    expect(await idb.storagePersisted()).toBe(true)
    expect(await idb.storageEstimate()).toEqual({ usage: 1024, quota: 4096 })
    estimate.mockResolvedValue({})
    expect(await idb.storageEstimate()).toEqual({ usage: 0, quota: 0 })
  })

  it('answers no when the API is missing or throws', async () => {
    vi.stubGlobal('navigator', {})
    let idb = await load()
    expect(await idb.requestPersistence()).toBe(false)
    expect(await idb.storagePersisted()).toBe(false)
    expect(await idb.storageEstimate()).toBeNull()

    vi.stubGlobal('navigator', {
      storage: {
        persist: () => Promise.reject(new Error('no')),
        persisted: () => Promise.reject(new Error('no')),
        estimate: () => Promise.reject(new Error('no')),
      },
    })
    idb = await load()
    expect(await idb.requestPersistence()).toBe(false)
    expect(await idb.storagePersisted()).toBe(false)
    expect(await idb.storageEstimate()).toBeNull()
  })
})
