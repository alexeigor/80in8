import { describe, expect, it } from 'vitest'
import { canonicalJson, hash8, isCustomRef, isPresetRef, profileRefOf } from './canonical.js'
import { PRESETS } from './presets.js'
import type { Profile } from './types.js'

describe('canonicalJson', () => {
  it('sorts object keys so equal profiles hash equally', () => {
    expect(canonicalJson({ b: 1, a: 2 })).toBe('{"a":2,"b":1}')
    expect(canonicalJson({ a: 2, b: 1 })).toBe(canonicalJson({ b: 1, a: 2 }))
  })

  it('preserves array order, which is meaningful', () => {
    expect(canonicalJson([3, 1, 2])).toBe('[3,1,2]')
  })

  it('handles primitives and nesting', () => {
    expect(canonicalJson(null)).toBe('null')
    expect(canonicalJson(5)).toBe('5')
    expect(canonicalJson('x')).toBe('"x"')
    expect(canonicalJson(true)).toBe('true')
    expect(canonicalJson({ a: { d: 1, c: [{ f: 1, e: 2 }] } })).toBe('{"a":{"c":[{"e":2,"f":1}],"d":1}}')
  })

  it('drops undefined members, which JSON cannot represent', () => {
    expect(canonicalJson({ a: 1, b: undefined })).toBe('{"a":1}')
    expect(canonicalJson(undefined)).toBe('null')
  })
})

describe('hash8', () => {
  it('is stable and eight hex characters wide', () => {
    expect(hash8('hello')).toMatch(/^[0-9a-f]{8}$/)
    expect(hash8('hello')).toBe(hash8('hello'))
    expect(hash8('hello')).not.toBe(hash8('hellp'))
  })

  it('handles the empty string', () => {
    expect(hash8('')).toMatch(/^[0-9a-f]{8}$/)
  })
})

describe('profile references', () => {
  it('names built-in presets by id and version', () => {
    expect(profileRefOf(PRESETS['optiver-classic'], true)).toBe('optiver-classic@1')
  })

  it('names custom profiles by content hash', () => {
    const custom = { ...PRESETS['optiver-classic'], questionCount: 40 }
    const ref = profileRefOf(custom, false)
    expect(ref).toMatch(/^custom-[0-9a-f]{8}$/)
    // Same parameters, same reference, on any device.
    expect(profileRefOf({ ...custom }, false)).toBe(ref)
    expect(profileRefOf({ ...custom, questionCount: 41 }, false)).not.toBe(ref)
  })

  describe('the custom hash covers generation and nothing else', () => {
    const custom = { ...PRESETS['optiver-classic'], questionCount: 40 }
    const ref = profileRefOf(custom, false)

    it('ignores pacing, marking and presentation', () => {
      // Practising the same paper with a longer clock or stricter marking must not
      // fork the question ids, or those runs could never share statistics with it.
      const variants: Profile[] = [
        { ...custom, timeLimit: { kind: 'untimed' } },
        { ...custom, timeLimit: { kind: 'timed', durationMs: 4_800_000 } },
        { ...custom, scoring: { correct: 1, wrong: -2, skipped: -2, allowSkip: false } },
        { ...custom, answerPolicy: { fractions: 'simplified' } },
        { ...custom, name: 'Something else', description: 'Reworded' },
        { ...custom, passScore: 1, competitiveScore: 2 },
        { ...custom, defaultMode: 'mcq', allowAutoSubmit: true, pauseOnHide: true },
      ]
      for (const variant of variants) expect(profileRefOf(variant, false)).toBe(ref)
    })

    it('reacts to everything that does change the questions', () => {
      const variants: Profile[] = [
        { ...custom, questionCount: 41 },
        { ...custom, mix: [{ kind: 'int.add', weight: 1 }] },
        { ...custom, missingOperandShare: 0.9 },
        { ...custom, integer: { ...custom.integer, addSub: [1, 500] } },
        { ...custom, decimal: { ...custom.decimal, places: [2], placesWeights: [1] } },
        { ...custom, fraction: { ...custom.fraction, denominators: [2, 4] } },
      ]
      for (const variant of variants) expect(profileRefOf(variant, false)).not.toBe(ref)
    })
  })

  it('recognises the two reference shapes', () => {
    expect(isPresetRef('optiver-classic@1')).toBe(true)
    expect(isPresetRef('optiver-classic@0')).toBe(false)
    expect(isPresetRef('custom-1a2b3c4d')).toBe(false)
    expect(isCustomRef('custom-1a2b3c4d')).toBe(true)
    expect(isCustomRef('custom-XYZ')).toBe(false)
    expect(isCustomRef('optiver-classic@1')).toBe(false)
  })
})
