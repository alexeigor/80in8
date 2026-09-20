import type { Clocks } from '@80in8/core'

/**
 * The only place the app reads a clock.
 *
 * Both clocks travel with every event the reducer sees. `performance.now()` is
 * monotonic and immune to the user changing the system time, but on many platforms it
 * stops while the device sleeps; `Date.now()` keeps going but can be moved. The core
 * takes the stricter of the two, so neither closing a laptop nor winding the clock
 * back buys extra time. Ticks are never counted — the deadline is an instant, and the
 * display is derived from it.
 */
export function now(): Clocks {
  return { mono: performance.now(), wall: Date.now() }
}
