import type { JSX } from 'preact'

/**
 * `m:ss`, tabular numerals, a reserved minimum width: the clock ticks without ever
 * moving anything else on screen (§7.6).
 */
export function formatClock(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000))
  const minutes = Math.floor(total / 60)
  const seconds = total % 60
  return `${minutes}:${String(seconds).padStart(2, '0')}`
}

export type Urgency = 'calm' | 'soon' | 'now'

export function urgencyOf(ms: number | null): Urgency {
  if (ms === null) return 'calm'
  if (ms <= 10_000) return 'now'
  if (ms <= 60_000) return 'soon'
  return 'calm'
}

export interface TimerProps {
  /** Remaining milliseconds, or null for an untimed run (then `elapsed` is shown). */
  ms: number | null
  elapsed?: number
}

export function Timer({ ms, elapsed = 0 }: TimerProps): JSX.Element {
  const untimed = ms === null
  const text = untimed ? formatClock(elapsed) : formatClock(ms)
  return (
    <span
      class="timer nums"
      role="timer"
      data-testid="timer"
      data-urgency={urgencyOf(ms)}
      data-untimed={untimed ? 'true' : 'false'}
      aria-label={untimed ? `${text} elapsed` : `${text} remaining`}
    >
      {text}
    </span>
  )
}
