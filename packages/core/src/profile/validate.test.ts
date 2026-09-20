import { describe, expect, it } from 'vitest'
import { PRESETS } from './presets.js'
import type { Profile } from './types.js'
import { ProfileError, validateProfile } from './validate.js'

const base = PRESETS['optiver-classic']

function withProfile(patch: Partial<Profile>): () => Profile {
  return () => validateProfile({ ...base, ...patch })
}

describe('validateProfile', () => {
  it('accepts a good profile and returns it', () => {
    expect(validateProfile(base)).toBe(base)
  })

  it.each<[string, Partial<Profile>, RegExp]>([
    ['a bad id', { id: 'Not Kebab' }, /kebab-case/],
    ['a zero version', { version: 0 }, /positive integer/],
    ['no questions', { questionCount: 0 }, /questionCount/],
    ['a zero duration', { timeLimit: { kind: 'timed', durationMs: 0 } }, /positive durationMs/],
    ['an empty mix', { mix: [] }, /mix must not be empty/],
    ['an unknown kind', { mix: [{ kind: 'int.pow' as never, weight: 1 }] }, /unknown kind/],
    ['a zero weight', { mix: [{ kind: 'int.add', weight: 0 }] }, /must be positive/],
    [
      'a repeated kind',
      {
        mix: [
          { kind: 'int.add', weight: 1 },
          { kind: 'int.add', weight: 1 },
        ],
      },
      /must not repeat/,
    ],
    ['a share above one', { missingOperandShare: 1.5 }, /missingOperandShare/],
    ['a non-finite pass score', { passScore: Number.NaN }, /passScore must be finite/],
    ['a non-finite competitive score', { competitiveScore: Number.NaN }, /competitiveScore/],
  ])('rejects %s', (_label, patch, message) => {
    expect(withProfile(patch)).toThrow(message)
    expect(withProfile(patch)).toThrow(ProfileError)
  })

  it('rejects bad integer ranges', () => {
    expect(withProfile({ integer: { ...base.integer, negativeFirstShare: 2 } })).toThrow(/negativeFirstShare/)
    expect(withProfile({ integer: { ...base.integer, mulLargeSmallShare: -1 } })).toThrow(
      /mulLargeSmallShare/,
    )
    expect(withProfile({ integer: { ...base.integer, addSub: [0, 10] } })).toThrow(/addSub/)
    expect(withProfile({ integer: { ...base.integer, addSub: [10, 1] } })).toThrow(/addSub/)
    expect(withProfile({ integer: { ...base.integer, mulLarge: [9, 1] } })).toThrow(/mulLarge/)
    expect(withProfile({ integer: { ...base.integer, mulSmall: [1, 9] } })).toThrow(/mulSmall/)
    expect(withProfile({ integer: { ...base.integer, mulTwoDigit: [9, 1] } })).toThrow(/mulTwoDigit/)
    expect(withProfile({ integer: { ...base.integer, mulFriendly: [] } })).toThrow(
      /mulFriendly must not be empty/,
    )
    expect(withProfile({ integer: { ...base.integer, mulFriendly: [1] } })).toThrow(/degenerate/)
    expect(withProfile({ integer: { ...base.integer, divisors: [] } })).toThrow(/divisors must not be empty/)
    expect(withProfile({ integer: { ...base.integer, divisors: [1] } })).toThrow(/dividing by 1/)
    expect(withProfile({ integer: { ...base.integer, quotient: [1, 5] } })).toThrow(/quotient range/)
  })

  it('rejects bad decimal settings', () => {
    expect(withProfile({ decimal: { ...base.decimal, places: [] } })).toThrow(/places must not be empty/)
    expect(withProfile({ decimal: { ...base.decimal, placesWeights: [1] } })).toThrow(/same length/)
    expect(withProfile({ decimal: { ...base.decimal, places: [0, 2] } })).toThrow(/within \[1, 6\]/)
    expect(withProfile({ decimal: { ...base.decimal, placesWeights: [0, 1] } })).toThrow(
      /weights must be positive/,
    )
    expect(withProfile({ decimal: { ...base.decimal, scaled: [0, 9] } })).toThrow(/scaled must be/)
    expect(withProfile({ decimal: { ...base.decimal, mulScaled: [9, 1] } })).toThrow(/mulScaled/)
    expect(withProfile({ decimal: { ...base.decimal, divScaled: [9, 1] } })).toThrow(/divScaled/)
    expect(withProfile({ decimal: { ...base.decimal, mulPlaces: 0 } })).toThrow(/mulPlaces/)
    expect(withProfile({ decimal: { ...base.decimal, divPlaces: 0 } })).toThrow(/divPlaces/)
  })

  it('rejects bad fraction settings', () => {
    expect(withProfile({ fraction: { ...base.fraction, denominators: [] } })).toThrow(/must not be empty/)
    expect(withProfile({ fraction: { ...base.fraction, denominators: [1, 2] } })).toThrow(/integers >= 2/)
    expect(withProfile({ fraction: { ...base.fraction, maxLcd: 3 } })).toThrow(/maxLcd/)
  })

  it('accepts an untimed profile', () => {
    expect(withProfile({ timeLimit: { kind: 'untimed' } })).not.toThrow()
  })
})
