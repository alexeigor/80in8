import { describe, expect, it } from 'vitest'
import { toId } from '../identity/id.js'
import type { Answer } from '../session/types.js'
import { type AnsweredRun, questionStats, retryDeck } from './questions.js'

function answer(seed: number, correct: boolean, elapsedMs = 1000): Answer {
  return {
    questionId: toId({ profileRef: 'optiver-classic@1', kind: 'int.add', seed }),
    shownAt: 0,
    answeredAt: elapsedMs,
    elapsedMs,
    raw: '1',
    value: null,
    correct,
    skipped: false,
  }
}

const id = (seed: number) => toId({ profileRef: 'optiver-classic@1', kind: 'int.add', seed })

describe('questionStats', () => {
  it('aggregates attempts, misses and mean time per question', () => {
    const runs: AnsweredRun[] = [
      { startedAt: 100, answers: [answer(1, false, 2000), answer(2, true, 1000)] },
      { startedAt: 200, answers: [answer(1, true, 4000)] },
    ]
    const stats = questionStats(runs)
    const first = stats.find((s) => s.questionId === id(1))
    expect(first).toMatchObject({ attempts: 2, misses: 1, meanMs: 3000, lastSeenAt: 200, kind: 'int.add' })
    expect(stats.find((s) => s.questionId === id(2))).toMatchObject({ attempts: 1, misses: 0 })
  })

  it('orders by most recently seen', () => {
    const runs: AnsweredRun[] = [
      { startedAt: 100, answers: [answer(1, true)] },
      { startedAt: 300, answers: [answer(2, true)] },
      { startedAt: 200, answers: [answer(3, true)] },
    ]
    expect(questionStats(runs).map((s) => s.questionId)).toEqual([id(2), id(3), id(1)])
  })

  it('reports a null kind for an unreadable id', () => {
    const broken: Answer = { ...answer(1, true), questionId: 'rubbish' }
    expect(questionStats([{ startedAt: 1, answers: [broken] }])[0]?.kind).toBeNull()
  })

  it('returns nothing for no runs', () => {
    expect(questionStats([])).toEqual([])
  })
})

describe('retryDeck', () => {
  const runs: AnsweredRun[] = [
    {
      startedAt: 100,
      answers: [answer(1, false, 1000), answer(2, false, 1000), answer(3, true, 9000), answer(4, true, 100)],
    },
    { startedAt: 200, answers: [answer(1, false, 1000)] },
  ]

  it('puts the most-missed questions first', () => {
    expect(retryDeck(runs, { size: 2 })).toEqual([id(1), id(2)])
  })

  it('pads with the slowest questions once the misses run out', () => {
    expect(retryDeck(runs, { size: 4 })).toEqual([id(1), id(2), id(3), id(4)])
  })

  it('can rank purely by slowness instead', () => {
    expect(retryDeck(runs, { size: 2, prefer: 'slow' })).toEqual([id(3), id(1)])
  })

  it('returns fewer than asked when history is thin', () => {
    expect(retryDeck(runs, { size: 99 })).toHaveLength(4)
    expect(retryDeck([], { size: 10 })).toEqual([])
  })

  it('never repeats a question', () => {
    expect(new Set(retryDeck(runs, { size: 99 })).size).toBe(4)
  })
})

describe('stable ordering when values tie', () => {
  it('breaks a last-seen tie by question id', () => {
    const runs: AnsweredRun[] = [{ startedAt: 100, answers: [answer(9, true), answer(2, true)] }]
    const stats = questionStats(runs)
    expect(stats.map((s) => s.questionId)).toEqual([id(2), id(9)])
  })

  it('breaks a miss-count tie by recency', () => {
    const runs: AnsweredRun[] = [
      { startedAt: 100, answers: [answer(1, false)] },
      { startedAt: 300, answers: [answer(2, false)] },
    ]
    expect(retryDeck(runs, { size: 2 })).toEqual([id(2), id(1)])
  })
})
