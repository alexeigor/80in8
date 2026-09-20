import { canonicalJson, generateRun, PRESETS, type Profile, profileRefOf } from '@80in8/core'
import { act, cleanup, render, screen } from '@testing-library/preact'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { encodeProfileParam, profilesReady } from '../adapters/profiles.js'
import { sync } from '../adapters/router.js'
import { App } from '../app.js'
import { abortRun, session } from '../session.js'

vi.mock('../adapters/idb.js', () => ({
  runsStore: null,
  profilesStore: null,
  storageAvailable: { value: false },
  idbEntries: vi.fn(async () => []),
  idbSet: vi.fn(async () => false),
  idbClear: vi.fn(async () => undefined),
  requestPersistence: vi.fn(async () => false),
  storagePersisted: vi.fn(async () => false),
  storageEstimate: vi.fn(async () => null),
}))

const CLASSIC = PRESETS['optiver-classic']
const presetId = generateRun('x', 3, CLASSIC, 'mcq').questionIds[0] ?? ''

function open(pathname: string, search = '') {
  history.replaceState(null, '', `${pathname}${search}`)
  act(() => {
    sync()
  })
  return render(<App />)
}

beforeEach(() => {
  vi.useFakeTimers()
  session.value = { phase: 'idle' }
  profilesReady.value = true
})

afterEach(() => {
  act(() => {
    abortRun()
  })
  cleanup()
  vi.useRealTimers()
  history.replaceState(null, '', '/')
})

describe('/q/<id>', () => {
  it('opens a preset question as a single untimed practice question, in the profile default mode', () => {
    open(`/q/${presetId}`)
    expect(session.value.phase).toBe('running')
    expect(screen.getByTestId('question').dataset.questionId).toBe(presetId)
    expect(screen.getByTestId('counter').textContent).toBe('1/1')
    expect(screen.getByTestId('timer').dataset.untimed).toBe('true')
    expect(screen.getByTestId('typed-input')).toBeTruthy()
    expect(location.pathname).toBe(`/q/${presetId}`)
    if (session.value.phase !== 'running') throw new Error('expected a run')
    expect(session.value.run.spec).toMatchObject({ kind: 'deck', origin: 'single' })
    expect(session.value.run.profile.questionCount).toBe(1)
    // The clock counts up.
    act(() => {
      vi.advanceTimersByTime(5000)
    })
    expect(screen.getByTestId('timer').textContent).toBe('0:05')
  })

  it('rejects an id it cannot parse', () => {
    open('/q/not-an-id')
    expect(screen.getByTestId('question-error')).toBeTruthy()
    expect(session.value.phase).toBe('idle')
  })

  it('waits for the stored profiles, then says when a custom profile is missing', () => {
    const custom: Profile = { ...CLASSIC, questionCount: 5 }
    const id = generateRun('x', 3, custom, 'typed', false).questionIds[0] ?? ''
    profilesReady.value = false
    open(`/q/${id}`)
    expect(screen.getByTestId('question-loading')).toBeTruthy()
    act(() => {
      profilesReady.value = true
    })
    expect(screen.getByTestId('question-unavailable').textContent).toContain(id)
    expect(session.value.phase).toBe('idle')
  })

  it('accepts the custom profile when the link carries a matching snapshot', () => {
    const custom: Profile = { ...CLASSIC, questionCount: 5, defaultMode: 'mcq' }
    const id = generateRun('x', 3, custom, 'typed', false).questionIds[0] ?? ''
    expect(profileRefOf(custom, false)).toBe(id.split('.')[1])
    open(`/q/${id}`, `?pf=${encodeProfileParam(custom)}`)
    expect(screen.getByTestId('question').dataset.questionId).toBe(id)
    expect(screen.getByTestId('mcq-grid')).toBeTruthy()
    void canonicalJson
  })
})
