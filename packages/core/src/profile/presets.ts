/**
 * Built-in profiles (DESIGN.md Appendix A).
 *
 * Presets are versioned. Any change to the parameters below changes what an existing
 * question id regenerates to, so it MUST come with a version bump and a new frozen
 * entry here; `presets.snapshot.test.ts` fails otherwise. Old versions stay in the
 * registry forever so that historical ids keep resolving.
 */
import type { Profile } from './types.js'
import { validateProfile } from './validate.js'

/** Second factors that are tractable mentally (Appendix A, int.mul). */
const FRIENDLY_FACTORS = [
  11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 24, 25, 27, 29, 30, 31, 32, 33, 35, 36, 39, 40, 41, 44, 45,
  48, 49, 50, 51, 55, 60, 64, 72, 75, 80, 81, 90, 96, 99,
] as const

/** Divisors that yield exact integer quotients (Appendix A, int.div). */
const CLEAN_DIVISORS = [
  12, 14, 15, 16, 18, 20, 22, 24, 25, 27, 32, 33, 35, 36, 40, 44, 45, 48, 50, 55, 60, 64, 72, 75, 80, 96,
] as const

const CLASSIC_INTEGER = {
  addSub: [1, 999] as [number, number],
  negativeFirstShare: 0.25,
  mulLargeSmallShare: 0.5,
  mulLarge: [100, 999] as [number, number],
  mulSmall: [2, 9] as [number, number],
  mulTwoDigit: [11, 99] as [number, number],
  mulFriendly: FRIENDLY_FACTORS,
  divisors: CLEAN_DIVISORS,
  quotient: [3, 20] as [number, number],
}

const CLASSIC_DECIMAL = {
  places: [1, 2],
  placesWeights: [0.75, 0.25],
  scaled: [1, 9999] as [number, number],
  mulPlaces: 1,
  mulScaled: [11, 999] as [number, number],
  divPlaces: 1,
  divScaled: [11, 99] as [number, number],
}

const CLASSIC_FRACTION = {
  denominators: [2, 3, 4, 5, 6, 8, 10, 12],
  maxLcd: 12,
  allowMixed: true,
}

const CLASSIC_MIX = [
  { kind: 'int.add', weight: 2 },
  { kind: 'int.sub', weight: 2 },
  { kind: 'int.mul', weight: 2 },
  { kind: 'int.div', weight: 2 },
  { kind: 'dec.add', weight: 1 },
  { kind: 'dec.sub', weight: 1 },
  { kind: 'frac.add', weight: 1 },
  { kind: 'frac.sub', weight: 1 },
] as const

const optiverClassic: Profile = {
  id: 'optiver-classic',
  version: 1,
  name: 'Optiver 80 in 8',
  description: '80 questions in 8 minutes. +1 correct, -1 wrong, skipping is free.',
  questionCount: 80,
  timeLimit: { kind: 'timed', durationMs: 480_000 },
  scoring: { correct: 1, wrong: -1, skipped: 0, allowSkip: true },
  passScore: 56,
  competitiveScore: 70,
  defaultMode: 'typed',
  allowAutoSubmit: false,
  pauseOnHide: false,
  mix: CLASSIC_MIX,
  missingOperandShare: 0.2,
  integer: CLASSIC_INTEGER,
  decimal: CLASSIC_DECIMAL,
  fraction: CLASSIC_FRACTION,
  answerPolicy: { fractions: 'equivalent' },
}

const optiverStrict: Profile = {
  ...optiverClassic,
  id: 'optiver-strict',
  name: 'Optiver 80 in 8 (no skipping)',
  description: 'As the classic test, but every question must be answered.',
  scoring: { correct: 1, wrong: -1, skipped: 0, allowSkip: false },
}

const optiverMcq: Profile = {
  ...optiverClassic,
  id: 'optiver-mcq',
  name: 'Optiver 80 in 8 (multiple choice)',
  description: 'Four options per question, with a higher share of missing-operand problems.',
  defaultMode: 'mcq',
  missingOperandShare: 0.4,
}

/**
 * Candidate reports disagree about the penalty: most describe one point off for a
 * wrong answer, while older accounts describe two, and some say an unanswered question
 * costs the same as a wrong one. Rather than pick a side, the harsher reading is a
 * preset of its own. See DESIGN.md section 3.1.
 */
const optiverHarsh: Profile = {
  ...optiverClassic,
  id: 'optiver-harsh',
  name: 'Optiver 80 in 8 (harsh marking)',
  description: 'The stricter scoring some candidates report: +1 correct, -2 wrong, -2 unanswered.',
  scoring: { correct: 1, wrong: -2, skipped: -2, allowSkip: true },
  passScore: 40,
  competitiveScore: 60,
}

const hard: Profile = {
  id: 'hard',
  version: 1,
  name: 'Hard',
  description: 'Bigger numbers, decimal multiplication and division, and fraction products.',
  questionCount: 80,
  timeLimit: { kind: 'timed', durationMs: 480_000 },
  scoring: { correct: 1, wrong: -1, skipped: 0, allowSkip: true },
  passScore: 45,
  competitiveScore: 60,
  defaultMode: 'typed',
  allowAutoSubmit: false,
  pauseOnHide: false,
  mix: [
    { kind: 'int.add', weight: 1 },
    { kind: 'int.sub', weight: 1 },
    { kind: 'int.mul', weight: 2 },
    { kind: 'int.div', weight: 2 },
    { kind: 'dec.add', weight: 1 },
    { kind: 'dec.sub', weight: 1 },
    { kind: 'dec.mul', weight: 1 },
    { kind: 'dec.div', weight: 1 },
    { kind: 'frac.add', weight: 1 },
    { kind: 'frac.sub', weight: 1 },
    { kind: 'frac.mul', weight: 1 },
    { kind: 'frac.div', weight: 1 },
  ],
  missingOperandShare: 0.3,
  integer: {
    ...CLASSIC_INTEGER,
    addSub: [12, 4800],
    mulLarge: [120, 980],
    mulTwoDigit: [13, 99],
  },
  decimal: {
    places: [1, 2],
    placesWeights: [0.5, 0.5],
    scaled: [1, 9999],
    mulPlaces: 1,
    mulScaled: [11, 999],
    divPlaces: 1,
    divScaled: [11, 99],
  },
  fraction: { denominators: [2, 3, 4, 5, 6, 8, 10, 12, 16, 20, 25], maxLcd: 48, allowMixed: true },
  answerPolicy: { fractions: 'equivalent' },
}

const zetamacDrill: Profile = {
  id: 'zetamac-drill',
  version: 1,
  name: 'Zetamac drill',
  description: 'Integers only for two minutes. No penalty for a wrong key, so answers auto-submit.',
  questionCount: 500,
  timeLimit: { kind: 'timed', durationMs: 120_000 },
  scoring: { correct: 1, wrong: 0, skipped: 0, allowSkip: true },
  defaultMode: 'typed',
  allowAutoSubmit: true,
  pauseOnHide: false,
  mix: [
    { kind: 'int.add', weight: 1 },
    { kind: 'int.sub', weight: 1 },
    { kind: 'int.mul', weight: 1 },
    { kind: 'int.div', weight: 1 },
  ],
  missingOperandShare: 0,
  integer: { ...CLASSIC_INTEGER, addSub: [2, 100], negativeFirstShare: 0, mulLargeSmallShare: 0 },
  decimal: CLASSIC_DECIMAL,
  fraction: CLASSIC_FRACTION,
  answerPolicy: { fractions: 'equivalent' },
}

/** Every preset version ever published, keyed by profile reference. */
const REGISTRY = new Map<string, Profile>()

function register(profile: Profile): Profile {
  const validated = validateProfile(profile)
  REGISTRY.set(`${validated.id}@${validated.version}`, validated)
  return validated
}

export const PRESETS = {
  'optiver-classic': register(optiverClassic),
  'optiver-strict': register(optiverStrict),
  'optiver-mcq': register(optiverMcq),
  'optiver-harsh': register(optiverHarsh),
  hard: register(hard),
  'zetamac-drill': register(zetamacDrill),
} as const

export type PresetId = keyof typeof PRESETS

/** Presets offered in the UI, in display order. Older versions stay resolvable but are not listed. */
export const CURRENT_PRESETS: readonly Profile[] = [
  PRESETS['optiver-classic'],
  PRESETS['optiver-mcq'],
  PRESETS['optiver-strict'],
  PRESETS['optiver-harsh'],
  PRESETS.hard,
  PRESETS['zetamac-drill'],
]

/** How a practice run relaxes the clock. */
export type PracticeMode = 'untimed' | 'extended'

/** Extra time granted by the extended practice mode, per WCAG 2.2.1's guidance. */
export const EXTENDED_TIME_FACTOR = 10

/**
 * A practice version of a profile: the clock is removed or stretched, and nothing else
 * changes. That restriction matters, because only the time limit is safe to vary. The
 * question mix, ranges and count all feed question generation, so changing one would
 * make a practice run's ids mean something different from the same ids elsewhere.
 */
export function practiceVariant(profile: Profile, mode: PracticeMode): Profile {
  if (mode === 'untimed') return { ...profile, timeLimit: { kind: 'untimed' } }
  if (profile.timeLimit.kind === 'untimed') return profile
  return {
    ...profile,
    timeLimit: { kind: 'timed', durationMs: profile.timeLimit.durationMs * EXTENDED_TIME_FACTOR },
  }
}

/** Resolve a built-in preset reference such as "optiver-classic@1". */
export function resolvePreset(ref: string): Profile | undefined {
  return REGISTRY.get(ref)
}

/** Every registered reference, for tests and diagnostics. */
export function presetRefs(): string[] {
  return [...REGISTRY.keys()].sort()
}
