/**
 * Exact rational arithmetic (DESIGN.md §6.1).
 *
 * Every number the core reasons about is an exact reduced fraction. No floating point
 * arithmetic is ever performed on question values: `0.1 + 0.2 !== 0.3` must never be
 * able to produce a wrong answer key.
 *
 * Exactness bound. JS numbers are exact integers only below 2^53, and the arithmetic
 * helpers below form products of two operands' components. We therefore bound every
 * value we *compute with* to |num|, den <= 2^26 so that any cross-product is <= 2^52
 * and any sum of two such products is <= 2^53, i.e. exactly representable.
 *
 * Typed user input is handled separately: `ofWide` builds a reduced rational from any
 * safe-integer pair. Such a value may exceed the arithmetic bound, but `eq` is
 * structural (it never multiplies), so a parsed answer can still be compared exactly.
 * Passing a wide value to add/sub/mul/div/cmp throws rather than rounding silently.
 */

/** A reduced fraction. Invariants: `den > 0`, `gcd(|num|, den) === 1`, both integers. */
export interface Rational {
  readonly num: number
  readonly den: number
}

/** Largest magnitude allowed for a value used in arithmetic. 2^26 = 67_108_864. */
export const MAX_EXACT_MAGNITUDE = 2 ** 26

/** Largest denominator that still counts as a terminating decimal: 10^6. */
export const MAX_DECIMAL_SCALE = 1_000_000

/** Unicode minus sign (U+2212) used in all core-rendered strings; the parser also accepts '-'. */
export const MINUS = '−'

/** Thrown when a value would leave the exactness bound, instead of rounding silently. */
export class RationalRangeError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'RationalRangeError'
  }
}

/** Greatest common divisor of two integers, sign-insensitive. */
export function gcd(a: number, b: number): number {
  let x = Math.abs(a)
  let y = Math.abs(b)
  while (y !== 0) {
    const t = x % y
    x = y
    y = t
  }
  return x
}

function assertInteger(value: number, what: string): void {
  if (!Number.isInteger(value)) throw new RationalRangeError(`${what} must be an integer, got ${value}`)
}

function assertExact(r: Rational, what: string): void {
  if (r.num > MAX_EXACT_MAGNITUDE || r.num < -MAX_EXACT_MAGNITUDE || r.den > MAX_EXACT_MAGNITUDE) {
    throw new RationalRangeError(`${what} ${r.num}/${r.den} exceeds the exactness bound 2^26`)
  }
}

function reduce(num: number, den: number): Rational {
  assertInteger(num, 'numerator')
  assertInteger(den, 'denominator')
  if (den === 0) throw new RationalRangeError('denominator must not be zero')
  let n = num
  let d = den
  if (d < 0) {
    n = -n
    d = -d
  }
  // d is non-zero here, so the divisor is always at least 1.
  const g = gcd(n, d)
  // `|| 0` normalises -0 to 0 so that reduced form is unique and structural equality works.
  return { num: n / g || 0, den: d / g }
}

/** Build a reduced rational usable in arithmetic. Throws outside the 2^26 exactness bound. */
function of(num: number, den = 1): Rational {
  const r = reduce(num, den)
  assertExact(r, 'value')
  return r
}

/**
 * Build a reduced rational from any safe-integer pair, without the arithmetic bound.
 * Used only for parsed user input, which is compared structurally and never computed with.
 */
function ofWide(num: number, den = 1): Rational {
  if (!Number.isSafeInteger(num) || !Number.isSafeInteger(den)) {
    throw new RationalRangeError(`value ${num}/${den} is outside the safe integer range`)
  }
  return reduce(num, den)
}

function requireExact(r: Rational, what: string): void {
  assertInteger(r.num, `${what} numerator`)
  assertInteger(r.den, `${what} denominator`)
  assertExact(r, what)
}

function add(a: Rational, b: Rational): Rational {
  requireExact(a, 'left operand')
  requireExact(b, 'right operand')
  return of(a.num * b.den + b.num * a.den, a.den * b.den)
}

function sub(a: Rational, b: Rational): Rational {
  requireExact(a, 'left operand')
  requireExact(b, 'right operand')
  return of(a.num * b.den - b.num * a.den, a.den * b.den)
}

function mul(a: Rational, b: Rational): Rational {
  requireExact(a, 'left operand')
  requireExact(b, 'right operand')
  return of(a.num * b.num, a.den * b.den)
}

function div(a: Rational, b: Rational): Rational {
  requireExact(a, 'left operand')
  requireExact(b, 'right operand')
  if (b.num === 0) throw new RationalRangeError('division by zero')
  return of(a.num * b.den, a.den * b.num)
}

function neg(a: Rational): Rational {
  return { num: -a.num || 0, den: a.den }
}

function abs(a: Rational): Rational {
  return a.num < 0 ? neg(a) : a
}

/** Structural equality on reduced values. Never multiplies, so it is exact for wide values too. */
function eq(a: Rational, b: Rational): boolean {
  return a.num === b.num && a.den === b.den
}

/** Ordering. Cross-multiplies, so both operands must satisfy the arithmetic bound. */
function cmp(a: Rational, b: Rational): -1 | 0 | 1 {
  requireExact(a, 'left operand')
  requireExact(b, 'right operand')
  const left = a.num * b.den
  const right = b.num * a.den
  if (left < right) return -1
  if (left > right) return 1
  return 0
}

function isInteger(r: Rational): boolean {
  return r.den === 1
}

function isZero(r: Rational): boolean {
  return r.num === 0
}

function isNegative(r: Rational): boolean {
  return r.num < 0
}

/** True when the value terminates within 6 decimal places. */
function isDecimal(r: Rational): boolean {
  return MAX_DECIMAL_SCALE % r.den === 0
}

/** Number of decimal places needed to write the value exactly, or null if it does not terminate. */
function decimalPlaces(r: Rational): number | null {
  if (!isDecimal(r)) return null
  let places = 0
  let pow = 1
  while (pow % r.den !== 0) {
    pow *= 10
    places += 1
  }
  return places
}

function signPrefix(r: Rational): string {
  return r.num < 0 ? MINUS : ''
}

/** "12.75", or null when the value does not terminate in <= 6 places. Trailing zeros are trimmed. */
function toDecimalString(r: Rational): string | null {
  const places = decimalPlaces(r)
  if (places === null) return null
  const magnitude = r.num < 0 ? -r.num : r.num
  const scaled = magnitude * (10 ** places / r.den)
  const digits = String(scaled).padStart(places + 1, '0')
  const whole = digits.slice(0, digits.length - places)
  const frac = places === 0 ? '' : digits.slice(digits.length - places)
  return `${signPrefix(r)}${whole}${frac === '' ? '' : `.${frac}`}`
}

/** "3/8", or "5" when the value is an integer. */
function toFractionString(r: Rational): string {
  const magnitude = r.num < 0 ? -r.num : r.num
  if (r.den === 1) return `${signPrefix(r)}${magnitude}`
  return `${signPrefix(r)}${magnitude}/${r.den}`
}

/** "2 1/4" for improper fractions, otherwise the same as `toFractionString`. */
function toMixedString(r: Rational): string {
  if (r.den === 1) return toFractionString(r)
  const magnitude = r.num < 0 ? -r.num : r.num
  if (magnitude < r.den) return toFractionString(r)
  const whole = Math.floor(magnitude / r.den)
  const rest = magnitude - whole * r.den
  return `${signPrefix(r)}${whole} ${rest}/${r.den}`
}

export const ZERO: Rational = { num: 0, den: 1 }
export const ONE: Rational = { num: 1, den: 1 }

export const R = {
  of,
  ofWide,
  add,
  sub,
  mul,
  div,
  neg,
  abs,
  eq,
  cmp,
  isInteger,
  isZero,
  isNegative,
  isDecimal,
  decimalPlaces,
  toDecimalString,
  toFractionString,
  toMixedString,
} as const
