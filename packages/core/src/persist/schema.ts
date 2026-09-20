/**
 * Stored shapes and migrations (DESIGN.md §6.11).
 *
 * Types and pure validation only: the core performs no I/O, so the web app owns
 * IndexedDB and the file pickers. Runs are keyed by `attemptId`, which is why two
 * attempts at the same seed are two rows rather than one overwriting the other.
 */

import type { QuestionId, RunId, RunSpec } from '../generate/types.js'
import { isCustomRef, isPresetRef, profileRefOf } from '../profile/canonical.js'
import type { Mode, Profile } from '../profile/types.js'
import { validateProfile } from '../profile/validate.js'
import type { Answer, RunSummary } from '../session/types.js'
import { isStoredRun } from './validate.js'

export const SCHEMA_VERSION = 1

export interface StoredRun {
  schemaVersion: typeof SCHEMA_VERSION
  /** Storage key. Unique per attempt, so "same seed" never overwrites an earlier row. */
  attemptId: string
  /** Present for seeded runs; absent for decks, which no seed reproduces. */
  runId?: RunId
  spec: RunSpec
  startedAt: number
  practice: boolean
  questionIds: QuestionId[]
  summary: RunSummary
  answers: Answer[]
}

export interface Settings {
  profileRef: string
  mode: Mode
  /** Show the on-screen keypad instead of relying on the device keyboard. */
  keypad: boolean
  autoSubmit: boolean
  theme: 'system' | 'light' | 'dark'
  sound: boolean
  /** Force reduced motion on, regardless of what the operating system reports. */
  reducedMotion: boolean
  /** Render fractions stacked rather than inline. */
  stackedFractions: boolean
  fractionPolicy: 'equivalent' | 'simplified'
  announceTimer: boolean
  showLiveScore: boolean
  feedback: boolean
}

export const DEFAULT_SETTINGS: Settings = {
  profileRef: 'optiver-classic@1',
  mode: 'typed',
  keypad: true,
  autoSubmit: false,
  theme: 'system',
  sound: false,
  reducedMotion: false,
  stackedFractions: true,
  fractionPolicy: 'equivalent',
  announceTimer: true,
  showLiveScore: false,
  feedback: true,
}

export interface ExportFile {
  schemaVersion: typeof SCHEMA_VERSION
  exportedAt: number
  app: '80in8'
  settings: Settings
  /** Every profile referenced by a stored id, so old ids stay resolvable forever. */
  profiles: Record<string, Profile>
  runs: StoredRun[]
}

export class MigrationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'MigrationError'
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** Missing settings get defaults; present values must have the documented type. */
export function readSettings(value: unknown): Settings {
  if (!isRecord(value)) throw new MigrationError('settings must be an object')
  const result = { ...DEFAULT_SETTINGS }
  for (const key of Object.keys(DEFAULT_SETTINGS) as (keyof Settings)[]) {
    if (!(key in value)) continue
    const field = value[key]
    let valid = typeof field === 'boolean'
    if (key === 'profileRef') valid = typeof field === 'string' && (isPresetRef(field) || isCustomRef(field))
    else if (key === 'mode') valid = field === 'typed' || field === 'mcq'
    else if (key === 'theme') valid = field === 'system' || field === 'light' || field === 'dark'
    else if (key === 'fractionPolicy') valid = field === 'equivalent' || field === 'simplified'
    if (!valid) throw new MigrationError(`invalid setting ${key}`)
    Object.assign(result, { [key]: field })
  }
  return result
}

/**
 * Validate and upgrade an export file. Throws `MigrationError` on anything unknown,
 * rather than importing a file we cannot interpret.
 */
export function migrate(file: unknown): ExportFile {
  if (!isRecord(file)) throw new MigrationError('export must be an object')
  if (file.app !== '80in8') throw new MigrationError('not an 80in8 export file')
  const version = file.schemaVersion
  if (version !== 1) {
    throw new MigrationError(`unsupported schema version ${String(version)}; this build understands 1`)
  }
  if (!Array.isArray(file.runs)) throw new MigrationError('export is missing its runs array')
  if (!isRecord(file.settings)) throw new MigrationError('export is missing its settings')

  const runs = file.runs.map((run, index) => {
    if (!isRecord(run)) throw new MigrationError(`run ${index} is not an object`)
    if (typeof run.attemptId !== 'string' || run.attemptId === '') {
      throw new MigrationError(`run ${index} has no attemptId`)
    }
    if (!Array.isArray(run.questionIds)) throw new MigrationError(`run ${index} has no questionIds`)
    if (!Array.isArray(run.answers)) throw new MigrationError(`run ${index} has no answers`)
    if (!isStoredRun(run)) throw new MigrationError(`run ${index} has invalid fields`)
    return run
  })

  const profiles: Record<string, Profile> = {}
  if (isRecord(file.profiles)) {
    for (const [ref, value] of Object.entries(file.profiles)) {
      try {
        const profile = validateProfile(value as Profile)
        if (profileRefOf(profile, isPresetRef(ref)) !== ref) throw new Error('profile reference mismatch')
        profiles[ref] = profile
      } catch {
        throw new MigrationError(`invalid profile ${ref}`)
      }
    }
  }

  return {
    schemaVersion: SCHEMA_VERSION,
    exportedAt: typeof file.exportedAt === 'number' ? file.exportedAt : 0,
    app: '80in8',
    settings: readSettings(file.settings),
    profiles,
    runs,
  }
}

/** Merge imported runs into existing ones. An attempt already present is never replaced. */
export function mergeRuns(existing: readonly StoredRun[], incoming: readonly StoredRun[]): StoredRun[] {
  const byId = new Map<string, StoredRun>()
  for (const run of existing) byId.set(run.attemptId, run)
  for (const run of incoming) if (!byId.has(run.attemptId)) byId.set(run.attemptId, run)
  return [...byId.values()].sort((a, b) => b.startedAt - a.startedAt)
}
