import { generateRun, PRESETS, type StoredRun } from '@80in8/core'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { readCheckpoint, saveCheckpoint } from './adapters/checkpoint.js'
import { runs, saveRun } from './adapters/history.js'
import { navigate, path } from './adapters/router.js'
import { updateSettings } from './adapters/settings.js'
import { beep, vibrate } from './adapters/sound.js'
import { acquireWakeLock, releaseWakeLock } from './adapters/wakelock.js'
import {
  abortRun,
  again,
  announcement,
  announceText,
  answeredCount,
  buildRun,
  clock,
  dispatch,
  feedback,
  installLifecycleListeners,
  lastStart,
  question,
  randomSeed,
  recoverCheckpoint,
  recovered,
  retryMistakes,
  runError,
  sameSeed,
  session,
  skipCountdown,
  startRun,
  tick,
} from './session.js'
import { abortPending } from './ui-state.js'

/**
 * The store around the reducer: what starts a run, what happens when one ends, and
 * how the browser's lifecycle reaches the core. Storage, sound and the wake lock are
 * mocked at the adapter boundary; the reducer and the questions are real.
 */

vi.mock('./adapters/history.js', async (original) => {
  const actual = await original<typeof import('./adapters/history.js')>()
  // jsdom has no IndexedDB, and a write that never lands rightly keeps the checkpoint;
  // these tests are about the store, so the write is taken as having landed.
  return { ...actual, saveRun: vi.fn(async (_run: StoredRun) => true) }
})
vi.mock('./adapters/sound.js', () => ({ beep: vi.fn(), vibrate: vi.fn() }))
vi.mock('./adapters/wakelock.js', () => ({
  acquireWakeLock: vi.fn(async () => undefined),
  reacquireWakeLock: vi.fn(),
  releaseWakeLock: vi.fn(),
}))

const CLASSIC = PRESETS['optiver-classic']

function begin(count = 4, extra: Partial<Parameters<typeof startRun>[0]> = {}) {
  startRun({
    profile: { ...CLASSIC, questionCount: count },
    mode: 'typed',
    seed: 11,
    practice: false,
    countdownMs: 0,
    ...extra,
  })
}

function answer(correct = true) {
  const current = question.value
  if (!current) throw new Error('no question')
  dispatch({
    type: 'answer',
    raw: correct ? String(current.answer.num / current.answer.den) : '999999',
    at: now(),
  })
}

const now = () => ({ mono: performance.now(), wall: Date.now() })

async function settled() {
  await Promise.resolve()
  await Promise.resolve()
  await Promise.resolve()
}

beforeEach(() => {
  vi.useFakeTimers()
  sessionStorage.clear()
  runs.value = []
  session.value = { phase: 'idle' }
  lastStart.value = null
  announceText.value = ''
  abortPending.value = false
  navigate('/', { replace: true })
  vi.mocked(saveRun).mockClear()
  vi.mocked(beep).mockClear()
  vi.mocked(vibrate).mockClear()
})

afterEach(() => {
  abortRun()
  vi.useRealTimers()
})

describe('starting', () => {
  it('builds a seeded run, counts down, and goes to the run screen', () => {
    begin(4, { countdownMs: 3000 })
    expect(session.value.phase).toBe('countdown')
    expect(path.value).toBe('/run')
    vi.advanceTimersByTime(3100)
    expect(session.value.phase).toBe('running')
    expect(acquireWakeLock).toHaveBeenCalled()
    expect(answeredCount()).toBe(0)
  })

  it('a zero countdown starts at once, and skipCountdown only acts during one', () => {
    begin()
    expect(session.value.phase).toBe('running')
    skipCountdown()
    expect(session.value.phase).toBe('running')
    abortRun()
    begin(4, { countdownMs: 3000 })
    skipCountdown()
    expect(session.value.phase).toBe('running')
  })

  it('refuses an empty deck and an id whose profile is unknown', () => {
    expect(
      buildRun({
        profile: CLASSIC,
        mode: 'typed',
        seed: 1,
        practice: false,
        deck: { ids: [], origin: 'retry' },
      }),
    ).toEqual({
      error: 'That deck is empty.',
    })
    startRun({
      profile: CLASSIC,
      mode: 'typed',
      seed: 1,
      practice: false,
      deck: { ids: [], origin: 'retry' },
    })
    expect(runError.value).toBe('That deck is empty.')
    startRun({
      profile: CLASSIC,
      mode: 'typed',
      seed: 1,
      practice: false,
      deck: { ids: ['1.custom-00000000.int-add.0000000'], origin: 'single' },
    })
    expect(runError.value).toMatch(/custom profile that was not included/)
    startRun({
      profile: CLASSIC,
      mode: 'typed',
      seed: 1,
      practice: false,
      deck: { ids: ['nonsense'], origin: 'single' },
    })
    expect(runError.value).toMatch(/could not be rebuilt/)
    expect(session.value.phase).toBe('idle')
  })

  it('remembers how to start again, but not where a one-off start went or how it counted down', () => {
    begin(4, { countdownMs: 0, navigateTo: null })
    expect(path.value).toBe('/')
    expect(lastStart.value).not.toHaveProperty('navigateTo')
    expect(lastStart.value).not.toHaveProperty('countdownMs')
    abortRun()
    sameSeed()
    // The remembered start goes to the run screen and counts down like any other.
    expect(path.value).toBe('/run')
    expect(session.value.phase).toBe('countdown')
  })

  it('a random seed and attempt id survive a browser without crypto', () => {
    const values = vi.spyOn(crypto, 'getRandomValues').mockImplementation(() => {
      throw new Error('no entropy')
    })
    const uuid = vi.spyOn(crypto, 'randomUUID').mockImplementation(() => {
      throw new Error('no uuid')
    })
    expect(randomSeed()).toBeGreaterThanOrEqual(0)
    begin()
    expect(session.value.phase === 'running' && session.value.run.attemptId).toMatch(/^[0-9a-z]+-[0-9a-z]+$/)
    values.mockRestore()
    uuid.mockRestore()
  })
})

describe('results actions', () => {
  it('again is a new seed, same seed is the same paper, retry is the misses', () => {
    begin(3)
    const first = question.value?.id
    answer(false)
    dispatch({ type: 'skip', at: now() })
    answer(true)
    expect(session.value.phase).toBe('finished')
    const missed = session.value.phase === 'finished' ? session.value.run.questionIds.slice(0, 2) : []

    // The misses of the run just finished: the wrong answer and the skip, in order.
    retryMistakes()
    skipCountdown()
    expect(session.value.phase === 'running' && session.value.run.questionIds).toEqual(missed)
    expect(session.value.phase === 'running' && session.value.run.spec.kind).toBe('deck')
    expect(lastStart.value?.practice).toBe(true)
    abortRun()

    sameSeed()
    skipCountdown()
    expect(question.value?.id).toBe(first)
    abortRun()

    again()
    skipCountdown()
    expect(session.value.phase === 'running' && session.value.run.spec.kind).toBe('seeded')
    expect(question.value?.id).not.toBe(first)
  })

  it('go home when there is nothing to repeat, and retry does nothing without mistakes', () => {
    lastStart.value = null
    navigate('/results', { replace: true })
    again()
    expect(path.value).toBe('/')
    navigate('/results', { replace: true })
    sameSeed()
    expect(path.value).toBe('/')
    retryMistakes()
    expect(session.value.phase).toBe('idle')

    begin(1)
    answer(true)
    retryMistakes()
    expect(session.value.phase).toBe('finished')
  })
})

describe('ending', () => {
  it('saves a run with answers, then clears its checkpoint; forgets one with none', async () => {
    begin(2)
    answer(true)
    const attemptId = session.value.phase === 'running' ? session.value.run.attemptId : ''
    expect(readCheckpoint()?.state).toMatchObject({ run: { attemptId } })
    abortRun()
    expect(session.value.phase).toBe('finished')
    await settled()
    expect(saveRun).toHaveBeenCalledOnce()
    const stored = vi.mocked(saveRun).mock.calls[0]?.[0]
    expect(stored).toMatchObject({ schemaVersion: 1, practice: false, spec: { kind: 'seeded' } })
    expect(stored?.answers).toHaveLength(1)
    expect(stored?.startedAt).toBeGreaterThan(0)
    expect(readCheckpoint()).toBeNull()
    expect(releaseWakeLock).toHaveBeenCalled()

    begin(2)
    abortRun()
    await settled()
    expect(saveRun).toHaveBeenCalledOnce()
    expect(readCheckpoint()).toBeNull()
  })

  it('drops a pending abort question when time ends the run first', () => {
    begin(4)
    abortPending.value = true
    vi.advanceTimersByTime(9 * 60_000)
    tick()
    expect(session.value.phase).toBe('finished')
    expect(abortPending.value).toBe(false)
  })

  it('flashes a verdict with tone and tick only when those are on', () => {
    updateSettings({ feedback: true, sound: true })
    begin(4)
    answer(true)
    expect(feedback.value?.correct).toBe(true)
    expect(beep).toHaveBeenCalledWith(880, 70)
    expect(vibrate).toHaveBeenCalledWith(8)
    answer(false)
    expect(feedback.value?.correct).toBe(false)
    expect(vibrate).toHaveBeenLastCalledWith(18)
    vi.advanceTimersByTime(320)
    expect(feedback.value).toBeNull()

    updateSettings({ feedback: false, sound: false })
    dispatch({ type: 'skip', at: now() })
    answer(true)
    expect(feedback.value).toBeNull()
    expect(beep).toHaveBeenCalledTimes(2)
    updateSettings({ feedback: true })
  })
})

describe('the clock', () => {
  it('speaks each milestone once, and after a jump only the latest one', () => {
    updateSettings({ sound: true })
    begin(4)
    expect(announceText.value).toBe('')
    vi.advanceTimersByTime(4 * 60_000 + 500)
    expect(announceText.value).toBe('4 minutes remaining')
    vi.advanceTimersByTime(2 * 60_000)
    expect(announceText.value).toBe('2 minutes remaining')
    // Six more minutes pass in one go, as after a sleep: straight to the last one.
    vi.advanceTimersByTime(110_000 + 500)
    expect(announceText.value).toBe('10 seconds remaining')
    expect(beep).toHaveBeenCalledWith(660, 120)
    expect(announcement()).toBeNull()
    updateSettings({ sound: false })
  })

  it('says nothing when announcements are off, in an untimed run, or outside a run', () => {
    updateSettings({ announceTimer: false })
    begin(4)
    vi.advanceTimersByTime(5 * 60_000)
    expect(announceText.value).toBe('')
    // Switched on mid-run: the milestone that is true now is spoken, once.
    updateSettings({ announceTimer: true })
    expect(announceText.value).toBe('4 minutes remaining')
    abortRun()
    expect(announcement()).toBeNull()
    begin(4, { profile: { ...CLASSIC, questionCount: 4, timeLimit: { kind: 'untimed' } } })
    vi.advanceTimersByTime(5 * 60_000)
    expect(announcement()).toBeNull()
    expect(clock.value.mono).toBeGreaterThan(0)
  })

  it('accounts hidden time and enforces the deadline on wake-up events', () => {
    const stop = installLifecycleListeners()
    begin(4)
    const visibility = vi.spyOn(document, 'visibilityState', 'get')
    visibility.mockReturnValue('hidden')
    document.dispatchEvent(new Event('visibilitychange'))
    vi.advanceTimersByTime(30_000)
    visibility.mockReturnValue('visible')
    document.dispatchEvent(new Event('visibilitychange'))
    expect(session.value.phase === 'running' && session.value.hiddenMs).toBeGreaterThanOrEqual(30_000)

    vi.setSystemTime(Date.now() + 9 * 60_000)
    window.dispatchEvent(new Event('focus'))
    expect(session.value.phase).toBe('finished')
    expect(session.value.phase === 'finished' && session.value.endedBy).toBe('time')
    // Not live any more: the listeners do nothing.
    window.dispatchEvent(new Event('pageshow'))
    stop()
    visibility.mockRestore()
  })
})

describe('recovery', () => {
  function checkpointAfter(answers: number, practice = false) {
    begin(4, { practice })
    for (let index = 0; index < answers; index++) answer(true)
    const state = session.value
    // Pretend the page went away: the store forgets, the checkpoint does not.
    session.value = { phase: 'idle' }
    recovered.value = false
    return state
  }

  it('closes an interrupted run out as aborted, keeps its answers and practice flag, and saves it', async () => {
    const state = checkpointAfter(2, true)
    expect(recoverCheckpoint()).toBe(true)
    expect(recovered.value).toBe(true)
    expect(session.value.phase).toBe('finished')
    if (session.value.phase !== 'finished' || state.phase !== 'running') throw new Error('unexpected phase')
    expect(session.value.endedBy).toBe('aborted')
    expect(session.value.answers).toHaveLength(2)
    expect(session.value.run.attemptId).toBe(state.run.attemptId)
    expect(lastStart.value).toMatchObject({ seed: 11, practice: true })
    await settled()
    expect(saveRun).toHaveBeenCalledOnce()
    expect(vi.mocked(saveRun).mock.calls[0]?.[0]).toMatchObject({
      practice: true,
      startedAt: expect.any(Number),
    })
    expect(readCheckpoint()).toBeNull()
  })

  it('finishes a run whose final write never landed, and forgets one nobody answered', async () => {
    begin(1)
    answer(true)
    const finished = session.value
    session.value = { phase: 'idle' }
    vi.mocked(saveRun).mockClear()
    saveCheckpoint(finished, now(), false, Date.now())
    expect(recoverCheckpoint()).toBe(true)
    await settled()
    expect(saveRun).toHaveBeenCalledOnce()
    expect(readCheckpoint()).toBeNull()

    checkpointAfter(0)
    saveCheckpoint(session.value, now())
    expect(recoverCheckpoint()).toBe(false)
    expect(recovered.value).toBe(false)
    expect(readCheckpoint()).toBeNull()
  })

  it('reports nothing to recover when there is no checkpoint', () => {
    expect(recoverCheckpoint()).toBe(false)
  })

  it('recovers a deck run as a deck', () => {
    const run = generateRun('x', 1, CLASSIC, 'typed')
    startRun({
      profile: CLASSIC,
      mode: 'typed',
      seed: 0,
      practice: true,
      deck: { ids: run.questionIds.slice(0, 2), origin: 'retry' },
      countdownMs: 0,
    })
    answer(true)
    session.value = { phase: 'idle' }
    expect(recoverCheckpoint()).toBe(true)
    expect(lastStart.value?.deck).toEqual({ ids: run.questionIds.slice(0, 2), origin: 'retry' })
    expect(lastStart.value?.seed).toBe(0)
  })

  it('a checkpoint from an older build, without a wall-clock start, still recovers one', async () => {
    begin(2)
    answer(true)
    const raw = JSON.parse(sessionStorage.getItem('80in8:checkpoint:v1') ?? '{}')
    raw.startedAtWall = undefined
    sessionStorage.setItem('80in8:checkpoint:v1', JSON.stringify(raw))
    session.value = { phase: 'idle' }
    expect(recoverCheckpoint()).toBe(true)
    await settled()
    const stored = vi.mocked(saveRun).mock.calls.at(-1)?.[0]
    expect(stored?.startedAt).toBe(raw.at.wall - (raw.at.mono - raw.state.startedAt))
  })
})
