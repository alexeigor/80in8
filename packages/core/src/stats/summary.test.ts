import { describe, expect, it } from 'vitest'
import { toId } from '../identity/id.js'
import { PRESETS } from '../profile/presets.js'
import type { Profile } from '../profile/types.js'
import { R } from '../rational/rational.js'
import type { Answer } from '../session/types.js'
import { kindOfAnswer, SLOWEST_COUNT, scoreOf, summariseRun } from './summary.js'

const profile = PRESETS['optiver-classic']

function answer(patch: Partial<Answer> & { kind?: Parameters<typeof toId>[0]['kind'] }): Answer {
  const { kind = 'int.add', ...rest } = patch
  return {
    questionId: toId({ profileRef: 'optiver-classic@1', kind, seed: 1 }),
    shownAt: 0,
    answeredAt: 1000,
    elapsedMs: 1000,
    raw: '1',
    value: R.of(1),
    correct: true,
    skipped: false,
    ...rest,
  }
}

describe('scoreOf', () => {
  it('applies the profile rule to each outcome', () => {
    const answers = [
      answer({ correct: true }),
      answer({ correct: false }),
      answer({ correct: false, skipped: true }),
    ]
    expect(scoreOf(answers, profile)).toBe(0)
    const harsh: Profile = { ...profile, scoring: { correct: 1, wrong: -2, skipped: -2, allowSkip: true } }
    expect(scoreOf(answers, harsh)).toBe(-3)
  })

  it('scores an empty run as nothing', () => {
    expect(scoreOf([], profile)).toBe(0)
  })
})

describe('kindOfAnswer', () => {
  it('recovers the kind from the question id', () => {
    expect(kindOfAnswer(answer({ kind: 'frac.div' }))).toBe('frac.div')
  })

  it('returns null for an unreadable id', () => {
    expect(kindOfAnswer({ ...answer({}), questionId: 'rubbish' })).toBeNull()
  })
})

describe('summariseRun', () => {
  const options = { endedBy: 'completed' as const, totalMs: 60_000, hiddenMs: 1500 }

  it('counts outcomes and computes accuracy over attempts only', () => {
    const answers = [
      answer({ correct: true }),
      answer({ correct: true }),
      answer({ correct: false }),
      answer({ correct: false, skipped: true }),
    ]
    const summary = summariseRun(answers, profile, options)
    expect(summary).toMatchObject({
      answered: 4,
      correct: 2,
      wrong: 1,
      skipped: 1,
      score: 1,
      questionCount: 80,
      totalMs: 60_000,
      hiddenMs: 1500,
      endedBy: 'completed',
    })
    // Skips do not count against accuracy; they were never attempted.
    expect(summary.accuracy).toBeCloseTo(2 / 3)
  })

  it('reports nothing rather than zero when nothing was attempted', () => {
    const summary = summariseRun([], profile, options)
    expect(summary.accuracy).toBeNull()
    expect(summary.meanMsPerQuestion).toBeNull()
    expect(summary.medianMsPerQuestion).toBeNull()
    expect(summary.byKind).toEqual([])
    expect(summary.byOp).toEqual([])
  })

  it('computes mean and median times', () => {
    const answers = [1000, 2000, 6000].map((elapsedMs) => answer({ elapsedMs }))
    const summary = summariseRun(answers, profile, options)
    expect(summary.meanMsPerQuestion).toBe(3000)
    expect(summary.medianMsPerQuestion).toBe(2000)
    const even = summariseRun(
      [1000, 2000, 3000, 6000].map((elapsedMs) => answer({ elapsedMs })),
      profile,
      options,
    )
    expect(even.medianMsPerQuestion).toBe(2500)
  })

  it('breaks results down by kind and by operator', () => {
    const answers = [
      answer({ kind: 'int.add', correct: true, elapsedMs: 1000 }),
      answer({ kind: 'int.add', correct: false, elapsedMs: 3000 }),
      answer({ kind: 'frac.add', correct: false, skipped: true, elapsedMs: 500 }),
      answer({ kind: 'int.mul', correct: true, elapsedMs: 2000 }),
    ]
    const summary = summariseRun(answers, profile, options)
    expect(summary.byKind).toEqual([
      { kind: 'frac.add', answered: 1, correct: 0, wrong: 0, skipped: 1, meanMs: 500 },
      { kind: 'int.add', answered: 2, correct: 1, wrong: 1, skipped: 0, meanMs: 2000 },
      { kind: 'int.mul', answered: 1, correct: 1, wrong: 0, skipped: 0, meanMs: 2000 },
    ])
    expect(summary.byOp).toEqual([
      { op: '+', answered: 3, correct: 1, meanMs: 1500 },
      { op: '×', answered: 1, correct: 1, meanMs: 2000 },
    ])
  })

  it('ignores answers whose id cannot be read', () => {
    const summary = summariseRun([{ ...answer({}), questionId: 'rubbish' }], profile, options)
    expect(summary.answered).toBe(1)
    expect(summary.byKind).toEqual([])
  })

  it('lists the slowest questions, longest first', () => {
    const answers = [100, 900, 300, 700, 500, 800, 200].map((elapsedMs) => answer({ elapsedMs }))
    const summary = summariseRun(answers, profile, options)
    expect(summary.slowest).toHaveLength(SLOWEST_COUNT)
    expect(summary.slowest.map((s) => s.elapsedMs)).toEqual([900, 800, 700, 500, 300])
  })

  it('counts which mistakes the distractors caught, ignoring correct picks', () => {
    const answers = [
      answer({ correct: false, source: 'off-by-one' }),
      answer({ correct: false, source: 'off-by-one' }),
      answer({ correct: false, source: 'decimal-shift' }),
      answer({ correct: true, source: 'answer' }),
      answer({ correct: false, skipped: true }),
    ]
    expect(summariseRun(answers, profile, options).distractorSources).toEqual([
      { source: 'off-by-one', count: 2 },
      { source: 'decimal-shift', count: 1 },
    ])
  })

  it('judges the pass mark only when the profile sets one', () => {
    const passing = Array.from({ length: 60 }, () => answer({ correct: true }))
    expect(summariseRun(passing, profile, options).passed).toBe(true)
    expect(summariseRun([answer({ correct: true })], profile, options).passed).toBe(false)
    // Omitted rather than set to undefined: exactOptionalPropertyTypes draws that
    // distinction, and so does JSON serialisation.
    const { passScore: _passScore, ...unmarked } = profile
    expect(summariseRun(passing, unmarked, options).passed).toBeNull()
  })
})

describe('stable ordering when counts tie', () => {
  it('breaks a distractor tie alphabetically, whatever order they arrived in', () => {
    const answers = [
      answer({ correct: false, source: 'off-by-one' }),
      answer({ correct: false, source: 'decimal-shift' }),
      answer({ correct: false, source: 'sign-flip' }),
      answer({ correct: false, source: 'cross-add' }),
      answer({ correct: false, source: 'cross-add' }),
    ]
    expect(
      summariseRun(answers, profile, { endedBy: 'completed', totalMs: 1, hiddenMs: 0 }).distractorSources,
    ).toEqual([
      { source: 'cross-add', count: 2 },
      { source: 'decimal-shift', count: 1 },
      { source: 'off-by-one', count: 1 },
      { source: 'sign-flip', count: 1 },
    ])
  })
})
