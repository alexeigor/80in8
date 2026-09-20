import { fc, test as propTest } from '@fast-check/vitest'
import { describe, expect, it } from 'vitest'
import { MAX_EXACT_MAGNITUDE, MINUS, ONE, R, type Rational, RationalRangeError, ZERO } from './rational.js'

/** Rationals small enough that every arithmetic helper stays inside the exactness bound. */
const smallRational = fc
  .record({ num: fc.integer({ min: -5000, max: 5000 }), den: fc.integer({ min: 1, max: 5000 }) })
  .map(({ num, den }) => R.of(num, den))

const nonZeroRational = smallRational.filter((r) => !R.isZero(r))

describe('construction', () => {
  it('reduces to lowest terms', () => {
    expect(R.of(6, 8)).toEqual({ num: 3, den: 4 })
    expect(R.of(-6, 8)).toEqual({ num: -3, den: 4 })
  })

  it('moves a negative denominator to the numerator', () => {
    expect(R.of(3, -4)).toEqual({ num: -3, den: 4 })
    expect(R.of(-3, -4)).toEqual({ num: 3, den: 4 })
  })

  it('normalises negative zero so that reduced form is unique', () => {
    expect(Object.is(R.of(-0).num, 0)).toBe(true)
    expect(R.of(-0)).toEqual(ZERO)
  })

  it('defaults the denominator to one', () => {
    expect(R.of(7)).toEqual({ num: 7, den: 1 })
    expect(ONE).toEqual({ num: 1, den: 1 })
  })

  it('rejects a zero denominator', () => {
    expect(() => R.of(1, 0)).toThrow(RationalRangeError)
  })

  it('rejects non-integer components', () => {
    expect(() => R.of(1.5)).toThrow(/must be an integer/)
    expect(() => R.of(1, 2.5)).toThrow(/must be an integer/)
  })

  it('rejects values beyond the exactness bound', () => {
    expect(() => R.of(MAX_EXACT_MAGNITUDE + 1)).toThrow(/exactness bound/)
    expect(() => R.of(-(MAX_EXACT_MAGNITUDE + 1))).toThrow(/exactness bound/)
    expect(() => R.of(1, MAX_EXACT_MAGNITUDE + 1)).toThrow(/exactness bound/)
  })

  it('accepts values exactly on the bound', () => {
    expect(R.of(MAX_EXACT_MAGNITUDE).num).toBe(MAX_EXACT_MAGNITUDE)
  })

  describe('ofWide', () => {
    it('admits values too large for arithmetic but still exact', () => {
      const wide = R.ofWide(200_000_003, 100_000_000)
      expect(wide.num).toBeGreaterThan(MAX_EXACT_MAGNITUDE)
      // The point of the whole scheme: a value a hair away from 2 must not equal 2.
      expect(R.eq(wide, R.of(2))).toBe(false)
      expect(R.eq(R.ofWide(200_000_000, 100_000_000), R.of(2))).toBe(true)
    })

    it('rejects anything outside the safe integer range', () => {
      // 9007199254740993 cannot even be written as a JS number: the literal rounds to
      // 2^53, which is exactly why the answer parser caps input by digit count instead
      // of trusting Number(). Here we check the guard itself.
      expect(() => R.ofWide(2 ** 53)).toThrow(/safe integer range/)
      expect(() => R.ofWide(1, 2 ** 53)).toThrow(/safe integer range/)
    })

    it('refuses to do arithmetic on a wide value rather than rounding', () => {
      const wide = R.ofWide(200_000_003, 100_000_000)
      expect(() => R.add(wide, ONE)).toThrow(RationalRangeError)
      expect(() => R.cmp(wide, ONE)).toThrow(RationalRangeError)
    })
  })

  it('rejects a hand-built rational with non-integer parts', () => {
    const bogus = { num: 1.5, den: 2 } as Rational
    expect(() => R.add(bogus, ONE)).toThrow(/must be an integer/)
  })
})

describe('arithmetic', () => {
  it('computes exact sums that floating point gets wrong', () => {
    // 0.1 + 0.2 !== 0.3 in floating point; here it is exact by construction.
    const tenth = R.of(1, 10)
    const fifth = R.of(2, 10)
    expect(R.add(tenth, fifth)).toEqual({ num: 3, den: 10 })
  })

  it('divides exactly and rejects division by zero', () => {
    expect(R.div(R.of(1, 2), R.of(3, 4))).toEqual({ num: 2, den: 3 })
    expect(() => R.div(ONE, ZERO)).toThrow(/division by zero/)
  })

  it('negates and takes absolute values', () => {
    expect(R.neg(R.of(-3, 4))).toEqual({ num: 3, den: 4 })
    expect(Object.is(R.neg(ZERO).num, 0)).toBe(true)
    expect(R.abs(R.of(-3, 4))).toEqual({ num: 3, den: 4 })
    expect(R.abs(R.of(3, 4))).toEqual({ num: 3, den: 4 })
  })

  it('throws instead of silently overflowing', () => {
    const big = R.of(MAX_EXACT_MAGNITUDE)
    expect(() => R.mul(big, big)).toThrow(RationalRangeError)
  })

  propTest.prop([smallRational, smallRational])('addition is commutative', (a, b) => {
    expect(R.add(a, b)).toEqual(R.add(b, a))
  })

  propTest.prop([smallRational, smallRational])('subtraction inverts addition', (a, b) => {
    expect(R.sub(R.add(a, b), b)).toEqual(a)
  })

  propTest.prop([smallRational, nonZeroRational])('division inverts multiplication', (a, b) => {
    expect(R.div(R.mul(a, b), b)).toEqual(a)
  })

  propTest.prop([fc.integer({ min: -10_000, max: 10_000 }), fc.integer({ min: -10_000, max: 10_000 })])(
    'agrees with integer arithmetic on scaled values',
    (x, y) => {
      const scaled = (n: number) => R.of(n, 100)
      expect(R.add(scaled(x), scaled(y))).toEqual(R.of(x + y, 100))
      expect(R.sub(scaled(x), scaled(y))).toEqual(R.of(x - y, 100))
    },
  )
})

describe('comparison', () => {
  propTest.prop([smallRational])('equality is reflexive', (a) => {
    expect(R.eq(a, a)).toBe(true)
  })

  propTest.prop([smallRational, smallRational])('equality is symmetric', (a, b) => {
    expect(R.eq(a, b)).toBe(R.eq(b, a))
  })

  propTest.prop([smallRational, smallRational, smallRational])('equality is transitive', (a, b, c) => {
    if (R.eq(a, b) && R.eq(b, c)) expect(R.eq(a, c)).toBe(true)
  })

  propTest.prop([smallRational, smallRational])('cmp agrees with eq', (a, b) => {
    expect(R.cmp(a, b) === 0).toBe(R.eq(a, b))
  })

  it('orders values', () => {
    expect(R.cmp(R.of(1, 3), R.of(1, 2))).toBe(-1)
    expect(R.cmp(R.of(1, 2), R.of(1, 3))).toBe(1)
    expect(R.cmp(R.of(2, 4), R.of(1, 2))).toBe(0)
  })
})

describe('predicates', () => {
  it('classifies values', () => {
    expect(R.isInteger(R.of(4))).toBe(true)
    expect(R.isInteger(R.of(1, 2))).toBe(false)
    expect(R.isZero(ZERO)).toBe(true)
    expect(R.isZero(ONE)).toBe(false)
    expect(R.isNegative(R.of(-1))).toBe(true)
    expect(R.isNegative(R.of(1))).toBe(false)
  })

  it('identifies terminating decimals', () => {
    expect(R.isDecimal(R.of(1, 2))).toBe(true)
    expect(R.isDecimal(R.of(1, 8))).toBe(true)
    expect(R.isDecimal(R.of(1, 3))).toBe(false)
    expect(R.decimalPlaces(R.of(1, 3))).toBeNull()
    expect(R.decimalPlaces(R.of(5))).toBe(0)
    expect(R.decimalPlaces(R.of(1, 2))).toBe(1)
    expect(R.decimalPlaces(R.of(1, 8))).toBe(3)
  })
})

describe('formatting', () => {
  it('writes decimals without trailing zeros', () => {
    expect(R.toDecimalString(R.of(1275, 100))).toBe('12.75')
    expect(R.toDecimalString(R.of(50, 100))).toBe('0.5')
    expect(R.toDecimalString(R.of(5))).toBe('5')
  })

  it('uses a true minus sign', () => {
    expect(R.toDecimalString(R.of(-17))).toBe(`${MINUS}17`)
    expect(R.toFractionString(R.of(-3, 8))).toBe(`${MINUS}3/8`)
    expect(R.toMixedString(R.of(-9, 4))).toBe(`${MINUS}2 1/4`)
  })

  it('returns null for a value that does not terminate', () => {
    expect(R.toDecimalString(R.of(1, 3))).toBeNull()
  })

  it('writes fractions and mixed numbers', () => {
    expect(R.toFractionString(R.of(3, 8))).toBe('3/8')
    expect(R.toFractionString(R.of(5))).toBe('5')
    expect(R.toMixedString(R.of(5))).toBe('5')
    expect(R.toMixedString(R.of(1, 2))).toBe('1/2')
    expect(R.toMixedString(R.of(9, 4))).toBe('2 1/4')
    expect(R.toMixedString(R.of(8, 4))).toBe('2')
  })

  propTest.prop([smallRational])('decimal strings round-trip through the value', (value) => {
    const text = R.toDecimalString(value)
    if (text === null) return
    const [whole = '', frac = ''] = text.replace(MINUS, '-').split('.')
    const scaled = Number(`${whole}${frac}`)
    expect(R.of(scaled, 10 ** frac.length)).toEqual(value)
  })
})
