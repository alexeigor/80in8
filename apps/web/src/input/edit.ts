/**
 * Editing the typed answer (DESIGN.md §7.4, §7.8).
 *
 * A pure string transform, shared by the physical keyboard and the on-screen keypad,
 * so both surfaces cannot drift apart. The grammar it produces is Appendix C's:
 * `-12`, `.5`, `3/8`, `2 1/4`.
 */

export type EditKey =
  | '0'
  | '1'
  | '2'
  | '3'
  | '4'
  | '5'
  | '6'
  | '7'
  | '8'
  | '9'
  | '.'
  | '/'
  | '-'
  | ' '
  | 'back'
  | 'clear'

const DIGITS = new Set(['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'])

/** The part of the input the next character would join: after the space, after the slash. */
function tail(draft: string): string {
  const cut = Math.max(draft.lastIndexOf(' '), draft.lastIndexOf('/'))
  return cut === -1 ? draft : draft.slice(cut + 1)
}

export function applyKey(draft: string, key: EditKey): string {
  if (key === 'back') return draft.slice(0, -1)
  if (key === 'clear') return ''

  // The sign is a toggle at any caret position, because a minus key is hard to reach
  // on a phone and impossible to place after the fact.
  if (key === '-') return draft.startsWith('-') ? draft.slice(1) : `-${draft}`

  if (DIGITS.has(key)) return draft + key

  if (key === '.') {
    if (draft.includes('/')) return draft // a fraction part is never decimal
    return tail(draft).includes('.') ? draft : draft + key
  }

  if (key === '/') {
    const body = draft.startsWith('-') ? draft.slice(1) : draft
    if (body === '' || draft.includes('/') || draft.endsWith(' ')) return draft
    if (tail(draft).includes('.')) return draft
    return draft + key
  }

  // Space is the mixed-number separator and nothing else. It never skips a question.
  const body = draft.startsWith('-') ? draft.slice(1) : draft
  if (body === '' || draft.includes(' ') || draft.includes('/') || draft.endsWith('.')) return draft
  return `${draft} `
}

/** Maps a `KeyboardEvent.key` to an edit key, or null when the app should ignore it. */
export function keyToEdit(key: string): EditKey | null {
  if (DIGITS.has(key)) return key as EditKey
  if (key === '.' || key === ',') return '.'
  if (key === '/') return '/'
  if (key === '-' || key === '−' || key === 'Subtract') return '-'
  if (key === ' ' || key === 'Spacebar') return ' '
  if (key === 'Backspace') return 'back'
  return null
}
