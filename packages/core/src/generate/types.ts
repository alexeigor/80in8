/** Question, option and run shapes (DESIGN.md §6.4). */

import type { Kind, Mode, Op, Profile } from '../profile/types.js'
import type { Rational } from '../rational/rational.js'

/** `1.<profileRef>.<kind-slug>.<seed36>` — regenerates the whole question. */
export type QuestionId = string
/** `1.<profileRef>.<mode>.<seed36>` — regenerates a seeded run's question list. */
export type RunId = string

export type DistractorSource =
  | 'off-by-one'
  | 'off-by-ten'
  | 'decimal-shift'
  | 'sign-flip'
  | 'transposed-digits'
  | 'wrong-op'
  | 'partial-product'
  | 'last-digit'
  | 'unsimplified-trap'
  | 'cross-add'
  | 'missing-operand-echo'
  | 'generic-offset'

export interface Option {
  text: string
  value: Rational
  correct: boolean
  source: DistractorSource | 'answer'
}

/** Which slot is blank. `'c'` is the ordinary `a op b = ?` form. */
export type MissingSlot = 'a' | 'b' | 'c'

/** What a kind generator produces, before identity, the missing-slot transform and options. */
export interface BaseQuestion {
  kind: Kind
  op: Op
  a: Rational
  b: Rational
  c: Rational
}

export interface QuestionDisplay {
  left: string
  op: string
  right: string
  result: string
}

export interface Question extends BaseQuestion {
  id: QuestionId
  missing: MissingSlot
  answer: Rational
  display: QuestionDisplay
  options: readonly Option[]
}

/** Where a deck of explicit ids came from. */
export type DeckOrigin = 'retry' | 'weakest' | 'single'

/**
 * What was asked. A seeded spec is rebuildable from its `RunId`; a deck is an arbitrary
 * ordered list that no seed reproduces, so it carries its ids verbatim and has no id.
 */
export type RunSpec =
  | { kind: 'seeded'; profileRef: string; mode: Mode; seed: number }
  | {
      kind: 'deck'
      profileRef: string
      mode: Mode
      questionIds: readonly QuestionId[]
      origin: DeckOrigin
    }

/**
 * One attempt. `attemptId` identifies *this* attempt and is minted by the UI, so two
 * attempts at the same seed are distinct rows in history while sharing a `runId`.
 */
export interface Run {
  attemptId: string
  spec: RunSpec
  /** Present only for seeded specs. */
  runId?: RunId
  profile: Profile
  questionIds: readonly QuestionId[]
}
