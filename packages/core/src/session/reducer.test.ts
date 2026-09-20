import { fc, test as propTest } from '@fast-check/vitest'
import { describe, expect, it } from 'vitest'
import { generateRun, generateRunFromIds, materialise } from '../generate/run.js'
import type { Question, Run } from '../generate/types.js'
import { isResolveFailure } from '../identity/resolve.js'
import { PRESETS, resolvePreset } from '../profile/presets.js'
import type { Profile } from '../profile/types.js'
import { R } from '../rational/rational.js'
import { activeQuestion, initialState, liveScore, missedQuestionIds, reduce, remainingMs } from './reducer.js'
import type { Clocks, SessionEvent, SessionState } from './types.js'

const SHORT: Profile = { ...PRESETS['optiver-classic'], questionCount: 3 }
const UNTIMED: Profile = { ...SHORT, timeLimit: { kind: 'untimed' } }
const NO_SKIP: Profile = { ...SHORT, scoring: { ...SHORT.scoring, allowSkip: false } }
const PAUSING: Profile = { ...SHORT, pauseOnHide: true }

function at(mono: number, wall = 1_000_000 + mono): Clocks {
  return { mono, wall }
}

function buildRun(profile: Profile, seed = 1): { run: Run; questions: Question[] } {
  const run = generateRun('attempt-1', seed, profile, 'mcq')
  const questions = materialise(run, () => profile).filter((q): q is Question => !isResolveFailure(q))
  return { run, questions }
}

/** A session already under way, with the clock at zero. */
function started(profile: Profile = SHORT): SessionState {
  const { run, questions } = buildRun(profile)
  const countdown = reduce(initialState, { type: 'start', run, questions, at: at(0), countdownMs: 3000 })
  return reduce(countdown, { type: 'go', at: at(0) })
}

function correctAnswerFor(state: SessionState): string {
  const question = activeQuestion(state)
  if (!question) throw new Error('no active question')
  return question.options.find((o) => o.correct)?.text ?? ''
}

describe('phases', () => {
  it('starts idle and ignores everything but start', () => {
    expect(initialState).toEqual({ phase: 'idle' })
    for (const event of [
      { type: 'go' as const, at: at(0) },
      { type: 'tick' as const, at: at(0) },
      { type: 'abort' as const, at: at(0) },
      { type: 'answer' as const, raw: '1', at: at(0) },
    ]) {
      expect(reduce(initialState, event)).toBe(initialState)
    }
  })

  it('enters a countdown and then runs', () => {
    const { run, questions } = buildRun(SHORT)
    const countdown = reduce(initialState, { type: 'start', run, questions, at: at(100), countdownMs: 3000 })
    expect(countdown).toMatchObject({ phase: 'countdown', startsAt: 3100 })
    const running = reduce(countdown, { type: 'go', at: at(3100) })
    expect(running).toMatchObject({ phase: 'running', index: 0, answers: [] })
  })

  it('begins automatically once the countdown elapses', () => {
    const { run, questions } = buildRun(SHORT)
    const countdown = reduce(initialState, { type: 'start', run, questions, at: at(0), countdownMs: 3000 })
    expect(reduce(countdown, { type: 'tick', at: at(2999) }).phase).toBe('countdown')
    expect(reduce(countdown, { type: 'tick', at: at(3000) }).phase).toBe('running')
  })

  it('ignores stray events during the countdown', () => {
    const { run, questions } = buildRun(SHORT)
    const countdown = reduce(initialState, { type: 'start', run, questions, at: at(0), countdownMs: 3000 })
    expect(reduce(countdown, { type: 'answer', raw: '5', at: at(10) })).toBe(countdown)
    expect(reduce(countdown, { type: 'visibility', hidden: true, at: at(10) })).toBe(countdown)
  })

  it('can be abandoned during the countdown', () => {
    const { run, questions } = buildRun(SHORT)
    const countdown = reduce(initialState, { type: 'start', run, questions, at: at(0), countdownMs: 3000 })
    const aborted = reduce(countdown, { type: 'abort', at: at(500) })
    expect(aborted).toMatchObject({ phase: 'finished', endedBy: 'aborted' })
    if (aborted.phase === 'finished') expect(aborted.summary.answered).toBe(0)
  })

  it('finishes immediately when there is nothing to ask', () => {
    const run = generateRunFromIds('a', [], SHORT, 'typed', 'single')
    const countdown = reduce(initialState, { type: 'start', run, questions: [], at: at(0), countdownMs: 0 })
    expect(reduce(countdown, { type: 'go', at: at(0) })).toMatchObject({
      phase: 'finished',
      endedBy: 'completed',
    })
  })

  it('is terminal once finished', () => {
    let state = started()
    for (let i = 0; i < 3; i++)
      state = reduce(state, { type: 'answer', raw: correctAnswerFor(state), at: at(i) })
    expect(state.phase).toBe('finished')
    for (const event of [
      { type: 'answer' as const, raw: '1', at: at(99) },
      { type: 'tick' as const, at: at(99) },
      { type: 'abort' as const, at: at(99) },
      { type: 'go' as const, at: at(99) },
    ]) {
      expect(reduce(state, event)).toBe(state)
    }
  })

  it('a start event replaces whatever came before', () => {
    const finished = reduce(started(), { type: 'abort', at: at(5) })
    const { run, questions } = buildRun(SHORT, 2)
    expect(reduce(finished, { type: 'start', run, questions, at: at(0), countdownMs: 0 }).phase).toBe(
      'countdown',
    )
  })
})

describe('answering', () => {
  it('records a typed answer and advances', () => {
    const state = started()
    const next = reduce(state, { type: 'answer', raw: correctAnswerFor(state), at: at(1500) })
    expect(next).toMatchObject({ phase: 'running', index: 1 })
    if (next.phase !== 'running') return
    expect(next.answers).toHaveLength(1)
    expect(next.answers[0]).toMatchObject({ correct: true, skipped: false, elapsedMs: 1500 })
    expect(next.questionShownAt).toBe(1500)
  })

  it('records a wrong answer without advancing the score', () => {
    const state = started()
    const next = reduce(state, { type: 'answer', raw: '999999', at: at(100) })
    expect(next.phase === 'running' && next.answers[0]?.correct).toBe(false)
    expect(liveScore(next)).toBe(-1)
  })

  it('ignores a half-typed answer entirely', () => {
    const state = started()
    for (const raw of ['', '-', '3/', 'abc']) {
      expect(reduce(state, { type: 'answer', raw, at: at(10) })).toBe(state)
    }
  })

  it('records a multiple-choice selection with its distractor source', () => {
    const state = started()
    const question = activeQuestion(state)
    if (!question) throw new Error('no question')
    const wrongIndex = question.options.findIndex((o) => !o.correct)
    const next = reduce(state, { type: 'select', optionIndex: wrongIndex, at: at(700) })
    if (next.phase !== 'running') throw new Error('expected to continue')
    expect(next.answers[0]).toMatchObject({
      correct: false,
      optionIndex: wrongIndex,
      source: question.options[wrongIndex]?.source,
      raw: question.options[wrongIndex]?.text,
    })
  })

  it('ignores a selection outside the option list', () => {
    const state = started()
    expect(reduce(state, { type: 'select', optionIndex: 9, at: at(10) })).toBe(state)
    expect(reduce(state, { type: 'select', optionIndex: -1, at: at(10) })).toBe(state)
  })

  it('skips only when the profile allows it', () => {
    const allowed = reduce(started(), { type: 'skip', at: at(200) })
    expect(allowed).toMatchObject({ phase: 'running', index: 1 })
    if (allowed.phase === 'running') {
      expect(allowed.answers[0]).toMatchObject({ skipped: true, correct: false, value: null, raw: '' })
    }
    const strict = started(NO_SKIP)
    expect(reduce(strict, { type: 'skip', at: at(200) })).toBe(strict)
  })

  it('finishes after the last question', () => {
    let state = started()
    for (let i = 0; i < 3; i++) {
      state = reduce(state, { type: 'answer', raw: correctAnswerFor(state), at: at(i * 100) })
    }
    expect(state).toMatchObject({ phase: 'finished', endedBy: 'completed' })
    if (state.phase === 'finished') expect(state.summary.correct).toBe(3)
  })

  it('never lets elapsed time go negative when clocks jump backwards', () => {
    const state = started()
    const next = reduce(state, { type: 'answer', raw: correctAnswerFor(state), at: at(-500) })
    expect(next.phase === 'running' && next.answers[0]?.elapsedMs).toBe(0)
  })
})

describe('the deadline', () => {
  it('counts down on the stricter of the two clocks', () => {
    const state = started()
    expect(remainingMs(state, at(0))).toBe(480_000)
    expect(remainingMs(state, at(1000))).toBe(479_000)
    // The wall clock has run on although the monotonic clock stalled, as after sleep.
    expect(remainingMs(state, { mono: 1000, wall: 1_000_000 + 400_000 })).toBe(80_000)
    // The wall clock was wound back; the monotonic clock still governs.
    expect(remainingMs(state, { mono: 400_000, wall: 0 })).toBe(80_000)
  })

  it('never reports a negative remainder', () => {
    expect(remainingMs(started(), at(999_999))).toBe(0)
  })

  it('reports nothing for an untimed run or a run not in progress', () => {
    expect(remainingMs(started(UNTIMED), at(0))).toBeNull()
    expect(remainingMs(initialState, at(0))).toBeNull()
  })

  it('discards an answer that lands after time is up', () => {
    const state = started()
    const late = reduce(state, { type: 'answer', raw: correctAnswerFor(state), at: at(480_000) })
    expect(late).toMatchObject({ phase: 'finished', endedBy: 'time' })
    if (late.phase === 'finished') expect(late.answers).toHaveLength(0)
  })

  it('accepts an answer one millisecond before the deadline', () => {
    const state = started()
    const inTime = reduce(state, { type: 'answer', raw: correctAnswerFor(state), at: at(479_999) })
    expect(inTime.phase).toBe('running')
  })

  it('ends retroactively after the device slept through the deadline', () => {
    const state = started()
    // performance.now() froze while Date.now() kept going: the classic laptop-lid case.
    const woken = reduce(state, { type: 'tick', at: { mono: 2000, wall: 1_000_000 + 600_000 } })
    expect(woken).toMatchObject({ phase: 'finished', endedBy: 'time' })
  })

  it('ends an untimed run only by finishing or abandoning it', () => {
    const state = started(UNTIMED)
    expect(reduce(state, { type: 'tick', at: at(10_000_000) }).phase).toBe('running')
    expect(reduce(state, { type: 'abort', at: at(10_000_000) })).toMatchObject({ endedBy: 'aborted' })
  })
})

describe('visibility', () => {
  it('keeps the clock running but records the time away', () => {
    const hidden = reduce(started(), { type: 'visibility', hidden: true, at: at(1000) })
    expect(hidden).toMatchObject({ phase: 'running', hiddenSince: 1000 })
    // A second hide changes nothing.
    expect(reduce(hidden, { type: 'visibility', hidden: true, at: at(1500) })).toBe(hidden)
    const shown = reduce(hidden, { type: 'visibility', hidden: false, at: at(4000) })
    expect(shown).toMatchObject({ phase: 'running', hiddenMs: 3000 })
    expect(shown.phase === 'running' && 'hiddenSince' in shown).toBe(false)
    // The deadline did not move: the real test does not pause either.
    expect(remainingMs(shown, at(4000))).toBe(476_000)
  })

  it('ignores becoming visible when it never went away', () => {
    const state = started()
    expect(reduce(state, { type: 'visibility', hidden: false, at: at(10) })).toBe(state)
  })

  it('reports time away even if the run ends while hidden', () => {
    const hidden = reduce(started(), { type: 'visibility', hidden: true, at: at(1000) })
    const finished = reduce(hidden, { type: 'abort', at: at(5000) })
    expect(finished.phase === 'finished' && finished.summary.hiddenMs).toBe(4000)
  })

  it('stops the clock for a profile that asks for it', () => {
    const hidden = reduce(started(PAUSING), { type: 'visibility', hidden: true, at: at(1000) })
    const shown = reduce(hidden, { type: 'visibility', hidden: false, at: at(4000) })
    expect(remainingMs(shown, at(4000))).toBe(479_000)
  })

  it('does not try to move a deadline that does not exist', () => {
    const profile: Profile = { ...UNTIMED, pauseOnHide: true }
    const hidden = reduce(started(profile), { type: 'visibility', hidden: true, at: at(1000) })
    const shown = reduce(hidden, { type: 'visibility', hidden: false, at: at(4000) })
    expect(shown.phase === 'running' && shown.deadline).toBeUndefined()
  })
})

describe('derived views', () => {
  it('exposes the active question only while running', () => {
    expect(activeQuestion(initialState)).toBeUndefined()
    expect(activeQuestion(started())).toBeDefined()
  })

  it('scores live and at the end consistently', () => {
    let state = started()
    expect(liveScore(initialState)).toBe(0)
    state = reduce(state, { type: 'answer', raw: correctAnswerFor(state), at: at(1) })
    expect(liveScore(state)).toBe(1)
    state = reduce(state, { type: 'skip', at: at(2) })
    expect(liveScore(state)).toBe(1)
    state = reduce(state, { type: 'answer', raw: '123456', at: at(3) })
    expect(state.phase).toBe('finished')
    expect(liveScore(state)).toBe(0)
    if (state.phase === 'finished') expect(state.summary.score).toBe(0)
  })

  it('lists the questions worth retrying', () => {
    let state = started()
    expect(missedQuestionIds(state)).toEqual([])
    const firstId = activeQuestion(state)?.id
    state = reduce(state, { type: 'answer', raw: '123456', at: at(1) })
    const secondId = activeQuestion(state)?.id
    state = reduce(state, { type: 'skip', at: at(2) })
    state = reduce(state, { type: 'answer', raw: correctAnswerFor(state), at: at(3) })
    expect(missedQuestionIds(state)).toEqual([firstId, secondId])
  })
})

describe('invariants under arbitrary event sequences', () => {
  const clocksArb = fc.record({
    mono: fc.integer({ min: -1000, max: 600_000 }),
    wall: fc.integer({ min: 900_000, max: 1_700_000 }),
  })

  const eventArb: fc.Arbitrary<SessionEvent> = fc.oneof(
    fc.record({ type: fc.constant('tick' as const), at: clocksArb }),
    fc.record({ type: fc.constant('go' as const), at: clocksArb }),
    fc.record({ type: fc.constant('skip' as const), at: clocksArb }),
    fc.record({ type: fc.constant('abort' as const), at: clocksArb }),
    fc.record({ type: fc.constant('answer' as const), raw: fc.string(), at: clocksArb }),
    fc.record({
      type: fc.constant('select' as const),
      optionIndex: fc.integer({ min: -2, max: 6 }),
      at: clocksArb,
    }),
    fc.record({ type: fc.constant('visibility' as const), hidden: fc.boolean(), at: clocksArb }),
  )

  propTest.prop([fc.array(eventArb, { maxLength: 40 }), fc.integer({ min: 0, max: 1000 })])(
    'never reaches an invalid state',
    (events, seed) => {
      const { run, questions } = buildRun(SHORT, seed)
      let state: SessionState = reduce(initialState, {
        type: 'start',
        run,
        questions,
        at: at(0),
        countdownMs: 0,
      })
      let finished = false
      for (const event of events) {
        state = reduce(state, event)
        if (state.phase === 'running') {
          expect(state.index).toBeGreaterThanOrEqual(0)
          expect(state.index).toBeLessThan(questions.length)
          expect(state.answers).toHaveLength(state.index)
          expect(state.hiddenMs).toBeGreaterThanOrEqual(0)
          for (const answer of state.answers) expect(answer.elapsedMs).toBeGreaterThanOrEqual(0)
          const left = remainingMs(state, event.at)
          if (left !== null) expect(left).toBeGreaterThanOrEqual(0)
        }
        if (state.phase === 'finished') {
          // Once finished, it stays finished and the answer list stops growing.
          expect(state.answers.length).toBeLessThanOrEqual(questions.length)
          finished = true
        } else {
          expect(finished).toBe(false)
        }
      }
    },
  )

  propTest.prop([fc.array(eventArb, { maxLength: 30 })])(
    'stays JSON serialisable, so the checkpoint round-trips',
    (events) => {
      const { run, questions } = buildRun(SHORT)
      let state: SessionState = reduce(initialState, {
        type: 'start',
        run,
        questions,
        at: at(0),
        countdownMs: 0,
      })
      for (const event of events) {
        state = reduce(state, event)
        const text = JSON.stringify(state)
        expect(text).not.toContain('null,null')
        expect(JSON.parse(text)).toEqual(state)
      }
    },
  )

  propTest.prop([fc.array(eventArb, { maxLength: 30 })])('scores exactly what it recorded', (events) => {
    const { run, questions } = buildRun(SHORT)
    let state: SessionState = reduce(initialState, {
      type: 'start',
      run,
      questions,
      at: at(0),
      countdownMs: 0,
    })
    for (const event of events) state = reduce(state, event)
    const answers = state.phase === 'running' || state.phase === 'finished' ? state.answers : []
    const expected = answers.reduce((sum, answer) => {
      if (answer.skipped) return sum + SHORT.scoring.skipped
      return sum + (answer.correct ? SHORT.scoring.correct : SHORT.scoring.wrong)
    }, 0)
    expect(liveScore(state)).toBe(expected)
    expect(expected).toBeLessThanOrEqual(questions.length * SHORT.scoring.correct)
    expect(expected).toBeGreaterThanOrEqual(questions.length * SHORT.scoring.wrong)
  })
})

describe('regeneration still holds inside a session', () => {
  it('judges an answer against the question the id names', () => {
    const profile = PRESETS['optiver-classic']
    const run = generateRun('attempt-1', 77, profile, 'typed')
    const questions = materialise(run, resolvePreset).filter((q): q is Question => !isResolveFailure(q))
    let state: SessionState = reduce(initialState, {
      type: 'start',
      run,
      questions,
      at: at(0),
      countdownMs: 0,
    })
    state = reduce(state, { type: 'go', at: at(0) })
    const first = questions[0] as Question
    const text = R.toDecimalString(first.answer) ?? R.toFractionString(first.answer)
    state = reduce(state, { type: 'answer', raw: text, at: at(100) })
    expect(state.phase === 'running' && state.answers[0]?.correct).toBe(true)
    expect(state.phase === 'running' && state.answers[0]?.questionId).toBe(first.id)
  })
})

describe('totality against malformed states', () => {
  it('leaves a running state whose index addresses nothing alone', () => {
    // The reducer promises to be total for any (state, event) pair, including states
    // no transition of its own can produce.
    const state = started()
    if (state.phase !== 'running') throw new Error('expected a running state')
    const impossible: SessionState = { ...state, index: 99 }
    expect(reduce(impossible, { type: 'answer', raw: '1', at: at(10) })).toBe(impossible)
    expect(reduce(impossible, { type: 'select', optionIndex: 0, at: at(10) })).toBe(impossible)
    expect(reduce(impossible, { type: 'skip', at: at(10) })).toBe(impossible)
  })

  it('ignores a go event once the run is already under way', () => {
    const state = started()
    expect(reduce(state, { type: 'go', at: at(10) })).toBe(state)
  })
})
