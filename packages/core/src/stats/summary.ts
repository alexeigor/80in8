/**
 * Per-run statistics (DESIGN.md §6.10).
 *
 * Pure folds over the answer list. A run's questions are recovered from their ids, so
 * a breakdown by kind never needs the question bodies to have been stored.
 */

import type { DistractorSource } from '../generate/types.js'
import { parseId } from '../identity/id.js'
import type { Kind, Op, Profile } from '../profile/types.js'
import type {
  Answer,
  EndReason,
  KindBreakdown,
  OpBreakdown,
  RunSummary,
  SlowQuestion,
  SourceCount,
} from '../session/types.js'

/** Slowest questions listed on the results screen. */
export const SLOWEST_COUNT = 5

const OP_BY_KIND: Readonly<Record<string, Op>> = {
  add: '+',
  sub: '-',
  mul: '×',
  div: '÷',
}

export function kindOfAnswer(answer: Answer): Kind | null {
  const parsed = parseId(answer.questionId)
  return 'error' in parsed ? null : parsed.kind
}

function opOfKind(kind: Kind): Op {
  return OP_BY_KIND[kind.slice(kind.indexOf('.') + 1)] as Op
}

function mean(values: readonly number[]): number | null {
  if (values.length === 0) return null
  let total = 0
  for (const value of values) total += value
  return total / values.length
}

function median(values: readonly number[]): number | null {
  if (values.length === 0) return null
  const sorted = [...values].sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)
  if (sorted.length % 2 === 1) return sorted[middle] as number
  return ((sorted[middle - 1] as number) + (sorted[middle] as number)) / 2
}

export function scoreOf(answers: readonly Answer[], profile: Profile): number {
  let score = 0
  for (const answer of answers) {
    if (answer.skipped) score += profile.scoring.skipped
    else if (answer.correct) score += profile.scoring.correct
    else score += profile.scoring.wrong
  }
  return score
}

export function summariseRun(
  answers: readonly Answer[],
  profile: Profile,
  options: { endedBy: EndReason; totalMs: number; hiddenMs: number },
): RunSummary {
  const correct = answers.filter((a) => a.correct).length
  const skipped = answers.filter((a) => a.skipped).length
  const wrong = answers.length - correct - skipped
  const attempted = correct + wrong
  const elapsed = answers.map((a) => a.elapsedMs)

  const kindBuckets = new Map<Kind, Answer[]>()
  const opBuckets = new Map<Op, Answer[]>()
  for (const answer of answers) {
    const kind = kindOfAnswer(answer)
    if (kind === null) continue
    const kindBucket = kindBuckets.get(kind)
    if (kindBucket) kindBucket.push(answer)
    else kindBuckets.set(kind, [answer])
    const op = opOfKind(kind)
    const opBucket = opBuckets.get(op)
    if (opBucket) opBucket.push(answer)
    else opBuckets.set(op, [answer])
  }

  const byKind: KindBreakdown[] = [...kindBuckets.entries()]
    .map(([kind, bucket]) => ({
      kind,
      answered: bucket.length,
      correct: bucket.filter((a) => a.correct).length,
      wrong: bucket.filter((a) => !a.correct && !a.skipped).length,
      skipped: bucket.filter((a) => a.skipped).length,
      meanMs: mean(bucket.map((a) => a.elapsedMs)),
    }))
    .sort((a, b) => (a.kind < b.kind ? -1 : 1))

  const byOp: OpBreakdown[] = [...opBuckets.entries()]
    .map(([op, bucket]) => ({
      op,
      answered: bucket.length,
      correct: bucket.filter((a) => a.correct).length,
      meanMs: mean(bucket.map((a) => a.elapsedMs)),
    }))
    .sort((a, b) => (a.op < b.op ? -1 : 1))

  const slowest: SlowQuestion[] = [...answers]
    .sort((a, b) => b.elapsedMs - a.elapsedMs || (a.questionId < b.questionId ? -1 : 1))
    .slice(0, SLOWEST_COUNT)
    .map((a) => ({ questionId: a.questionId, elapsedMs: a.elapsedMs }))

  const sourceCounts = new Map<DistractorSource, number>()
  for (const answer of answers) {
    // Correct picks carry the source 'answer', which is not a mistake to report.
    if (!answer.source || answer.correct || answer.source === 'answer') continue
    sourceCounts.set(answer.source, (sourceCounts.get(answer.source) ?? 0) + 1)
  }
  const distractorSources: SourceCount[] = [...sourceCounts.entries()]
    .map(([source, count]) => ({ source, count }))
    .sort((a, b) => b.count - a.count || (a.source < b.source ? -1 : 1))

  const score = scoreOf(answers, profile)

  return {
    questionCount: profile.questionCount,
    answered: answers.length,
    correct,
    wrong,
    skipped,
    score,
    accuracy: attempted === 0 ? null : correct / attempted,
    totalMs: options.totalMs,
    hiddenMs: options.hiddenMs,
    meanMsPerQuestion: mean(elapsed),
    medianMsPerQuestion: median(elapsed),
    byKind,
    byOp,
    slowest,
    distractorSources,
    endedBy: options.endedBy,
    passed: profile.passScore === undefined ? null : score >= profile.passScore,
  }
}
