import { fc, test as propTest } from '@fast-check/vitest'
import { describe, expect, it } from 'vitest'
import { PRESETS } from '../profile/presets.js'
import { R } from '../rational/rational.js'
import { splitmix32 } from '../rng/rng.js'
import { answerFor, pickMissingSlot } from './missing.js'

const classic = PRESETS['optiver-classic']

describe('pickMissingSlot', () => {
  it('never hides an operand when the share is zero', () => {
    const never = { ...classic, missingOperandShare: 0 }
    for (let seed = 0; seed < 200; seed++) {
      expect(pickMissingSlot(splitmix32(seed), never)).toBe('c')
    }
  })

  it('always hides an operand when the share is one', () => {
    const always = { ...classic, missingOperandShare: 1 }
    for (let seed = 0; seed < 200; seed++) {
      expect(['a', 'b']).toContain(pickMissingSlot(splitmix32(seed), always))
    }
  })

  it('hides operands at roughly the configured share, split evenly', () => {
    const counts = { a: 0, b: 0, c: 0 }
    const total = 6000
    for (let seed = 0; seed < total; seed++) counts[pickMissingSlot(splitmix32(seed), classic)] += 1
    expect((counts.a + counts.b) / total).toBeGreaterThan(0.17)
    expect((counts.a + counts.b) / total).toBeLessThan(0.23)
    expect(Math.abs(counts.a - counts.b) / total).toBeLessThan(0.03)
  })

  propTest.prop([fc.integer({ min: 0, max: 0xffffffff })])('is deterministic', (seed) => {
    expect(pickMissingSlot(splitmix32(seed), classic)).toBe(pickMissingSlot(splitmix32(seed), classic))
  })
})

describe('answerFor', () => {
  const parts = { kind: 'int.add' as const, op: '+' as const, a: R.of(12), b: R.of(5), c: R.of(17) }

  it('returns the value in the hidden slot', () => {
    expect(answerFor(parts, 'a')).toEqual(R.of(12))
    expect(answerFor(parts, 'b')).toEqual(R.of(5))
    expect(answerFor(parts, 'c')).toEqual(R.of(17))
  })
})
