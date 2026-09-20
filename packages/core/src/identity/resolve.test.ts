import { fc, test as propTest } from '@fast-check/vitest'
import { describe, expect, it } from 'vitest'
import { refFor } from '../generate/run.js'
import { PRESETS, resolvePreset } from '../profile/presets.js'
import { ALL_KINDS } from '../profile/types.js'
import { toId } from './id.js'
import { isResolveFailure, profileMatchesRef, questionFromId, questionFromIdOrThrow } from './resolve.js'

const classic = PRESETS['optiver-classic']
const seedArb = fc.integer({ min: 0, max: 0xffffffff })
const kindArb = fc.constantFrom(...classic.mix.map((m) => m.kind))
const presetArb = fc.constantFrom(...Object.values(PRESETS))

describe('profileMatchesRef', () => {
  it('accepts the profile a reference names', () => {
    expect(profileMatchesRef(classic, 'optiver-classic@1')).toBe(true)
    expect(profileMatchesRef(classic, 'optiver-classic@2')).toBe(false)
    expect(profileMatchesRef(classic, refFor(classic, false))).toBe(true)
  })
})

describe('questionFromId', () => {
  propTest.prop([kindArb, seedArb])('regenerates a question from its id alone', (kind, seed) => {
    const id = toId({ profileRef: 'optiver-classic@1', kind, seed })
    const first = questionFromId(id, resolvePreset)
    const second = questionFromId(id, resolvePreset)
    expect(isResolveFailure(first)).toBe(false)
    expect(second).toEqual(first)
  })

  propTest.prop([presetArb, seedArb])('carries its own id', (profile, seed) => {
    const profileRef = refFor(profile, true)
    const id = toId({ profileRef, kind: 'int.mul', seed })
    const question = questionFromId(id, resolvePreset)
    if (isResolveFailure(question)) throw new Error(question.error)
    expect(question.id).toBe(id)
    expect(question.kind).toBe('int.mul')
  })

  propTest.prop([fc.constantFrom(...ALL_KINDS), seedArb])(
    'always produces four options with exactly one correct',
    (kind, seed) => {
      const id = toId({ profileRef: 'hard@1', kind, seed })
      const question = questionFromId(id, resolvePreset)
      if (isResolveFailure(question)) throw new Error(question.error)
      expect(question.options).toHaveLength(4)
      expect(question.options.filter((o) => o.correct)).toHaveLength(1)
    },
  )

  propTest.prop([kindArb, seedArb])('agrees with the missing slot on the answer', (kind, seed) => {
    const id = toId({ profileRef: 'optiver-classic@1', kind, seed })
    const question = questionFromId(id, resolvePreset)
    if (isResolveFailure(question)) throw new Error(question.error)
    expect(question.answer).toEqual(question[question.missing])
    const correct = question.options.find((o) => o.correct)
    expect(correct?.value).toEqual(question.answer)
  })

  it('resolves a question for a kind the profile never draws', () => {
    // The mix decides what gets drawn, not what an id can name.
    const id = toId({ profileRef: 'optiver-classic@1', kind: 'frac.div', seed: 1 })
    expect(isResolveFailure(questionFromId(id, resolvePreset))).toBe(false)
  })

  it('reports a malformed id', () => {
    expect(questionFromId('nope', resolvePreset)).toEqual({ error: 'malformed' })
  })

  it('reports an unresolvable profile', () => {
    expect(questionFromId('1.optiver-classic@7.int-add.0000001', resolvePreset)).toEqual({
      error: 'unknown-profile',
    })
  })

  it('refuses a profile that does not match the reference', () => {
    const wrong = { ...classic, id: 'hard' }
    expect(questionFromId('1.optiver-classic@1.int-add.0000001', () => wrong)).toEqual({
      error: 'profile-mismatch',
    })
  })

  it('is independent of mode, so a missed question can be retried either way', () => {
    // Nothing in the id names a mode, and options come from the question seed.
    const id = toId({ profileRef: 'optiver-mcq@1', kind: 'int.div', seed: 4242 })
    const viaOne = questionFromId(id, resolvePreset)
    const viaTwo = questionFromId(id, resolvePreset)
    expect(viaTwo).toEqual(viaOne)
  })
})

describe('isResolveFailure', () => {
  it('distinguishes failures from questions', () => {
    expect(isResolveFailure({ error: 'malformed' })).toBe(true)
    expect(isResolveFailure(null)).toBe(false)
    expect(isResolveFailure('x')).toBe(false)
    const ok = questionFromId(toId({ profileRef: 'hard@1', kind: 'int.add', seed: 1 }), resolvePreset)
    expect(isResolveFailure(ok)).toBe(false)
  })
})

describe('questionFromIdOrThrow', () => {
  it('returns the question when it resolves', () => {
    const id = toId({ profileRef: 'hard@1', kind: 'int.add', seed: 9 })
    expect(questionFromIdOrThrow(id, resolvePreset).id).toBe(id)
  })

  it('throws with the reason when it does not', () => {
    expect(() => questionFromIdOrThrow('bad', resolvePreset)).toThrow(
      /cannot resolve question bad: malformed/,
    )
  })
})
