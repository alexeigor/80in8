/**
 * Parsing a typed answer (DESIGN.md §6.8, Appendix C).
 *
 * The parser distinguishes three failure modes, because the UI needs them:
 *   - `empty`      nothing typed yet
 *   - `incomplete` a prefix of something valid, e.g. "-", "3/", "2 " on the way to "2 1/4"
 *   - `invalid`    genuinely not a number
 * Only `invalid` deserves a shake; the other two mean "keep typing".
 *
 * Every accepted value is exact. The 15 significant digit cap keeps `whole * den + num`
 * below 2^53, so a long input is rejected outright rather than silently rounded: the
 * classic trap is `9007199254740993/4503599627370496` quietly comparing equal to 2.
 */
import { R, type Rational } from '../rational/rational.js'

export type AnswerForm = 'integer' | 'decimal' | 'fraction' | 'mixed'
export type ParseError = 'empty' | 'incomplete' | 'invalid'

export interface ParseSuccess {
  ok: true
  value: Rational
  form: AnswerForm
  /** As written, before reduction. Present for fraction and mixed forms. */
  writtenFraction?: { num: number; den: number }
}

export interface ParseFailure {
  ok: false
  error: ParseError
}

export type ParseResult = ParseSuccess | ParseFailure

/** Total significant digits allowed across every numeric part of the input. */
export const MAX_SIGNIFICANT_DIGITS = 15

const MINUS_GLYPHS = /−/g

function significantDigits(text: string): number {
  return text.replace(/^0+/, '').length
}

/**
 * Resolve comma usage. With a '.' present, commas are thousands separators and must
 * form exact groups of three. Without one, a single comma is the decimal separator.
 */
function normaliseCommas(body: string): string | null {
  const hasDot = body.includes('.')
  if (!body.includes(',')) return body
  if (hasDot) {
    const [intPart = '', ...rest] = body.split('.')
    if (rest.length !== 1) return null
    if (!/^\d{1,3}(,\d{3})*$/.test(intPart)) return null
    return `${intPart.replace(/,/g, '')}.${rest[0]}`
  }
  const commas = body.split(',').length - 1
  if (commas !== 1) return null
  return body.replace(',', '.')
}

function parseDecimalBody(body: string): { value: Rational; form: AnswerForm; digits: number } | null {
  const normalised = normaliseCommas(body)
  if (normalised === null) return null
  if (!/^(\d+(\.\d*)?|\.\d+)$/.test(normalised)) return null
  const [wholeText = '', fracText = ''] = normalised.split('.')
  const digits = significantDigits(wholeText) + fracText.length
  if (digits > MAX_SIGNIFICANT_DIGITS) return null
  const places = fracText.length
  // At most 15 significant digits, checked above, so this stays an exact integer.
  const scaled = Number(`${wholeText === '' ? '0' : wholeText}${fracText}`)
  return {
    value: R.ofWide(scaled, 10 ** places),
    form: places > 0 ? 'decimal' : 'integer',
    digits,
  }
}

/**
 * Parse one whole-number part of a fraction or mixed number. Callers only reach this
 * with text already matched by `\d[\d,]*`, so once commas are resolved the remainder
 * is digits; a comma that turned into a decimal point means the part was not an integer.
 */
function parseIntegerPart(text: string): { value: number; digits: number } | null {
  const normalised = text.includes(',') ? normaliseCommas(text) : text
  if (normalised === null || normalised.includes('.')) return null
  const value = Number(normalised)
  if (!Number.isSafeInteger(value)) return null
  return { value, digits: significantDigits(normalised) }
}

/** Parse a typed answer. Never throws. */
export function parseAnswer(raw: string): ParseResult {
  if (typeof raw !== 'string' || raw === '') return { ok: false, error: 'empty' }

  const unified = raw.replace(MINUS_GLYPHS, '-')

  // "Keep typing" states have to be recognised before trimming, because a trailing
  // space is exactly how someone starts a mixed number.
  if (/\s$/.test(unified)) {
    const stem = unified.trim()
    const withoutSign = stem.replace(/^[+-]/, '')
    // Whitespace alone is still "nothing typed"; a space after a sign or a number is
    // someone on their way to a mixed number.
    if (stem !== '' && (withoutSign === '' || /^\d[\d,]*$/.test(withoutSign))) {
      return { ok: false, error: 'incomplete' }
    }
  }

  const body = unified.trim()
  if (body === '') return { ok: false, error: 'empty' }

  const signed = body.startsWith('-') || body.startsWith('+')
  const sign = body.startsWith('-') ? -1 : 1
  const rest = signed ? body.slice(1) : body

  if (rest === '') return { ok: false, error: 'incomplete' }
  if (rest === '.') return { ok: false, error: 'incomplete' }
  if (/[/+]$/.test(rest)) return { ok: false, error: 'incomplete' }

  const apply = (value: Rational): Rational => (sign === -1 ? R.neg(value) : value)

  // Mixed number: "2 1/4" or "2+1/4".
  const mixed = /^(\d[\d,]*)\s*[+ ]\s*(\d[\d,]*)\/(\d[\d,]*)$/.exec(rest)
  if (mixed) {
    const whole = parseIntegerPart(mixed[1] as string)
    const num = parseIntegerPart(mixed[2] as string)
    const den = parseIntegerPart(mixed[3] as string)
    if (!whole || !num || !den) return { ok: false, error: 'invalid' }
    if (den.value === 0) return { ok: false, error: 'invalid' }
    if (whole.digits + num.digits + den.digits > MAX_SIGNIFICANT_DIGITS) {
      return { ok: false, error: 'invalid' }
    }
    // The digit cap above bounds this product well below 2^53, so it stays exact.
    const scaled = whole.value * den.value + num.value
    return {
      ok: true,
      value: apply(R.ofWide(scaled, den.value)),
      form: 'mixed',
      writtenFraction: { num: scaled, den: den.value },
    }
  }

  // Plain fraction: "3/8".
  const fraction = /^(\d[\d,]*)\/(\d[\d,]*)$/.exec(rest)
  if (fraction) {
    const num = parseIntegerPart(fraction[1] as string)
    const den = parseIntegerPart(fraction[2] as string)
    if (!num || !den) return { ok: false, error: 'invalid' }
    if (den.value === 0) return { ok: false, error: 'invalid' }
    if (num.digits + den.digits > MAX_SIGNIFICANT_DIGITS) return { ok: false, error: 'invalid' }
    return {
      ok: true,
      value: apply(R.ofWide(num.value, den.value)),
      form: 'fraction',
      writtenFraction: { num: num.value, den: den.value },
    }
  }

  const decimal = parseDecimalBody(rest)
  if (decimal) return { ok: true, value: apply(decimal.value), form: decimal.form }

  return { ok: false, error: 'invalid' }
}

/** Render a rational the way the parser would accept it back. Used for round-trip tests. */
export function formatCanonical(value: Rational): string {
  return R.toDecimalString(value) ?? R.toFractionString(value)
}
