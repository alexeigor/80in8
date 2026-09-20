import { PRESETS } from '@80in8/core'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/preact'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { navigate, path } from '../adapters/router.js'
import { updateSettings } from '../adapters/settings.js'
import { App } from '../app.js'
import { abortRun, dispatch, question, session, startRun } from '../session.js'
import { abortPending } from '../ui-state.js'

/** The run screen's chrome: countdown, End button, nudge, keypad and layout. */

const CLASSIC = PRESETS['optiver-classic']
const now = () => ({ mono: performance.now(), wall: Date.now() })

function begin(options: Partial<Parameters<typeof startRun>[0]> = {}) {
  act(() => {
    startRun({
      profile: { ...CLASSIC, questionCount: 8 },
      mode: 'typed',
      seed: 9,
      practice: false,
      countdownMs: 0,
      ...options,
    })
  })
}

function answerMany(n: number) {
  for (let index = 0; index < n; index++) act(() => dispatch({ type: 'skip', at: now() }))
}

beforeEach(() => {
  vi.useFakeTimers()
  updateSettings({ keypad: false, feedback: true, showLiveScore: false })
  abortPending.value = false
  act(() => {
    navigate('/', { replace: true })
  })
})

afterEach(() => {
  act(() => {
    abortRun()
  })
  cleanup()
  vi.useRealTimers()
})

describe('the countdown', () => {
  it('counts three, two, one on the clock and offers a skip', () => {
    render(<App />)
    begin({ countdownMs: 3000 })
    const digit = () => screen.getByTestId('countdown').querySelector('.n')?.textContent
    expect(digit()).toBe('3')
    act(() => {
      vi.advanceTimersByTime(1100)
    })
    expect(digit()).toBe('2')
    act(() => {
      vi.advanceTimersByTime(1000)
    })
    expect(digit()).toBe('1')
    act(() => {
      vi.advanceTimersByTime(1000)
    })
    expect(screen.getByTestId('question')).toBeTruthy()
    act(() => {
      abortRun()
    })
    begin({ countdownMs: 3000 })
    fireEvent.click(screen.getByTestId('skip-countdown'))
    expect(session.value.phase).toBe('running')
  })

  it('sends a visitor with no run home', () => {
    act(() => {
      session.value = { phase: 'idle' }
    })
    render(<App />)
    act(() => {
      navigate('/run')
    })
    expect(path.value).toBe('/')
  })
})

describe('the End control', () => {
  it('ends a short run at once and asks about a longer one', () => {
    render(<App />)
    begin()
    answerMany(5)
    fireEvent.click(screen.getByTestId('abort'))
    expect(session.value.phase).toBe('finished')
    expect(path.value).toBe('/results')

    begin()
    answerMany(6)
    fireEvent.click(screen.getByTestId('abort'))
    expect(screen.getByTestId('abort-confirm').textContent).toContain('You have answered 6 questions')
    fireEvent.click(screen.getByTestId('abort-no'))
    expect(screen.queryByTestId('abort-confirm')).toBeNull()
    expect(session.value.phase).toBe('running')
    fireEvent.click(screen.getByTestId('abort'))
    fireEvent.click(screen.getByTestId('abort-yes'))
    expect(session.value.phase).toBe('finished')
  })
})

describe('the typed surface', () => {
  it('holds focus on the answer field, and any tap on the run puts it back', () => {
    render(<App />)
    begin()
    const input = screen.getByTestId('typed-input')
    expect(document.activeElement).toBe(input)
    screen.getByTestId('abort').focus()
    fireEvent.pointerDown(screen.getByTestId('question'))
    expect(document.activeElement).toBe(input)
    expect(screen.getByTestId('run').dataset.layout).toBe('centred')
    expect(screen.getByTestId('run').dataset.mode).toBe('typed')
  })

  it('shows the keypad when asked, keeping the draft, and wires its keys to the run', () => {
    render(<App />)
    begin()
    expect(screen.queryByTestId('keypad')).toBeNull()
    fireEvent.keyDown(window, { key: '1' })
    fireEvent.click(screen.getByTestId('show-keypad'))
    expect(screen.getByTestId('keypad')).toBeTruthy()
    expect(screen.getByTestId('run').dataset.layout).toBe('stage')
    expect(screen.getByTestId<HTMLInputElement>('typed-input').value).toBe('1')
    expect(document.activeElement).toBe(screen.getByTestId('typed-input'))

    fireEvent.click(screen.getByTestId('key-2'))
    expect(screen.getByTestId<HTMLInputElement>('typed-input').value).toBe('12')
    fireEvent.click(screen.getByTestId('key-submit'))
    expect(screen.getByTestId('counter').textContent).toBe('2/8')
    fireEvent.click(screen.getByTestId('key-skip'))
    expect(screen.getByTestId('counter').textContent).toBe('3/8')
    expect(screen.getByTestId('question-id').textContent).toBe(question.value?.id)
  })

  it('nudges after a second without focus, and the nudge goes when focus returns', () => {
    render(<App />)
    begin()
    act(() => {
      window.dispatchEvent(new Event('blur'))
    })
    expect(screen.queryByTestId('blurred')).toBeNull()
    act(() => {
      vi.advanceTimersByTime(1000)
    })
    expect(screen.getByTestId('blurred').textContent).toContain('the clock is still running')
    act(() => {
      window.dispatchEvent(new Event('focus'))
    })
    expect(screen.queryByTestId('blurred')).toBeNull()
    // A blur that is undone in time never shows anything.
    act(() => {
      window.dispatchEvent(new Event('blur'))
    })
    act(() => {
      vi.advanceTimersByTime(500)
    })
    act(() => {
      window.dispatchEvent(new Event('focus'))
    })
    act(() => {
      vi.advanceTimersByTime(1000)
    })
    expect(screen.queryByTestId('blurred')).toBeNull()
  })
})

describe('the multiple-choice surface', () => {
  it('shows the grid, a skip button where allowed, the live score when asked, and the verdict', () => {
    updateSettings({ showLiveScore: true })
    render(<App />)
    begin({ mode: 'mcq' })
    expect(screen.getByTestId('run').dataset.mode).toBe('mcq')
    expect(screen.getByTestId('mcq-grid')).toBeTruthy()
    expect(screen.getByTestId('live-score').textContent).toBe('0')
    fireEvent.click(screen.getByTestId('skip'))
    expect(screen.getByTestId('counter').textContent).toBe('2/8')
    const wrong = question.value?.options.findIndex((option) => !option.correct) ?? 0
    fireEvent.click(screen.getByTestId(`option-${wrong}`))
    expect(screen.getByTestId('live-score').textContent).toBe('-1')
    expect(screen.getByTestId('feedback').dataset.correct).toBe('false')
    act(() => {
      vi.advanceTimersByTime(400)
    })
    expect(screen.queryByTestId('feedback')).toBeNull()
    act(() => {
      abortRun()
    })
    begin({ mode: 'mcq', profile: { ...PRESETS['optiver-strict'], questionCount: 8 } })
    expect(screen.queryByTestId('skip')).toBeNull()
  })
})
