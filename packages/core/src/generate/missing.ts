/**
 * The missing-operand transform (DESIGN.md §6.6).
 *
 * Applied *after* a question is generated: we already have a well-formed `a op b = c`
 * with tractable numbers, so hiding one of the operands is guaranteed to leave a
 * question whose answer is just as tractable. Generating "solve for x" directly would
 * not give that guarantee.
 */

import type { Profile } from '../profile/types.js'
import { type Rng, rand } from '../rng/rng.js'
import type { BaseQuestion, MissingSlot } from './types.js'

export function pickMissingSlot(rng: Rng, profile: Profile): MissingSlot {
  if (!rand.bool(rng, profile.missingOperandShare)) return 'c'
  return rand.bool(rng, 0.5) ? 'a' : 'b'
}

export function answerFor(parts: BaseQuestion, missing: MissingSlot) {
  return parts[missing]
}
