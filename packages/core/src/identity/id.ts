/**
 * Question and run identifiers (DESIGN.md §6.5).
 *
 * A question is a pure function of (profile, kind, seed), so the id encodes exactly
 * those three things and nothing else. Given an id and a way to resolve the profile,
 * the question, its missing slot and its four options all come back identically.
 *
 * Deliberately absent from the id: the mode (a question missed in typed mode can be
 * retried as multiple choice) and the attempt (see `Run.attemptId`).
 */

import type { QuestionId, RunId } from '../generate/types.js'
import { isCustomRef, isPresetRef } from '../profile/canonical.js'
import { ALL_KINDS, type Kind, type Mode } from '../profile/types.js'

export const ID_VERSION = '1'
const SEED_CHARS = 7
const TWO_32 = 4_294_967_296

export type IdError = 'malformed' | 'unsupported-version' | 'unknown-kind'

export interface ParsedQuestionId {
  v: 1
  profileRef: string
  kind: Kind
  seed: number
}

export interface ParsedRunId {
  v: 1
  profileRef: string
  mode: Mode
  seed: number
}

const KIND_BY_SLUG = new Map<string, Kind>(ALL_KINDS.map((kind) => [kind.replace('.', '-'), kind]))

export function kindSlug(kind: Kind): string {
  return kind.replace('.', '-')
}

function encodeSeed(seed: number): string {
  return (seed >>> 0).toString(36).padStart(SEED_CHARS, '0')
}

function decodeSeed(text: string): number | null {
  if (text.length !== SEED_CHARS || !/^[0-9a-z]+$/.test(text)) return null
  const value = Number.parseInt(text, 36)
  if (!Number.isInteger(value) || value < 0 || value >= TWO_32) return null
  return value
}

function validRef(ref: string): boolean {
  return isPresetRef(ref) || isCustomRef(ref)
}

export function toId(parts: { profileRef: string; kind: Kind; seed: number }): QuestionId {
  return `${ID_VERSION}.${parts.profileRef}.${kindSlug(parts.kind)}.${encodeSeed(parts.seed)}`
}

export function toRunId(parts: { profileRef: string; mode: Mode; seed: number }): RunId {
  return `${ID_VERSION}.${parts.profileRef}.${parts.mode}.${encodeSeed(parts.seed)}`
}

export function parseId(id: string): ParsedQuestionId | { error: IdError } {
  if (typeof id !== 'string') return { error: 'malformed' }
  const segments = id.split('.')
  if (segments.length !== 4) return { error: 'malformed' }
  const [version, profileRef, slug, seedText] = segments as [string, string, string, string]
  if (version !== ID_VERSION) {
    return { error: /^[0-9]+$/.test(version) ? 'unsupported-version' : 'malformed' }
  }
  if (!validRef(profileRef)) return { error: 'malformed' }
  const seed = decodeSeed(seedText)
  if (seed === null) return { error: 'malformed' }
  const kind = KIND_BY_SLUG.get(slug)
  if (!kind) return { error: 'unknown-kind' }
  return { v: 1, profileRef, kind, seed }
}

export function parseRunId(id: string): ParsedRunId | { error: IdError } {
  if (typeof id !== 'string') return { error: 'malformed' }
  const segments = id.split('.')
  if (segments.length !== 4) return { error: 'malformed' }
  const [version, profileRef, mode, seedText] = segments as [string, string, string, string]
  if (version !== ID_VERSION) {
    return { error: /^[0-9]+$/.test(version) ? 'unsupported-version' : 'malformed' }
  }
  if (!validRef(profileRef)) return { error: 'malformed' }
  if (mode !== 'mcq' && mode !== 'typed') return { error: 'malformed' }
  const seed = decodeSeed(seedText)
  if (seed === null) return { error: 'malformed' }
  return { v: 1, profileRef, mode, seed }
}

/** Ids are safe in URLs and file names, and short enough to read aloud. */
export const ID_PATTERN = /^[A-Za-z0-9.@-]+$/
