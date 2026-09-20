import {
  activeQuestion,
  type Clocks,
  type DeckOrigin,
  generateRun,
  generateRunFromIds,
  initialState,
  isResolveFailure,
  type Mode,
  materialise,
  missedQuestionIds,
  type Profile,
  type Question,
  type QuestionId,
  type Run,
  reduce,
  remainingMs,
  SCHEMA_VERSION,
  type SessionEvent,
  type SessionState,
  type StoredRun,
} from '@80in8/core'
import { computed, effect, signal } from '@preact/signals'
import { clearCheckpoint, readCheckpoint, saveCheckpoint } from './adapters/checkpoint.js'
import { now } from './adapters/clock.js'
import { saveRun } from './adapters/history.js'
import { isBuiltIn, rememberProfile, resolveProfile } from './adapters/profiles.js'
import { navigate } from './adapters/router.js'
import { settings } from './adapters/settings.js'
import { beep, vibrate } from './adapters/sound.js'
import { resumeUpdates, suspendUpdates } from './adapters/sw.js'
import { acquireWakeLock, reacquireWakeLock, releaseWakeLock } from './adapters/wakelock.js'

/**
 * The session store: the reducer from `@80in8/core` plus the browser's clocks,
 * lifecycle events and storage. Everything that decides anything lives in the core;
 * this file only feeds it and reacts to what comes back.
 */

export const session = signal<SessionState>(initialState)
/** Advanced by the run loop; the display derives from it rather than counting ticks. */
export const clock = signal<Clocks>({ mono: 0, wall: 0 })
export const runError = signal<string | null>(null)
/** Set when a reload closed out a run that was in progress. */
export const recovered = signal(false)

export interface FeedbackFlash {
  correct: boolean
  /** Distinguishes consecutive flashes of the same verdict so the animation restarts. */
  token: number
}

export const feedback = signal<FeedbackFlash | null>(null)

export interface StartOptions {
  profile: Profile
  mode: Mode
  seed: number
  practice: boolean
  deck?: { ids: readonly QuestionId[]; origin: DeckOrigin }
  countdownMs?: number
  /** Where to go once the run is built. `null` keeps the current route (used by `/q/<id>`). */
  navigateTo?: string | null
}

export const lastStart = signal<StartOptions | null>(null)

export const remaining = computed(() => remainingMs(session.value, clock.value))

export const elapsedMs = computed(() => {
  const state = session.value
  if (state.phase !== 'running') return 0
  return Math.max(0, clock.value.mono - state.startedAt)
})

export const question = computed<Question | undefined>(() => activeQuestion(session.value))

export const progress = computed(() => {
  const state = session.value
  if (state.phase === 'running') return { index: state.index, total: state.questions.length }
  if (state.phase === 'finished') return { index: state.answers.length, total: state.questions.length }
  return { index: 0, total: 0 }
})

// ---------------------------------------------------------------------------
// The run loop
// ---------------------------------------------------------------------------

let rafId: number | undefined
let timeoutId: ReturnType<typeof setTimeout> | undefined
let looping = false

/**
 * Drives the display and lets the reducer notice the deadline. Ticks are *never*
 * counted: each one carries the real instant, and the reducer compares it with the
 * deadline captured at `go`. Dropping frames, throttling or sleeping therefore changes
 * nothing about when the run ends.
 */
export function tick(): void {
  const at = now()
  clock.value = at
  dispatch({ type: 'tick', at })
}

function frame(): void {
  if (!looping) return
  tick()
  rafId = requestAnimationFrame(frame)
}

/**
 * requestAnimationFrame stops in a background tab, so a plain timer runs alongside it.
 * It is aimed at the next whole second of remaining time so the display never sits on
 * a stale value.
 */
function scheduleFallback(): void {
  if (!looping) return
  const left = remainingMs(session.value, clock.value)
  const delay = left === null ? 1000 : Math.max(50, left % 1000 || 1000)
  timeoutId = setTimeout(() => {
    tick()
    scheduleFallback()
  }, delay)
}

function startLoop(): void {
  if (looping) return
  looping = true
  clock.value = now()
  rafId = requestAnimationFrame(frame)
  scheduleFallback()
}

function stopLoop(): void {
  looping = false
  if (rafId !== undefined) cancelAnimationFrame(rafId)
  if (timeoutId !== undefined) clearTimeout(timeoutId)
  rafId = undefined
  timeoutId = undefined
}

// ---------------------------------------------------------------------------
// Dispatch
// ---------------------------------------------------------------------------

let flashToken = 0
let flashTimer: ReturnType<typeof setTimeout> | undefined
let finalisedAttempt: string | null = null
let startedAtWall = 0
let currentPractice = false
let announcedAt = -1

export function dispatch(event: SessionEvent): void {
  const previous = session.value
  const next = reduce(previous, event)
  if (next === previous) return
  session.value = next
  react(previous, next, event.at)
}

function react(previous: SessionState, next: SessionState, at: Clocks): void {
  const previousAnswers = previous.phase === 'running' ? previous.answers.length : 0
  const nextAnswers =
    next.phase === 'running' ? next.answers.length : next.phase === 'finished' ? next.answers.length : 0

  if (nextAnswers > previousAnswers && next.phase !== 'idle' && next.phase !== 'countdown') {
    const answer = next.answers.at(-1)
    if (answer && !answer.skipped) flash(answer.correct)
    if (next.phase === 'running') saveCheckpoint(next, at, currentPractice, startedAtWall)
  }

  if (previous.phase !== 'running' && next.phase === 'running') {
    // The deadline was captured inside the reducer from these very clocks.
    startedAtWall = at.wall
    announcedAt = -1
    suspendUpdates()
    void acquireWakeLock()
  }

  if (next.phase === 'finished') {
    // The final answer and end reason also need synchronous protection until the
    // asynchronous history transaction commits.
    saveCheckpoint(next, at, currentPractice, startedAtWall)
    void finalise(next)
  }
}

function flash(correct: boolean): void {
  if (!settings.value.feedback) return
  flashToken += 1
  feedback.value = { correct, token: flashToken }
  if (settings.value.sound) beep(correct ? 880 : 300, 70)
  vibrate(correct ? 8 : 18)
  if (flashTimer) clearTimeout(flashTimer)
  flashTimer = setTimeout(() => {
    feedback.value = null
  }, 320)
}

async function finalise(state: Extract<SessionState, { phase: 'finished' }>): Promise<void> {
  if (finalisedAttempt === state.run.attemptId) return
  finalisedAttempt = state.run.attemptId
  stopLoop()
  releaseWakeLock()
  resumeUpdates()

  // A run nobody answered has nothing to teach and would drag down every average it
  // appeared in, so it is not recorded at all.
  if (state.answers.length === 0) {
    clearCheckpoint(state.run.attemptId)
    return
  }

  const run = state.run
  const stored: StoredRun = {
    schemaVersion: SCHEMA_VERSION,
    attemptId: run.attemptId,
    ...(run.runId === undefined ? {} : { runId: run.runId }),
    spec: run.spec,
    startedAt: startedAtWall || Date.now(),
    practice: currentPractice,
    questionIds: [...run.questionIds],
    summary: state.summary,
    answers: state.answers,
  }
  const saved = await saveRun(stored)
  // Only now. The checkpoint is this run's last line of defence, and the write above
  // is asynchronous: a hard navigation in the moment between finishing and the write
  // landing would otherwise lose the run twice over. Recovery reuses the same
  // attemptId, so a write that did land is overwritten rather than duplicated.
  if (saved) clearCheckpoint(run.attemptId)
}

/** What the polite live region is currently saying. */
export const announceText = signal('')

/** Announce the remaining time at the thresholds in §7.5, and beep at ten seconds. */
export function announcement(): string | null {
  const left = remaining.value
  if (left === null || session.value.phase !== 'running') return null
  const thresholds = [240_000, 120_000, 60_000, 30_000, 10_000]
  for (const threshold of thresholds) {
    if (left <= threshold && announcedAt !== threshold && (announcedAt < 0 || threshold < announcedAt)) {
      announcedAt = threshold
      if (threshold === 10_000 && settings.value.sound) beep(660, 120)
      return `${formatSpoken(threshold)} remaining`
    }
  }
  return null
}

// Driven by the run loop through `remaining`, so the announcement lands on the clock
// rather than on a render.
effect(() => {
  if (!settings.value.announceTimer) return
  const message = announcement()
  if (message) announceText.value = message
})

function formatSpoken(ms: number): string {
  const seconds = Math.round(ms / 1000)
  if (seconds % 60 === 0) return `${seconds / 60} minute${seconds === 60 ? '' : 's'}`
  return `${seconds} seconds`
}

// ---------------------------------------------------------------------------
// Starting runs
// ---------------------------------------------------------------------------

export function randomSeed(): number {
  try {
    const buffer = new Uint32Array(1)
    crypto.getRandomValues(buffer)
    return (buffer[0] ?? 0) >>> 0
  } catch {
    return (Math.random() * 2 ** 32) >>> 0
  }
}

/**
 * A fresh attempt id on *every* start, including "Same seed" (DESIGN.md §6.5). History
 * is keyed by attempt, so two goes at the same sequence are two rows, not one.
 */
function newAttemptId(): string {
  try {
    return crypto.randomUUID()
  } catch {
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
  }
}

export function buildRun(options: StartOptions): Run | { error: string } {
  const builtIn = isBuiltIn(options.profile)
  if (!builtIn) rememberProfile(options.profile)
  const attemptId = newAttemptId()
  const run = options.deck
    ? generateRunFromIds(
        attemptId,
        options.deck.ids,
        options.profile,
        options.mode,
        options.deck.origin,
        builtIn,
      )
    : generateRun(attemptId, options.seed, options.profile, options.mode, builtIn)
  if (run.questionIds.length === 0) return { error: 'That deck is empty.' }
  return run
}

export function startRun(options: StartOptions): void {
  const run = buildRun(options)
  if ('error' in run) {
    runError.value = run.error
    return
  }
  const resolved = materialise(run, resolveProfile)
  const failure = resolved.find(isResolveFailure)
  if (failure) {
    runError.value =
      failure.error === 'unknown-profile'
        ? 'Unavailable: that link uses a custom profile that was not included.'
        : `Those questions could not be rebuilt (${failure.error}).`
    return
  }

  runError.value = null
  recovered.value = false
  finalisedAttempt = null
  lastStart.value = options
  currentPractice = options.practice
  feedback.value = null

  const questions = resolved as Question[]
  const at = now()
  clock.value = at
  session.value = initialState
  const countdownMs = options.countdownMs ?? 3000
  dispatch({ type: 'start', run, questions, at, countdownMs })
  // A zero-length countdown should not flash a "1" for one frame.
  if (countdownMs === 0) dispatch({ type: 'go', at: now() })
  startLoop()
  const destination = options.navigateTo === undefined ? '/run' : options.navigateTo
  if (destination !== null) navigate(destination)
}

export function skipCountdown(): void {
  if (session.value.phase !== 'countdown') return
  dispatch({ type: 'go', at: now() })
}

export function abortRun(): void {
  dispatch({ type: 'abort', at: now() })
}

/** Results: a new sequence. A fresh seed and, as always, a fresh attempt id. */
export function again(): void {
  const previous = lastStart.value
  if (!previous) {
    navigate('/')
    return
  }
  const { deck: _deck, ...rest } = previous
  startRun({ ...rest, seed: randomSeed() })
}

/**
 * The same question sequence again. The run id is identical, the attempt id is not,
 * so this is a second row in history rather than an overwrite (§6.5).
 */
export function sameSeed(): void {
  const previous = lastStart.value
  if (!previous) {
    navigate('/')
    return
  }
  startRun({ ...previous })
}

/** A deck of exactly what went wrong, in the order it went wrong. */
export function retryMistakes(): void {
  const previous = lastStart.value
  const ids = missedQuestionIds(session.value)
  if (!previous || ids.length === 0) return
  startRun({ ...previous, deck: { ids, origin: 'retry' }, practice: true })
}

/** How many answers are in the run on screen; the abort confirmation depends on it. */
export function answeredCount(): number {
  const state = session.value
  return state.phase === 'running' ? state.answers.length : 0
}

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------

function live(): boolean {
  const phase = session.value.phase
  return phase === 'running' || phase === 'countdown'
}

/**
 * Three separate wake-ups (§7.5). A tab restored from the back/forward cache fires
 * `pageshow` but not `visibilitychange`; a desktop window coming back from a sleeping
 * machine may only fire `focus`. Any of them is enough to make the reducer notice that
 * the deadline passed while nothing was running.
 */
export function installLifecycleListeners(): () => void {
  const onVisibility = () => {
    if (!live()) return
    const at = now()
    clock.value = at
    dispatch({ type: 'visibility', hidden: document.visibilityState === 'hidden', at })
    if (document.visibilityState === 'visible') {
      tick()
      reacquireWakeLock()
    }
  }
  const onWake = () => {
    if (!live()) return
    tick()
    reacquireWakeLock()
  }

  document.addEventListener('visibilitychange', onVisibility)
  addEventListener('pageshow', onWake)
  addEventListener('focus', onWake)
  return () => {
    document.removeEventListener('visibilitychange', onVisibility)
    removeEventListener('pageshow', onWake)
    removeEventListener('focus', onWake)
  }
}

/**
 * A reload during a run cannot resume it — the clock kept running while the page was
 * gone — so the checkpoint is closed out as aborted and shown with a note, which is
 * still far better than losing the answers.
 */
export function recoverCheckpoint(): boolean {
  const checkpoint = readCheckpoint()
  if (!checkpoint) return false
  const answered =
    checkpoint.state.phase === 'running' || checkpoint.state.phase === 'finished'
      ? checkpoint.state.answers.length
      : 0
  if (answered === 0) {
    // A run nobody answered is not worth a row in history.
    clearCheckpoint()
    return false
  }
  // The checkpoint is deliberately left in place: `finalise` clears it once the run
  // has actually reached storage, so an interrupted recovery can be tried again.
  finalisedAttempt = null
  // The monotonic clock restarted at zero on reload, so the run's wall-clock start is
  // recovered from how far into the run the checkpoint was taken.
  startedAtWall =
    checkpoint.startedAtWall ??
    (checkpoint.state.phase === 'running'
      ? checkpoint.at.wall - (checkpoint.at.mono - checkpoint.state.startedAt)
      : checkpoint.at.wall)
  session.value = checkpoint.state
  currentPractice = checkpoint.practice ?? false
  const state = checkpoint.state
  if (state.phase === 'idle') return false
  const { run } = state
  lastStart.value = {
    profile: run.profile,
    mode: run.spec.mode,
    seed: run.spec.kind === 'seeded' ? run.spec.seed : 0,
    practice: currentPractice,
    ...(run.spec.kind === 'deck' ? { deck: { ids: run.spec.questionIds, origin: run.spec.origin } } : {}),
  }
  recovered.value = true
  if (state.phase === 'finished') void finalise(state)
  else dispatch({ type: 'abort', at: checkpoint.at })
  return session.value.phase === 'finished'
}
