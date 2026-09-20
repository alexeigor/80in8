import { describe, expect, it } from 'vitest'
import { applyKey, type EditKey, keyToEdit } from './edit.js'

function type(keys: string, start = ''): string {
  return [...keys].reduce((draft, key) => applyKey(draft, key as EditKey), start)
}

describe('applyKey', () => {
  it('appends digits', () => {
    expect(type('407')).toBe('407')
  })

  it('toggles the sign wherever the caret is', () => {
    expect(applyKey('42', '-')).toBe('-42')
    expect(applyKey('-42', '-')).toBe('42')
    expect(applyKey('', '-')).toBe('-')
  })

  it('allows one decimal point per part', () => {
    expect(type('1.5')).toBe('1.5')
    expect(applyKey('1.5', '.')).toBe('1.5')
    expect(applyKey('.5', '.')).toBe('.5')
  })

  it('accepts a leading decimal point', () => {
    expect(type('.25')).toBe('.25')
  })

  it('builds fractions and refuses a second bar', () => {
    expect(type('3/8')).toBe('3/8')
    expect(applyKey('3/8', '/')).toBe('3/8')
    expect(applyKey('', '/')).toBe('')
    expect(applyKey('-', '/')).toBe('-')
  })

  it('refuses a decimal inside a fraction', () => {
    expect(applyKey('3/8', '.')).toBe('3/8')
    expect(applyKey('1.5', '/')).toBe('1.5')
  })

  it('uses space as the mixed-number separator, once, and never on an empty field', () => {
    expect(type('2 1/4')).toBe('2 1/4')
    expect(applyKey('', ' ')).toBe('')
    expect(applyKey('-', ' ')).toBe('-')
    expect(applyKey('2 ', ' ')).toBe('2 ')
    expect(applyKey('2.', ' ')).toBe('2.')
  })

  it('backspaces and clears', () => {
    expect(applyKey('2 1/4', 'back')).toBe('2 1/')
    expect(applyKey('', 'back')).toBe('')
    expect(applyKey('2 1/4', 'clear')).toBe('')
  })
})

describe('keyToEdit', () => {
  it('maps the physical keys from the binding table', () => {
    expect(keyToEdit('7')).toBe('7')
    expect(keyToEdit(',')).toBe('.')
    expect(keyToEdit('−')).toBe('-')
    expect(keyToEdit('Subtract')).toBe('-')
    expect(keyToEdit(' ')).toBe(' ')
    expect(keyToEdit('Backspace')).toBe('back')
  })

  it('ignores everything else, including the keys that mean something elsewhere', () => {
    expect(keyToEdit('Enter')).toBeNull()
    expect(keyToEdit('ArrowRight')).toBeNull()
    expect(keyToEdit('Escape')).toBeNull()
    expect(keyToEdit('a')).toBeNull()
  })
})
