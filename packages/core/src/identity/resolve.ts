/**
 * Regenerating questions and runs from their ids (DESIGN.md §6.5).
 *
 * This is the only code path that produces a `Question`, so `questionFromId(q.id)`
 * reproducing `q` holds by construction rather than by careful maintenance.
 */

import { buildOptions } from '../distract/build.js'
import { buildDisplay } from '../generate/display.js'
import { GENERATORS } from '../generate/kinds.js'
import { answerFor, pickMissingSlot } from '../generate/missing.js'
import type { Question, QuestionId } from '../generate/types.js'
import { isPresetRef, profileRefOf } from '../profile/canonical.js'
import type { Profile } from '../profile/types.js'
import { splitmix32 } from '../rng/rng.js'
import { type IdError, parseId } from './id.js'

/** Looks up the profile a reference names. Returns undefined when it is not available. */
export type ProfileResolver = (profileRef: string) => Profile | undefined

export type ResolveError =
  | IdError
  /** The reference is well formed but no profile is available for it. */
  | 'unknown-profile'
  /** A profile was supplied but it does not hash to the reference in the id. */
  | 'profile-mismatch'

export interface ResolveFailure {
  error: ResolveError
}

export function isResolveFailure(value: unknown): value is ResolveFailure {
  return typeof value === 'object' && value !== null && 'error' in value
}

/**
 * Check that a supplied profile really is the one the reference names. For a shared
 * custom profile this is what stops a tampered payload from silently regenerating a
 * different question under someone else's id.
 */
export function profileMatchesRef(profile: Profile, profileRef: string): boolean {
  return profileRefOf(profile, isPresetRef(profileRef)) === profileRef
}

/** Rebuild a question from its id alone. */
export function questionFromId(id: QuestionId, resolve: ProfileResolver): Question | ResolveFailure {
  const parsed = parseId(id)
  if ('error' in parsed) return parsed

  const profile = resolve(parsed.profileRef)
  if (!profile) return { error: 'unknown-profile' }
  if (!profileMatchesRef(profile, parsed.profileRef)) return { error: 'profile-mismatch' }

  // One stream decides the operands and the missing slot; options use their own.
  const rng = splitmix32(parsed.seed)
  const parts = GENERATORS[parsed.kind](rng, profile)
  const missing = pickMissingSlot(rng, profile)
  const answer = answerFor(parts, missing)

  return {
    ...parts,
    id,
    missing,
    answer,
    display: buildDisplay(parts, missing, profile),
    options: buildOptions(parts, missing, answer, profile, parsed.seed),
  }
}

/** Rebuild a question, throwing on failure. For call sites that have already validated the id. */
export function questionFromIdOrThrow(id: QuestionId, resolve: ProfileResolver): Question {
  const result = questionFromId(id, resolve)
  if (isResolveFailure(result)) throw new Error(`cannot resolve question ${id}: ${result.error}`)
  return result
}
