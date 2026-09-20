import { PRESETS, type Profile, practiceVariant, profileRefOf } from '@80in8/core'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { idbSet } from './idb.js'
import {
  adoptProfiles,
  customProfiles,
  decodeProfileParam,
  encodeProfileParam,
  isBuiltIn,
  refOf,
  rememberProfile,
  resolveProfile,
} from './profiles.js'

vi.mock('./idb.js', () => ({ profilesStore: null, idbSet: vi.fn(), idbEntries: vi.fn() }))

const CLASSIC = PRESETS['optiver-classic']

beforeEach(() => {
  vi.mocked(idbSet).mockReset()
})

describe('what counts as built in', () => {
  it('a preset, byte for byte', () => {
    expect(isBuiltIn(CLASSIC)).toBe(true)
    expect(refOf(CLASSIC)).toBe('optiver-classic@1')
  })

  it('a practice or marking variant of a preset, because it asks the same questions', () => {
    // §6.5: pacing, marking and the name never change a question, so the untimed
    // practice of the classic test keeps the classic ids and shares its statistics.
    for (const variant of [
      practiceVariant(CLASSIC, 'untimed'),
      practiceVariant(CLASSIC, 'extended'),
      { ...CLASSIC, answerPolicy: { fractions: 'simplified' as const } },
      { ...CLASSIC, name: 'Renamed', scoring: { ...CLASSIC.scoring, wrong: -2 } },
    ]) {
      expect(isBuiltIn(variant)).toBe(true)
      expect(refOf(variant)).toBe('optiver-classic@1')
    }
    expect(idbSet).not.toHaveBeenCalled()
  })

  it('not a change to the questions themselves', () => {
    for (const variant of [
      { ...CLASSIC, questionCount: 40 },
      { ...CLASSIC, missingOperandShare: 0.3 },
      { ...CLASSIC, id: 'my-own' },
      { ...CLASSIC, version: 99 },
    ]) {
      expect(isBuiltIn(variant)).toBe(false)
      expect(refOf(variant)).toMatch(/^custom-[0-9a-f]{8}$/)
    }
  })
})

describe('remembering custom snapshots', () => {
  it('stores a snapshot once and lets the newest variant of the same questions win', () => {
    const forty: Profile = { ...CLASSIC, questionCount: 44 }
    const ref = rememberProfile(forty)
    rememberProfile(forty)
    expect(idbSet).toHaveBeenCalledTimes(1)
    expect(resolveProfile(ref)).toEqual(forty)

    const relaxed = practiceVariant(forty, 'untimed')
    expect(rememberProfile(relaxed)).toBe(ref)
    expect(resolveProfile(ref)).toEqual(relaxed)
    expect(customProfiles()[ref]).toEqual(relaxed)
  })

  it('adopts imported snapshots only when they hash to their reference and validate', () => {
    const good: Profile = { ...CLASSIC, questionCount: 41 }
    const ref = profileRefOf(good, false)
    const already: Profile = { ...CLASSIC, questionCount: 42 }
    const alreadyRef = rememberProfile(already)
    vi.mocked(idbSet).mockClear()

    adoptProfiles({
      [ref]: good,
      [alreadyRef]: { ...already, name: 'should not replace' },
      'custom-00000000': good,
      'optiver-classic@1': CLASSIC,
      'custom-deadbeef': { name: 'broken' } as unknown as Profile,
    })
    expect(resolveProfile(ref)).toEqual(good)
    expect(resolveProfile(alreadyRef)).toEqual(already)
    expect(resolveProfile('custom-00000000')).toBeUndefined()
    expect(resolveProfile('custom-deadbeef')).toBeUndefined()
    expect(idbSet).toHaveBeenCalledTimes(1)
  })
})

describe('the share payload', () => {
  it('round-trips a profile through base64url and refuses a payload that does not hash back', () => {
    const custom: Profile = { ...CLASSIC, questionCount: 43 }
    const ref = profileRefOf(custom, false)
    const payload = encodeProfileParam(custom)
    expect(payload).toMatch(/^[A-Za-z0-9_-]+$/)
    expect(decodeProfileParam(payload, ref)).toEqual(custom)
    expect(decodeProfileParam(payload, 'custom-00000000')).toBeUndefined()
    expect(decodeProfileParam('%%%', ref)).toBeUndefined()
    expect(decodeProfileParam(btoa('{"id":1}'), ref)).toBeUndefined()
  })
})
