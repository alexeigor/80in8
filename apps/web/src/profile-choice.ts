import {
  CURRENT_PRESETS,
  canonicalJson,
  EXTENDED_TIME_FACTOR,
  PRESETS,
  type Profile,
  practiceVariant,
} from '@80in8/core'

/** The legacy MCQ preset remains resolvable, but its mix is now a separate control. */
export const TEST_PRESETS = CURRENT_PRESETS.filter((profile) => profile.id !== 'optiver-mcq')

export function testRefFor(ref: string): string {
  return ref === 'optiver-mcq@1' ? 'optiver-classic@1' : ref
}

export function testName(profile: Profile): string {
  return profile.id === 'optiver-mcq'
    ? profile.name.replace(PRESETS['optiver-mcq'].name, PRESETS['optiver-classic'].name)
    : profile.name
}

export function hasQuestionMix(profile: Profile): boolean {
  return profile.id === 'optiver-classic' || profile.id === 'optiver-mcq'
}

export function withQuestionMix(base: Profile, share: 0.2 | 0.4): Profile {
  if (share === base.missingOperandShare) return base
  // Reuse the frozen presets so existing settings, question IDs and links remain
  // compatible. Custom/shared variants retain their timing, scoring and count.
  if (
    canonicalJson(base) === canonicalJson(PRESETS['optiver-classic']) ||
    canonicalJson(base) === canonicalJson(PRESETS['optiver-mcq'])
  ) {
    return share === 0.4 ? PRESETS['optiver-mcq'] : PRESETS['optiver-classic']
  }
  return { ...base, missingOperandShare: share }
}

/**
 * Apply count, pacing and marking after choosing the base question mix.
 *
 * Only `questionCount` here reaches question generation, so only changing it forks the
 * question ids (a 40-question paper genuinely is a different paper). Pacing and marking
 * ride along on the same ids, which is what lets an extended-time practice run feed the
 * same per-question statistics and retry decks as the graded run it came from.
 *
 * Derived profiles are snapshotted locally so their ids keep resolving, and share links
 * carry the whole profile in `pf`.
 */

export type Pace = 'timed' | 'extended' | 'untimed'

export const PACE_LABELS: Record<Pace, string> = {
  timed: 'Timed',
  extended: `Extended time (×${EXTENDED_TIME_FACTOR})`,
  untimed: 'Untimed practice',
}

export function isPractice(pace: Pace): boolean {
  return pace !== 'timed'
}

export function deriveProfile(
  base: Profile,
  count: number,
  pace: Pace,
  fractions: Profile['answerPolicy']['fractions'] = base.answerPolicy.fractions,
): Profile {
  const sameCount = count === base.questionCount
  const samePolicy = fractions === base.answerPolicy.fractions
  if (sameCount && pace === 'timed' && samePolicy) return base

  const suffix = [
    sameCount ? null : `${count} questions`,
    pace === 'timed' ? null : PACE_LABELS[pace],
    samePolicy ? null : 'lowest terms only',
  ]
    .filter(Boolean)
    .join(' · ')

  const marked: Profile = {
    ...base,
    name: `${base.name} — ${suffix}`,
    description: `${base.description} Derived variant: ${suffix}.`,
    questionCount: count,
    answerPolicy: { fractions },
  }

  // The clock is relaxed by the core's helper, so "only the time limit may vary" is
  // enforced in one place rather than re-derived here.
  return pace === 'timed' ? marked : practiceVariant(marked, pace)
}

export function describeLimit(profile: Profile): string {
  if (profile.timeLimit.kind === 'untimed') return 'no time limit'
  const total = Math.round(profile.timeLimit.durationMs / 1000)
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`
}

export function describeScoring(profile: Profile): string {
  const { correct, wrong, skipped, allowSkip } = profile.scoring
  const sign = (n: number) => (n > 0 ? `+${n}` : String(n))
  return `${sign(correct)} correct · ${sign(wrong)} wrong · ${
    allowSkip ? `${sign(skipped)} skipped` : 'no skipping'
  }`
}
