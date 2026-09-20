import { fc, test as propTest } from '@fast-check/vitest'
import { describe, expect, it } from 'vitest'
import { parseId, toRunId } from '../identity/id.js'
import { isResolveFailure } from '../identity/resolve.js'
import { PRESETS, resolvePreset } from '../profile/presets.js'
import type { Profile } from '../profile/types.js'
import { drawQuestionIds, generateRun, generateRunFromIds, materialise, refFor, runFromId } from './run.js'

const classic = PRESETS['optiver-classic']
const seedArb = fc.integer({ min: 0, max: 0xffffffff })

describe('refFor', () => {
  it('names built-in and custom profiles differently', () => {
    expect(refFor(classic, true)).toBe('optiver-classic@1')
    expect(refFor(classic, false)).toMatch(/^custom-/)
  })
})

describe('drawQuestionIds', () => {
  propTest.prop([seedArb])('draws exactly the configured number of unique ids', (seed) => {
    const ids = drawQuestionIds(seed, classic, 'optiver-classic@1')
    expect(ids).toHaveLength(classic.questionCount)
    expect(new Set(ids).size).toBe(classic.questionCount)
  })

  propTest.prop([seedArb])('is deterministic', (seed) => {
    expect(drawQuestionIds(seed, classic, 'optiver-classic@1')).toEqual(
      drawQuestionIds(seed, classic, 'optiver-classic@1'),
    )
  })

  it('only draws kinds the profile actually mixes', () => {
    const allowed = new Set(classic.mix.map((entry) => entry.kind))
    for (const id of drawQuestionIds(99, classic, 'optiver-classic@1')) {
      const parsed = parseId(id)
      expect('error' in parsed).toBe(false)
      if (!('error' in parsed)) expect(allowed.has(parsed.kind)).toBe(true)
    }
  })

  it('matches the configured mix within three percentage points', () => {
    const counts = new Map<string, number>()
    const runs = 60
    for (let seed = 0; seed < runs; seed++) {
      for (const id of drawQuestionIds(seed, classic, 'optiver-classic@1')) {
        const parsed = parseId(id)
        if ('error' in parsed) continue
        counts.set(parsed.kind, (counts.get(parsed.kind) ?? 0) + 1)
      }
    }
    const total = runs * classic.questionCount
    const weightTotal = classic.mix.reduce((sum, entry) => sum + entry.weight, 0)
    for (const entry of classic.mix) {
      const observed = (counts.get(entry.kind) ?? 0) / total
      expect(Math.abs(observed - entry.weight / weightTotal)).toBeLessThan(0.03)
    }
  })

  it('redraws on a collision, and gives up rather than hanging', () => {
    // A stream stuck on one value makes every draw identical, which is the collision
    // case the budget guard exists for.
    const stuck = () => 0
    const tiny: Profile = { ...classic, questionCount: 3 }
    const ids = drawQuestionIds(1, tiny, 'optiver-classic@1', stuck)
    expect(ids).toHaveLength(3)
    // Past the redraw budget duplicates are accepted, because hanging would be worse.
    expect(new Set(ids).size).toBe(1)
  })

  it('still terminates if the id space is exhausted', () => {
    // A single kind and a tiny question count is fine; the budget guard only matters
    // when collisions are forced, which we approximate with a very large count.
    const many: Profile = { ...classic, questionCount: 2000 }
    expect(drawQuestionIds(1, many, 'optiver-classic@1')).toHaveLength(2000)
  })
})

describe('generateRun', () => {
  it('produces a seeded spec with a run id', () => {
    const run = generateRun('attempt-a', 42, classic, 'mcq')
    expect(run.spec).toEqual({ kind: 'seeded', profileRef: 'optiver-classic@1', mode: 'mcq', seed: 42 })
    expect(run.runId).toBe(toRunId({ profileRef: 'optiver-classic@1', mode: 'mcq', seed: 42 }))
    expect(run.questionIds).toHaveLength(80)
  })

  it('gives two attempts at the same seed the same questions but different attempt ids', () => {
    const first = generateRun('attempt-a', 7, classic, 'typed')
    const second = generateRun('attempt-b', 7, classic, 'typed')
    expect(second.questionIds).toEqual(first.questionIds)
    expect(second.runId).toBe(first.runId)
    expect(second.attemptId).not.toBe(first.attemptId)
  })

  it('uses a custom reference when the profile is not built in', () => {
    const run = generateRun('attempt-a', 1, classic, 'typed', false)
    expect(run.spec.profileRef).toMatch(/^custom-/)
  })
})

describe('generateRunFromIds', () => {
  it('carries its ids verbatim and has no run id', () => {
    const ids = ['1.optiver-classic@1.int-add.0000001', '1.optiver-classic@1.int-mul.0000002']
    const run = generateRunFromIds('attempt-a', ids, classic, 'typed', 'retry')
    expect(run.questionIds).toEqual(ids)
    expect(run.runId).toBeUndefined()
    expect('runId' in run).toBe(false)
    expect(run.spec).toEqual({
      kind: 'deck',
      profileRef: 'optiver-classic@1',
      mode: 'typed',
      questionIds: ids,
      origin: 'retry',
    })
  })

  it('copies the id list so later mutation cannot corrupt the run', () => {
    const ids = ['1.optiver-classic@1.int-add.0000001']
    const run = generateRunFromIds('attempt-a', ids, classic, 'typed', 'single')
    ids.push('1.optiver-classic@1.int-add.0000002')
    expect(run.questionIds).toHaveLength(1)
  })

  it('uses a custom reference when asked', () => {
    const run = generateRunFromIds('a', [], classic, 'typed', 'weakest', false)
    expect(run.spec.profileRef).toMatch(/^custom-/)
  })
})

describe('runFromId', () => {
  propTest.prop([seedArb, fc.constantFrom('mcq' as const, 'typed' as const)])(
    'rebuilds a seeded run exactly',
    (seed, mode) => {
      const run = generateRun('attempt-a', seed, classic, mode)
      const rebuilt = runFromId(run.runId as string, resolvePreset)
      expect(isResolveFailure(rebuilt)).toBe(false)
      if (isResolveFailure(rebuilt)) return
      expect(rebuilt.questionIds).toEqual(run.questionIds)
      expect(rebuilt.spec).toEqual(run.spec)
      expect(rebuilt.runId).toBe(run.runId)
    },
  )

  it('reports a malformed id', () => {
    expect(runFromId('nonsense', resolvePreset)).toEqual({ error: 'malformed' })
  })

  it('reports an unresolvable profile', () => {
    expect(runFromId('1.optiver-classic@99.mcq.0000001', resolvePreset)).toEqual({
      error: 'unknown-profile',
    })
  })

  it('refuses a custom profile whose content does not hash to the reference', () => {
    // This is the case the sharing scheme has to survive: a link carries the profile
    // payload, so a tampered payload must not quietly regenerate different questions.
    const custom = { ...classic, questionCount: 5 }
    const honestRef = refFor(custom, false)
    const run = generateRunFromIds('a', [], custom, 'mcq', 'single', false)
    expect(run.spec.profileRef).toBe(honestRef)
    const tampered = { ...custom, questionCount: 6 }
    expect(runFromId(`1.${honestRef}.mcq.0000001`, () => tampered)).toEqual({
      error: 'profile-mismatch',
    })
    expect(isResolveFailure(runFromId(`1.${honestRef}.mcq.0000001`, () => custom))).toBe(false)
  })

  it('trusts a preset reference on its id and version', () => {
    // A preset reference names a build-time constant rather than a payload, so it is
    // identified by id and version. The presets snapshot test is what guarantees those
    // parameters cannot change without a version bump.
    const wrongId = { ...classic, id: 'hard' }
    expect(runFromId('1.optiver-classic@1.mcq.0000001', () => wrongId)).toEqual({
      error: 'profile-mismatch',
    })
  })
})

describe('materialise', () => {
  it('turns a run into full questions', () => {
    const run = generateRun('attempt-a', 3, classic, 'mcq')
    const questions = materialise(run, resolvePreset)
    expect(questions).toHaveLength(80)
    for (const question of questions) {
      expect(isResolveFailure(question)).toBe(false)
      if (isResolveFailure(question)) continue
      expect(question.options).toHaveLength(4)
    }
  })

  it('reports failures per question rather than throwing', () => {
    const run = generateRunFromIds('a', ['not-an-id'], classic, 'typed', 'single')
    expect(materialise(run, resolvePreset)).toEqual([{ error: 'malformed' }])
  })
})
