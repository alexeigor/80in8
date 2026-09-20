/**
 * Distractor rules (DESIGN.md §6.7, Appendix B).
 *
 * A good wrong option is a mistake a hurried person actually makes: a dropped carry, a
 * misplaced decimal point, a transposed pair of digits, the wrong operation. Random
 * offsets are the fallback of last resort, not the design.
 *
 * Every rule is wrapped by the builder so that a candidate which would leave the
 * exactness bound is dropped rather than thrown.
 */

import { familyOf } from '../generate/display.js'
import type { BaseQuestion, DistractorSource, MissingSlot } from '../generate/types.js'
import type { Op, Profile } from '../profile/types.js'
import { R, type Rational } from '../rational/rational.js'

export interface Candidate {
  value: Rational
  source: DistractorSource
  priority: 1 | 2 | 3
}

export interface RuleContext {
  parts: BaseQuestion
  missing: MissingSlot
  answer: Rational
  profile: Profile
}

/** One unit in the last decimal place of the answer, or 1 for integers and fractions. */
export function unit(answer: Rational, ctx: RuleContext): Rational {
  const family = familyOf(ctx.parts.kind)
  if (family === 'dec') {
    const places = R.decimalPlaces(answer)
    if (places !== null && places > 0) return R.of(1, 10 ** places)
  }
  if (family === 'frac' && answer.den > 1) return R.of(1, answer.den)
  return R.of(1)
}

function offBy(ctx: RuleContext, step: Rational, source: DistractorSource, priority: 1 | 2 | 3): Candidate[] {
  return [
    { value: R.add(ctx.answer, step), source, priority },
    { value: R.sub(ctx.answer, step), source, priority },
  ]
}

const TEN = R.of(10)

function digitsOf(value: Rational): string | null {
  if (!R.isInteger(value)) return null
  const magnitude = value.num < 0 ? -value.num : value.num
  return String(magnitude)
}

const RULES: ((ctx: RuleContext) => Candidate[])[] = [
  // Off by one in the last place: the single most common slip.
  (ctx) => offBy(ctx, unit(ctx.answer, ctx), 'off-by-one', 1),

  // A dropped or doubled carry shifts the answer by ten units.
  (ctx) => {
    const family = familyOf(ctx.parts.kind)
    if (family === 'frac') return []
    return offBy(ctx, R.mul(unit(ctx.answer, ctx), TEN), 'off-by-ten', 1)
  },

  // Misplacing the decimal point.
  (ctx) => {
    const family = familyOf(ctx.parts.kind)
    const big = R.abs(ctx.answer)
    const isLargeInteger = family === 'int' && R.cmp(big, R.of(100)) >= 0
    if (family !== 'dec' && !isLargeInteger) return []
    return [
      { value: R.mul(ctx.answer, TEN), source: 'decimal-shift', priority: 1 },
      { value: R.div(ctx.answer, TEN), source: 'decimal-shift', priority: 1 },
    ]
  },

  // Losing the sign.
  (ctx) => (R.isZero(ctx.answer) ? [] : [{ value: R.neg(ctx.answer), source: 'sign-flip', priority: 1 }]),

  // Transposing two adjacent digits of the integer part.
  (ctx) => {
    const digits = digitsOf(ctx.answer)
    if (digits === null || digits.length < 2) return []
    const out: Candidate[] = []
    for (let i = 0; i < digits.length - 1; i++) {
      if (digits[i] === digits[i + 1]) continue
      const swapped = `${digits.slice(0, i)}${digits[i + 1]}${digits[i]}${digits.slice(i + 2)}`
      const magnitude = Number(swapped)
      const signed = ctx.answer.num < 0 ? -magnitude : magnitude
      out.push({ value: R.of(signed), source: 'transposed-digits', priority: 2 })
    }
    return out
  },

  // Applying the inverse operation.
  (ctx) => {
    if (ctx.missing !== 'c') return []
    const { a, b, op } = ctx.parts
    const swap: Record<Op, () => Rational> = {
      '+': () => R.sub(a, b),
      '-': () => R.add(a, b),
      '×': () => R.div(a, b),
      '÷': () => R.mul(a, b),
    }
    return [{ value: swap[op](), source: 'wrong-op', priority: 2 }]
  },

  // Multiplication slips: one partial product too many or too few.
  (ctx) => {
    if (ctx.parts.kind !== 'int.mul' || ctx.missing !== 'c') return []
    const { a, b, c } = ctx.parts
    return [
      { value: R.add(c, a), source: 'partial-product', priority: 2 },
      { value: R.sub(c, a), source: 'partial-product', priority: 2 },
      { value: R.add(c, b), source: 'partial-product', priority: 2 },
      { value: R.sub(c, b), source: 'partial-product', priority: 2 },
    ]
  },

  // Right except for the final digit.
  (ctx) => {
    const digits = digitsOf(ctx.answer)
    if (digits === null) return []
    const last = Number(digits[digits.length - 1])
    const out: Candidate[] = []
    // None of these offsets can land back on the original digit.
    for (const replacement of [(last + 1) % 10, (last + 9) % 10, (last + 5) % 10]) {
      const magnitude = Number(`${digits.slice(0, -1)}${replacement}`)
      const signed = ctx.answer.num < 0 ? -magnitude : magnitude
      out.push({ value: R.of(signed), source: 'last-digit', priority: 2 })
    }
    return out
  },

  // Fraction traps: an unreduced form, or a numerator/denominator off by one.
  (ctx) => {
    if (familyOf(ctx.parts.kind) !== 'frac' || ctx.answer.den === 1) return []
    const { num, den } = ctx.answer
    const out: Candidate[] = [
      { value: R.of(num + 1, den), source: 'unsimplified-trap', priority: 2 },
      { value: R.of(num - 1, den), source: 'unsimplified-trap', priority: 2 },
      { value: R.of(num, den + 1), source: 'unsimplified-trap', priority: 2 },
    ]
    return out.filter((candidate) => !R.isInteger(candidate.value) && !R.isZero(candidate.value))
  },

  // Adding numerators and denominators straight across.
  (ctx) => {
    const { kind, a, b } = ctx.parts
    if (kind !== 'frac.add' && kind !== 'frac.sub') return []
    if (ctx.missing !== 'c') return []
    const den = a.den + b.den
    const num = kind === 'frac.add' ? a.num + b.num : a.num - b.num
    if (den === 0 || num === 0) return []
    return [{ value: R.of(num, den), source: 'cross-add', priority: 2 }]
  },

  // Reading the wrong slot: answering with a visible number.
  (ctx) => {
    if (ctx.missing === 'c') return []
    const visible = ctx.missing === 'a' ? ctx.parts.b : ctx.parts.a
    return [
      { value: ctx.parts.c, source: 'missing-operand-echo', priority: 3 },
      { value: visible, source: 'missing-operand-echo', priority: 3 },
    ]
  },
]

/** Family-aware filler used only when the mistake-shaped rules cannot supply three options. */
export function genericOffsets(ctx: RuleContext): Candidate[] {
  const step = unit(ctx.answer, ctx)
  const out: Candidate[] = []
  for (const k of [2, 3, 5, 4, 20, 50, 100]) {
    out.push(...offBy(ctx, R.mul(step, R.of(k)), 'generic-offset', 3))
  }
  return out
}

/** Run every rule, dropping candidates whose arithmetic would leave the exactness bound. */
export function generateCandidates(ctx: RuleContext): Candidate[] {
  const out: Candidate[] = []
  for (const rule of RULES) {
    try {
      out.push(...rule(ctx))
    } catch {
      // A rule that overflows simply contributes nothing.
    }
  }
  return out
}
