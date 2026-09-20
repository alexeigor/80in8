import { fc, test as propTest } from '@fast-check/vitest'
import { describe, expect, it } from 'vitest'
import { ALL_KINDS, type Kind } from '../profile/types.js'
import { ID_PATTERN, ID_VERSION, kindSlug, parseId, parseRunId, toId, toRunId } from './id.js'

const kindArb = fc.constantFrom(...ALL_KINDS)
const seedArb = fc.integer({ min: 0, max: 0xffffffff })
const refArb = fc.constantFrom('optiver-classic@1', 'hard@2', 'custom-1a2b3c4d')

describe('question ids', () => {
  it('has the documented shape', () => {
    expect(toId({ profileRef: 'optiver-classic@1', kind: 'int.mul', seed: 1_000_000 })).toBe(
      '1.optiver-classic@1.int-mul.000lfls',
    )
  })

  it('pads the seed to a fixed width so ids sort and align', () => {
    expect(toId({ profileRef: 'hard@1', kind: 'int.add', seed: 0 }).endsWith('.0000000')).toBe(true)
    expect(toId({ profileRef: 'hard@1', kind: 'int.add', seed: 0xffffffff }).endsWith('.1z141z3')).toBe(true)
  })

  propTest.prop([refArb, kindArb, seedArb])('round-trips through parseId', (profileRef, kind, seed) => {
    const parsed = parseId(toId({ profileRef, kind, seed }))
    expect(parsed).toEqual({ v: 1, profileRef, kind, seed })
  })

  propTest.prop([refArb, kindArb, seedArb])('stays URL and filename safe', (profileRef, kind, seed) => {
    const id = toId({ profileRef, kind, seed })
    expect(id).toMatch(ID_PATTERN)
    expect(id.length).toBeLessThanOrEqual(48)
    expect(encodeURIComponent(id)).toBe(id.replace(/@/g, '%40'))
  })

  it('maps kinds to slugs and back', () => {
    for (const kind of ALL_KINDS) {
      expect(kindSlug(kind)).toBe(kind.replace('.', '-'))
      const parsed = parseId(toId({ profileRef: 'hard@1', kind, seed: 1 }))
      expect('error' in parsed ? null : parsed.kind).toBe(kind)
    }
  })

  describe('rejects bad input', () => {
    it.each<[string, string, string]>([
      ['too few segments', '1.optiver-classic@1.int-mul', 'malformed'],
      ['too many segments', '1.optiver-classic@1.int-mul.0000001.x', 'malformed'],
      ['a future version', '2.optiver-classic@1.int-mul.0000001', 'unsupported-version'],
      ['a non-numeric version', 'x.optiver-classic@1.int-mul.0000001', 'malformed'],
      ['a bad profile reference', '1.Bad Ref.int-mul.0000001', 'malformed'],
      ['a custom reference with bad hex', '1.custom-zzzz.int-mul.0000001', 'malformed'],
      ['a short seed', '1.optiver-classic@1.int-mul.001', 'malformed'],
      ['a seed with bad characters', '1.optiver-classic@1.int-mul.00000-1', 'malformed'],
      ['an unknown kind', '1.optiver-classic@1.int-pow.0000001', 'unknown-kind'],
    ])('%s', (_label, id, error) => {
      expect(parseId(id)).toEqual({ error })
    })

    it('rejects a non-string', () => {
      expect(parseId(undefined as unknown as string)).toEqual({ error: 'malformed' })
    })

    it('rejects a seed above 32 bits', () => {
      // "zzzzzzz" in base 36 is larger than 2^32.
      expect(parseId('1.optiver-classic@1.int-mul.zzzzzzz')).toEqual({ error: 'malformed' })
    })
  })

  propTest.prop([fc.string()])('never throws on arbitrary input', (text) => {
    expect(() => parseId(text)).not.toThrow()
  })
})

describe('run ids', () => {
  it('has the documented shape', () => {
    expect(toRunId({ profileRef: 'optiver-classic@1', mode: 'mcq', seed: 42 })).toBe(
      '1.optiver-classic@1.mcq.0000016',
    )
  })

  propTest.prop([refArb, fc.constantFrom('mcq' as const, 'typed' as const), seedArb])(
    'round-trips through parseRunId',
    (profileRef, mode, seed) => {
      expect(parseRunId(toRunId({ profileRef, mode, seed }))).toEqual({ v: 1, profileRef, mode, seed })
    },
  )

  it.each<[string, string, string]>([
    ['too few segments', '1.optiver-classic@1.mcq', 'malformed'],
    ['a future version', '9.optiver-classic@1.mcq.0000001', 'unsupported-version'],
    ['a non-numeric version', 'v.optiver-classic@1.mcq.0000001', 'malformed'],
    ['a bad profile reference', '1.BAD.mcq.0000001', 'malformed'],
    ['an unknown mode', '1.optiver-classic@1.oral.0000001', 'malformed'],
    ['a bad seed', '1.optiver-classic@1.mcq.zz', 'malformed'],
  ])('rejects %s', (_label, id, error) => {
    expect(parseRunId(id)).toEqual({ error })
  })

  it('rejects a non-string', () => {
    expect(parseRunId(42 as unknown as string)).toEqual({ error: 'malformed' })
  })
})

describe('id version', () => {
  it('is the documented version', () => {
    expect(ID_VERSION).toBe('1')
  })

  it('does not collide across kinds for a fixed seed', () => {
    const ids = new Set(ALL_KINDS.map((kind: Kind) => toId({ profileRef: 'hard@1', kind, seed: 5 })))
    expect(ids.size).toBe(ALL_KINDS.length)
  })
})
