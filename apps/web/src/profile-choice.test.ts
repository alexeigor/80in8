import { generateRun, PRESETS, profileRefOf } from '@80in8/core'
import { describe, expect, it } from 'vitest'
import { deriveProfile, describeLimit, describeScoring } from './profile-choice.js'

const CLASSIC = PRESETS['optiver-classic']

const refOf = (profile: typeof CLASSIC) => profileRefOf(profile, false)

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
