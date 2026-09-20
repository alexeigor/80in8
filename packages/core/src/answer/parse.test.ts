import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { fc, test as propTest } from '@fast-check/vitest'
import { describe, expect, it } from 'vitest'
import { R } from '../rational/rational.js'
import { formatCanonical, MAX_SIGNIFICANT_DIGITS, parseAnswer } from './parse.js'

interface Row {
  input: string
  expect: string
  form: string
  note: string
}

/**
 * The fixture is the same table that appears in the design doc, so a change to the
 * accepted grammar has to be made in one place and shows up in both.
 */
function loadFixture(): Row[] {
  const path = fileURLToPath(new URL('../../test/fixtures/answers.tsv', import.meta.url))
  return readFileSync(path, 'utf8')
    .split('\n')
    .filter((line) => line.trim() !== '' && !line.startsWith('#'))
    .slice(1)
    .map((line) => {
      const [input, expected, form, note] = line.split('\t') as [string, string, string, string]
      return { input: JSON.parse(input) as string, expect: expected, form, note }
    })
}

const rows = loadFixture()

describe('parseAnswer fixture table', () => {
  it('has rows', () => {
    expect(rows.length).toBeGreaterThan(30)
  })

  it.each(rows.map((row) => [JSON.stringify(row.input), row] as const))('%s', (_label, row) => {
    const result = parseAnswer(row.input)
    if (row.expect.startsWith('!')) {
      expect(result.ok).toBe(false)
      if (!result.ok) expect(result.error).toBe(row.expect.slice(1))
      return
    }
    const [num, den] = row.expect.split('/').map(Number) as [number, number]
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value).toEqual(R.ofWide(num, den))
    expect(result.form).toBe(row.form)
  })
})

describe('parseAnswer', () => {
  it('reports the written fraction so the simplified policy can be applied', () => {
    const result = parseAnswer('6/16')
    expect(result.ok && result.writtenFraction).toEqual({ num: 6, den: 16 })
    const mixed = parseAnswer('2 1/4')
    expect(mixed.ok && mixed.writtenFraction).toEqual({ num: 9, den: 4 })
    const decimal = parseAnswer('0.5')
    expect(decimal.ok && decimal.writtenFraction).toBeUndefined()
  })

  it('rejects a non-string', () => {
    expect(parseAnswer(undefined as unknown as string)).toEqual({ ok: false, error: 'empty' })
  })

  it('treats a whitespace-only string as empty', () => {
    expect(parseAnswer('   ')).toEqual({ ok: false, error: 'empty' })
  })

  it('caps the total digit count rather than trusting Number()', () => {
    expect(MAX_SIGNIFICANT_DIGITS).toBe(15)
    // Leading zeros are not significant, so this is well within the cap.
    expect(parseAnswer('000000000000000042').ok).toBe(true)
    expect(parseAnswer('1/1234567890123456').ok).toBe(false)
    expect(parseAnswer('1234567 1/1234567').ok).toBe(true)
    expect(parseAnswer('12345678 1/12345678').ok).toBe(false)
  })

  propTest.prop([fc.string()])('never throws, whatever it is given', (text) => {
    expect(() => parseAnswer(text)).not.toThrow()
  })

  propTest.prop([fc.string()])('returns either a value or a reason', (text) => {
    const result = parseAnswer(text)
    if (result.ok) expect(result.value.den).toBeGreaterThan(0)
    else expect(['empty', 'incomplete', 'invalid']).toContain(result.error)
  })
})

describe('round trips', () => {
  propTest.prop([fc.integer({ min: -99_999, max: 99_999 }), fc.constantFrom(1, 2, 4, 5, 8, 10, 20, 25, 100)])(
    'every value the core can render parses back to itself',
    (num, den) => {
      const value = R.of(num, den)
      for (const text of [R.toFractionString(value), R.toMixedString(value), formatCanonical(value)]) {
        const parsed = parseAnswer(text)
        expect(parsed.ok).toBe(true)
        if (parsed.ok) expect(R.eq(parsed.value, value)).toBe(true)
      }
    },
  )

  propTest.prop([fc.integer({ min: -9999, max: 9999 }), fc.constantFrom(1, 3, 7, 9)])(
    'values with no decimal form still round-trip as fractions',
    (num, den) => {
      const value = R.of(num, den)
      expect(formatCanonical(value)).toBe(R.toDecimalString(value) ?? R.toFractionString(value))
      const parsed = parseAnswer(formatCanonical(value))
      expect(parsed.ok && R.eq(parsed.value, value)).toBe(true)
    },
  )
})

describe('comma and fraction part edge cases', () => {
  it('rejects more than one decimal point alongside a thousands separator', () => {
    expect(parseAnswer('1,234.5.6')).toEqual({ ok: false, error: 'invalid' })
  })

  it('rejects a comma inside a fraction part', () => {
    // With no decimal point the comma means a decimal separator, which cannot appear
    // in the numerator or denominator of a fraction.
    expect(parseAnswer('1,234/5')).toEqual({ ok: false, error: 'invalid' })
    expect(parseAnswer('1,2,3 1/2')).toEqual({ ok: false, error: 'invalid' })
  })

  it('accepts a thousands separator inside a fraction part', () => {
    const result = parseAnswer('1,234/2')
    expect(result.ok).toBe(false)
  })

  it('rejects a zero denominator in a mixed number', () => {
    expect(parseAnswer('2 1/0')).toEqual({ ok: false, error: 'invalid' })
  })
})
