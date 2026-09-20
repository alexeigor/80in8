import { PRESETS, type Profile, profileRefOf } from '@80in8/core'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/preact'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { runs } from '../adapters/history.js'
import { encodeProfileParam } from '../adapters/profiles.js'
import { sync } from '../adapters/router.js'
import { settings, updateSettings } from '../adapters/settings.js'
import { App } from '../app.js'
import { installPrompt } from '../install.js'
import { abortRun, runError, session } from '../session.js'
import { Home, seedFromText } from './Home.js'

/** The configuration screen: what it offers, what it discloses, and what it starts. */

const CLASSIC = PRESETS['optiver-classic']

function open(search = '') {
  history.replaceState(null, '', `/${search}`)
  act(() => {
    sync()
  })
  return render(<App />)
}

beforeEach(() => {
  updateSettings({ profileRef: 'optiver-classic@1', mode: 'typed' })
  runs.value = []
  runError.value = null
  installPrompt.value = null
})

afterEach(() => {
  act(() => {
    abortRun()
  })
  cleanup()
  history.replaceState(null, '', '/')
})

describe('seedFromText', () => {
  it('takes digits as they are, hashes words, and draws a fresh seed for nothing', () => {
    expect(seedFromText(' 4242 ')).toBe(4242)
    expect(seedFromText('hello')).toBe(seedFromText('hello'))
    expect(seedFromText('hello')).not.toBe(seedFromText('world'))
    expect(seedFromText('')).not.toBe(seedFromText(''))
  })
})

describe('the picker', () => {
  it('lists the tests, keeps the answer format separate, and discloses the terms', () => {
    open()
    const picker = screen.getByTestId<HTMLSelectElement>('profile')
    expect([...picker.options].map((option) => option.value)).toEqual([
      'optiver-classic@1',
      'optiver-strict@1',
      'optiver-harsh@1',
      'hard@1',
      'zetamac-drill@1',
    ])
    expect(screen.getByTestId('disclosure').textContent).toBe(
      '80 questions · 8:00 · +1 correct · -1 wrong · 0 skipped',
    )
    expect(screen.getByTestId('mode-typed').getAttribute('aria-pressed')).toBe('true')

    fireEvent.change(picker, { target: { value: 'optiver-harsh@1' } })
    expect(screen.getByTestId('disclosure').textContent).toContain('-2 wrong · -2 skipped')
    fireEvent.click(screen.getByTestId('mode-mcq'))
    expect(screen.getByTestId('mode-mcq').getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByTestId('mode-typed').getAttribute('aria-pressed')).toBe('false')
  })

  it('offers the question mix only for the classic test and maps it onto the frozen presets', () => {
    open()
    fireEvent.click(screen.getByTestId('toggle-advanced'))
    const mix = screen.getByTestId<HTMLSelectElement>('question-mix')
    expect(mix.value).toBe('0.2')
    fireEvent.change(mix, { target: { value: '0.4' } })
    expect(screen.getByTestId('disclosure').textContent).toContain('40% missing-number questions')
    fireEvent.change(screen.getByTestId('profile'), { target: { value: 'hard@1' } })
    expect(screen.queryByTestId('question-mix')).toBeNull()
    fireEvent.click(screen.getByTestId('toggle-advanced'))
    expect(screen.queryByTestId('advanced')).toBeNull()
  })

  it('starts a run with the chosen settings and remembers them as the defaults', () => {
    open()
    fireEvent.click(screen.getByTestId('mode-mcq'))
    fireEvent.change(screen.getByTestId('profile'), { target: { value: 'optiver-strict@1' } })
    fireEvent.click(screen.getByTestId('start'))
    expect(session.value.phase).toBe('countdown')
    expect(session.value.phase === 'countdown' && session.value.run.spec).toMatchObject({
      profileRef: 'optiver-strict@1',
      mode: 'mcq',
    })
    expect(settings.value).toMatchObject({ profileRef: 'optiver-strict@1', mode: 'mcq' })
    expect(location.pathname).toBe('/run')
  })
})

describe('the advanced panel', () => {
  it('derives count, pace and seed, and marks practice pacing as practice', () => {
    open()
    fireEvent.click(screen.getByTestId('toggle-advanced'))
    const count = screen.getByTestId<HTMLInputElement>('count')
    fireEvent.input(count, { target: { value: '900' } })
    expect(screen.getByTestId('disclosure').textContent).toContain('500 questions')
    fireEvent.input(count, { target: { value: '0' } })
    expect(screen.getByTestId('disclosure').textContent).toContain('80 questions')
    fireEvent.input(count, { target: { value: '3' } })
    fireEvent.change(screen.getByTestId('pace'), { target: { value: 'untimed' } })
    expect(screen.getByTestId('disclosure').textContent).toBe(
      '3 questions · no time limit · +1 correct · -1 wrong · 0 skipped',
    )
    fireEvent.input(screen.getByTestId('seed'), { target: { value: '77' } })
    fireEvent.click(screen.getByTestId('start'))
    const state = session.value
    if (state.phase !== 'countdown') throw new Error('expected a countdown')
    expect(state.run.spec).toMatchObject({ kind: 'seeded', seed: 77 })
    expect(state.run.questionIds).toHaveLength(3)
    expect(state.run.profile.timeLimit).toEqual({ kind: 'untimed' })
    expect(state.run.spec.profileRef).toMatch(/^custom-/)
  })
})

describe('a shared link', () => {
  const shared: Profile = { ...CLASSIC, questionCount: 3, missingOperandShare: 0.3 }
  const search = `?${new URLSearchParams({
    p: profileRefOf(shared, false),
    pf: encodeProfileParam(shared),
    s: '4242',
    m: 'mcq',
  })}`

  it('preselects everything the link says without touching the saved defaults', () => {
    open(search)
    expect(screen.getByTestId<HTMLSelectElement>('profile').value).toBe('shared')
    expect(screen.getByText('Optiver 80 in 8 (from link)')).toBeTruthy()
    expect(screen.getByTestId('mode-mcq').getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByTestId('disclosure').textContent).toContain('3 questions')
    expect(screen.getByTestId('disclosure').textContent).toContain('30% missing-number')
    fireEvent.click(screen.getByTestId('toggle-advanced'))
    expect(screen.getByTestId<HTMLInputElement>('seed').value).toBe('4242')
    expect(screen.getByText('From link (30%)')).toBeTruthy()
    fireEvent.click(screen.getByTestId('start'))
    expect(session.value.phase === 'countdown' && session.value.run.spec).toMatchObject({
      seed: 4242,
      mode: 'mcq',
    })
    expect(settings.value).toMatchObject({ profileRef: 'optiver-classic@1', mode: 'typed' })
  })

  it('lets the mix be changed on the shared profile, and lets another test replace it', () => {
    open(search)
    fireEvent.click(screen.getByTestId('toggle-advanced'))
    fireEvent.change(screen.getByTestId('question-mix'), { target: { value: '0.2' } })
    expect(screen.getByTestId('disclosure').textContent).toContain('3 questions')
    expect(screen.getByTestId('disclosure').textContent).not.toContain('missing-number')
    fireEvent.change(screen.getByTestId('profile'), { target: { value: 'shared' } })
    fireEvent.change(screen.getByTestId('profile'), { target: { value: 'hard@1' } })
    expect(screen.queryByText(/from link/)).toBeNull()
    expect(screen.getByTestId('disclosure').textContent).toContain('80 questions')
  })
})

describe('extras', () => {
  it('shows a start error, and the install button after two runs', async () => {
    open()
    act(() => {
      runError.value = 'Those questions could not be rebuilt.'
    })
    expect(screen.getByTestId('run-error').textContent).toContain('could not be rebuilt')

    const prompt = vi.fn().mockResolvedValue(undefined)
    act(() => {
      installPrompt.value = Object.assign(new Event('beforeinstallprompt'), { prompt })
    })
    expect(screen.queryByTestId('install')).toBeNull()
    act(() => {
      runs.value = [{ attemptId: 'a' }, { attemptId: 'b' }] as never
    })
    fireEvent.click(screen.getByTestId('install'))
    await act(() => Promise.resolve())
    expect(prompt).toHaveBeenCalledOnce()
    expect(screen.queryByTestId('install')).toBeNull()
  })

  it('renders on its own with the stored profile when nothing is shared', () => {
    updateSettings({ profileRef: 'zetamac-drill@1' })
    render(<Home />)
    expect(screen.getByTestId<HTMLSelectElement>('profile').value).toBe('zetamac-drill@1')
    expect(screen.getByTestId('disclosure').textContent).toBe(
      '500 questions · 2:00 · +1 correct · 0 wrong · 0 skipped',
    )
  })
})
