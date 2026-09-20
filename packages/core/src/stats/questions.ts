/**
 * Per-question statistics and retry decks (DESIGN.md §6.10, F13).
 *
 * Because a question id regenerates the question, history only ever stores ids. That
 * makes "the eighty you keep getting wrong" a list of strings.
 */

import type { QuestionId } from '../generate/types.js'
import { parseId } from '../identity/id.js'
import type { Kind } from '../profile/types.js'
import type { Answer } from '../session/types.js'

export interface QuestionStat {
  questionId: QuestionId
  kind: Kind | null
  attempts: number
  misses: number
  meanMs: number
  lastSeenAt: number
}

export interface AnsweredRun {
  startedAt: number
  answers: readonly Answer[]
}

export function questionStats(runs: readonly AnsweredRun[]): QuestionStat[] {
  const buckets = new Map<QuestionId, { attempts: number; misses: number; totalMs: number; last: number }>()
  for (const run of runs) {
    for (const answer of run.answers) {
      const current = buckets.get(answer.questionId) ?? { attempts: 0, misses: 0, totalMs: 0, last: 0 }
      current.attempts += 1
      if (!answer.correct) current.misses += 1
      current.totalMs += answer.elapsedMs
      current.last = Math.max(current.last, run.startedAt)
      buckets.set(answer.questionId, current)
    }
  }
  return [...buckets.entries()]
    .map(([questionId, value]) => {
      const parsed = parseId(questionId)
      return {
        questionId,
        kind: 'error' in parsed ? null : parsed.kind,
        attempts: value.attempts,
        misses: value.misses,
        meanMs: value.totalMs / value.attempts,
        lastSeenAt: value.last,
      }
    })
    .sort((a, b) => b.lastSeenAt - a.lastSeenAt || (a.questionId < b.questionId ? -1 : 1))
}

export interface RetryDeckOptions {
  size: number
  /** Missed questions first, or the slowest ones first. */
  prefer?: 'missed' | 'slow'
}

/**
 * Build a deck of question ids worth revisiting: most recently missed first, then the
 * slowest, then anything else seen. Returns fewer than `size` when history is thin;
 * the caller decides whether to pad it with fresh questions.
 */
export function retryDeck(runs: readonly AnsweredRun[], options: RetryDeckOptions): QuestionId[] {
  const stats = questionStats(runs)
  const prefer = options.prefer ?? 'missed'

  const missed = stats.filter((stat) => stat.misses > 0)
  const rest = stats.filter((stat) => stat.misses === 0)

  const byRecency = (a: QuestionStat, b: QuestionStat) => b.lastSeenAt - a.lastSeenAt
  const bySlowness = (a: QuestionStat, b: QuestionStat) => b.meanMs - a.meanMs

  const ordered =
    prefer === 'slow'
      ? [...stats].sort(bySlowness)
      : [...missed.sort((a, b) => b.misses - a.misses || byRecency(a, b)), ...rest.sort(bySlowness)]

  // `questionStats` keys by question id, so the ordering above is already unique.
  return ordered.slice(0, options.size).map((stat) => stat.questionId)
}
