/**
 * Building the four multiple-choice options (DESIGN.md §6.7).
 *
 * Options are derived from the question's own seed through a separate stream, so
 * changing a distractor rule never changes which questions a run contains, and the same
 * question id always yields the same four options in the same order.
 */

import { familyOf, formatValue } from '../generate/display.js'
import type { BaseQuestion, MissingSlot, Option } from '../generate/types.js'
import type { Profile } from '../profile/types.js'
import { R, type Rational } from '../rational/rational.js'
import { deriveSeed, rand, splitmix32 } from '../rng/rng.js'
import { type Candidate, generateCandidates, genericOffsets, type RuleContext, unit } from './catalogue.js'

/** Number of options presented. */
export const OPTION_COUNT = 4

/** Relative likelihood of each priority tier being drawn. Commonest slips first. */
const PRIORITY_WEIGHT: Readonly<Record<1 | 2 | 3, number>> = { 1: 6, 2: 3, 3: 1 }

/**
 * Approximate value, used only for magnitude filtering and never for an answer.
 * Ordering distractors by rough size is exactly the kind of job floats are fine for.
 */
function approx(value: Rational): number {
  return value.num / value.den
}

function sameShape(candidate: Rational, ctx: RuleContext): boolean {
  const family = familyOf(ctx.parts.kind)
  if (family === 'int') return R.isInteger(candidate)
  if (family === 'dec') {
    const places = R.decimalPlaces(candidate)
    if (places === null) return false
    // Judge against whichever is more permissive: the profile's budget, or the
    // precision the answer itself already uses. Comparing only against the profile
    // would starve the pool for any answer more precise than the profile expects.
    // A decimal question's answer always terminates, by construction.
    const answerPlaces = R.decimalPlaces(ctx.answer) as number
    return places <= Math.max(answerPlaces, ...ctx.profile.decimal.places)
  }
  // Fraction answers stay fractions, with a denominator a person could plausibly write.
  if (R.isInteger(ctx.answer)) return R.isInteger(candidate)
  return candidate.den > 1 && candidate.den <= ctx.profile.fraction.maxLcd * 2
}

/**
 * Whether a negative option is plausible at all. Subtraction can go below zero, and so
 * can addition when the first operand may be negative. A product or quotient of two
 * positive numbers cannot, so offering a negative there would be a giveaway.
 */
function domainAllowsNegative(ctx: RuleContext): boolean {
  if (R.isNegative(ctx.answer)) return true
  const { kind } = ctx.parts
  if (kind === 'int.sub' || kind === 'dec.sub' || kind === 'frac.sub') return true
  if (kind === 'int.add') return ctx.profile.integer.negativeFirstShare > 0
  return false
}

/**
 * Keep a distractor on the same scale as the answer. The window has to be relative:
 * an absolute slack that suits an answer of 1636 would happily offer 19 3/5 as a
 * distractor for -2/5, which nobody would ever write down.
 */
function inMagnitudeWindow(candidate: Rational, ctx: RuleContext): boolean {
  const target = Math.abs(approx(ctx.answer))
  const value = Math.abs(approx(candidate))
  if (target === 0) return value <= 10
  // Within a factor of ten either way, which covers a misplaced decimal point.
  return value <= target * 10 && value * 10 >= target
}

function acceptable(candidate: Rational, ctx: RuleContext): boolean {
  if (R.eq(candidate, ctx.answer)) return false
  if (!sameShape(candidate, ctx)) return false
  if (R.isNegative(candidate) && !domainAllowsNegative(ctx)) return false
  if (!inMagnitudeWindow(candidate, ctx)) return false
  return true
}

/**
 * Last-resort filler, reached only when the mistake-shaped rules and the plain offsets
 * have all been filtered away. It walks outwards one unit at a time and enforces only
 * distinctness, because four options is a promise the UI depends on and an odd-looking
 * option beats a missing one.
 *
 * It needs no sign filter of its own: it steps upwards first and stops as soon as it
 * has what it needs, so with three options to fill it never walks below zero. That is
 * an invariant of the step order and the option count rather than of this function, so
 * it is pinned by the "never offers a negative where the domain forbids one" property
 * test. Raising OPTION_COUNT would break it, and that test is what will say so.
 */
function lastResort(ctx: RuleContext, taken: Map<string, Rational>, need: number): Candidate[] {
  const out: Candidate[] = []
  // The same step the rules use: one unit in the answer's own last place.
  const step = unit(ctx.answer, ctx)
  for (let k = 1; out.length < need && k <= 512; k++) {
    for (const direction of [1, -1]) {
      if (out.length >= need) break
      let value: Rational
      try {
        value = R.add(ctx.answer, R.mul(step, R.of(direction * k)))
      } catch {
        continue
      }
      // k starts at 1, so a stepped value is never the answer itself.
      const text = formatValue(value, ctx.parts.kind, ctx.profile)
      // The pool may already hold a value exactly one unit from the answer, so this
      // filler has to skip it rather than offer the same option twice.
      if (taken.has(text)) continue
      taken.set(text, value)
      out.push({ value, source: 'generic-offset', priority: 3 })
    }
  }
  return out
}

/**
 * Four options for a question: the answer plus three distractors, shuffled.
 * The correct option's position is uniform over the four slots.
 */
export function buildOptions(
  parts: BaseQuestion,
  missing: MissingSlot,
  answer: Rational,
  profile: Profile,
  questionSeed: number,
): Option[] {
  const ctx: RuleContext = { parts, missing, answer, profile }
  const rng = splitmix32(deriveSeed(questionSeed, 'options'))

  const answerText = formatValue(answer, parts.kind, profile)
  const taken = new Map<string, Rational>([[answerText, answer]])

  const pool: Candidate[] = []
  const admit = (candidates: readonly Candidate[]): void => {
    for (const candidate of candidates) {
      if (!acceptable(candidate.value, ctx)) continue
      const text = formatValue(candidate.value, parts.kind, profile)
      if (taken.has(text)) continue
      taken.set(text, candidate.value)
      pool.push(candidate)
    }
  }

  admit(generateCandidates(ctx))
  // Plain offsets are a fallback, not a source. Mixing them in from the start let
  // them outnumber the mistake-shaped rules and made every option set look alike.
  if (pool.length < OPTION_COUNT - 1) {
    try {
      admit(genericOffsets(ctx))
    } catch {
      // An answer close to the exactness bound has no room for offsets; the filler below
      // still runs, and the rules above may already have supplied enough.
    }
  }

  // Weighted rather than strictly tiered. Under strict tiers the commonest slips
  // (off by one, off by ten, a shifted decimal point) always filled all three slots,
  // so every question looked the same and the answer tended to sit in the middle of
  // the spread. Weighting keeps those slips likeliest while still admitting
  // transposed digits, partial products and last-digit errors.
  const chosen: Candidate[] = []
  while (chosen.length < OPTION_COUNT - 1 && pool.length > 0) {
    const picked = rand.weighted(
      rng,
      pool.map((candidate) => [candidate, PRIORITY_WEIGHT[candidate.priority]] as const),
    )
    chosen.push(picked)
    pool.splice(pool.indexOf(picked), 1)
  }
  if (chosen.length < OPTION_COUNT - 1) {
    chosen.push(...lastResort(ctx, taken, OPTION_COUNT - 1 - chosen.length))
  }

  const options: Option[] = [
    { text: answerText, value: answer, correct: true, source: 'answer' },
    ...chosen.slice(0, OPTION_COUNT - 1).map((candidate) => ({
      text: formatValue(candidate.value, parts.kind, profile),
      value: candidate.value,
      correct: false,
      source: candidate.source,
    })),
  ]
  return rand.shuffle(rng, options)
}
