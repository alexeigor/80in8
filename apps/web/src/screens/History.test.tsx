import {
  type Answer,
  generateRun,
  generateRunFromIds,
  PRESETS,
  parseId,
  type StoredRun,
  summariseRun,
} from '@80in8/core'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/preact'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { historyLoaded, runs, storageWorks } from '../adapters/history.js'
import { idbClear, idbEntries, storageAvailable } from '../adapters/idb.js'
import { navigate, path } from '../adapters/router.js'
import { App } from '../app.js'
import { abortRun, session } from '../session.js'
import { toast } from '../ui-state.js'

vi.mock('../adapters/idb.js', () => ({
  runsStore: {},
  profilesStore: {},
  storageAvailable: { value: true },
  idbEntries: vi.fn(async () => []),
  idbSet: vi.fn(async () => true),
  idbClear: vi.fn(async () => undefined),
  requestPersistence: vi.fn(async () => true),
  storagePersisted: vi.fn(async () => true),
  storageEstimate: vi.fn(async () => null),
}))

const CLASSIC = PRESETS['optiver-classic']

/** A stored run with every answer decided up front. */
function storedRun(
  attemptId: string,
  startedAt: number,
  verdicts: readonly ('right' | 'wrong' | 'skip')[],
  options: { practice?: boolean; kind?: string } = {},
): StoredRun {
  const seeded = generateRun(attemptId, 8080, CLASSIC, 'typed')
  const ids = options.kind
    ? seeded.questionIds.filter((id) => {
        const parsed = parseId(id)
        return !('error' in parsed) && parsed.kind === options.kind
      })
    : seeded.questionIds
  const run = generateRunFromIds(attemptId, ids.slice(0, verdicts.length), CLASSIC, 'typed', 'retry')
  const answers: Answer[] = run.questionIds.map((questionId, index) => ({
    questionId,
    shownAt: index * 1000,
    answeredAt: index * 1000 + 800,
    elapsedMs: 800,
    raw: verdicts[index] === 'skip' ? '' : '1',
    value: null,
    correct: verdicts[index] === 'right',
    skipped: verdicts[index] === 'skip',
  }))
  return {
    schemaVersion: 1,
    attemptId,
    spec: run.spec,
    startedAt,
    practice: options.practice ?? false,
    questionIds: [...run.questionIds],
    answers,
    summary: summariseRun(answers, CLASSIC, { endedBy: 'aborted', totalMs: 5000, hiddenMs: 0 }),
  }
}

function open() {
  act(() => {
    navigate('/history', { replace: true })
  })
  return render(<App />)
}

beforeEach(() => {
  runs.value = []
  historyLoaded.value = true
  storageWorks.value = true
  storageAvailable.value = true
  toast.value = null
  vi.mocked(idbEntries).mockClear()
  vi.mocked(idbClear).mockClear()
})

afterEach(() => {
  act(() => {
    abortRun()
  })
  cleanup()
})

describe('with nothing recorded', () => {
  it('says so, loads once, and warns when storage is not working', async () => {
    historyLoaded.value = false
    open()
    expect(screen.getByTestId('history-empty')).toBeTruthy()
    expect(screen.queryByTestId('storage-warning')).toBeNull()
    await act(() => Promise.resolve())
    expect(idbEntries).toHaveBeenCalledOnce()

    act(() => {
      storageWorks.value = false
    })
    expect(screen.getByTestId('storage-warning')).toBeTruthy()
  })
})

describe('with runs', () => {
  it('lists attempts newest first, counts, keeps the best graded score, and draws a trend of graded runs', () => {
    // The adapter keeps the list newest first; the screen renders it as it is.
    runs.value = [
      storedRun('new', 3000, ['right', 'skip']),
      storedRun('practice', 2000, ['right', 'right', 'right', 'right'], { practice: true }),
      storedRun('old', 1000, ['right', 'right', 'wrong']),
    ]
    open()
    expect(screen.getByTestId('run-count').textContent).toBe('3')
    const rows = screen.getAllByTestId('history-row')
    expect(rows.map((row) => row.dataset.attemptId)).toEqual(['new', 'practice', 'old'])
    expect(rows[1]?.textContent).toContain('practice')
    expect(rows[0]?.dataset.runId).toBe('')
    expect(rows[0]?.textContent).toContain('2/80')
    expect(rows[1]?.textContent).toContain('100%')
    expect(screen.getByText('Best').nextElementSibling?.textContent).toBe('1')
    expect(screen.getByTestId('trend').getAttribute('aria-label')).toBe(
      'Score trend over 2 runs, from 1 to 1',
    )
    expect(screen.getByText('Day streak').nextElementSibling?.textContent).toBe('0')
    expect(screen.getByTestId('weakest-80').textContent).toMatch(/^(Weakest|Slowest) 80$/)
  })

  it('names the weakest category in words and offers a deck built from it', () => {
    runs.value = [
      storedRun('adds', Date.now(), ['wrong', 'wrong', 'wrong', 'right', 'wrong', 'wrong'], {
        kind: 'int.add',
      }),
    ]
    open()
    expect(screen.getByTestId('weakest').textContent).toBe('Weakest: Integer +')
    expect(screen.getByTestId('weakest-80').textContent).toBe('Weakest 80')
    expect(screen.getByText('Day streak').nextElementSibling?.textContent).toBe('1')
    expect(screen.queryByTestId('trend-section')).toBeNull()

    fireEvent.click(screen.getByTestId('weakest-80'))
    expect(session.value.phase).toBe('countdown')
    if (session.value.phase !== 'countdown') throw new Error('expected a countdown')
    expect(session.value.run.spec).toMatchObject({ kind: 'deck', origin: 'weakest' })
    expect(session.value.run.questionIds).toHaveLength(6)
    expect(path.value).toBe('/run')
  })

  it('has nothing to revisit when the runs hold no answers', () => {
    runs.value = [{ ...storedRun('empty', 1000, []), answers: [] }]
    open()
    fireEvent.click(screen.getByTestId('weakest-80'))
    expect(toast.value).toBe('Nothing to revisit yet.')
    expect(session.value.phase).not.toBe('countdown')
  })
})

describe('your data', () => {
  it('clears everything only after a confirmation', async () => {
    runs.value = [storedRun('only', 1000, ['right'])]
    open()
    fireEvent.click(screen.getByTestId('clear'))
    fireEvent.click(screen.getByTestId('clear-no'))
    expect(screen.queryByTestId('clear-confirm')).toBeNull()
    expect(runs.value).toHaveLength(1)

    fireEvent.click(screen.getByTestId('clear'))
    fireEvent.click(screen.getByTestId('clear-yes'))
    await act(() => Promise.resolve())
    expect(idbClear).toHaveBeenCalledOnce()
    expect(screen.getByTestId('history-empty')).toBeTruthy()
    expect(toast.value).toBe('History cleared.')
  })

  it('imports a file through the hidden input and reports the outcome either way', async () => {
    open()
    const file = (text: string) => new File([text], 'export.json', { type: 'application/json' })
    const input = screen.getByTestId<HTMLInputElement>('import-file')
    fireEvent.click(screen.getByTestId('import'))

    const run = storedRun('imported', 1000, ['right'])
    const good = { app: '80in8', schemaVersion: 1, exportedAt: 1, settings: {}, profiles: {}, runs: [run] }
    fireEvent.change(input, { target: { files: [file(JSON.stringify(good))] } })
    await vi.waitFor(() => expect(toast.value).toBe('Imported 1 new runs.'))
    expect(screen.getAllByTestId('history-row')).toHaveLength(1)

    fireEvent.change(input, { target: { files: [file('{"app":"80in8","schemaVersion":9}')] } })
    await vi.waitFor(() => expect(toast.value).toMatch(/^Import failed: unsupported schema version 9/))
    expect(screen.getAllByTestId('history-row')).toHaveLength(1)

    // No file chosen: nothing happens.
    fireEvent.change(input, { target: { files: [] } })
  })

  it('exports on request', () => {
    const anchor = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined)
    Object.defineProperty(URL, 'createObjectURL', { value: () => 'blob:x', configurable: true })
    Object.defineProperty(URL, 'revokeObjectURL', { value: () => undefined, configurable: true })
    open()
    fireEvent.click(screen.getByTestId('export'))
    expect(anchor).toHaveBeenCalledOnce()
  })
})
