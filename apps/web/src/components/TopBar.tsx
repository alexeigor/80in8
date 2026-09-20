import type { JSX } from 'preact'
import { Timer } from './Timer.js'

/**
 * The only chrome a run has: position, clock, score. The feedback glyph lives here
 * rather than on the answer buttons, so nothing about showing it can delay the next
 * question (§7.3).
 */

export interface TopBarProps {
  index: number
  total: number
  remaining: number | null
  elapsed: number
  score: number
  showScore: boolean
  flash: { correct: boolean; token: number } | null
  onAbort: () => void
}

export function TopBar({
  index,
  total,
  remaining,
  elapsed,
  score,
  showScore,
  flash,
  onAbort,
}: TopBarProps): JSX.Element {
  return (
    <header class="topbar">
      <span class="left">
        <span class="counter nums" data-testid="counter">
          {Math.min(index + 1, total)}/{total}
        </span>
        {/* Beside the counter, never over the clock: the verdict must not obscure the
            one number the person is watching. */}
        {flash ? (
          <span
            class="verdict"
            key={flash.token}
            data-testid="feedback"
            data-correct={String(flash.correct)}
            aria-hidden="true"
          >
            {flash.correct ? '✓' : '✗'}
          </span>
        ) : null}
      </span>
      <Timer ms={remaining} elapsed={elapsed} />
      <span class="right">
        {showScore ? (
          <span class="nums" data-testid="live-score">
            {score > 0 ? `+${score}` : score}
          </span>
        ) : null}
        <button type="button" class="ghost small" data-testid="abort" onClick={onAbort}>
          <span class="touch-label">End</span>
          <span class="keyboard-hint">Esc</span>
        </button>
      </span>
      {flash ? <div class="flash" key={`tint-${flash.token}`} data-correct={String(flash.correct)} /> : null}
    </header>
  )
}
