import { fc, test as propTest } from '@fast-check/vitest'
import { describe, expect, it } from 'vitest'
import { R } from '../rational/rational.js'
import { checkAnswer, isAutoSubmitMatch } from './check.js'

const equivalent = { fractions: 'equivalent' } as const
const simplified = { fractions: 'simplified' } as const

describe('checkAnswer', () => {
  it('accepts any spelling of the same value by default', () => {
    const half = R.of(1, 2)
    for (const raw of ['0.5', '.5', '0.50', '1/2', '2/4', '0,5']) {
      expect(checkAnswer(raw, half).status).toBe('correct')
    }
  })

  it('marks a different value wrong and reports what was read', () => {
    const verdict = checkAnswer('0.6', R.of(1, 2))
    expect(verdict.status).toBe('wrong')
    if (verdict.status === 'wrong') expect(verdict.value).toEqual(R.of(3, 5))
  })

  it('treats half-typed input as pending rather than wrong', () => {
    for (const raw of ['', '-', '3/', '2 ']) {
      const verdict = checkAnswer(raw, R.of(1, 2))
      expect(verdict.status).toBe('pending')
    }
    const invalid = checkAnswer('abc', R.of(1, 2))
    expect(invalid).toEqual({ status: 'pending', error: 'invalid' })
  })

  describe('the simplified policy', () => {
    it('rejects a fraction that is not in lowest terms', () => {
      const verdict = checkAnswer('14/20', R.of(7, 10), simplified)
      expect(verdict).toEqual({ status: 'wrong', value: R.of(7, 10), reason: 'unsimplified' })
    })

    it('still accepts the reduced fraction', () => {
      expect(checkAnswer('7/10', R.of(7, 10), simplified).status).toBe('correct')
    })

    it('still accepts a decimal, which claims nothing about fractions', () => {
      expect(checkAnswer('0.7', R.of(7, 10), simplified).status).toBe('correct')
    })

    it('checks mixed numbers too', () => {
      expect(checkAnswer('1 2/4', R.of(3, 2), simplified).status).toBe('wrong')
      expect(checkAnswer('1 1/2', R.of(3, 2), simplified).status).toBe('correct')
    })

    it('does not object under the default policy', () => {
      expect(checkAnswer('14/20', R.of(7, 10), equivalent).status).toBe('correct')
      expect(checkAnswer('14/20', R.of(7, 10)).status).toBe('correct')
    })
  })

  propTest.prop([fc.string(), fc.integer({ min: -100, max: 100 })])(
    'never throws and never claims a pending input is right',
    (raw, num) => {
      const verdict = checkAnswer(raw, R.of(num, 7))
      if (verdict.status === 'pending') expect(verdict).not.toHaveProperty('value')
    },
  )
})

describe('isAutoSubmitMatch', () => {
  it('fires only on an exact match', () => {
    expect(isAutoSubmitMatch('42', R.of(42))).toBe(true)
    expect(isAutoSubmitMatch('4', R.of(42))).toBe(false)
    expect(isAutoSubmitMatch('', R.of(42))).toBe(false)
    expect(isAutoSubmitMatch('-', R.of(42))).toBe(false)
  })

  it('does not fire on a prefix of a longer answer', () => {
    // Typing towards 123 passes through "1" and "12"; neither may submit.
    expect(isAutoSubmitMatch('1', R.of(123))).toBe(false)
    expect(isAutoSubmitMatch('12', R.of(123))).toBe(false)
    expect(isAutoSubmitMatch('123', R.of(123))).toBe(true)
  })
})
