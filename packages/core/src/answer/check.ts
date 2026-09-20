/**
 * Judging a typed answer (DESIGN.md §6.8).
 *
 * Equality is structural on reduced rationals, so "0.5", ".5" and "1/2" are all the
 * same value. Under the `simplified` policy a *written* fraction must additionally be
 * in lowest terms; a decimal is still accepted, because the person did not claim to
 * have written a fraction.
 */

import type { Profile } from '../profile/types.js'
import { gcd, R, type Rational } from '../rational/rational.js'
import { type ParseError, parseAnswer } from './parse.js'

export type AnswerVerdict =
  | { status: 'correct'; value: Rational }
  | { status: 'wrong'; value: Rational; reason?: 'unsimplified' }
  | { status: 'pending'; error: ParseError }

/**
 * Judge a raw input against the expected answer.
 * `pending` means the input is not yet a number; it is neither right nor wrong.
 */
export function checkAnswer(
  raw: string,
  expected: Rational,
  policy: Profile['answerPolicy'] = { fractions: 'equivalent' },
): AnswerVerdict {
  const parsed = parseAnswer(raw)
  if (!parsed.ok) return { status: 'pending', error: parsed.error }

  if (policy.fractions === 'simplified' && parsed.writtenFraction) {
    const { num, den } = parsed.writtenFraction
    if (den > 0 && gcd(num, den) !== 1) {
      return { status: 'wrong', value: parsed.value, reason: 'unsimplified' }
    }
  }

  return R.eq(parsed.value, expected)
    ? { status: 'correct', value: parsed.value }
    : { status: 'wrong', value: parsed.value }
}

/**
 * Whether a partially typed string already equals the answer, for Zetamac-style
 * auto-submit. Only ever enabled on profiles where a wrong keystroke costs nothing.
 */
export function isAutoSubmitMatch(raw: string, expected: Rational): boolean {
  const parsed = parseAnswer(raw)
  return parsed.ok && R.eq(parsed.value, expected)
}
