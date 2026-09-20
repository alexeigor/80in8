import { isCustomRef, type Mode, type Profile, parseId, type QuestionId, type Run } from '@80in8/core'
import { decodeProfileParam, encodeProfileParam, resolveProfile } from './profiles.js'
import { href } from './router.js'

/**
 * Share links (DESIGN.md §6.5, F7).
 *
 *   `?p=<profileRef>&s=<seed>&m=<mode>`  reproduces a whole run
 *   `/q/<questionId>`                    opens one question, untimed
 *
 * A custom profile is not in the recipient's browser, so its canonical JSON rides
 * along in `pf` and is accepted only if it hashes back to the reference in the id.
 */

function absolute(pathAndQuery: string): string {
  return new URL(href(pathAndQuery), location.origin).toString()
}

export function runLink(run: Run): string {
  if (run.spec.kind !== 'seeded') return absolute('/')
  const params = new URLSearchParams({
    p: run.spec.profileRef,
    s: String(run.spec.seed),
    m: run.spec.mode,
  })
  if (isCustomRef(run.spec.profileRef)) params.set('pf', encodeProfileParam(run.profile))
  return absolute(`/?${params.toString()}`)
}

export function questionLink(id: QuestionId): string {
  const parsed = parseId(id)
  if ('error' in parsed) return absolute('/')
  if (!isCustomRef(parsed.profileRef)) return absolute(`/q/${id}`)
  const profile = resolveProfile(parsed.profileRef)
  if (!profile) return absolute(`/q/${id}`)
  return absolute(`/q/${id}?pf=${encodeProfileParam(profile)}`)
}

export interface SharedRun {
  profile: Profile
  mode: Mode
  seed: number
}

/** Read a shared run out of the query string, resolving (and verifying) any `pf` payload. */
export function readSharedRun(params: URLSearchParams): SharedRun | null {
  const ref = params.get('p')
  if (!ref) return null
  const profile = readProfile(ref, params)
  if (!profile) return null
  const seed = Number(params.get('s'))
  const mode = params.get('m') === 'mcq' ? 'mcq' : params.get('m') === 'typed' ? 'typed' : profile.defaultMode
  if (!Number.isFinite(seed)) return null
  return { profile, mode, seed: seed >>> 0 }
}

export function readProfile(ref: string, params: URLSearchParams): Profile | undefined {
  const payload = params.get('pf')
  // The same generative hash can have different timing/scoring settings. An
  // explicit snapshot must win over the recipient's previously saved variant.
  if (payload !== null && isCustomRef(ref)) return decodeProfileParam(payload, ref)
  return resolveProfile(ref)
}

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    return false
  }
}
