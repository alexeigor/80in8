import {
  type ExportFile,
  type HistoryEntry,
  isStoredRun,
  mergeRuns,
  migrate,
  SCHEMA_VERSION,
  type StoredRun,
} from '@80in8/core'
import { signal } from '@preact/signals'
import { idbClear, idbEntries, idbSet, requestPersistence, runsStore, storageAvailable } from './idb.js'
import { adoptProfiles, customProfiles } from './profiles.js'
import { replaceSettings, settings } from './settings.js'

/**
 * Run history (DESIGN.md §8).
 *
 * One IndexedDB record per *attempt*. The key is `attemptId`, never `runId`, so two
 * attempts at the same seed are two rows rather than one quietly overwriting the other.
 */

export const runs = signal<StoredRun[]>([])
export const historyLoaded = signal(false)
export const storageWorks = signal(true)
let historyRevision = 0

function sortRuns(list: StoredRun[]): StoredRun[] {
  return [...list].sort((a, b) => b.startedAt - a.startedAt)
}

export async function loadHistory(): Promise<void> {
  const revision = historyRevision
  const stored = await idbEntries<StoredRun>(runsStore)
  if (revision !== historyRevision) return
  // Recovery can save a run while this read is pending. Keep the newer in-memory
  // entries instead of replacing them with a snapshot taken before that write.
  runs.value = mergeRuns(runs.value, stored.map(([, run]) => run).filter(isStoredRun))
  storageWorks.value = storageAvailable.value
  historyLoaded.value = true
}

export async function saveRun(run: StoredRun): Promise<boolean> {
  runs.value = sortRuns([...runs.value.filter((r) => r.attemptId !== run.attemptId), run])
  const ok = await idbSet(runsStore, run.attemptId, run)
  storageWorks.value = ok
  // Asked for after a run has actually been recorded, so the browser prompt (where
  // there is one) follows something the person just did.
  if (ok && runs.value.length >= 1) void requestPersistence()
  return ok
}

export async function clearHistory(): Promise<void> {
  historyRevision += 1
  historyLoaded.value = true
  runs.value = []
  await idbClear(runsStore)
}

export function historyEntries(list: readonly StoredRun[] = runs.value): HistoryEntry[] {
  return list.map((run) => ({
    attemptId: run.attemptId,
    startedAt: run.startedAt,
    profileRef: run.spec.profileRef,
    mode: run.spec.mode,
    practice: run.practice,
    summary: run.summary,
  }))
}

export function buildExport(): ExportFile {
  return {
    schemaVersion: SCHEMA_VERSION,
    exportedAt: Date.now(),
    app: '80in8',
    settings: settings.value,
    profiles: customProfiles(),
    runs: runs.value,
  }
}

export function downloadExport(): void {
  const stamp = new Date().toISOString().slice(0, 10)
  const blob = new Blob([JSON.stringify(buildExport(), null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = `80in8-export-${stamp}.json`
  anchor.click()
  URL.revokeObjectURL(url)
}

export interface ImportOutcome {
  added: number
  total: number
}

/** Merge by `attemptId`; an attempt already on this device is never replaced. */
export async function importExport(text: string): Promise<ImportOutcome> {
  const file = migrate(JSON.parse(text) as unknown)
  adoptProfiles(file.profiles)
  const existing = new Set(runs.value.map((run) => run.attemptId))
  const before = runs.value.length
  const merged = mergeRuns(runs.value, file.runs)
  runs.value = sortRuns(merged)
  for (const run of merged) {
    if (existing.has(run.attemptId)) continue
    await idbSet(runsStore, run.attemptId, run)
  }
  replaceSettings(file.settings)
  return { added: runs.value.length - before, total: runs.value.length }
}
