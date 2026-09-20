/** Question kinds and profile shape (DESIGN.md §6.3, §6.4, Appendix A). */

export type Kind =
  | 'int.add'
  | 'int.sub'
  | 'int.mul'
  | 'int.div'
  | 'dec.add'
  | 'dec.sub'
  | 'dec.mul'
  | 'dec.div'
  | 'frac.add'
  | 'frac.sub'
  | 'frac.mul'
  | 'frac.div'

export const ALL_KINDS: readonly Kind[] = [
  'int.add',
  'int.sub',
  'int.mul',
  'int.div',
  'dec.add',
  'dec.sub',
  'dec.mul',
  'dec.div',
  'frac.add',
  'frac.sub',
  'frac.mul',
  'frac.div',
] as const

export type Op = '+' | '-' | '×' | '÷'

export type Mode = 'mcq' | 'typed'

/** Tagged so that JSON round-trips; `Infinity` would serialise to `null`. */
export type TimeLimit = { kind: 'timed'; durationMs: number } | { kind: 'untimed' }

export interface WeightedKind {
  kind: Kind
  weight: number
}

export interface ScoringRule {
  correct: number
  wrong: number
  skipped: number
  allowSkip: boolean
}

export interface IntegerRanges {
  /** Inclusive operand range for addition and subtraction. */
  addSub: [number, number]
  /** Probability that the first operand of an integer add/sub is negative. */
  negativeFirstShare: number
  /** Share of multiplications that use the "large x small" shape rather than "friendly 2-digit". */
  mulLargeSmallShare: number
  mulLarge: [number, number]
  mulSmall: [number, number]
  mulTwoDigit: [number, number]
  /** "Friendly" second factors that are tractable mentally. */
  mulFriendly: readonly number[]
  /** Divisors that give exact quotients. */
  divisors: readonly number[]
  quotient: [number, number]
}

export interface DecimalRanges {
  /** Decimal place counts that may be drawn, with their weights. */
  places: readonly number[]
  placesWeights: readonly number[]
  /** Inclusive range of the *scaled integer* value, e.g. [1, 999] tenths = 0.1 .. 99.9. */
  scaled: [number, number]
  /** Place count and scaled range for factors of decimal multiplication. */
  mulPlaces: number
  mulScaled: [number, number]
  /** Place count and scaled range for the divisor and quotient of decimal division. */
  divPlaces: number
  divScaled: [number, number]
}

export interface FractionRanges {
  denominators: readonly number[]
  /** Largest least-common-denominator allowed for an add/sub pair and for a division answer. */
  maxLcd: number
  /** Whether answers may be shown as mixed numbers. */
  allowMixed: boolean
}

export interface Profile {
  /** Stable preset id, e.g. "optiver-classic". */
  id: string
  /** Version of this preset's parameters. Bumped whenever generation behaviour changes. */
  version: number
  name: string
  description: string
  questionCount: number
  timeLimit: TimeLimit
  scoring: ScoringRule
  passScore?: number
  competitiveScore?: number
  defaultMode: Mode
  /** Zetamac-style advance-on-correct-digits. Only meaningful when nothing is lost by a wrong key. */
  allowAutoSubmit: boolean
  /** Pause the clock while the page is hidden. Off for exam-realistic profiles. */
  pauseOnHide: boolean
  mix: readonly WeightedKind[]
  /** Share of questions rendered as `a op ? = c` instead of `a op b = ?`. */
  missingOperandShare: number
  integer: IntegerRanges
  decimal: DecimalRanges
  fraction: FractionRanges
  answerPolicy: { fractions: 'equivalent' | 'simplified' }
}
