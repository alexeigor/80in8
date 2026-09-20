import { describe, expect, it } from 'vitest'
import { generateRun, materialise } from '../generate/run.js'
import type { Question } from '../generate/types.js'
import { profileRefOf } from '../profile/canonical.js'
import { PRESETS, resolvePreset } from '../profile/presets.js'
import { initialState, reduce } from '../session/reducer.js'
import { DEFAULT_SETTINGS, migrate, readSettings, type StoredRun } from './schema.js'
import { isSessionState, isStoredRun } from './validate.js'

const run = generateRun('validation-attempt', 42, PRESETS['optiver-classic'], 'mcq')
const questions = materialise(run, resolvePreset) as Question[]
const countdown = reduce(initialState, {
  type: 'start',
  run,
  questions,
  at: { mono: 0, wall: 1000 },
  countdownMs: 3000,
})
let running = reduce(countdown, { type: 'go', at: { mono: 3000, wall: 4000 } })
running = reduce(running, { type: 'select', optionIndex: 0, at: { mono: 4000, wall: 5000 } })
running = reduce(running, { type: 'skip', at: { mono: 5000, wall: 6000 } })
const finished = reduce(running, { type: 'abort', at: { mono: 6000, wall: 7000 } })
if (finished.phase !== 'finished') throw new Error('fixture did not finish')
const stored: StoredRun = {
  schemaVersion: 1,
  attemptId: run.attemptId,
  spec: run.spec,
  runId: run.runId!,
  startedAt: 1000,
  practice: false,
  questionIds: [...run.questionIds],
  answers: finished.answers,
  summary: finished.summary,
}

function changed<T>(base: T, path: string, value: unknown): T {
  const result = structuredClone(base)
  const parts = path.split('.')
  let target = result as Record<string, unknown>
  for (const part of parts.slice(0, -1)) target = target[part] as Record<string, unknown>
  target[parts.at(-1)!] = value
  return result
}

describe('persisted run validation', () => {
  it('accepts real records, including deck runs and optional answer fields', () => {
    expect(isStoredRun(stored)).toBe(true)
    const deck = {
      ...stored,
      runId: undefined,
      spec: {
        kind: 'deck',
        profileRef: 'custom-12345678',
        mode: 'typed',
        questionIds: run.questionIds,
        origin: 'retry',
      },
    }
    expect(isStoredRun(deck)).toBe(true)
    expect(isStoredRun(changed(stored, 'summary.accuracy', null))).toBe(true)
    expect(isStoredRun(changed(stored, 'summary.passed', null))).toBe(true)
    expect(
      isStoredRun(changed(stored, 'summary.distractorSources', [{ source: 'sign-flip', count: 1 }])),
    ).toBe(true)
  })

  it.each([
    ['spec', undefined],
    ['summary', undefined],
    ['startedAt', Number.NaN],
    ['startedAt', 9e15],
    ['startedAt', 'today'],
    ['practice', 'false'],
    ['runId', 'invalid'],
    ['attemptId', ''],
    ['spec.seed', -1],
    ['spec.seed', 2 ** 32],
    ['spec.seed', 1.5],
    ['spec.profileRef', 4],
    ['spec.profileRef', 'invalid'],
    ['spec.mode', 'voice'],
    ['questionIds', [null]],
    ['answers', {}],
    ['answers.0.raw', 2],
    ['answers.0.elapsedMs', -1],
    ['answers.0.value.den', 0],
    ['answers.0.value.num', 1.5],
    ['answers.0.optionIndex', 4],
    ['answers.0.source', ''],
    ['summary.accuracy', 2],
    ['summary.accuracy', -0.1],
    ['summary.byKind.0.kind', 'unknown'],
    ['summary.byKind.0.meanMs', -1],
    ['summary.byOp.0.op', '?'],
    ['summary.slowest', [{ questionId: 'invalid', elapsedMs: 0 }]],
    ['summary.distractorSources', [{ source: null, count: 1 }]],
    ['summary.passed', 0],
    ['summary.endedBy', 'unknown'],
    ['summary.score', Infinity],
    ['summary.questionCount', 2.5],
    ['summary.correct', -1],
  ])('rejects invalid %s (%s)', (path, value) => {
    const bad = changed(stored, path as string, value)
    expect(isStoredRun(bad)).toBe(false)
    expect(() => migrate({ app: '80in8', schemaVersion: 1, settings: {}, runs: [bad] })).toThrow()
  })

  it.each([null, [], 'not an object', 3])('rejects non-record %s', (value) => {
    expect(isStoredRun(value)).toBe(false)
  })
})

describe('session validation', () => {
  it('accepts each real reducer phase and untimed clocks', () => {
    for (const state of [initialState, countdown, running, finished]) expect(isSessionState(state)).toBe(true)
    expect(isSessionState(changed(running, 'deadline', undefined))).toBe(true)
    expect(isSessionState(changed(running, 'hiddenSince', 1))).toBe(true)
  })
  it.each([
    ['phase', 'invalid'],
    ['run.profile', {}],
    ['run', null],
    ['answers', undefined],
    ['questions', null],
    ['questions.0.display.left', null],
    ['questions.0.options.0.value', null],
    ['deadline.mono', 'now'],
    ['hiddenSince', Infinity],
    ['index', -1],
  ])('rejects corrupt session %s', (path, value) => {
    expect(isSessionState(changed(running, path as string, value))).toBe(false)
  })
})

describe('settings and profile validation', () => {
  it('fills missing settings and accepts all supported choices', () => {
    expect(readSettings({})).toEqual(DEFAULT_SETTINGS)
    expect(
      readSettings({
        theme: 'dark',
        mode: 'mcq',
        fractionPolicy: 'simplified',
        profileRef: 'custom-12345678',
      }).theme,
    ).toBe('dark')
    expect(readSettings({ theme: 'light', unused: 'ignored' }).theme).toBe('light')
    expect(readSettings(DEFAULT_SETTINGS)).toEqual(DEFAULT_SETTINGS)
  })
  it.each(Object.keys(DEFAULT_SETTINGS))('rejects an invalid %s setting', (key) => {
    expect(() => readSettings({ [key]: null })).toThrow(`invalid setting ${key}`)
  })
  it.each(['profileRef', 'theme', 'mode', 'fractionPolicy'])('rejects an unknown %s choice', (key) => {
    expect(() => readSettings({ [key]: 'unknown' })).toThrow()
  })
  it.each([null, [], 'bad'])('rejects settings %s', (value) => {
    expect(() => readSettings(value)).toThrow()
  })
  it('checks custom profile hashes and validates snapshots before importing', () => {
    const profile = PRESETS['optiver-classic']
    const file = {
      app: '80in8',
      schemaVersion: 1,
      settings: {},
      runs: [],
      profiles: { [profileRefOf(profile, false)]: profile },
    }
    expect(Object.keys(migrate(file).profiles)).toHaveLength(1)
    expect(() => migrate({ ...file, profiles: { 'custom-00000000': profile } })).toThrow('invalid profile')
    expect(() => migrate({ ...file, profiles: { 'custom-00000000': {} } })).toThrow('invalid profile')
  })
})
