import { fc, test as propTest } from '@fast-check/vitest'
import { beforeEach, describe, expect, it } from 'vitest'
import { PRESETS } from '../profile/presets.js'
import type { Kind, Op, Profile } from '../profile/types.js'
import { ALL_KINDS } from '../profile/types.js'
import { R, type Rational } from '../rational/rational.js'
import { splitmix32 } from '../rng/rng.js'
import { fallbackCount, MAX_DRAW_ATTEMPTS, resetFallbackCounts } from './fallback.js'
import { GENERATORS } from './kinds.js'
import type { BaseQuestion } from './types.js'

const seedArb = fc.integer({ min: 0, max: 0xffffffff })
const presets = Object.values(PRESETS)
const presetArb = fc.constantFrom(...presets)

function apply(op: Op, a: Rational, b: Rational): Rational {
  switch (op) {
    case '+':
      return R.add(a, b)
    case '-':
      return R.sub(a, b)
    case '×':
      return R.mul(a, b)
    default:
      return R.div(a, b)
  }
}

function generate(kind: Kind, seed: number, profile: Profile): BaseQuestion {
  return GENERATORS[kind](splitmix32(seed), profile)
}

const OP_BY_KIND: Record<string, Op> = { add: '+', sub: '-', mul: '×', div: '÷' }

describe.each(ALL_KINDS)('generator %s', (kind) => {
  const suffix = kind.slice(kind.indexOf('.') + 1)

  propTest.prop([seedArb, presetArb])('produces a true equation', (seed, profile) => {
    const q = generate(kind, seed, profile)
    expect(R.eq(apply(q.op, q.a, q.b), q.c)).toBe(true)
  })

  propTest.prop([seedArb, presetArb])('reports the kind and operator it was asked for', (seed, profile) => {
    const q = generate(kind, seed, profile)
    expect(q.kind).toBe(kind)
    expect(q.op).toBe(OP_BY_KIND[suffix])
  })

  propTest.prop([seedArb, presetArb])('is deterministic for a seed', (seed, profile) => {
    expect(generate(kind, seed, profile)).toEqual(generate(kind, seed, profile))
  })

  propTest.prop([seedArb, presetArb])('avoids degenerate operands and answers', (seed, profile) => {
    const q = generate(kind, seed, profile)
    // Nothing multiplied or divided by one, and no operand that makes the question free.
    if (q.op === '×' || q.op === '÷') {
      expect(R.eq(q.b, R.of(1))).toBe(false)
      expect(R.eq(q.a, R.of(1))).toBe(false)
    }
    if (q.op === '+' || q.op === '-') {
      // x - x and x + (-x) are busywork, not arithmetic.
      expect(R.isZero(q.c)).toBe(false)
    }
    expect(R.isZero(q.a)).toBe(false)
    expect(R.isZero(q.b)).toBe(false)
  })

  propTest.prop([seedArb, presetArb])('keeps every value inside the exactness bound', (seed, profile) => {
    const q = generate(kind, seed, profile)
    for (const value of [q.a, q.b, q.c]) {
      // Re-constructing asserts the bound; the largest legitimate value is nowhere near it.
      expect(() => R.of(value.num, value.den)).not.toThrow()
      expect(Math.abs(value.num)).toBeLessThan(2 ** 26)
    }
  })
})

describe('integer generators respect their ranges', () => {
  const profile = PRESETS['optiver-classic']

  propTest.prop([seedArb])('addition and subtraction draw from the configured range', (seed) => {
    for (const kind of ['int.add', 'int.sub'] as const) {
      const q = generate(kind, seed, profile)
      const [lo, hi] = profile.integer.addSub
      expect(Math.abs(q.a.num)).toBeGreaterThanOrEqual(lo)
      expect(Math.abs(q.a.num)).toBeLessThanOrEqual(hi)
      expect(q.b.num).toBeGreaterThanOrEqual(lo)
      expect(q.b.num).toBeLessThanOrEqual(hi)
      expect(R.isInteger(q.c)).toBe(true)
    }
  })

  propTest.prop([seedArb])('multiplication uses one of the two intended shapes', (seed) => {
    const q = generate('int.mul', seed, profile)
    const [largeLo, largeHi] = profile.integer.mulLarge
    const [smallLo, smallHi] = profile.integer.mulSmall
    const [twoLo, twoHi] = profile.integer.mulTwoDigit
    const isLargeBySmall =
      q.a.num >= largeLo && q.a.num <= largeHi && q.b.num >= smallLo && q.b.num <= smallHi
    const isFriendly = q.a.num >= twoLo && q.a.num <= twoHi && profile.integer.mulFriendly.includes(q.b.num)
    expect(isLargeBySmall || isFriendly).toBe(true)
  })

  propTest.prop([seedArb])('division comes out exact, with a listed divisor', (seed) => {
    const q = generate('int.div', seed, profile)
    expect(profile.integer.divisors).toContain(q.b.num)
    expect(R.isInteger(q.c)).toBe(true)
    expect(q.c.num).toBeGreaterThanOrEqual(profile.integer.quotient[0])
    expect(q.c.num).toBeLessThanOrEqual(profile.integer.quotient[1])
    expect(q.a.num).toBe(q.b.num * q.c.num)
  })

  it('draws negative first operands at roughly the configured share', () => {
    let negatives = 0
    const total = 4000
    for (let seed = 0; seed < total; seed++) {
      if (R.isNegative(generate('int.add', seed, profile).a)) negatives += 1
    }
    expect(negatives / total).toBeGreaterThan(0.2)
    expect(negatives / total).toBeLessThan(0.3)
  })
})

describe('decimal generators', () => {
  const profile = PRESETS.hard

  propTest.prop([seedArb])('addition and subtraction keep operands genuinely decimal', (seed) => {
    for (const kind of ['dec.add', 'dec.sub'] as const) {
      const q = generate(kind, seed, profile)
      expect(R.isInteger(q.a)).toBe(false)
      expect(R.isInteger(q.b)).toBe(false)
      const places = R.decimalPlaces(q.c)
      expect(places).not.toBeNull()
      expect(places as number).toBeLessThanOrEqual(Math.max(...profile.decimal.places))
    }
  })

  propTest.prop([seedArb])('division is exact and the answer fits the place budget', (seed) => {
    const q = generate('dec.div', seed, profile)
    expect(R.eq(R.mul(q.b, q.c), q.a)).toBe(true)
    expect(R.decimalPlaces(q.c)).toBeLessThanOrEqual(profile.decimal.divPlaces)
    expect(R.decimalPlaces(q.a)).toBeLessThanOrEqual(Math.max(...profile.decimal.places))
  })

  propTest.prop([seedArb])('multiplication keeps both factors decimal', (seed) => {
    const q = generate('dec.mul', seed, profile)
    expect(R.isInteger(q.a)).toBe(false)
    expect(R.isInteger(q.b)).toBe(false)
  })
})

describe('fraction generators', () => {
  const profile = PRESETS.hard

  propTest.prop([seedArb])('operands are proper fractions with listed denominators', (seed) => {
    for (const kind of ['frac.add', 'frac.sub', 'frac.mul', 'frac.div'] as const) {
      const q = generate(kind, seed, profile)
      for (const operand of [q.a, q.b]) {
        expect(R.isInteger(operand)).toBe(false)
        expect(R.cmp(R.abs(operand), R.of(1))).toBeLessThan(0)
        // The reduced denominator must divide one of the configured denominators.
        expect(profile.fraction.denominators.some((d) => d % operand.den === 0)).toBe(true)
      }
    }
  })

  propTest.prop([seedArb])('answers stay fractions within the denominator budget', (seed) => {
    for (const kind of ['frac.add', 'frac.sub', 'frac.mul', 'frac.div'] as const) {
      const q = generate(kind, seed, profile)
      expect(R.isInteger(q.c)).toBe(false)
      expect(q.c.den).toBeLessThanOrEqual(profile.fraction.maxLcd)
    }
  })

  propTest.prop([seedArb])('add and sub pairs share a tractable common denominator', (seed) => {
    for (const kind of ['frac.add', 'frac.sub'] as const) {
      const q = generate(kind, seed, profile)
      let x = q.a.den
      let y = q.b.den
      while (y !== 0) {
        const t = x % y
        x = y
        y = t
      }
      expect((q.a.den / x) * q.b.den).toBeLessThanOrEqual(profile.fraction.maxLcd)
    }
  })
})

describe('termination', () => {
  beforeEach(resetFallbackCounts)

  it('falls back rather than looping when a profile admits no valid draw', () => {
    // Only halves available and a denominator budget of two: every sum is a whole
    // number and every difference is zero, so no draw can ever succeed.
    const impossible: Profile = {
      ...PRESETS['optiver-classic'],
      fraction: { denominators: [2], maxLcd: 2, allowMixed: true },
    }
    const q = GENERATORS['frac.add'](splitmix32(1), impossible)
    expect(R.eq(apply(q.op, q.a, q.b), q.c)).toBe(true)
    expect(fallbackCount('frac.add')).toBe(1)
    expect(fallbackCount()).toBe(1)
  })

  it.each<[Kind, Partial<Profile>]>([
    [
      'int.add',
      { integer: { ...PRESETS['optiver-classic'].integer, addSub: [1, 1], negativeFirstShare: 1 } },
    ],
    [
      'int.sub',
      { integer: { ...PRESETS['optiver-classic'].integer, addSub: [1, 1], negativeFirstShare: 0 } },
    ],
    ['dec.add', { decimal: { ...PRESETS.hard.decimal, places: [1], placesWeights: [1], scaled: [10, 10] } }],
    ['dec.sub', { decimal: { ...PRESETS.hard.decimal, places: [1], placesWeights: [1], scaled: [10, 10] } }],
    ['dec.mul', { decimal: { ...PRESETS.hard.decimal, mulScaled: [10, 10], divScaled: [10, 10] } }],
    ['dec.div', { decimal: { ...PRESETS.hard.decimal, divScaled: [10, 10] } }],
    [
      'dec.div',
      // Divisors carry more precision than the answer budget allows, so every product
      // is too precise to use.
      { decimal: { ...PRESETS.hard.decimal, places: [1], placesWeights: [1], divPlaces: 2 } },
    ],
    ['frac.sub', { fraction: { denominators: [2], maxLcd: 2, allowMixed: true } }],
    ['frac.mul', { fraction: { denominators: [2], maxLcd: 2, allowMixed: true } }],
    ['frac.div', { fraction: { denominators: [2], maxLcd: 2, allowMixed: true } }],
  ])('%s terminates on an impossible profile', (kind, patch) => {
    const profile: Profile = { ...PRESETS.hard, ...patch }
    const q = GENERATORS[kind](splitmix32(7), profile)
    expect(R.eq(apply(q.op, q.a, q.b), q.c)).toBe(true)
    expect(fallbackCount(kind)).toBe(1)
  })

  it('int.mul falls back when every product would be degenerate', () => {
    const impossible: Profile = {
      ...PRESETS['optiver-classic'],
      integer: { ...PRESETS['optiver-classic'].integer, mulLarge: [1, 1], mulLargeSmallShare: 1 },
    }
    const q = GENERATORS['int.mul'](splitmix32(3), impossible)
    expect(R.eq(apply(q.op, q.a, q.b), q.c)).toBe(true)
    expect(fallbackCount('int.mul')).toBe(1)
  })

  it('int.div is exact by construction and has no redraw at all', () => {
    for (let seed = 0; seed < 200; seed++) {
      GENERATORS['int.mul'](splitmix32(seed), PRESETS.hard)
      GENERATORS['int.div'](splitmix32(seed), PRESETS.hard)
    }
    expect(fallbackCount('int.div')).toBe(0)
  })

  it('stays far below the 0.1% fallback budget on real profiles', () => {
    let drawn = 0
    for (const profile of presets) {
      for (const entry of profile.mix) {
        for (let seed = 0; seed < 500; seed++) {
          GENERATORS[entry.kind](splitmix32(seed), profile)
          drawn += 1
        }
      }
    }
    expect(fallbackCount() / drawn).toBeLessThan(0.001)
    expect(fallbackCount()).toBe(0)
  })

  it('bounds the redraw loop', () => {
    expect(MAX_DRAW_ATTEMPTS).toBeGreaterThan(8)
    expect(MAX_DRAW_ATTEMPTS).toBeLessThanOrEqual(256)
  })
})
