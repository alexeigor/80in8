/**
 * Canonical JSON and the profile reference used inside question ids (DESIGN.md §6.5).
 *
 * A built-in preset is referenced as "<id>@<version>". A user-defined profile is
 * referenced as "custom-<hash8>", where the hash is taken over the canonical JSON so
 * that the same parameters always produce the same reference on any device.
 */
import type { Profile } from './types.js'

/** Deterministic JSON: object keys sorted, arrays kept in order, no whitespace. */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null'
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : 1))
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`).join(',')}}`
}

/** FNV-1a, rendered as 8 lowercase hex characters. */
export function hash8(input: string): string {
  let h = 0x811c9dc5
  for (let i = 0; i < input.length; i++) {
    h = Math.imul(h ^ input.charCodeAt(i), 0x01000193) >>> 0
  }
  return h.toString(16).padStart(8, '0')
}

/**
 * The parts of a profile that decide what questions come out of it.
 *
 * Deliberately narrow. A profile also carries a name, a time limit, a scoring rule and
 * a marking policy, and none of those change a single question. Hashing them too would
 * mean that practising the same paper with a longer clock, or with stricter marking,
 * forked every question id, so those runs could never share per-question statistics or
 * a retry deck with the profile they came from.
 */
function generativeFingerprint(profile: Profile) {
  return {
    questionCount: profile.questionCount,
    mix: profile.mix,
    missingOperandShare: profile.missingOperandShare,
    integer: profile.integer,
    decimal: profile.decimal,
    fraction: profile.fraction,
  }
}

/**
 * "optiver-classic@1" for a built-in preset, "custom-1a2b3c4d" for anything else.
 *
 * Two custom profiles that generate the same questions share a reference even if they
 * are marked or timed differently. A shared link still carries the whole profile, so
 * nothing is lost; what is gained is that ids stay stable across pacing and marking.
 */
export function profileRefOf(profile: Profile, builtIn: boolean): string {
  if (builtIn) return `${profile.id}@${profile.version}`
  return `custom-${hash8(canonicalJson(generativeFingerprint(profile)))}`
}

/** True for a reference of the form "custom-<8 hex>". */
export function isCustomRef(ref: string): boolean {
  return /^custom-[0-9a-f]{8}$/.test(ref)
}

/** True for a reference of the form "<kebab-id>@<version>". */
export function isPresetRef(ref: string): boolean {
  return /^[a-z0-9-]+@[1-9][0-9]*$/.test(ref)
}
