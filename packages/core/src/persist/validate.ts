/** Runtime checks for JSON at persistence boundaries; TypeScript casts cannot validate it. */
import { parseId, parseRunId } from '../identity/id.js'
import { isCustomRef, isPresetRef } from '../profile/canonical.js'
import { ALL_KINDS, type Profile } from '../profile/types.js'
import { validateProfile } from '../profile/validate.js'
import type { SessionState } from '../session/types.js'
import type { StoredRun } from './schema.js'

type Check = (value: unknown) => boolean
const object =
  (fields: Record<string, Check>): Check =>
  (value) =>
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    Object.entries(fields).every(([key, check]) => check((value as Record<string, unknown>)[key]))
const array =
  (check: Check): Check =>
  (value) =>
    Array.isArray(value) && value.every(check)
const optional =
  (check: Check): Check =>
  (value) =>
    value === undefined || check(value)
const nullable =
  (check: Check): Check =>
  (value) =>
    value === null || check(value)
const choice =
  (...values: unknown[]): Check =>
  (value) =>
    values.includes(value)
const text: Check = (value) => typeof value === 'string'
const nonempty: Check = (value) => text(value) && value !== ''
const boolean: Check = (value) => typeof value === 'boolean'
const finite: Check = (value) => typeof value === 'number' && Number.isFinite(value)
const integer: Check = (value) => Number.isSafeInteger(value)
const nonnegative: Check = (value) => finite(value) && (value as number) >= 0
const count: Check = (value) => integer(value) && (value as number) >= 0
const positive: Check = (value) => integer(value) && (value as number) > 0
const questionId: Check = (value) => !('error' in parseId(value as string))
const runId: Check = (value) => !('error' in parseRunId(value as string))
const ref: Check = (value) => typeof value === 'string' && (isPresetRef(value) || isCustomRef(value))
const mode = choice('typed', 'mcq')
const kind = choice(...ALL_KINDS)
const op = choice('+', '-', '×', '÷')
const endedBy = choice('time', 'completed', 'aborted')
const rational = object({ num: integer, den: positive })
const clocks = object({ mono: finite, wall: finite })
const profile: Check = (value) => {
  try {
    validateProfile(value as Profile)
    return true
  } catch {
    return false
  }
}

const spec: Check = (value) =>
  object({
    kind: choice('seeded'),
    profileRef: ref,
    mode,
    seed: (seed) => count(seed) && (seed as number) < 2 ** 32,
  })(value) ||
  object({
    kind: choice('deck'),
    profileRef: ref,
    mode,
    questionIds: array(questionId),
    origin: choice('retry', 'weakest', 'single'),
  })(value)
const answer = object({
  questionId,
  shownAt: finite,
  answeredAt: finite,
  elapsedMs: nonnegative,
  raw: text,
  value: nullable(rational),
  correct: boolean,
  skipped: boolean,
  optionIndex: optional(choice(0, 1, 2, 3)),
  source: optional(nonempty),
})
const summary = object({
  questionCount: count,
  answered: count,
  correct: count,
  wrong: count,
  skipped: count,
  score: finite,
  accuracy: nullable((value) => nonnegative(value) && (value as number) <= 1),
  totalMs: nonnegative,
  hiddenMs: nonnegative,
  meanMsPerQuestion: nullable(nonnegative),
  medianMsPerQuestion: nullable(nonnegative),
  byKind: array(
    object({
      kind,
      answered: count,
      correct: count,
      wrong: count,
      skipped: count,
      meanMs: nullable(nonnegative),
    }),
  ),
  byOp: array(object({ op, answered: count, correct: count, meanMs: nullable(nonnegative) })),
  slowest: array(object({ questionId, elapsedMs: nonnegative })),
  distractorSources: array(object({ source: nonempty, count })),
  endedBy,
  passed: nullable(boolean),
})
const stored = object({
  schemaVersion: choice(1),
  attemptId: nonempty,
  runId: optional(runId),
  spec,
  startedAt: (value) => finite(value) && Math.abs(value as number) <= 8.64e15,
  practice: boolean,
  questionIds: array(questionId),
  answers: array(answer),
  summary,
})

export function isStoredRun(value: unknown): value is StoredRun {
  return stored(value)
}

const run = object({
  attemptId: nonempty,
  runId: optional(runId),
  spec,
  profile,
  questionIds: array(questionId),
})
const questions = array(
  object({
    id: questionId,
    kind,
    op,
    a: rational,
    b: rational,
    c: rational,
    answer: rational,
    missing: choice('a', 'b', 'c'),
    display: object({ left: text, right: text, op: text, result: text }),
    options: array(object({ text, value: rational, correct: boolean, source: nonempty })),
  }),
)
const countdown = object({ phase: choice('countdown'), run, questions, startsAt: finite })
const running = object({
  phase: choice('running'),
  run,
  questions,
  deadline: optional(clocks),
  startedAt: finite,
  index: count,
  questionShownAt: finite,
  answers: array(answer),
  hiddenMs: nonnegative,
  hiddenSince: optional(finite),
})
const finished = object({
  phase: choice('finished'),
  run,
  questions,
  answers: array(answer),
  endedBy,
  summary,
})

export function isSessionState(value: unknown): value is SessionState {
  return object({ phase: choice('idle') })(value) || countdown(value) || running(value) || finished(value)
}
