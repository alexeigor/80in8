/**
 * Run assembly (DESIGN.md §6.6).
 *
 * A run is a list of question ids, nothing more. Retry decks, shared single questions
 * and ordinary seeded runs therefore all flow through the same session machinery.
 */

import { parseRunId, toId, toRunId } from '../identity/id.js'
import { type ProfileResolver, questionFromId, type ResolveFailure } from '../identity/resolve.js'
import { isPresetRef, profileRefOf } from '../profile/canonical.js'
import type { Mode, Profile } from '../profile/types.js'
import { deriveSeed, type Rng, rand, splitmix32 } from '../rng/rng.js'
import type { DeckOrigin, Question, QuestionId, Run, RunId } from './types.js'

const TWO_32 = 4_294_967_296

/** The reference that this profile's ids will carry. */
export function refFor(profile: Profile, builtIn: boolean): string {
  return profileRefOf(profile, builtIn)
}

/**
 * Draw the question ids for a seeded run. Kinds are drawn independently per question
 * from the mix weights rather than allotted fixed quotas, so category counts vary a
 * little between runs, exactly as they do on the sites this mirrors.
 */
export function drawQuestionIds(
  runSeed: number,
  profile: Profile,
  profileRef: string,
  rng: Rng = splitmix32(deriveSeed(runSeed, 'questions')),
): QuestionId[] {
  const weights = profile.mix.map((entry) => [entry.kind, entry.weight] as const)
  const ids: QuestionId[] = []
  const seen = new Set<string>()
  // Bounded so the function is total even in the (astronomically unlikely) case of
  // repeated seed collisions; past the budget we accept a repeat rather than hang.
  const budget = profile.questionCount * 16
  let attempts = 0
  while (ids.length < profile.questionCount) {
    const kind = rand.weighted(rng, weights)
    const seed = Math.floor(rng() * TWO_32) >>> 0
    const id = toId({ profileRef, kind, seed })
    attempts += 1
    if (seen.has(id) && attempts < budget) continue
    seen.add(id)
    ids.push(id)
  }
  return ids
}

/** A seeded run: reproducible in full from its `runId`. */
export function generateRun(
  attemptId: string,
  seed: number,
  profile: Profile,
  mode: Mode,
  builtIn = true,
): Run {
  const profileRef = refFor(profile, builtIn)
  return {
    attemptId,
    spec: { kind: 'seeded', profileRef, mode, seed },
    runId: toRunId({ profileRef, mode, seed }),
    profile,
    questionIds: drawQuestionIds(seed, profile, profileRef),
  }
}

/** A deck: an explicit ordered list, such as the questions missed in an earlier run. */
export function generateRunFromIds(
  attemptId: string,
  questionIds: readonly QuestionId[],
  profile: Profile,
  mode: Mode,
  origin: DeckOrigin,
  builtIn = true,
): Run {
  const profileRef = refFor(profile, builtIn)
  return {
    attemptId,
    spec: { kind: 'deck', profileRef, mode, questionIds: [...questionIds], origin },
    profile,
    questionIds: [...questionIds],
  }
}

/** Rebuild a seeded run from its id. Decks have no id and cannot round-trip this way. */
export function runFromId(runId: RunId, resolve: ProfileResolver): Omit<Run, 'attemptId'> | ResolveFailure {
  const parsed = parseRunId(runId)
  if ('error' in parsed) return parsed
  const profile = resolve(parsed.profileRef)
  if (!profile) return { error: 'unknown-profile' }
  if (profileRefOf(profile, isPresetRef(parsed.profileRef)) !== parsed.profileRef) {
    return { error: 'profile-mismatch' }
  }
  return {
    spec: { kind: 'seeded', profileRef: parsed.profileRef, mode: parsed.mode, seed: parsed.seed },
    runId,
    profile,
    questionIds: drawQuestionIds(parsed.seed, profile, parsed.profileRef),
  }
}

/** Turn a run's ids into full questions. */
export function materialise(run: Run, resolve: ProfileResolver): (Question | ResolveFailure)[] {
  return run.questionIds.map((id) => questionFromId(id, resolve))
}
