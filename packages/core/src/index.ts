/**
 * @80in8/core — the whole trainer, minus the screen.
 *
 * Exact arithmetic, seeded question generation, stable question identity, answer
 * parsing, scoring and the session state machine. Pure and dependency-free: no DOM,
 * no timers, no storage, no network.
 */

export { type AnswerVerdict, checkAnswer, isAutoSubmitMatch } from './answer/check.js'
export {
  type AnswerForm,
  formatCanonical,
  MAX_SIGNIFICANT_DIGITS,
  type ParseError,
  type ParseResult,
  parseAnswer,
} from './answer/parse.js'
export { buildOptions, OPTION_COUNT } from './distract/build.js'
export { BLANK, type Family, familyOf, formatValue, opGlyph } from './generate/display.js'
export { fallbackCount, MAX_DRAW_ATTEMPTS, resetFallbackCounts } from './generate/fallback.js'
export { GENERATORS, type KindGenerator } from './generate/kinds.js'
export { answerFor, pickMissingSlot } from './generate/missing.js'
export {
  drawQuestionIds,
  generateRun,
  generateRunFromIds,
  materialise,
  refFor,
  runFromId,
} from './generate/run.js'
export type {
  BaseQuestion,
  DeckOrigin,
  DistractorSource,
  MissingSlot,
  Option,
  Question,
  QuestionDisplay,
  QuestionId,
  Run,
  RunId,
  RunSpec,
} from './generate/types.js'
export {
  ID_PATTERN,
  ID_VERSION,
  type IdError,
  kindSlug,
  type ParsedQuestionId,
  type ParsedRunId,
  parseId,
  parseRunId,
  toId,
  toRunId,
} from './identity/id.js'
export {
  isResolveFailure,
  type ProfileResolver,
  profileMatchesRef,
  questionFromId,
  questionFromIdOrThrow,
  type ResolveError,
  type ResolveFailure,
} from './identity/resolve.js'
export {
  DEFAULT_SETTINGS,
  type ExportFile,
  MigrationError,
  mergeRuns,
  migrate,
  readSettings,
  SCHEMA_VERSION,
  type Settings,
  type StoredRun,
} from './persist/schema.js'
export { isSessionState, isStoredRun } from './persist/validate.js'
export { canonicalJson, hash8, isCustomRef, isPresetRef, profileRefOf } from './profile/canonical.js'
export {
  CURRENT_PRESETS,
  EXTENDED_TIME_FACTOR,
  PRESETS,
  type PracticeMode,
  type PresetId,
  practiceVariant,
  presetRefs,
  resolvePreset,
} from './profile/presets.js'
export {
  ALL_KINDS,
  type DecimalRanges,
  type FractionRanges,
  type IntegerRanges,
  type Kind,
  type Mode,
  type Op,
  type Profile,
  type ScoringRule,
  type TimeLimit,
  type WeightedKind,
} from './profile/types.js'
export { ProfileError, validateProfile } from './profile/validate.js'
export {
  MAX_DECIMAL_SCALE,
  MAX_EXACT_MAGNITUDE,
  MINUS,
  ONE,
  R,
  type Rational,
  RationalRangeError,
  ZERO,
} from './rational/rational.js'
export { deriveSeed, type Rng, rand, splitmix32 } from './rng/rng.js'
export {
  activeQuestion,
  initialState,
  liveScore,
  missedQuestionIds,
  reduce,
  remainingMs,
} from './session/reducer.js'
export type {
  Answer,
  Clocks,
  Deadline,
  EndReason,
  KindBreakdown,
  OpBreakdown,
  RunSummary,
  SessionEvent,
  SessionState,
  SlowQuestion,
  SourceCount,
} from './session/types.js'
export {
  accuracyByKind,
  graded,
  type HistoryEntry,
  type KindAccuracy,
  type ProfileStats,
  practiceStreak,
  statsByProfile,
  type TrendPoint,
  trend,
  weakestKinds,
} from './stats/history.js'
export {
  type AnsweredRun,
  type QuestionStat,
  questionStats,
  type RetryDeckOptions,
  retryDeck,
} from './stats/questions.js'
export { kindOfAnswer, SLOWEST_COUNT, scoreOf, summariseRun } from './stats/summary.js'
