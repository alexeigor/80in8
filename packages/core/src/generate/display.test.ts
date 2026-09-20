import { fc, test as propTest } from '@fast-check/vitest'
import { describe, expect, it } from 'vitest'
import { parseAnswer } from '../answer/parse.js'
import { PRESETS } from '../profile/presets.js'
import { ALL_KINDS } from '../profile/types.js'
import { MINUS, R } from '../rational/rational.js'
import { BLANK, buildDisplay, familyOf, formatValue, opGlyph } from './display.js'

const classic = PRESETS['optiver-classic']

describe('familyOf', () => {
  it('splits a kind into its family', () => {
    expect(familyOf('int.add')).toBe('int')
    expect(familyOf('dec.div')).toBe('dec')
    expect(familyOf('frac.mul')).toBe('frac')
  })
})

describe('opGlyph', () => {
  it('renders subtraction with a true minus so it lines up with negatives', () => {
    expect(opGlyph('-')).toBe(MINUS)
    expect(opGlyph('+')).toBe('+')
    expect(opGlyph('×')).toBe('×')
    expect(opGlyph('÷')).toBe('÷')
  })
})

describe('formatValue', () => {
  it('writes the same rational differently depending on the question family', () => {
    const half = R.of(1, 2)
    expect(formatValue(half, 'dec.add', classic)).toBe('0.5')
    expect(formatValue(half, 'frac.add', classic)).toBe('1/2')
    expect(formatValue(R.of(4), 'int.add', classic)).toBe('4')
  })

  it('writes improper fractions as mixed numbers when the profile allows it', () => {
    expect(formatValue(R.of(9, 4), 'frac.add', classic)).toBe('2 1/4')
    const plain = { ...classic, fraction: { ...classic.fraction, allowMixed: false } }
    expect(formatValue(R.of(9, 4), 'frac.add', plain)).toBe('9/4')
  })

  it('writes an integer-valued fraction as an integer', () => {
    expect(formatValue(R.of(2), 'frac.add', classic)).toBe('2')
  })

  it('falls back to fraction notation for a value with no decimal form', () => {
    expect(formatValue(R.of(1, 3), 'int.div', classic)).toBe('1/3')
  })

  propTest.prop([
    fc.integer({ min: -999, max: 999 }),
    fc.constantFrom(1, 2, 4, 5, 8, 10, 100),
    fc.constantFrom(...ALL_KINDS),
  ])('every rendered value parses back to itself', (num, den, kind) => {
    const value = R.of(num, den)
    const text = formatValue(value, kind, classic)
    const parsed = parseAnswer(text)
    expect(parsed.ok).toBe(true)
    if (parsed.ok) expect(R.eq(parsed.value, value)).toBe(true)
  })
})

describe('buildDisplay', () => {
  const parts = { kind: 'int.add' as const, op: '+' as const, a: R.of(12), b: R.of(5), c: R.of(17) }

  it('blanks the result in the ordinary form', () => {
    expect(buildDisplay(parts, 'c', classic)).toEqual({ left: '12', op: '+', right: '5', result: BLANK })
  })

  it('blanks a hidden operand', () => {
    expect(buildDisplay(parts, 'a', classic)).toEqual({ left: BLANK, op: '+', right: '5', result: '17' })
    expect(buildDisplay(parts, 'b', classic)).toEqual({ left: '12', op: '+', right: BLANK, result: '17' })
  })

  it('renders each family in its own notation', () => {
    const frac = { kind: 'frac.add' as const, op: '+' as const, a: R.of(1, 2), b: R.of(1, 3), c: R.of(5, 6) }
    expect(buildDisplay(frac, 'c', classic)).toEqual({ left: '1/2', op: '+', right: '1/3', result: BLANK })
    const dec = {
      kind: 'dec.sub' as const,
      op: '-' as const,
      a: R.of(124, 10),
      b: R.of(87, 10),
      c: R.of(37, 10),
    }
    expect(buildDisplay(dec, 'c', classic)).toEqual({ left: '12.4', op: MINUS, right: '8.7', result: BLANK })
  })
})
