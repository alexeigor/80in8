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

describe('links', () => {
  it('a preset run link carries the seed and mode and no payload', async () => {
    const { generateRun, PRESETS } = await import('@80in8/core')
    const { runLink, questionLink, readSharedRun } = await import('./share.js')
    const run = generateRun('a', 4242, PRESETS['optiver-classic'], 'mcq')
    const link = new URL(runLink(run))
    expect(link.origin).toBe(location.origin)
    expect(link.pathname).toBe('/')
    expect([...link.searchParams.entries()]).toEqual([
      ['p', 'optiver-classic@1'],
      ['s', '4242'],
      ['m', 'mcq'],
    ])
    expect(readSharedRun(link.searchParams)).toEqual({
      profile: PRESETS['optiver-classic'],
      mode: 'mcq',
      seed: 4242,
    })

    const first = run.questionIds[0] ?? ''
    expect(questionLink(first)).toBe(`${location.origin}/q/${first}`)
  })

  it('a custom run link and question link carry the profile snapshot', async () => {
    const { generateRun, PRESETS, generateRunFromIds } = await import('@80in8/core')
    const { runLink, questionLink } = await import('./share.js')
    const { encodeProfileParam, rememberProfile } = await import('./profiles.js')
    const custom = { ...PRESETS['optiver-classic'], questionCount: 9 }
    const ref = rememberProfile(custom)
    const run = generateRun('a', 1, custom, 'typed', false)
    expect(new URL(runLink(run)).searchParams.get('pf')).toBe(encodeProfileParam(custom))
    const first = run.questionIds[0] ?? ''
    expect(first.startsWith(`1.${ref}.`)).toBe(true)
    expect(new URL(questionLink(first)).searchParams.get('pf')).toBe(encodeProfileParam(custom))

    // A deck has no seed to share; the link is just the front door.
    const deck = generateRunFromIds('b', run.questionIds, custom, 'typed', 'retry', false)
    expect(runLink(deck)).toBe(`${location.origin}/`)
    // An id that names a profile nobody here knows, or no valid id at all.
    expect(questionLink('1.custom-00000000.int-add.0000000')).toBe(
      `${location.origin}/q/1.custom-00000000.int-add.0000000`,
    )
    expect(questionLink('nonsense')).toBe(`${location.origin}/`)
  })

  it('reads a shared run leniently: no mode means the profile default, no seed means nothing', async () => {
    const { PRESETS } = await import('@80in8/core')
    const { readSharedRun } = await import('./share.js')
    expect(readSharedRun(new URLSearchParams({ p: 'optiver-mcq@1', s: '7' }))?.mode).toBe('mcq')
    expect(readSharedRun(new URLSearchParams({ p: 'optiver-mcq@1', s: 'seven' }))).toBeNull()
    expect(readSharedRun(new URLSearchParams({ p: 'nobody@1', s: '7' }))).toBeNull()
    expect(readSharedRun(new URLSearchParams({ s: '7' }))).toBeNull()
    expect(readSharedRun(new URLSearchParams({ p: 'optiver-classic@1', s: '-1' }))?.seed).toBe(2 ** 32 - 1)
    expect(readSharedRun(new URLSearchParams({ p: 'optiver-classic@1', s: '3', m: 'typed' }))?.profile).toBe(
      PRESETS['optiver-classic'],
    )
  })

  it('copyText reports whether the clipboard took it', async () => {
    const { copyText } = await import('./share.js')
    const writeText = vi.fn().mockResolvedValue(undefined)
    vi.stubGlobal('navigator', { clipboard: { writeText } })
    expect(await copyText('hello')).toBe(true)
    expect(writeText).toHaveBeenCalledWith('hello')
    writeText.mockRejectedValue(new DOMException('Denied', 'NotAllowedError'))
    expect(await copyText('hello')).toBe(false)
    vi.stubGlobal('navigator', {})
    expect(await copyText('hello')).toBe(false)
    vi.unstubAllGlobals()
  })
})
