/**
 * Redraw accounting (DESIGN.md §6.6 rule 5).
 *
 * Generators reject degenerate draws and try again. The loop is bounded so that every
 * generator is total; when the bound is reached we emit a fixed, valid question instead.
 * The counter exists so a test can assert the fallback rate stays under 0.1%.
 */
import type { Kind } from '../profile/types.js'

/** Draws attempted before a generator gives up and uses its fixed fallback. */
export const MAX_DRAW_ATTEMPTS = 64

const counts = new Map<Kind, number>()

export function noteFallback(kind: Kind): void {
  counts.set(kind, (counts.get(kind) ?? 0) + 1)
}

export function fallbackCount(kind?: Kind): number {
  if (kind) return counts.get(kind) ?? 0
  let total = 0
  for (const n of counts.values()) total += n
  return total
}

export function resetFallbackCounts(): void {
  counts.clear()
}
