import { fc, test as propTest } from '@fast-check/vitest'
import { describe, expect, it } from 'vitest'
import { familyOf, formatValue } from '../generate/display.js'
import { GENERATORS } from '../generate/kinds.js'
import { pickMissingSlot } from '../generate/missing.js'
import type { Question } from '../generate/types.js'
import { toId } from '../identity/id.js'
import { isResolveFailure, questionFromId } from '../identity/resolve.js'
import { PRESETS } from '../profile/presets.js'
import { ALL_KINDS, type Kind, type Profile } from '../profile/types.js'
import { R } from '../rational/rational.js'
import { splitmix32 } from '../rng/rng.js'
import { buildOptions, OPTION_COUNT } from './build.js'

const seedArb = fc.integer({ min: 0, max: 0xffffffff })
const kindArb = fc.constantFrom(...ALL_KINDS)
const presetArb = fc.constantFrom(...Object.values(PRESETS))

function question(kind: Kind, seed: number, profile: Profile, ref: string): Question {
  const result = questionFromId(toId({ profileRef: ref, kind, seed }), () => profile)
  if (isResolveFailure(result)) throw new Error(result.error)
  return result
}

describe('option sets', () => {
  propTest.prop([kindArb, seedArb, presetArb])(
    'always offers four distinct options with exactly one correct',
    (kind, seed, profile) => {
      const q = question(kind, seed, profile, `${profile.id}@${profile.version}`)
      expect(q.options).toHaveLength(OPTION_COUNT)
      expect(q.options.filter((o) => o.correct)).toHaveLength(1)
      expect(new Set(q.options.map((o) => o.text)).size).toBe(OPTION_COUNT)
      expect(new Set(q.options.map((o) => `${o.value.num}/${o.value.den}`)).size).toBe(OPTION_COUNT)
    },
  )

  propTest.prop([kindArb, seedArb, presetArb])(
    'never lets a distractor equal the answer',
    (kind, seed, profile) => {
      const q = question(kind, seed, profile, `${profile.id}@${profile.version}`)
      for (const option of q.options) {
        if (option.correct) continue
        expect(R.eq(option.value, q.answer)).toBe(false)
        expect(option.source).not.toBe('answer')
      }
    },
  )

  propTest.prop([kindArb, seedArb, presetArb])(
    "renders every option in the answer's notation",
    (kind, seed, profile) => {
      const q = question(kind, seed, profile, `${profile.id}@${profile.version}`)
      const family = familyOf(kind)
      for (const option of q.options) {
        expect(option.text).toBe(formatValue(option.value, kind, profile))
        if (family === 'int') expect(R.isInteger(option.value)).toBe(true)
        if (family === 'dec') {
          const places = R.decimalPlaces(option.value)
          expect(places).not.toBeNull()
          expect(places as number).toBeLessThanOrEqual(Math.max(...profile.decimal.places))
        }
        if (family === 'frac' && !R.isInteger(q.answer)) {
          expect(option.value.den).toBeGreaterThan(1)
          expect(option.value.den).toBeLessThanOrEqual(profile.fraction.maxLcd * 2)
        }
      }
    },
  )

  propTest.prop([kindArb, seedArb])('never offers a negative where the domain forbids one', (kind, seed) => {
    const profile = PRESETS.hard
    const q = question(kind, seed, profile, 'hard@1')
    const canBeNegative =
      kind.endsWith('.sub') || (kind === 'int.add' && profile.integer.negativeFirstShare > 0)
    if (canBeNegative || R.isNegative(q.answer)) return
    for (const option of q.options) expect(R.isNegative(option.value)).toBe(false)
  })

  propTest.prop([kindArb, seedArb, presetArb])(
    'is fully determined by the question id',
    (kind, seed, profile) => {
      const ref = `${profile.id}@${profile.version}`
      expect(question(kind, seed, profile, ref).options).toEqual(question(kind, seed, profile, ref).options)
    },
  )
})

describe('stream separation', () => {
  propTest.prop([kindArb, seedArb])(
    'options never disturb the question stream, so a rule change cannot change questions',
    (kind, seed) => {
      const profile = PRESETS.hard
      const q = question(kind, seed, profile, 'hard@1')
      // Replay only the question stream: operands then missing slot, no options.
      const rng = splitmix32(seed)
      const parts = GENERATORS[kind](rng, profile)
      const missing = pickMissingSlot(rng, profile)
      expect({ a: q.a, b: q.b, c: q.c, missing: q.missing }).toEqual({
        a: parts.a,
        b: parts.b,
        c: parts.c,
        missing,
      })
    },
  )
})

describe('the correct option lands in every slot equally often', () => {
  it('passes a chi-square test over ten thousand questions', () => {
    const counts = [0, 0, 0, 0]
    const total = 10_000
    for (let seed = 0; seed < total; seed++) {
      const q = question('int.add', seed, PRESETS['optiver-classic'], 'optiver-classic@1')
      const index = q.options.findIndex((o) => o.correct)
      counts[index] = (counts[index] ?? 0) + 1
    }
    const expected = total / 4
    const chiSquare = counts.reduce((sum, observed) => sum + (observed - expected) ** 2 / expected, 0)
    // Three degrees of freedom; the 0.01 critical value is 11.345.
    expect(chiSquare).toBeLessThan(11.345)
    expect(counts.reduce((a, b) => a + b, 0)).toBe(total)
  })
})

describe('distractor sources', () => {
  it('draws on mistake-shaped rules rather than random noise', () => {
    const seen = new Set<string>()
    for (const kind of ALL_KINDS) {
      for (let seed = 0; seed < 200; seed++) {
        for (const option of question(kind, seed, PRESETS.hard, 'hard@1').options) {
          if (!option.correct) seen.add(option.source)
        }
      }
    }
    for (const source of [
      'off-by-one',
      'off-by-ten',
      'decimal-shift',
      'sign-flip',
      'transposed-digits',
      'wrong-op',
      'partial-product',
      'last-digit',
      'generic-offset',
      'unsimplified-trap',
      'cross-add',
      'missing-operand-echo',
    ]) {
      expect(seen).toContain(source)
    }
  })

  it('mostly offers options a person could actually arrive at', () => {
    let plausible = 0
    let total = 0
    for (const kind of ALL_KINDS) {
      for (let seed = 0; seed < 100; seed++) {
        for (const option of question(kind, seed, PRESETS.hard, 'hard@1').options) {
          if (option.correct) continue
          total += 1
          if (option.source !== 'generic-offset') plausible += 1
        }
      }
    }
    expect(plausible / total).toBeGreaterThan(0.85)
  })
})

describe('degenerate inputs', () => {
  it('still fills four options when the rules produce almost nothing', () => {
    // A zero answer disables sign-flip and most magnitude-based rules.
    const profile = PRESETS['optiver-classic']
    const parts = { kind: 'int.add' as const, op: '+' as const, a: R.of(5), b: R.of(-5), c: R.of(0) }
    const options = buildOptions(parts, 'c', R.of(0), profile, 1)
    expect(options).toHaveLength(4)
    expect(options.filter((o) => o.correct)).toHaveLength(1)
    expect(new Set(options.map((o) => o.text)).size).toBe(4)
  })

  it('fills four options for a fraction answer with an awkward denominator', () => {
    const profile = PRESETS['optiver-classic']
    const parts = {
      kind: 'frac.add' as const,
      op: '+' as const,
      a: R.of(1, 7),
      b: R.of(1, 7),
      c: R.of(2, 7),
    }
    const options = buildOptions(parts, 'c', R.of(2, 7), profile, 5)
    expect(options).toHaveLength(4)
    expect(new Set(options.map((o) => o.text)).size).toBe(4)
  })
})

describe('the last-resort filler', () => {
  it('still produces four options when every rule is filtered away', () => {
    // A denominator budget far below the answer's own denominator rejects every
    // mistake-shaped candidate and every plain offset, which is the only situation
    // the filler exists for. Profile validation would reject this combination; it is
    // built by hand precisely to exercise the guarantee.
    const hostile: Profile = {
      ...PRESETS['optiver-classic'],
      fraction: { denominators: [2], maxLcd: 2, allowMixed: false },
    }
    const parts = {
      kind: 'frac.add' as const,
      op: '+' as const,
      a: R.of(1, 14),
      b: R.of(1, 14),
      c: R.of(1, 7),
    }
    const options = buildOptions(parts, 'c', R.of(1, 7), hostile, 11)
    expect(options).toHaveLength(4)
    expect(options.filter((o) => o.correct)).toHaveLength(1)
    expect(new Set(options.map((o) => o.text)).size).toBe(4)
    // Everything it invents is still a distinct value, not a repeat of the answer.
    for (const option of options) {
      if (option.correct) continue
      expect(R.eq(option.value, R.of(1, 7))).toBe(false)
    }
  })

  it('respects the sign of the domain even at the last resort', () => {
    const hostile: Profile = {
      ...PRESETS['optiver-classic'],
      fraction: { denominators: [2], maxLcd: 2, allowMixed: false },
    }
    const parts = {
      kind: 'frac.add' as const,
      op: '+' as const,
      a: R.of(1, 14),
      b: R.of(1, 14),
      c: R.of(1, 7),
    }
    for (const option of buildOptions(parts, 'c', R.of(1, 7), hostile, 12)) {
      expect(R.isNegative(option.value)).toBe(false)
    }
  })
})

describe('answers at the edge of the exactness bound', () => {
  it('declines to invent options rather than overflowing', () => {
    // No real generator produces a value this large; the point is that the option
    // builder degrades quietly instead of throwing a RationalRangeError at the UI.
    const huge = R.of(2 ** 26)
    const parts = { kind: 'int.add' as const, op: '+' as const, a: huge, b: R.of(1), c: huge }
    let options: ReturnType<typeof buildOptions> = []
    expect(() => {
      options = buildOptions(parts, 'c', huge, PRESETS['optiver-classic'], 3)
    }).not.toThrow()
    expect(options.filter((o) => o.correct)).toHaveLength(1)
  })
})

describe('shape rules for unusual answers', () => {
  const hostile: Profile = {
    ...PRESETS['optiver-classic'],
    fraction: { denominators: [2], maxLcd: 2, allowMixed: false },
  }

  it('keeps options integral when a fraction question happens to have a whole answer', () => {
    const parts = { kind: 'frac.add' as const, op: '+' as const, a: R.of(1, 2), b: R.of(1, 2), c: R.of(1) }
    const options = buildOptions(parts, 'c', R.of(1), PRESETS['optiver-classic'], 21)
    expect(options).toHaveLength(4)
    for (const option of options) expect(R.isInteger(option.value)).toBe(true)
  })

  it('allows negative fillers when the answer is already negative', () => {
    const parts = {
      kind: 'frac.sub' as const,
      op: '-' as const,
      a: R.of(1, 14),
      b: R.of(3, 14),
      c: R.of(-1, 7),
    }
    const options = buildOptions(parts, 'c', R.of(-1, 7), hostile, 31)
    expect(options).toHaveLength(4)
    expect(options.some((o) => R.isNegative(o.value) && !o.correct)).toBe(true)
  })
})

describe('the filler never repeats an option already offered', () => {
  it('steps past a value the main pool already contributed', () => {
    // Tuned so that exactly two candidates survive the filters, one of them a single
    // unit above the answer. The filler then starts on that same value and must skip
    // it. Profile validation would reject this denominator budget; it is built by
    // hand to reach a branch that protects the four-distinct-options promise.
    const narrow: Profile = {
      ...PRESETS['optiver-classic'],
      fraction: { denominators: [4], maxLcd: 1, allowMixed: false },
    }
    const parts = {
      kind: 'frac.add' as const,
      op: '+' as const,
      a: R.of(1, 8),
      b: R.of(1, 8),
      c: R.of(1, 4),
    }
    const options = buildOptions(parts, 'c', R.of(1, 4), narrow, 17)
    expect(options).toHaveLength(4)
    expect(new Set(options.map((o) => o.text)).size).toBe(4)
    expect(options.filter((o) => o.correct)).toHaveLength(1)
  })
})

describe('when a visible number happens to be the answer', () => {
  it('does not offer it twice', () => {
    // With both operands equal and one of them hidden, the "read the wrong slot"
    // rule proposes the visible operand, which is exactly the answer. Random seeds
    // reach this about once in five thousand questions, so it is pinned here rather
    // than left to luck.
    const parts = { kind: 'int.add' as const, op: '+' as const, a: R.of(5), b: R.of(5), c: R.of(10) }
    // Seed chosen so the echoed operand really is among the three picked; with most
    // seeds it loses the weighted draw and the case goes untested by accident.
    for (const missing of ['a', 'b'] as const) {
      const options = buildOptions(parts, missing, R.of(5), PRESETS['optiver-classic'], 2)
      expect(options).toHaveLength(4)
      expect(new Set(options.map((o) => o.text)).size).toBe(4)
      expect(options.filter((o) => o.correct)).toHaveLength(1)
      expect(options.filter((o) => R.eq(o.value, R.of(5)))).toHaveLength(1)
    }
  })
})
