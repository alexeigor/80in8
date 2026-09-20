import { generateRun, PRESETS, type StoredRun, summariseRun } from '@80in8/core'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { clearHistory, historyLoaded, loadHistory, runs, saveRun } from './history.js'
import { idbClear, idbEntries, idbSet } from './idb.js'

vi.mock('./idb.js', () => ({
  runsStore: null,
  profilesStore: null,
  storageAvailable: { value: true },
  idbEntries: vi.fn(),
  idbSet: vi.fn(),
  idbClear: vi.fn(),
  requestPersistence: vi.fn(),
}))

const profile = PRESETS['optiver-classic']
const generated = generateRun('saved-attempt', 42, profile, 'typed')
const saved: StoredRun = {
  schemaVersion: 1,
  attemptId: generated.attemptId,
  spec: generated.spec,
  startedAt: 1000,
  practice: false,
  questionIds: [...generated.questionIds],
  answers: [],
  summary: summariseRun([], profile, { endedBy: 'aborted', totalMs: 0, hiddenMs: 0 }),
}

function pendingRead() {
  let resolve!: (rows: [string, StoredRun][]) => void
  const promise = new Promise<[string, StoredRun][]>((done) => {
    resolve = done
  })
  return { promise, resolve }
}

beforeEach(() => {
  vi.resetAllMocks()
  runs.value = []
  historyLoaded.value = false
})

describe('history transaction ordering', () => {
  it('does not resurrect deleted history when an earlier read completes', async () => {
    const read = pendingRead()
    vi.mocked(idbEntries).mockReturnValueOnce(read.promise)
    const loading = loadHistory()
    await clearHistory()
    read.resolve([[saved.attemptId, saved]])
    await loading
    expect(runs.value).toEqual([])
    expect(historyLoaded.value).toBe(true)
    expect(idbClear).toHaveBeenCalledOnce()
  })

  it('retains a recovered attempt when a stale startup read finishes', async () => {
    const read = pendingRead()
    vi.mocked(idbEntries).mockReturnValueOnce(read.promise)
    vi.mocked(idbSet).mockResolvedValue(true)
    const loading = loadHistory()
    await saveRun(saved)
    read.resolve([])
    await loading
    expect(runs.value).toEqual([saved])
  })

  it('reports unsuccessful persistence without discarding the in-memory result', async () => {
    vi.mocked(idbSet).mockResolvedValue(false)
    expect(await saveRun(saved)).toBe(false)
    expect(runs.value).toEqual([saved])
  })
})

describe('export and import', () => {
  it('exports settings, custom profiles and runs, and downloads them as a dated file', async () => {
    const { buildExport, downloadExport } = await import('./history.js')
    const { rememberProfile } = await import('./profiles.js')
    const custom = { ...profile, questionCount: 5 }
    const ref = rememberProfile(custom)
    runs.value = [saved]
    const file = buildExport()
    expect(file).toMatchObject({ app: '80in8', schemaVersion: 1, runs: [saved] })
    expect(file.profiles[ref]).toEqual(custom)
    expect(file.exportedAt).toBeGreaterThan(0)

    const url = 'blob:80in8/export'
    // jsdom has no object URLs; the download only needs the two calls to exist.
    const revoke = vi.fn()
    Object.defineProperty(URL, 'createObjectURL', { value: () => url, configurable: true })
    Object.defineProperty(URL, 'revokeObjectURL', { value: revoke, configurable: true })
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      expect(this.href).toBe(url)
      expect(this.download).toMatch(/^80in8-export-\d{4}-\d{2}-\d{2}\.json$/)
    })
    downloadExport()
    expect(click).toHaveBeenCalledOnce()
    expect(revoke).toHaveBeenCalledWith(url)
  })

  it('imports by merging on attempt id, adopting profiles and replacing settings', async () => {
    const { importExport, buildExport, historyEntries } = await import('./history.js')
    const { resolveProfile } = await import('./profiles.js')
    const { settings } = await import('./settings.js')
    const { profileRefOf } = await import('@80in8/core')
    vi.mocked(idbSet).mockResolvedValue(true)
    runs.value = [saved]
    const custom = { ...profile, questionCount: 6 }
    const ref = profileRefOf(custom, false)
    const other: StoredRun = { ...saved, attemptId: 'other-attempt', startedAt: 2000 }
    const file = {
      ...buildExport(),
      settings: { ...buildExport().settings, sound: true },
      profiles: { [ref]: custom },
      runs: [{ ...saved, startedAt: 999 }, other],
    }
    const outcome = await importExport(JSON.stringify(file))
    expect(outcome).toEqual({ added: 1, total: 2 })
    // Newest first, and the attempt already here is never replaced.
    expect(runs.value.map((run) => run.attemptId)).toEqual(['other-attempt', saved.attemptId])
    expect(runs.value[1]?.startedAt).toBe(1000)
    // One write for the adopted profile, one for the new run, none for the known one.
    expect(idbSet).toHaveBeenCalledTimes(2)
    expect(idbSet).toHaveBeenCalledWith(null, 'other-attempt', other)
    expect(resolveProfile(ref)).toEqual(custom)
    expect(settings.value.sound).toBe(true)
    expect(historyEntries()).toHaveLength(2)
    expect(historyEntries()[0]).toMatchObject({
      attemptId: 'other-attempt',
      profileRef: saved.spec.profileRef,
    })
  })

  it('rejects a file it cannot interpret without touching what is there', async () => {
    const { importExport } = await import('./history.js')
    runs.value = [saved]
    await expect(importExport('{"app":"other"}')).rejects.toThrow(/not an 80in8 export/)
    await expect(importExport('nonsense')).rejects.toThrow()
    expect(runs.value).toEqual([saved])
    expect(idbSet).not.toHaveBeenCalled()
  })
})
