import type { Question } from '@80in8/core'
import type { JSX } from 'preact'
import { useRef } from 'preact/hooks'
import { Value } from './Value.js'

/**
 * The four options (DESIGN.md §7.3).
 *
 * Two things matter here and both are deliberate.
 *
 * 1. **The next question renders in the same frame.** `onSelect` dispatches straight
 *    into the reducer; the signal update re-renders before the browser paints, so the
 *    new options are on screen one frame after the tap. Nothing here waits for an
 *    animation, and the buttons themselves never flash — by the time any feedback is
 *    painted they already belong to the next question. Feedback lives in the top bar.
 * 2. **Duplicate taps are suppressed, keystrokes are not.** A double tap or a ghost
 *    click within 150 ms would otherwise answer the *next* question. Keyboard
 *    selection does not come through this component at all, so a fast typist is never
 *    throttled.
 */

export const POINTER_LOCKOUT_MS = 150

export interface McqGridProps {
  question: Question
  stacked: boolean
  onSelect: (index: number) => void
}

export function McqGrid({ question, stacked, onSelect }: McqGridProps): JSX.Element {
  // A ref, not state: it must survive the re-render that the selection itself causes.
  const lockedUntil = useRef(0)

  const press = (index: number) => (event: Event) => {
    event.preventDefault()
    const at = Date.now()
    if (at < lockedUntil.current) return
    lockedUntil.current = at + POINTER_LOCKOUT_MS
    onSelect(index)
  }

  return (
    <fieldset class="options" data-testid="mcq-grid">
      <legend class="sr-only">Answer options</legend>
      {question.options.map((option, index) => (
        // The key is the position, never the text: the grid keeps four stable cells so
        // a second tap after the advance lands on a button that is still there.
        <button
          type="button"
          class="option nums"
          key={index}
          data-testid={`option-${index}`}
          data-option-text={option.text}
          onClick={press(index)}
        >
          <span class="hint" aria-hidden="true">
            {index + 1}
          </span>
          <Value text={option.text} stacked={stacked} />
        </button>
      ))}
    </fieldset>
  )
}
