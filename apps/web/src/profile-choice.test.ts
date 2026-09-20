import { generateRun, PRESETS, profileRefOf } from '@80in8/core'
import { describe, expect, it } from 'vitest'
import {
  deriveProfile,
  describeLimit,
  describeScoring,
  TEST_PRESETS,
  testName,
  testRefFor,
  withQuestionMix,
} from './profile-choice.js'

const CLASSIC = PRESETS['optiver-classic']

const refOf = (profile: typeof CLASSIC) => profileRefOf(profile, false)

describe('separating test, answer format and question mix', () => {
  it('shows one classic Optiver choice while mapping legacy references and names', () => {
    expect(TEST_PRESETS).toContain(CLASSIC)
    expect(TEST_PRESETS).not.toContain(PRESETS['optiver-mcq'])
    expect(testRefFor('optiver-mcq@1')).toBe('optiver-classic@1')
    expect(testRefFor('optiver-harsh@1')).toBe('optiver-harsh@1')
    expect(testName(deriveProfile(PRESETS['optiver-mcq'], 3, 'extended'))).toBe(
      'Optiver 80 in 8 — 3 questions · Extended time (×10)',
    )
  })

  it('reuses frozen presets, including snapshots, when changing the built-in mix', () => {
    expect(withQuestionMix(CLASSIC, 0.2)).toBe(CLASSIC)
    expect(withQuestionMix(CLASSIC, 0.4)).toBe(PRESETS['optiver-mcq'])
    expect(withQuestionMix({ ...PRESETS['optiver-mcq'] }, 0.2)).toBe(CLASSIC)
  })

  it('preserves a custom snapshot and restores its question identity after a mix round trip', () => {
    const custom = deriveProfile(PRESETS['optiver-mcq'], 3, 'extended', 'simplified')
    const changed = withQuestionMix(custom, 0.2)
    expect(changed).toEqual({ ...custom, missingOperandShare: 0.2 })
    expect(custom.missingOperandShare).toBe(0.4)
    expect(refOf(changed)).not.toBe(refOf(custom))
    expect(refOf(withQuestionMix(changed, 0.4))).toBe(refOf(custom))
    expect(withQuestionMix(custom, 0.4)).toBe(custom)
  })

  for (const share of [0.2, 0.4] as const) {
    it(`keeps legacy question IDs in both answer formats with a ${share * 100}% mix`, () => {
      const chosen = withQuestionMix(CLASSIC, share)
      const legacy = share === 0.4 ? PRESETS['optiver-mcq'] : CLASSIC
      const expected = generateRun('legacy', 4242, legacy, legacy.defaultMode).questionIds
      for (const mode of ['typed', 'mcq'] as const) {
        expect(generateRun('new', 4242, chosen, mode).questionIds).toEqual(expected)
      }
    })
  }
})

describe('deriveProfile', () => {
  it('returns the preset untouched when nothing was overridden', () => {
    expect(deriveProfile(CLASSIC, CLASSIC.questionCount, 'timed')).toBe(CLASSIC)
  })

  it('keeps the question ids when only the clock changes', () => {
    // The point of the practice modes: the same paper, more time. Ids must not move,
    // or a practice run could never feed the retry deck of the graded one.
    const graded = deriveProfile(CLASSIC, 40, 'timed')
    const extended = deriveProfile(CLASSIC, 40, 'extended')
    const untimed = deriveProfile(CLASSIC, 40, 'untimed')

    expect(refOf(extended)).toBe(refOf(graded))
    expect(refOf(untimed)).toBe(refOf(graded))

    const ids = (profile: typeof CLASSIC) => generateRun('a', 7, profile, 'typed', false).questionIds
    expect(ids(extended)).toEqual(ids(graded))
    expect(ids(untimed)).toEqual(ids(graded))
  })

  it('keeps the question ids when only the marking changes', () => {
    const lenient = deriveProfile(CLASSIC, 40, 'timed', 'equivalent')
    const strict = deriveProfile(CLASSIC, 40, 'timed', 'simplified')
    expect(strict.answerPolicy.fractions).toBe('simplified')
    expect(refOf(strict)).toBe(refOf(lenient))
  })

  it('does fork the question ids when the count changes, because the paper changed', () => {
    expect(refOf(deriveProfile(CLASSIC, 40, 'timed'))).not.toBe(refOf(deriveProfile(CLASSIC, 20, 'timed')))
  })

  it('stretches or removes the clock and nothing else', () => {
    const extended = deriveProfile(CLASSIC, CLASSIC.questionCount, 'extended')
    expect(extended.timeLimit).toEqual({ kind: 'timed', durationMs: 4_800_000 })
    expect(deriveProfile(CLASSIC, CLASSIC.questionCount, 'untimed').timeLimit).toEqual({ kind: 'untimed' })
    expect(extended.mix).toEqual(CLASSIC.mix)
    expect(extended.integer).toEqual(CLASSIC.integer)
  })
})

describe('describing a profile before the run starts (WCAG 2.2.1)', () => {
  it('states the time limit', () => {
    expect(describeLimit(CLASSIC)).toBe('8:00')
    expect(describeLimit(deriveProfile(CLASSIC, 80, 'untimed'))).toBe('no time limit')
  })

  it('states the scoring rule, including the harsh preset', () => {
    expect(describeScoring(CLASSIC)).toBe('+1 correct · -1 wrong · 0 skipped')
    expect(describeScoring(PRESETS['optiver-harsh'])).toBe('+1 correct · -2 wrong · -2 skipped')
    expect(describeScoring(PRESETS['optiver-strict'])).toBe('+1 correct · -1 wrong · no skipping')
  })
})
