/**
 * Seeded pseudo-random number generation (DESIGN.md §6.2).
 *
 * The core has no runtime dependencies, so we implement splitmix32 rather than pulling
 * in pure-rand or seedrandom. splitmix32 has 32 bits of state, a full period, and is
 * more than good enough to lay out an arithmetic quiz. It is deterministic, which is
 * the property the whole identity scheme rests on.
 */

/** A generator of uniform values in [0, 1). */
export type Rng = () => number

const TWO_32 = 4_294_967_296

/** splitmix32. The same seed always yields the same sequence. */
export function splitmix32(seed: number): Rng {
  let state = seed >>> 0
  return () => {
    state = (state + 0x9e3779b9) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 16), 0x21f0aaad)
    t = Math.imul(t ^ (t >>> 15), 0x735a2d97)
    return ((t ^ (t >>> 15)) >>> 0) / TWO_32
  }
}

/**
 * Derive an independent 32-bit stream seed from a base seed and a label (FNV-1a).
 * Lets the question stream and the option stream evolve without disturbing each other.
 */
export function deriveSeed(seed: number, label: string): number {
  let h = (seed >>> 0) ^ 0x811c9dc5
  for (let i = 0; i < label.length; i++) {
    h = Math.imul(h ^ label.charCodeAt(i), 0x01000193) >>> 0
  }
  // A final mix so that short labels still spread the low bits.
  h = Math.imul(h ^ (h >>> 16), 0x21f0aaad) >>> 0
  return (h ^ (h >>> 15)) >>> 0
}

/** Inclusive on both ends. Requires `lo <= hi`. */
function int(rng: Rng, lo: number, hi: number): number {
  if (hi < lo) throw new RangeError(`empty range [${lo}, ${hi}]`)
  return lo + Math.floor(rng() * (hi - lo + 1))
}

function pick<T>(rng: Rng, items: readonly T[]): T {
  if (items.length === 0) throw new RangeError('cannot pick from an empty list')
  return items[int(rng, 0, items.length - 1)] as T
}

/** Weighted choice. All weights must be finite and positive; at least one item is required. */
function weighted<T>(rng: Rng, items: readonly (readonly [T, number])[]): T {
  if (items.length === 0) throw new RangeError('cannot pick from an empty list')
  let total = 0
  for (const [, weight] of items) {
    if (!(weight > 0) || !Number.isFinite(weight))
      throw new RangeError(`weight must be positive, got ${weight}`)
    total += weight
  }
  let target = rng() * total
  for (const [item, weight] of items) {
    target -= weight
    if (target < 0) return item
  }
  return items[items.length - 1]![0]
}

/** Fisher-Yates. Returns a new array; the input is not modified. */
function shuffle<T>(rng: Rng, items: readonly T[]): T[] {
  const out = items.slice()
  for (let i = out.length - 1; i > 0; i--) {
    const j = int(rng, 0, i)
    const tmp = out[i] as T
    out[i] = out[j] as T
    out[j] = tmp
  }
  return out
}

function bool(rng: Rng, probability: number): boolean {
  return rng() < probability
}

export const rand = { int, pick, weighted, shuffle, bool } as const
