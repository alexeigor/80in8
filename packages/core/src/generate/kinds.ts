/**
 * The twelve kind generators (DESIGN.md §6.6, Appendix A).
 *
 * Every generator obeys the same rules:
 *   1. `a op b = c` holds exactly.
 *   2. Divisions come out exact.
 *   3. Operands and answers stay inside the profile's declared ranges.
 *   4. Degenerate draws are rejected: no `x 1`, no `0 +`, no `x - x`, no integer-valued
 *      fraction operands or answers, no zero answers for add/sub.
 *   5. The redraw loop is bounded, so every generator terminates for every seed.
 */

import type { Kind, Profile } from '../profile/types.js'
import { R, type Rational } from '../rational/rational.js'
import { type Rng, rand } from '../rng/rng.js'
import { MAX_DRAW_ATTEMPTS, noteFallback } from './fallback.js'
import type { BaseQuestion } from './types.js'

function lcm(a: number, b: number): number {
  let x = a
  let y = b
  while (y !== 0) {
    const t = x % y
    x = y
    y = t
  }
  return (a / x) * b
}

/** Draw until the candidate passes, then fall back to a fixed valid question. */
function draw(
  kind: Kind,
  rng: Rng,
  attempt: () => BaseQuestion | null,
  fallback: () => BaseQuestion,
): BaseQuestion {
  for (let i = 0; i < MAX_DRAW_ATTEMPTS; i++) {
    const candidate = attempt()
    if (candidate !== null) return candidate
  }
  noteFallback(kind)
  // Keep the stream moving so that a fallback does not make two seeds converge.
  rng()
  return fallback()
}

/** Largest scaled value for a given place count, e.g. 2 places -> 9999 (99.99). */
function scaledCeiling(profile: Profile, places: number): number {
  return Math.min(profile.decimal.scaled[1], 10 ** (places + 2) - 1)
}

function drawPlaces(rng: Rng, profile: Profile): number {
  // Validation guarantees places and placesWeights have the same length.
  const options = profile.decimal.places.map(
    (p, i) => [p, profile.decimal.placesWeights[i] as number] as const,
  )
  return rand.weighted(rng, options)
}

/** A scaled decimal operand that is not a whole number, so the question is genuinely decimal. */
function drawDecimalScaled(rng: Rng, profile: Profile, places: number): number | null {
  const scale = 10 ** places
  const value = rand.int(rng, Math.max(1, profile.decimal.scaled[0]), scaledCeiling(profile, places))
  return value % scale === 0 ? null : value
}

function properFraction(rng: Rng, profile: Profile): { value: Rational; den: number } {
  const den = rand.pick(rng, profile.fraction.denominators)
  const num = rand.int(rng, 1, den - 1)
  return { value: R.of(num, den), den }
}

const intAdd = (rng: Rng, profile: Profile): BaseQuestion =>
  draw(
    'int.add',
    rng,
    () => {
      const [lo, hi] = profile.integer.addSub
      const magnitude = rand.int(rng, lo, hi)
      const negative = rand.bool(rng, profile.integer.negativeFirstShare)
      const b = rand.int(rng, lo, hi)
      const aValue = negative ? -magnitude : magnitude
      if (aValue + b === 0) return null
      const a = R.of(aValue)
      return { kind: 'int.add', op: '+', a, b: R.of(b), c: R.add(a, R.of(b)) }
    },
    () => ({ kind: 'int.add', op: '+', a: R.of(47), b: R.of(38), c: R.of(85) }),
  )

const intSub = (rng: Rng, profile: Profile): BaseQuestion =>
  draw(
    'int.sub',
    rng,
    () => {
      const [lo, hi] = profile.integer.addSub
      const magnitude = rand.int(rng, lo, hi)
      const negative = rand.bool(rng, profile.integer.negativeFirstShare)
      const b = rand.int(rng, lo, hi)
      const aValue = negative ? -magnitude : magnitude
      if (aValue - b === 0) return null
      const a = R.of(aValue)
      return { kind: 'int.sub', op: '-', a, b: R.of(b), c: R.sub(a, R.of(b)) }
    },
    () => ({ kind: 'int.sub', op: '-', a: R.of(91), b: R.of(34), c: R.of(57) }),
  )

const intMul = (rng: Rng, profile: Profile): BaseQuestion =>
  draw(
    'int.mul',
    rng,
    () => {
      const large = rand.bool(rng, profile.integer.mulLargeSmallShare)
      const a = large
        ? rand.int(rng, profile.integer.mulLarge[0], profile.integer.mulLarge[1])
        : rand.int(rng, profile.integer.mulTwoDigit[0], profile.integer.mulTwoDigit[1])
      const b = large
        ? rand.int(rng, profile.integer.mulSmall[0], profile.integer.mulSmall[1])
        : rand.pick(rng, profile.integer.mulFriendly)
      if (a <= 1 || b <= 1) return null
      const ra = R.of(a)
      const rb = R.of(b)
      return { kind: 'int.mul', op: '×', a: ra, b: rb, c: R.mul(ra, rb) }
    },
    () => ({ kind: 'int.mul', op: '×', a: R.of(24), b: R.of(15), c: R.of(360) }),
  )

/**
 * Division is built backwards from a divisor and quotient, so it is exact by
 * construction and can never need a redraw: profile validation already guarantees
 * divisors and quotients of at least two.
 */
const intDiv = (rng: Rng, profile: Profile): BaseQuestion => {
  const b = R.of(rand.pick(rng, profile.integer.divisors))
  const c = R.of(rand.int(rng, profile.integer.quotient[0], profile.integer.quotient[1]))
  return { kind: 'int.div', op: '÷', a: R.mul(b, c), b, c }
}

function decAddSub(kind: 'dec.add' | 'dec.sub', rng: Rng, profile: Profile): BaseQuestion {
  const op = kind === 'dec.add' ? '+' : '-'
  return draw(
    kind,
    rng,
    () => {
      const places = drawPlaces(rng, profile)
      const scale = 10 ** places
      const aScaled = drawDecimalScaled(rng, profile, places)
      const bScaled = drawDecimalScaled(rng, profile, places)
      if (aScaled === null || bScaled === null) return null
      const result = op === '+' ? aScaled + bScaled : aScaled - bScaled
      if (result === 0) return null
      const a = R.of(aScaled, scale)
      const b = R.of(bScaled, scale)
      return { kind, op, a, b, c: op === '+' ? R.add(a, b) : R.sub(a, b) }
    },
    () =>
      kind === 'dec.add'
        ? { kind, op, a: R.of(124, 10), b: R.of(87, 10), c: R.of(211, 10) }
        : { kind, op, a: R.of(124, 10), b: R.of(87, 10), c: R.of(37, 10) },
  )
}

const decMul = (rng: Rng, profile: Profile): BaseQuestion =>
  draw(
    'dec.mul',
    rng,
    () => {
      const places = profile.decimal.mulPlaces
      const scale = 10 ** places
      const aScaled = rand.int(rng, profile.decimal.mulScaled[0], profile.decimal.mulScaled[1])
      const bScaled = rand.int(rng, profile.decimal.divScaled[0], profile.decimal.divScaled[1])
      if (aScaled % scale === 0 || bScaled % scale === 0) return null
      const a = R.of(aScaled, scale)
      const b = R.of(bScaled, scale)
      return { kind: 'dec.mul', op: '×', a, b, c: R.mul(a, b) }
    },
    () => ({ kind: 'dec.mul', op: '×', a: R.of(85, 10), b: R.of(144, 10), c: R.of(1224, 10) }),
  )

const decDiv = (rng: Rng, profile: Profile): BaseQuestion =>
  draw(
    'dec.div',
    rng,
    () => {
      const places = profile.decimal.divPlaces
      const scale = 10 ** places
      const bScaled = rand.int(rng, profile.decimal.divScaled[0], profile.decimal.divScaled[1])
      const cScaled = rand.int(rng, profile.decimal.divScaled[0], profile.decimal.divScaled[1])
      if (bScaled % scale === 0 || cScaled % scale === 0) return null
      const b = R.of(bScaled, scale)
      const c = R.of(cScaled, scale)
      const a = R.mul(b, c)
      // A product of two terminating decimals always terminates, so this is a number.
      const aPlaces = R.decimalPlaces(a) as number
      if (aPlaces > Math.max(...profile.decimal.places)) return null
      return { kind: 'dec.div', op: '÷', a, b, c }
    },
    () => ({ kind: 'dec.div', op: '÷', a: R.of(1054, 100), b: R.of(31, 10), c: R.of(34, 10) }),
  )

function fracAddSub(kind: 'frac.add' | 'frac.sub', rng: Rng, profile: Profile): BaseQuestion {
  const op = kind === 'frac.add' ? '+' : '-'
  return draw(
    kind,
    rng,
    () => {
      const first = properFraction(rng, profile)
      const second = properFraction(rng, profile)
      if (lcm(first.den, second.den) > profile.fraction.maxLcd) return null
      const c = op === '+' ? R.add(first.value, second.value) : R.sub(first.value, second.value)
      if (R.isZero(c) || R.isInteger(c) || c.den > profile.fraction.maxLcd) return null
      return { kind, op, a: first.value, b: second.value, c }
    },
    () =>
      kind === 'frac.add'
        ? { kind, op, a: R.of(1, 2), b: R.of(1, 3), c: R.of(5, 6) }
        : { kind, op, a: R.of(1, 2), b: R.of(1, 3), c: R.of(1, 6) },
  )
}

const fracMul = (rng: Rng, profile: Profile): BaseQuestion =>
  draw(
    'frac.mul',
    rng,
    () => {
      const first = properFraction(rng, profile)
      const second = properFraction(rng, profile)
      const c = R.mul(first.value, second.value)
      if (R.isInteger(c) || c.den > profile.fraction.maxLcd) return null
      return { kind: 'frac.mul', op: '×', a: first.value, b: second.value, c }
    },
    () => ({ kind: 'frac.mul', op: '×', a: R.of(2, 3), b: R.of(3, 4), c: R.of(1, 2) }),
  )

const fracDiv = (rng: Rng, profile: Profile): BaseQuestion =>
  draw(
    'frac.div',
    rng,
    () => {
      const first = properFraction(rng, profile)
      const second = properFraction(rng, profile)
      const c = R.div(first.value, second.value)
      if (R.isInteger(c) || c.den > profile.fraction.maxLcd) return null
      return { kind: 'frac.div', op: '÷', a: first.value, b: second.value, c }
    },
    () => ({ kind: 'frac.div', op: '÷', a: R.of(1, 2), b: R.of(3, 4), c: R.of(2, 3) }),
  )

export type KindGenerator = (rng: Rng, profile: Profile) => BaseQuestion

export const GENERATORS: Readonly<Record<Kind, KindGenerator>> = {
  'int.add': intAdd,
  'int.sub': intSub,
  'int.mul': intMul,
  'int.div': intDiv,
  'dec.add': (rng, profile) => decAddSub('dec.add', rng, profile),
  'dec.sub': (rng, profile) => decAddSub('dec.sub', rng, profile),
  'dec.mul': decMul,
  'dec.div': decDiv,
  'frac.add': (rng, profile) => fracAddSub('frac.add', rng, profile),
  'frac.sub': (rng, profile) => fracAddSub('frac.sub', rng, profile),
  'frac.mul': fracMul,
  'frac.div': fracDiv,
}
