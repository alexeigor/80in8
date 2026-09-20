/** Session, answer and summary shapes (DESIGN.md §6.9, §6.10). */

import type { DistractorSource, Question, QuestionId, Run } from '../generate/types.js'
import type { Kind, Op } from '../profile/types.js'
import type { Rational } from '../rational/rational.js'

/**
 * Both clocks travel with every event. `mono` is `performance.now()`, which measures
 * durations reliably but may stall while a device sleeps. `wall` is `Date.now()`, which
 * keeps going across sleep but can be moved by the user. Deadlines take the stricter of
 * the two, so neither closing a laptop nor winding the clock back buys extra time.
 */
export interface Clocks {
  mono: number
  wall: number
}

export interface Deadline {
  mono: number
  wall: number
}

export type EndReason = 'time' | 'completed' | 'aborted'

export interface Answer {
  questionId: QuestionId
  /** Monotonic timestamps; durations are always measured on the monotonic clock. */
  shownAt: number
  answeredAt: number
  elapsedMs: number
  /** Exactly what the person typed, or the option text they chose. */
  raw: string
  /** Parsed value, or null when the question was skipped or the input was not a number. */
  value: Rational | null
  correct: boolean
  skipped: boolean
  /** Multiple choice only. */
  optionIndex?: number
  /** Which mistake the chosen distractor embodies, for the "what trips you up" breakdown. */
  source?: DistractorSource | 'answer'
}

export interface KindBreakdown {
  kind: Kind
  answered: number
  correct: number
  wrong: number
  skipped: number
  meanMs: number | null
}

export interface OpBreakdown {
  op: Op
  answered: number
  correct: number
  meanMs: number | null
}

export interface SlowQuestion {
  questionId: QuestionId
  elapsedMs: number
}

/** Only wrong picks are counted, so the correct option's `'answer'` source never appears. */
export interface SourceCount {
  source: DistractorSource
  count: number
}

export interface RunSummary {
  questionCount: number
  answered: number
  correct: number
  wrong: number
  skipped: number
  score: number
  /** correct / (correct + wrong), or null when nothing was attempted. */
  accuracy: number | null
  totalMs: number
  hiddenMs: number
  meanMsPerQuestion: number | null
  medianMsPerQuestion: number | null
  byKind: KindBreakdown[]
  byOp: OpBreakdown[]
  slowest: SlowQuestion[]
  distractorSources: SourceCount[]
  endedBy: EndReason
  /** Against the profile's pass score, or null when the profile does not set one. */
  passed: boolean | null
}

export type SessionState =
  | { phase: 'idle' }
  | {
      phase: 'countdown'
      run: Run
      questions: readonly Question[]
      /** Monotonic instant at which the run begins. */
      startsAt: number
    }
  | {
      phase: 'running'
      run: Run
      questions: readonly Question[]
      /** Absent for untimed practice runs. */
      deadline?: Deadline
      startedAt: number
      index: number
      questionShownAt: number
      answers: Answer[]
      hiddenMs: number
      /** Monotonic instant the page became hidden, while it still is. */
      hiddenSince?: number
    }
  | {
      phase: 'finished'
      run: Run
      questions: readonly Question[]
      answers: Answer[]
      endedBy: EndReason
      summary: RunSummary
    }

export type SessionEvent =
  | { type: 'start'; run: Run; questions: readonly Question[]; at: Clocks; countdownMs: number }
  | { type: 'go'; at: Clocks }
  | { type: 'answer'; raw: string; at: Clocks }
  | { type: 'skip'; at: Clocks }
  | { type: 'select'; optionIndex: number; at: Clocks }
  | { type: 'tick'; at: Clocks }
  | { type: 'visibility'; hidden: boolean; at: Clocks }
  | { type: 'abort'; at: Clocks }
