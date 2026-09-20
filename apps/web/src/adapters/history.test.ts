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
