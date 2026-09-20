/**
 * Rendering question values to strings (DESIGN.md §6.4).
 *
 * Formatting lives in the core so that the UI, the tests and the golden fixtures all
 * render a question identically. How a value is written depends on the question's
 * family, not only on the value: `1/2` is "0.5" in a decimal question and "1/2" in a
 * fraction question, even though both are the same rational.
 */

import type { Kind, Op, Profile } from '../profile/types.js'
import { MINUS, R, type Rational } from '../rational/rational.js'
import type { MissingSlot, QuestionDisplay } from './types.js'

export type Family = 'int' | 'dec' | 'frac'

export function familyOf(kind: Kind): Family {
  return kind.slice(0, kind.indexOf('.')) as Family
}

/** The blank shown in place of the missing value. */
export const BLANK = '?'

/** Operator glyphs. Subtraction uses a true minus sign so it lines up with negative values. */
export function opGlyph(op: Op): string {
  return op === '-' ? MINUS : op
}

/** Render a value the way its question family writes numbers. */
export function formatValue(value: Rational, kind: Kind, profile: Profile): string {
  if (familyOf(kind) === 'frac' && !R.isInteger(value)) {
    return profile.fraction.allowMixed ? R.toMixedString(value) : R.toFractionString(value)
  }
  return R.toDecimalString(value) ?? R.toFractionString(value)
}

export function buildDisplay(
  parts: { kind: Kind; op: Op; a: Rational; b: Rational; c: Rational },
  missing: MissingSlot,
  profile: Profile,
): QuestionDisplay {
  const show = (value: Rational, slot: MissingSlot): string =>
    missing === slot ? BLANK : formatValue(value, parts.kind, profile)
  return {
    left: show(parts.a, 'a'),
    op: opGlyph(parts.op),
    right: show(parts.b, 'b'),
    result: show(parts.c, 'c'),
  }
}
