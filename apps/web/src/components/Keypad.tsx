import type { JSX } from 'preact'
import type { EditKey } from '../input/edit.js'

/**
 * The on-screen keypad (DESIGN.md §7.4).
 *
 * It exists because iOS has no minus key on the numeric keyboard and because the
 * system keyboard resizes the viewport mid-run. The field is `inputmode="none"`, so
 * this is the only touch surface — and a physical keyboard keeps working alongside it.
 * Keys are ≥ 48 px and `touch-action: manipulation`.
 */

export type KeypadAction = { kind: 'edit'; key: EditKey } | { kind: 'submit' } | { kind: 'skip' }

export interface KeypadProps {
  onAction: (action: KeypadAction) => void
  allowSkip: boolean
}

interface Cell {
  testid: string
  label: string
  aria: string
  action: KeypadAction
  class?: string
}

const digit = (n: number): Cell => ({
  testid: `key-${n}`,
  label: String(n),
  aria: String(n),
  action: { kind: 'edit', key: String(n) as EditKey },
})

export function Keypad({ onAction, allowSkip }: KeypadProps): JSX.Element {
  const cells: Cell[] = [
    digit(7),
    digit(8),
    digit(9),
    { testid: 'key-back', label: '⌫', aria: 'backspace', action: { kind: 'edit', key: 'back' } },
    digit(4),
    digit(5),
    digit(6),
    { testid: 'key-slash', label: '/', aria: 'fraction bar', action: { kind: 'edit', key: '/' } },
    digit(1),
    digit(2),
    digit(3),
    { testid: 'key-space', label: '␣', aria: 'mixed number separator', action: { kind: 'edit', key: ' ' } },
    { testid: 'key-minus', label: '−', aria: 'toggle sign', action: { kind: 'edit', key: '-' } },
    digit(0),
    { testid: 'key-dot', label: '.', aria: 'decimal point', action: { kind: 'edit', key: '.' } },
    allowSkip
      ? { testid: 'key-skip', label: 'Skip', aria: 'skip question', action: { kind: 'skip' } }
      : { testid: 'key-clear', label: 'C', aria: 'clear', action: { kind: 'edit', key: 'clear' } },
    { testid: 'key-submit', label: '✓', aria: 'submit answer', action: { kind: 'submit' }, class: 'go full' },
  ]

  return (
    <div class="keypad" data-testid="keypad">
      {cells.map((cell) => (
        <button
          type="button"
          key={cell.testid}
          class={cell.class}
          data-testid={cell.testid}
          aria-label={cell.aria}
          // The answer field must keep focus so the physical keyboard still works.
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => onAction(cell.action)}
        >
          {cell.label}
        </button>
      ))}
    </div>
  )
}
