import { describe, expect, it } from 'vitest'
import { PRESETS } from '../profile/presets.js'
import { summariseRun } from '../stats/summary.js'
import {
  DEFAULT_SETTINGS,
  type ExportFile,
  MigrationError,
  mergeRuns,
  migrate,
  SCHEMA_VERSION,
  type StoredRun,
} from './schema.js'

const summary = summariseRun([], PRESETS['optiver-classic'], {
  endedBy: 'completed',
  totalMs: 0,
  hiddenMs: 0,
})

function run(attemptId: string, startedAt = 0): StoredRun {
  return {
    schemaVersion: SCHEMA_VERSION,
    attemptId,
    runId: '1.optiver-classic@1.typed.0000001',
    spec: { kind: 'seeded', profileRef: 'optiver-classic@1', mode: 'typed', seed: 1 },
    startedAt,
    practice: false,
    questionIds: ['1.optiver-classic@1.int-add.0000001'],
    summary,
    answers: [],
  }
}

function exportFile(patch: Partial<ExportFile> = {}): ExportFile {
  return {
    schemaVersion: SCHEMA_VERSION,
    exportedAt: 1000,
    app: '80in8',
    settings: DEFAULT_SETTINGS,
    profiles: { 'optiver-classic@1': PRESETS['optiver-classic'] },
    runs: [run('a')],
    ...patch,
  }
}

describe('defaults', () => {
  it('points at a preset that actually exists', () => {
    expect(DEFAULT_SETTINGS.profileRef).toBe('optiver-classic@1')
  })
})

describe('migrate', () => {
  it('accepts a current file unchanged', () => {
    const file = exportFile()
    expect(migrate(JSON.parse(JSON.stringify(file)))).toEqual(file)
  })

  it('fills in settings added since the file was written', () => {
    const file = exportFile({ settings: { mode: 'mcq' } as never })
    expect(migrate(file).settings).toEqual({ ...DEFAULT_SETTINGS, mode: 'mcq' })
  })

  it('tolerates a missing profiles map and export time', () => {
    const file = { ...exportFile() } as Record<string, unknown>
    file.profiles = undefined
    file.exportedAt = undefined
    const migrated = migrate(file)
    expect(migrated.profiles).toEqual({})
    expect(migrated.exportedAt).toBe(0)
  })

  it.each<[string, unknown, RegExp]>([
    ['a non-object', 'nope', /must be an object/],
    ['a null', null, /must be an object/],
    ['an array', [], /must be an object/],
    ["someone else's file", { app: 'other' }, /not an 80in8 export/],
    ['a future schema', { app: '80in8', schemaVersion: 2 }, /unsupported schema version 2/],
    ['a missing schema', { app: '80in8' }, /unsupported schema version undefined/],
    ['no runs array', { app: '80in8', schemaVersion: 1 }, /missing its runs array/],
    ['no settings', { app: '80in8', schemaVersion: 1, runs: [] }, /missing its settings/],
  ])('refuses %s', (_label, input, message) => {
    expect(() => migrate(input)).toThrow(message)
    expect(() => migrate(input)).toThrow(MigrationError)
  })

  it.each<[string, unknown, RegExp]>([
    ['a non-object run', 'x', /run 0 is not an object/],
    ['a run with no attempt id', {}, /run 0 has no attemptId/],
    ['a run with an empty attempt id', { attemptId: '' }, /run 0 has no attemptId/],
    ['a run with no question ids', { attemptId: 'a' }, /run 0 has no questionIds/],
    ['a run with no answers', { attemptId: 'a', questionIds: [] }, /run 0 has no answers/],
  ])('refuses %s', (_label, badRun, message) => {
    expect(() => migrate(exportFile({ runs: [badRun as StoredRun] }))).toThrow(message)
  })
})

describe('mergeRuns', () => {
  it('adds new attempts and never overwrites an existing one', () => {
    const existing = [run('a', 100)]
    const incoming = [{ ...run('a', 999), practice: true }, run('b', 200)]
    const merged = mergeRuns(existing, incoming)
    expect(merged).toHaveLength(2)
    expect(merged.find((r) => r.attemptId === 'a')?.practice).toBe(false)
  })

  it('sorts newest first', () => {
    expect(mergeRuns([run('a', 1)], [run('b', 3), run('c', 2)]).map((r) => r.attemptId)).toEqual([
      'b',
      'c',
      'a',
    ])
  })

  it('keeps two attempts at the same seed as two rows', () => {
    // The whole point of keying on attemptId rather than runId.
    const first = run('attempt-1', 1)
    const second = { ...run('attempt-2', 2) }
    expect(second.runId).toBe(first.runId)
    expect(mergeRuns([first], [second])).toHaveLength(2)
  })

  it('handles empty inputs', () => {
    expect(mergeRuns([], [])).toEqual([])
  })
})
