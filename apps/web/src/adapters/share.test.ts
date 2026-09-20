import { PRESETS, type Profile, profileRefOf } from '@80in8/core'
import { describe, expect, it, vi } from 'vitest'
import { idbEntries } from './idb.js'
import {
  encodeProfileParam,
  loadProfiles,
  profilesReady,
  rememberProfile,
  resolveProfile,
} from './profiles.js'
import { readProfile, readSharedRun } from './share.js'

vi.mock('./idb.js', () => ({ profilesStore: null, idbSet: vi.fn(), idbEntries: vi.fn() }))

describe('custom profile snapshots', () => {
  it('uses the shared timing snapshot even when the recipient already knows its question hash', () => {
    const timed: Profile = { ...PRESETS['optiver-classic'], questionCount: 3 }
    const extended: Profile = { ...timed, timeLimit: { kind: 'timed', durationMs: 4_800_000 } }
    const ref = rememberProfile(timed)
    expect(profileRefOf(extended, false)).toBe(ref)
    const params = new URLSearchParams({ p: ref, s: '42', m: 'typed', pf: encodeProfileParam(extended) })
    expect(readSharedRun(params)?.profile.timeLimit).toEqual(extended.timeLimit)
  })

  it('rejects an explicitly invalid payload even if a valid local snapshot exists', () => {
    const profile = { ...PRESETS['optiver-classic'], questionCount: 4 }
    const ref = rememberProfile(profile)
    for (const pf of ['', 'not-base64', encodeProfileParam({ ...profile, questionCount: 5 })]) {
      expect(readProfile(ref, new URLSearchParams({ pf }))).toBeUndefined()
    }
    expect(readProfile(ref, new URLSearchParams())).toEqual(profile)
  })

  it('drops invalid or mismatched persisted profiles while loading valid ones', async () => {
    const valid = { ...PRESETS['optiver-classic'], questionCount: 6 }
    const ref = profileRefOf(valid, false)
    const wrong = profileRefOf({ ...valid, questionCount: 7 }, false)
    const broken = profileRefOf({ ...valid, questionCount: 8 }, false)
    vi.mocked(idbEntries).mockResolvedValueOnce([
      [ref, valid],
      [wrong, valid],
      [broken, null],
    ])
    await loadProfiles()
    expect(profilesReady.value).toBe(true)
    expect(resolveProfile(ref)).toEqual(valid)
    expect(resolveProfile(wrong)).toBeUndefined()
    expect(resolveProfile(broken)).toBeUndefined()
  })
})
