import { generateRun, materialise, PRESETS, type Profile, type Question, resolvePreset } from '@80in8/core'

/** Real questions from the real generator: the tests should not invent their own. */
export function questionsFor(profile: Profile, seed = 12_345, count = 8): Question[] {
  const run = generateRun('fixture', seed, { ...profile, questionCount: count }, profile.defaultMode, true)
  return materialise(run, resolvePreset) as Question[]
}

export const MCQ_PROFILE = PRESETS['optiver-mcq']
export const TYPED_PROFILE = PRESETS['optiver-classic']
export const NO_SKIP_PROFILE = PRESETS['optiver-strict']
