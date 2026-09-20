import type { Profile } from './types.js'
import { ALL_KINDS } from './types.js'

export class ProfileError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ProfileError'
  }
}

function check(condition: boolean, message: string): void {
  if (!condition) throw new ProfileError(message)
}

function isShare(value: number): boolean {
  return Number.isFinite(value) && value >= 0 && value <= 1
}

function isRange(range: readonly [number, number]): boolean {
  const [lo, hi] = range
  return Number.isInteger(lo) && Number.isInteger(hi) && lo <= hi
}

/** Validate a profile at load time. Throws `ProfileError` with a specific message. */
export function validateProfile(profile: Profile): Profile {
  check(/^[a-z0-9-]+$/.test(profile.id), `profile id "${profile.id}" must be lowercase kebab-case`)
  check(
    Number.isInteger(profile.version) && profile.version >= 1,
    'profile version must be a positive integer',
  )
  check(
    Number.isInteger(profile.questionCount) && profile.questionCount > 0,
    'questionCount must be positive',
  )
  if (profile.timeLimit.kind === 'timed') {
    check(profile.timeLimit.durationMs > 0, 'timed profiles need a positive durationMs')
  }
  check(profile.mix.length > 0, 'mix must not be empty')
  for (const entry of profile.mix) {
    check(ALL_KINDS.includes(entry.kind), `unknown kind "${entry.kind}" in mix`)
    check(entry.weight > 0 && Number.isFinite(entry.weight), `weight for ${entry.kind} must be positive`)
  }
  const kinds = profile.mix.map((m) => m.kind)
  check(new Set(kinds).size === kinds.length, 'mix must not repeat a kind')
  check(isShare(profile.missingOperandShare), 'missingOperandShare must be within [0, 1]')
  check(isShare(profile.integer.negativeFirstShare), 'negativeFirstShare must be within [0, 1]')
  check(isShare(profile.integer.mulLargeSmallShare), 'mulLargeSmallShare must be within [0, 1]')
  check(
    isRange(profile.integer.addSub) && profile.integer.addSub[0] >= 1,
    'integer.addSub must be a valid range >= 1',
  )
  check(isRange(profile.integer.mulLarge), 'integer.mulLarge must be a valid range')
  check(
    isRange(profile.integer.mulSmall) && profile.integer.mulSmall[0] >= 2,
    'integer.mulSmall must start at >= 2',
  )
  check(isRange(profile.integer.mulTwoDigit), 'integer.mulTwoDigit must be a valid range')
  check(profile.integer.mulFriendly.length > 0, 'integer.mulFriendly must not be empty')
  check(
    profile.integer.mulFriendly.every((f) => Number.isInteger(f) && f >= 2),
    'friendly factors must be integers >= 2 (a factor of 1 is degenerate)',
  )
  check(profile.integer.divisors.length > 0, 'integer.divisors must not be empty')
  check(
    profile.integer.divisors.every((d) => Number.isInteger(d) && d >= 2),
    'divisors must be integers >= 2 (dividing by 1 is degenerate)',
  )
  check(
    isRange(profile.integer.quotient) && profile.integer.quotient[0] >= 2,
    'quotient range must start at >= 2',
  )
  check(profile.decimal.places.length > 0, 'decimal.places must not be empty')
  check(
    profile.decimal.places.length === profile.decimal.placesWeights.length,
    'decimal.places and decimal.placesWeights must have the same length',
  )
  check(
    profile.decimal.places.every((p) => Number.isInteger(p) && p >= 1 && p <= 6),
    'decimal places must be integers within [1, 6]',
  )
  check(
    profile.decimal.placesWeights.every((w) => w > 0),
    'decimal place weights must be positive',
  )
  check(
    isRange(profile.decimal.scaled) && profile.decimal.scaled[0] >= 1,
    'decimal.scaled must be a valid range >= 1',
  )
  check(isRange(profile.decimal.mulScaled), 'decimal.mulScaled must be a valid range')
  check(isRange(profile.decimal.divScaled), 'decimal.divScaled must be a valid range')
  check(profile.decimal.mulPlaces >= 1, 'decimal.mulPlaces must be >= 1')
  check(profile.decimal.divPlaces >= 1, 'decimal.divPlaces must be >= 1')
  check(profile.fraction.denominators.length > 0, 'fraction.denominators must not be empty')
  check(
    profile.fraction.denominators.every((d) => Number.isInteger(d) && d >= 2),
    'fraction denominators must be integers >= 2',
  )
  check(
    profile.fraction.maxLcd >= Math.max(...profile.fraction.denominators),
    'maxLcd must be >= every denominator',
  )
  if (profile.passScore !== undefined) {
    check(Number.isFinite(profile.passScore), 'passScore must be finite')
  }
  if (profile.competitiveScore !== undefined) {
    check(Number.isFinite(profile.competitiveScore), 'competitiveScore must be finite')
  }
  return profile
}
