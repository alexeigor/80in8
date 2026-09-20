import {
  canonicalJson,
  isCustomRef,
  type Profile,
  profileRefOf,
  resolvePreset,
  validateProfile,
} from '@80in8/core'
import { signal } from '@preact/signals'
import { idbEntries, idbSet, profilesStore } from './idb.js'

/**
 * Profile resolution (DESIGN.md §6.5).
 *
 * A question id names the profile that generated it. Presets resolve from the core's
 * frozen registry forever; anything the user derived (a different duration, an untimed
 * practice variant, a shorter deck) is a *custom* profile referenced by the hash of its
 * canonical JSON, so the snapshot must travel with the ids — in IndexedDB locally, and
 * in the `pf` query parameter when a link is shared.
 */

const custom = new Map<string, Profile>()

/** Flips once the stored custom snapshots are in memory; `/q/<id>` waits for it. */
export const profilesReady = signal(false)

export function resolveProfile(ref: string): Profile | undefined {
  return resolvePreset(ref) ?? custom.get(ref)
}

/**
 * Store the snapshot a custom reference resolves to.
 *
 * Since the reference hashes only the generative fields, two profiles that ask the
 * same questions but are timed or marked differently share one reference. The newest
 * wins: a `?p=`-only link then resolves to the way the sender most recently played it.
 * A `?pf=` link carries the whole profile, so nothing is guessed at there.
 */
export function rememberProfile(profile: Profile): string {
  const ref = profileRefOf(profile, false)
  const stored = custom.get(ref)
  if (!stored || canonicalJson(stored) !== canonicalJson(profile)) {
    custom.set(ref, profile)
    void idbSet(profilesStore, ref, profile)
  }
  return ref
}

export function customProfiles(): Record<string, Profile> {
  return Object.fromEntries(custom)
}

export function adoptProfiles(map: Record<string, Profile>): void {
  for (const [ref, profile] of Object.entries(map)) {
    if (custom.has(ref)) continue
    if (validSnapshot(ref, profile)) {
      custom.set(ref, profile)
      void idbSet(profilesStore, ref, profile)
    }
  }
}

function validSnapshot(ref: string, profile: Profile): boolean {
  try {
    return isCustomRef(ref) && profileRefOf(validateProfile(profile), false) === ref
  } catch {
    return false
  }
}

export async function loadProfiles(): Promise<void> {
  for (const [ref, profile] of await idbEntries<Profile>(profilesStore)) {
    if (!custom.has(ref) && validSnapshot(ref, profile)) custom.set(ref, profile)
  }
  profilesReady.value = true
}

/**
 * A profile is "built in" only when it is byte-identical to a published preset; any
 * override makes it custom, which is what keeps question ids honest.
 */
export function isBuiltIn(profile: Profile): boolean {
  const preset = resolvePreset(`${profile.id}@${profile.version}`)
  return preset !== undefined && canonicalJson(preset) === canonicalJson(profile)
}

export function refOf(profile: Profile): string {
  return isBuiltIn(profile) ? profileRefOf(profile, true) : rememberProfile(profile)
}

const B64_URL = /[+/=]/g
const B64_STD = /[-_]/g

export function encodeProfileParam(profile: Profile): string {
  const bytes = new TextEncoder().encode(canonicalJson(profile))
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(B64_URL, (c) => (c === '+' ? '-' : c === '/' ? '_' : ''))
}

/**
 * Decode a shared profile and check that it hashes to the reference in the id. Without
 * this a tampered payload would silently regenerate a different question under someone
 * else's id.
 */
export function decodeProfileParam(param: string, expectedRef: string): Profile | undefined {
  try {
    const binary = atob(param.replace(B64_STD, (c) => (c === '-' ? '+' : '/')))
    const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0))
    const profile = validateProfile(JSON.parse(new TextDecoder().decode(bytes)) as Profile)
    if (profileRefOf(profile, false) !== expectedRef) return undefined
    custom.set(expectedRef, profile)
    void idbSet(profilesStore, expectedRef, profile)
    return profile
  } catch {
    return undefined
  }
}
