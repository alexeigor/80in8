import { fc, test as propTest } from '@fast-check/vitest'
import { describe, expect, it } from 'vitest'
import { deriveSeed, rand, splitmix32 } from './rng.js'

const seedArb = fc.integer({ min: 0, max: 0xffffffff })

describe('splitmix32', () => {
  propTest.prop([seedArb])('yields the same sequence for the same seed', (seed) => {
    const a = splitmix32(seed)
    const b = splitmix32(seed)
    for (let i = 0; i < 16; i++) expect(a()).toBe(b())
  })

  propTest.prop([seedArb])('stays within [0, 1)', (seed) => {
    const rng = splitmix32(seed)
    for (let i = 0; i < 64; i++) {
      const value = rng()
      expect(value).toBeGreaterThanOrEqual(0)
      expect(value).toBeLessThan(1)
    }
  })

  it('separates neighbouring seeds', () => {
    const first = Array.from({ length: 8 }, () => splitmix32(1)())
    const second = Array.from({ length: 8 }, () => splitmix32(2)())
    expect(first).not.toEqual(second)
  })

  it('spreads values roughly evenly across ten buckets', () => {
    const rng = splitmix32(99)
    const buckets = new Array(10).fill(0)
    for (let i = 0; i < 100_000; i++) buckets[Math.floor(rng() * 10)] += 1
    for (const count of buckets) expect(Math.abs(count - 10_000)).toBeLessThan(600)
  })
})

describe('deriveSeed', () => {
  it('is deterministic and label-sensitive', () => {
    expect(deriveSeed(7, 'options')).toBe(deriveSeed(7, 'options'))
    expect(deriveSeed(7, 'options')).not.toBe(deriveSeed(7, 'questions'))
    expect(deriveSeed(7, 'options')).not.toBe(deriveSeed(8, 'options'))
  })

  propTest.prop([seedArb, fc.string()])('produces an unsigned 32-bit value', (seed, label) => {
    const derived = deriveSeed(seed, label)
    expect(Number.isInteger(derived)).toBe(true)
    expect(derived).toBeGreaterThanOrEqual(0)
    expect(derived).toBeLessThanOrEqual(0xffffffff)
  })
})

describe('rand', () => {
  propTest.prop([seedArb, fc.integer({ min: -50, max: 50 }), fc.integer({ min: 0, max: 100 })])(
    'int stays inside the inclusive range',
    (seed, lo, span) => {
      const rng = splitmix32(seed)
      for (let i = 0; i < 20; i++) {
        const value = rand.int(rng, lo, lo + span)
        expect(value).toBeGreaterThanOrEqual(lo)
        expect(value).toBeLessThanOrEqual(lo + span)
      }
    },
  )

  it('int reaches both ends of the range', () => {
    const rng = splitmix32(3)
    const seen = new Set<number>()
    for (let i = 0; i < 500; i++) seen.add(rand.int(rng, 1, 3))
    expect([...seen].sort()).toEqual([1, 2, 3])
  })

  it('int rejects an empty range', () => {
    expect(() => rand.int(splitmix32(1), 5, 4)).toThrow(/empty range/)
  })

  it('pick returns a member and rejects an empty list', () => {
    const rng = splitmix32(11)
    expect(['a', 'b', 'c']).toContain(rand.pick(rng, ['a', 'b', 'c']))
    expect(() => rand.pick(rng, [])).toThrow(/empty list/)
  })

  it('weighted respects the weights', () => {
    const rng = splitmix32(5)
    let heads = 0
    for (let i = 0; i < 10_000; i++) {
      if (rand.weighted(rng, [['h', 3] as const, ['t', 1] as const]) === 'h') heads += 1
    }
    expect(heads / 10_000).toBeGreaterThan(0.71)
    expect(heads / 10_000).toBeLessThan(0.79)
  })

  it('weighted rejects an empty list and bad weights', () => {
    const rng = splitmix32(1)
    expect(() => rand.weighted(rng, [])).toThrow(/empty list/)
    expect(() => rand.weighted(rng, [['a', 0] as const])).toThrow(/must be positive/)
    expect(() => rand.weighted(rng, [['a', Number.POSITIVE_INFINITY] as const])).toThrow(/must be positive/)
  })

  it('weighted falls back to the last item when rounding leaves no target', () => {
    // A generator pinned just below 1 exercises the final-item guard.
    const nearlyOne = () => 1 - Number.EPSILON / 2
    expect(rand.weighted(nearlyOne, [['a', 1] as const, ['b', 1] as const])).toBe('b')
  })

  propTest.prop([seedArb])('shuffle returns a permutation and leaves the input alone', (seed) => {
    const input = [1, 2, 3, 4, 5, 6, 7]
    const frozen = [...input]
    const out = rand.shuffle(splitmix32(seed), input)
    expect(input).toEqual(frozen)
    expect([...out].sort((a, b) => a - b)).toEqual(frozen)
  })

  it('shuffle actually reorders', () => {
    const input = [1, 2, 3, 4, 5, 6, 7, 8]
    const orders = new Set<string>()
    for (let seed = 0; seed < 40; seed++) orders.add(rand.shuffle(splitmix32(seed), input).join(','))
    expect(orders.size).toBeGreaterThan(20)
  })

  it('shuffle handles the empty list', () => {
    expect(rand.shuffle(splitmix32(1), [])).toEqual([])
  })

  it('bool honours its probability', () => {
    const rng = splitmix32(13)
    let hits = 0
    for (let i = 0; i < 10_000; i++) if (rand.bool(rng, 0.25)) hits += 1
    expect(hits / 10_000).toBeGreaterThan(0.22)
    expect(hits / 10_000).toBeLessThan(0.28)
    expect(rand.bool(() => 0.5, 0)).toBe(false)
    expect(rand.bool(() => 0.5, 1)).toBe(true)
  })
})

describe('weighted rounding guard', () => {
  it('returns the last item when the running total is exhausted exactly', () => {
    // A generator pinned at 1 leaves nothing for the final comparison to consume.
    expect(rand.weighted(() => 1, [['a', 1] as const, ['b', 2] as const])).toBe('b')
  })
})
