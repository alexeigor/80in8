import type { Mode, Profile } from '@80in8/core'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/preact'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { navigate } from './adapters/router.js'
import { App } from './app.js'
import { draft } from './input/actions.js'
import { abortRun, session, startRun } from './session.js'
import { MCQ_PROFILE, NO_SKIP_PROFILE, TYPED_PROFILE } from './test/fixtures.js'

/**
 * The run surface end to end inside jsdom: the real reducer, the real key handling,
 * the real components. Only the clock is fake.
 */

function begin(profile: Profile, mode: Mode, seed = 99): void {
  act(() => {
    startRun({
      profile: { ...profile, questionCount: 8 },
      mode,
      seed,
      practice: false,
      countdownMs: 0,
    })
  })
}

const questionId = (): string | undefined => screen.getByTestId('question').dataset.questionId
const counter = (): string | null => screen.getByTestId('counter').textContent

beforeEach(() => {
  navigate('/', { replace: true })
  // Freezes Date.now and performance.now, so the 150 ms pointer guard and the eight
  // minute deadline are both exactly where the test puts them.
  vi.useFakeTimers()
})

afterEach(() => {
  act(() => {
    abortRun()
  })
  cleanup()
  vi.useRealTimers()
})

describe('multiple choice', () => {
  it('advances to the next question in the same synchronous flush as the keypress', () => {
    render(<App />)
    begin(MCQ_PROFILE, 'mcq')

    const first = questionId()
    expect(counter()).toBe('1/8')

    fireEvent.keyDown(window, { key: '1' })

    // No awaits: by the time the event handler has returned, the DOM already shows
    // the next question. That is the < 16 ms input-to-next-question budget (N3).
    expect(questionId()).not.toBe(first)
    expect(counter()).toBe('2/8')
  })

  it('accepts every option key and records the option that was chosen', () => {
    render(<App />)
    begin(MCQ_PROFILE, 'mcq')
    const chosen = screen.getByTestId('option-2').dataset.optionText

    fireEvent.keyDown(window, { key: '3' })

    const state = session.value
    if (state.phase !== 'running') throw new Error('run should still be going')
    expect(state.answers[0]?.raw).toBe(chosen)
    expect(state.answers[0]?.optionIndex).toBe(2)
  })

  it('never throttles the keyboard, even though a second tap is suppressed', () => {
    render(<App />)
    begin(MCQ_PROFILE, 'mcq')

    fireEvent.keyDown(window, { key: '1' })
    fireEvent.keyDown(window, { key: '1' })
    expect(counter()).toBe('3/8')

    // Two taps inside the double-tap window count once.
    fireEvent.click(screen.getByTestId('option-0'))
    fireEvent.click(screen.getByTestId('option-0'))
    expect(counter()).toBe('4/8')
  })

  it('shows the verdict in the top bar, not on the option buttons', () => {
    render(<App />)
    begin(MCQ_PROFILE, 'mcq')
    fireEvent.keyDown(window, { key: '1' })

    const flash = screen.getByTestId('feedback')
    expect(flash.closest('.topbar')).not.toBeNull()
    expect(flash.closest('.options')).toBeNull()
  })
})

describe('typed input', () => {
  it('types through the physical keyboard and submits on Enter', () => {
    render(<App />)
    begin(TYPED_PROFILE, 'typed')

    fireEvent.keyDown(window, { key: '4' })
    fireEvent.keyDown(window, { key: '2' })
    expect(screen.getByTestId<HTMLInputElement>('typed-input').value).toBe('42')

    fireEvent.keyDown(window, { key: 'Enter' })
    expect(counter()).toBe('2/8')
    expect(draft.value).toBe('')
  })

  it('does nothing on Enter while the entry is incomplete', () => {
    render(<App />)
    begin(TYPED_PROFILE, 'typed')

    fireEvent.keyDown(window, { key: '-' })
    fireEvent.keyDown(window, { key: 'Enter' })

    expect(counter()).toBe('1/8')
    expect(screen.getByTestId<HTMLInputElement>('typed-input').value).toBe('-')
  })

  it('treats Space as the mixed-number separator and never as a skip', () => {
    render(<App />)
    begin(TYPED_PROFILE, 'typed')

    fireEvent.keyDown(window, { key: '2' })
    fireEvent.keyDown(window, { key: ' ' })
    fireEvent.keyDown(window, { key: '1' })
    fireEvent.keyDown(window, { key: '/' })
    fireEvent.keyDown(window, { key: '4' })

    expect(screen.getByTestId<HTMLInputElement>('typed-input').value).toBe('2 1/4')
    expect(counter()).toBe('1/8')
  })

  it('shows a live parse hint only when it adds something', () => {
    render(<App />)
    begin(TYPED_PROFILE, 'typed')

    fireEvent.keyDown(window, { key: '9' })
    fireEvent.keyDown(window, { key: '/' })
    fireEvent.keyDown(window, { key: '4' })
    // Already canonical: repeating it back would be noise.
    expect(screen.getByTestId('parse-hint').textContent).toBe('')

    for (const key of ['Backspace', 'Backspace', 'Backspace']) fireEvent.keyDown(window, { key })
    for (const key of ['2', ' ', '1', '/', '4']) fireEvent.keyDown(window, { key })
    expect(screen.getByTestId('parse-hint').textContent).toBe('= 9/4')
  })
})

describe('skipping', () => {
  it('skips with ArrowRight when the profile allows it', () => {
    render(<App />)
    begin(TYPED_PROFILE, 'typed')

    fireEvent.keyDown(window, { key: 'ArrowRight' })

    expect(counter()).toBe('2/8')
    const state = session.value
    if (state.phase !== 'running') throw new Error('run should still be going')
    expect(state.answers[0]?.skipped).toBe(true)
  })

  it('ignores ArrowRight when the profile forbids skipping', () => {
    render(<App />)
    begin(NO_SKIP_PROFILE, 'typed')

    fireEvent.keyDown(window, { key: 'ArrowRight' })

    expect(counter()).toBe('1/8')
  })
})

describe('the clock', () => {
  it('ends the run retroactively when the deadline passed while nothing was running', () => {
    render(<App />)
    begin(TYPED_PROFILE, 'typed')

    fireEvent.keyDown(window, { key: '1' })

    // Device sleep: the wall clock keeps going while `performance.now()` stands
    // still (vi.setSystemTime deliberately does not touch it). Sleep must not buy
    // extra time, so the stricter clock has to end the run.
    vi.setSystemTime(Date.now() + 9 * 60_000)
    act(() => {
      window.dispatchEvent(new Event('pageshow'))
    })

    const state = session.value
    expect(state.phase).toBe('finished')
    if (state.phase !== 'finished') throw new Error('expected a finished run')
    expect(state.endedBy).toBe('time')
    // The digit typed but never submitted is not an answer.
    expect(state.answers).toHaveLength(0)
  })
})
