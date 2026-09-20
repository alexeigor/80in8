/**
 * Statistics across runs (DESIGN.md §6.10).
 *
 * Pure functions over stored runs. Nothing here reads the clock: "today" is passed in,
 * so streaks are testable and time zones stay the caller's problem.
 */
import type { Kind, Mode } from '../profile/types.js'
import type { RunSummary } from '../session/types.js'

export interface HistoryEntry {
  attemptId: string
  startedAt: number
  profileRef: string
  mode: Mode
  practice: boolean
  summary: RunSummary
}

export interface ProfileStats {
  profileRef: string
  mode: Mode
  runs: number
  bestScore: number
  meanScore: number
  bestAccuracy: number | null
}

export interface TrendPoint {
  startedAt: number
  score: number
  accuracy: number | null
}

export interface KindAccuracy {
  kind: Kind
  answered: number
  correct: number
  accuracy: number | null
  meanMs: number | null
}

/** Only graded runs count towards records; practice runs are tracked but kept separate. */
export function graded(entries: readonly HistoryEntry[]): HistoryEntry[] {
  return entries.filter((entry) => !entry.practice)
}

export function statsByProfile(entries: readonly HistoryEntry[]): ProfileStats[] {
  const buckets = new Map<string, HistoryEntry[]>()
  for (const entry of graded(entries)) {
    const key = `${entry.profileRef}|${entry.mode}`
    const bucket = buckets.get(key)
    if (bucket) bucket.push(entry)
    else buckets.set(key, [entry])
  }
  return [...buckets.values()]
    .map((bucket) => {
      const scores = bucket.map((e) => e.summary.score)
      const accuracies = bucket
        .map((e) => e.summary.accuracy)
        .filter((value): value is number => value !== null)
      const first = bucket[0] as HistoryEntry
      return {
        profileRef: first.profileRef,
        mode: first.mode,
        runs: bucket.length,
        bestScore: Math.max(...scores),
        meanScore: scores.reduce((sum, value) => sum + value, 0) / scores.length,
        bestAccuracy: accuracies.length === 0 ? null : Math.max(...accuracies),
      }
    })
    .sort((a, b) => (`${a.profileRef}|${a.mode}` < `${b.profileRef}|${b.mode}` ? -1 : 1))
}

export function trend(entries: readonly HistoryEntry[], profileRef?: string, mode?: Mode): TrendPoint[] {
  return graded(entries)
    .filter((entry) => (profileRef ? entry.profileRef === profileRef : true))
    .filter((entry) => (mode ? entry.mode === mode : true))
    .sort((a, b) => a.startedAt - b.startedAt)
    .map((entry) => ({
      startedAt: entry.startedAt,
      score: entry.summary.score,
      accuracy: entry.summary.accuracy,
    }))
}

/** Accuracy per question kind over the most recent `limit` runs. */
export function accuracyByKind(entries: readonly HistoryEntry[], limit = 20): KindAccuracy[] {
  const recent = [...entries].sort((a, b) => b.startedAt - a.startedAt).slice(0, limit)
  const totals = new Map<Kind, { answered: number; correct: number; totalMs: number }>()
  for (const entry of recent) {
    for (const row of entry.summary.byKind) {
      const current = totals.get(row.kind) ?? { answered: 0, correct: 0, totalMs: 0 }
      current.answered += row.answered
      current.correct += row.correct
      current.totalMs += (row.meanMs ?? 0) * row.answered
      totals.set(row.kind, current)
    }
  }
  return [...totals.entries()]
    .map(([kind, value]) => ({
      kind,
      answered: value.answered,
      correct: value.correct,
      accuracy: value.answered === 0 ? null : value.correct / value.answered,
      meanMs: value.answered === 0 ? null : value.totalMs / value.answered,
    }))
    .sort((a, b) => (a.kind < b.kind ? -1 : 1))
}

/**
 * Kinds ordered worst first.
 *
 * A category is only a weakness if something has actually gone wrong in it, so those
 * answered perfectly are left out entirely rather than ranked last. Categories with
 * too few attempts to mean anything are excluded as well.
 */
export function weakestKinds(entries: readonly HistoryEntry[], minAnswered = 5, limit = 20): KindAccuracy[] {
  return accuracyByKind(entries, limit)
    .filter((row) => row.answered >= minAnswered && row.accuracy !== null && row.accuracy < 1)
    .sort((a, b) => (a.accuracy as number) - (b.accuracy as number))
}

const DAY_MS = 86_400_000

function dayNumber(epochMs: number, timeZoneOffsetMinutes: number): number {
  return Math.floor((epochMs - timeZoneOffsetMinutes * 60_000) / DAY_MS)
}

/**
 * Consecutive days with at least one run, counting back from `today`.
 * The caller supplies "today" and the UTC offset so the result is deterministic.
 */
export function practiceStreak(
  entries: readonly HistoryEntry[],
  today: number,
  timeZoneOffsetMinutes = 0,
): number {
  const days = new Set(entries.map((entry) => dayNumber(entry.startedAt, timeZoneOffsetMinutes)))
  let cursor = dayNumber(today, timeZoneOffsetMinutes)
  if (!days.has(cursor)) {
    // A streak survives until the end of the following day.
    cursor -= 1
    if (!days.has(cursor)) return 0
  }
  let streak = 0
  while (days.has(cursor)) {
    streak += 1
    cursor -= 1
  }
  return streak
}
