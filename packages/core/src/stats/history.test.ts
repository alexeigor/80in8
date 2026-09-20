import { describe, expect, it } from 'vitest'
import { toId } from '../identity/id.js'
import { PRESETS } from '../profile/presets.js'
import type { Answer, RunSummary } from '../session/types.js'
import {
  accuracyByKind,
  graded,
  type HistoryEntry,
  practiceStreak,
  statsByProfile,
  trend,
  weakestKinds,
} from './history.js'
import { summariseRun } from './summary.js'

const profile = PRESETS['optiver-classic']
const DAY = 86_400_000

function answers(kind: Parameters<typeof toId>[0]['kind'], correct: number, wrong: number): Answer[] {
  const make = (ok: boolean, i: number): Answer => ({
    questionId: toId({ profileRef: 'optiver-classic@1', kind, seed: i }),
    shownAt: 0,
    answeredAt: 1000,
    elapsedMs: 1000,
    raw: '1',
    value: null,
    correct: ok,
    skipped: false,
  })
  return [
    ...Array.from({ length: correct }, (_, i) => make(true, i)),
    ...Array.from({ length: wrong }, (_, i) => make(false, 100 + i)),
  ]
}

function entry(patch: Partial<HistoryEntry> & { summary?: RunSummary }): HistoryEntry {
  return {
    attemptId: `a${Math.random()}`,
    startedAt: 0,
    profileRef: 'optiver-classic@1',
    mode: 'typed',
    practice: false,
    summary: summariseRun(answers('int.add', 3, 1), profile, {
      endedBy: 'completed',
      totalMs: 1000,
      hiddenMs: 0,
    }),
    ...patch,
  }
}

describe('graded', () => {
  it('keeps practice runs out of the records', () => {
    const entries = [entry({}), entry({ practice: true })]
    expect(graded(entries)).toHaveLength(1)
  })
})

describe('statsByProfile', () => {
  it('summarises best and mean score per profile and mode', () => {
    const entries = [
      entry({
        summary: summariseRun(answers('int.add', 5, 0), profile, {
          endedBy: 'completed',
          totalMs: 1,
          hiddenMs: 0,
        }),
      }),
      entry({
        summary: summariseRun(answers('int.add', 1, 0), profile, {
          endedBy: 'completed',
          totalMs: 1,
          hiddenMs: 0,
        }),
      }),
      entry({ mode: 'mcq' }),
      entry({ practice: true }),
    ]
    const stats = statsByProfile(entries)
    expect(stats).toHaveLength(2)
    const typed = stats.find((s) => s.mode === 'typed')
    expect(typed).toMatchObject({ runs: 2, bestScore: 5, meanScore: 3 })
    expect(typed?.bestAccuracy).toBe(1)
  })

  it('handles runs with no accuracy to report', () => {
    const empty = summariseRun([], profile, { endedBy: 'aborted', totalMs: 0, hiddenMs: 0 })
    expect(statsByProfile([entry({ summary: empty })])[0]?.bestAccuracy).toBeNull()
  })

  it('sorts by profile then mode', () => {
    const stats = statsByProfile([
      entry({ profileRef: 'hard@1', mode: 'typed' }),
      entry({ profileRef: 'optiver-classic@1', mode: 'typed' }),
      entry({ profileRef: 'hard@1', mode: 'mcq' }),
    ])
    expect(stats.map((s) => `${s.profileRef}/${s.mode}`)).toEqual([
      'hard@1/mcq',
      'hard@1/typed',
      'optiver-classic@1/typed',
    ])
  })

  it('returns nothing for an empty history', () => {
    expect(statsByProfile([])).toEqual([])
  })
})

describe('trend', () => {
  it('orders points by time and can filter', () => {
    const entries = [
      entry({ startedAt: 300 }),
      entry({ startedAt: 100 }),
      entry({ startedAt: 200, mode: 'mcq' }),
      entry({ startedAt: 400, profileRef: 'hard@1' }),
      entry({ startedAt: 500, practice: true }),
    ]
    expect(trend(entries).map((p) => p.startedAt)).toEqual([100, 200, 300, 400])
    expect(trend(entries, 'optiver-classic@1').map((p) => p.startedAt)).toEqual([100, 200, 300])
    expect(trend(entries, 'optiver-classic@1', 'typed').map((p) => p.startedAt)).toEqual([100, 300])
    expect(trend(entries, undefined, 'mcq').map((p) => p.startedAt)).toEqual([200])
  })
})

describe('accuracyByKind', () => {
  it('aggregates across recent runs', () => {
    const entries = [
      entry({
        startedAt: 2,
        summary: summariseRun(answers('int.add', 3, 1), profile, {
          endedBy: 'completed',
          totalMs: 1,
          hiddenMs: 0,
        }),
      }),
      entry({
        startedAt: 1,
        summary: summariseRun(answers('int.mul', 1, 3), profile, {
          endedBy: 'completed',
          totalMs: 1,
          hiddenMs: 0,
        }),
      }),
    ]
    const rows = accuracyByKind(entries)
    expect(rows.map((r) => r.kind)).toEqual(['int.add', 'int.mul'])
    expect(rows.find((r) => r.kind === 'int.add')?.accuracy).toBe(0.75)
    expect(rows.find((r) => r.kind === 'int.mul')?.accuracy).toBe(0.25)
    expect(rows[0]?.meanMs).toBe(1000)
  })

  it('honours the recency limit', () => {
    const entries = [
      entry({
        startedAt: 2,
        summary: summariseRun(answers('int.add', 1, 0), profile, {
          endedBy: 'completed',
          totalMs: 1,
          hiddenMs: 0,
        }),
      }),
      entry({
        startedAt: 1,
        summary: summariseRun(answers('int.mul', 1, 0), profile, {
          endedBy: 'completed',
          totalMs: 1,
          hiddenMs: 0,
        }),
      }),
    ]
    expect(accuracyByKind(entries, 1).map((r) => r.kind)).toEqual(['int.add'])
  })

  it('handles a kind with nothing answered', () => {
    const summary = summariseRun([], profile, { endedBy: 'aborted', totalMs: 0, hiddenMs: 0 })
    summary.byKind = [{ kind: 'int.add', answered: 0, correct: 0, wrong: 0, skipped: 0, meanMs: null }]
    const rows = accuracyByKind([entry({ summary })])
    expect(rows[0]).toMatchObject({ accuracy: null, meanMs: null })
  })
})

describe('weakestKinds', () => {
  it('says nothing is weak when nothing has gone wrong', () => {
    // A category answered perfectly is not a weakness, however often it came up.
    const perfect = [
      entry({
        summary: summariseRun(answers('int.add', 10, 0), profile, {
          endedBy: 'completed',
          totalMs: 1,
          hiddenMs: 0,
        }),
      }),
    ]
    expect(accuracyByKind(perfect)[0]?.accuracy).toBe(1)
    expect(weakestKinds(perfect)).toEqual([])
  })

  it('ranks the worst first, ignoring thin samples', () => {
    const entries = [
      entry({
        summary: summariseRun(answers('int.add', 1, 5), profile, {
          endedBy: 'completed',
          totalMs: 1,
          hiddenMs: 0,
        }),
      }),
      entry({
        summary: summariseRun(answers('int.mul', 5, 1), profile, {
          endedBy: 'completed',
          totalMs: 1,
          hiddenMs: 0,
        }),
      }),
      entry({
        summary: summariseRun(answers('frac.add', 0, 1), profile, {
          endedBy: 'completed',
          totalMs: 1,
          hiddenMs: 0,
        }),
      }),
    ]
    expect(weakestKinds(entries).map((r) => r.kind)).toEqual(['int.add', 'int.mul'])
  })
})

describe('practiceStreak', () => {
  const today = 10 * DAY

  it('counts consecutive days ending today', () => {
    const entries = [
      entry({ startedAt: today }),
      entry({ startedAt: today - DAY }),
      entry({ startedAt: today - 2 * DAY }),
      entry({ startedAt: today - 5 * DAY }),
    ]
    expect(practiceStreak(entries, today)).toBe(3)
  })

  it('survives until the end of the following day', () => {
    expect(practiceStreak([entry({ startedAt: today - DAY })], today)).toBe(1)
  })

  it('is zero when nothing was practised recently', () => {
    expect(practiceStreak([entry({ startedAt: today - 5 * DAY })], today)).toBe(0)
    expect(practiceStreak([], today)).toBe(0)
  })

  it("respects the caller's time zone", () => {
    // 23:00 UTC is already the next day in a +120 minute zone.
    const lateUtc = 10 * DAY + 23 * 3_600_000
    expect(practiceStreak([entry({ startedAt: lateUtc })], lateUtc, 0)).toBe(1)
    expect(practiceStreak([entry({ startedAt: lateUtc })], lateUtc, -120)).toBe(1)
  })
})

describe('stable ordering', () => {
  it('sorts profiles both ways round', () => {
    const ascending = statsByProfile([entry({ profileRef: 'aaa@1' }), entry({ profileRef: 'zzz@1' })])
    expect(ascending.map((s) => s.profileRef)).toEqual(['aaa@1', 'zzz@1'])
    const descending = statsByProfile([entry({ profileRef: 'zzz@1' }), entry({ profileRef: 'aaa@1' })])
    expect(descending.map((s) => s.profileRef)).toEqual(['aaa@1', 'zzz@1'])
  })

  it('sorts modes both ways round within a profile', () => {
    const rows = statsByProfile([
      entry({ profileRef: 'mmm@1', mode: 'typed' }),
      entry({ profileRef: 'mmm@1', mode: 'mcq' }),
      entry({ profileRef: 'aaa@1', mode: 'typed' }),
      entry({ profileRef: 'zzz@1', mode: 'mcq' }),
      entry({ profileRef: 'aaa@1', mode: 'mcq' }),
    ])
    expect(rows.map((s) => `${s.profileRef}/${s.mode}`)).toEqual([
      'aaa@1/mcq',
      'aaa@1/typed',
      'mmm@1/mcq',
      'mmm@1/typed',
      'zzz@1/mcq',
    ])
  })
})
