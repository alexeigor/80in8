import { PRESETS } from '@80in8/core'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/preact'
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { navigate, path, startRouter } from './adapters/router.js'
import { updateReady } from './adapters/sw.js'
import { App } from './app.js'
import { abortRun, question, session, startRun } from './session.js'
import { abortPending, reviewOpen, shortcutsOpen, showToast, toast } from './ui-state.js'

/**
 * The binding table (§7.8) and the browser's Back button (§7.7), through the real
 * App: one key handler, so a key never means two things in the same context.
 */

const CLASSIC = PRESETS['optiver-classic']

// main.tsx starts the router before the App mounts, so its popstate listener runs
// first and `path` is current by the time the App's own listener looks at it.
const stopRouter = startRouter()
afterAll(stopRouter)

const go = (to: string) => act(() => navigate(to, { replace: true }))

function begin(count = 8, mode: 'typed' | 'mcq' = 'typed') {
  act(() => {
    startRun({
      profile: { ...CLASSIC, questionCount: count },
      mode,
      seed: 5,
      practice: false,
      countdownMs: 0,
    })
  })
}

function answerMany(n: number) {
  for (let index = 0; index < n; index++) fireEvent.keyDown(window, { key: 'ArrowRight' })
}

function finish(answers = 1) {
  begin()
  answerMany(answers)
  act(() => {
    abortRun()
  })
  expect(session.value.phase).toBe('finished')
}

const key = (k: string, init: KeyboardEventInit = {}) => fireEvent.keyDown(window, { key: k, ...init })

beforeEach(() => {
  vi.useFakeTimers()
  go('/')
  shortcutsOpen.value = false
  abortPending.value = false
  reviewOpen.value = false
  toast.value = null
  updateReady.value = false
})

afterEach(() => {
  act(() => {
    abortRun()
  })
  cleanup()
  vi.useRealTimers()
})

describe('the shortcuts sheet', () => {
  it('opens on ? anywhere but a text field, and closes on Escape or Enter', () => {
    render(<App />)
    key('?')
    expect(screen.getByTestId('shortcuts')).toBeTruthy()
    key('Escape')
    expect(screen.queryByTestId('shortcuts')).toBeNull()
    key('?')
    key('Enter')
    expect(screen.queryByTestId('shortcuts')).toBeNull()

    fireEvent.click(screen.getByTestId('toggle-advanced'))
    const seed = screen.getByTestId('seed')
    fireEvent.keyDown(seed, { key: '?' })
    expect(screen.queryByTestId('shortcuts')).toBeNull()
  })

  it('swallows every other key while open', () => {
    render(<App />)
    begin(8, 'mcq')
    key('?')
    key('1')
    expect(screen.getByTestId('counter').textContent).toBe('1/8')
    key('Escape')
    key('1')
    expect(screen.getByTestId('counter').textContent).toBe('2/8')
  })

  it('ignores keys held with a modifier', () => {
    render(<App />)
    begin(8, 'mcq')
    key('1', { ctrlKey: true })
    key('2', { metaKey: true })
    key('3', { altKey: true })
    key('?', { ctrlKey: true })
    expect(screen.getByTestId('counter').textContent).toBe('1/8')
    expect(screen.queryByTestId('shortcuts')).toBeNull()
  })
})

describe('leaving a run', () => {
  it('Escape ends a short run at once and asks after more than five answers', () => {
    render(<App />)
    begin()
    answerMany(5)
    key('Escape')
    expect(session.value.phase).toBe('finished')

    begin()
    answerMany(6)
    key('Escape')
    expect(screen.getByTestId('abort-confirm')).toBeTruthy()
    // While the question is up, nothing else is heard and ? is refused.
    key('1')
    key('?')
    expect(screen.queryByTestId('shortcuts')).toBeNull()
    key('Escape')
    expect(screen.queryByTestId('abort-confirm')).toBeNull()
    expect(session.value.phase).toBe('running')

    key('Escape')
    fireEvent.keyDown(window, { key: 'Enter' })
    expect(session.value.phase).toBe('finished')
    expect(abortPending.value).toBe(false)
  })

  it('the Back button ends a short run and asks about a long one, staying on the run', () => {
    render(<App />)
    begin()
    answerMany(2)
    act(() => {
      history.replaceState(null, '', '/')
      dispatchEvent(new PopStateEvent('popstate'))
    })
    expect(session.value.phase).toBe('finished')

    begin()
    answerMany(6)
    act(() => {
      history.replaceState(null, '', '/')
      dispatchEvent(new PopStateEvent('popstate'))
    })
    expect(abortPending.value).toBe(true)
    expect(path.value).toBe('/run')
    expect(location.pathname).toBe('/run')

    // Back while already on the run route, or with no run, changes nothing.
    abortPending.value = false
    act(() => {
      dispatchEvent(new PopStateEvent('popstate'))
    })
    expect(abortPending.value).toBe(false)
    act(() => {
      abortRun()
    })
    act(() => {
      history.replaceState(null, '', '/')
      dispatchEvent(new PopStateEvent('popstate'))
    })
    expect(session.value.phase).toBe('finished')
  })

  it('the Back button during the countdown just abandons it', () => {
    render(<App />)
    act(() => {
      startRun({ profile: { ...CLASSIC, questionCount: 8 }, mode: 'typed', seed: 5, practice: false })
    })
    expect(session.value.phase).toBe('countdown')
    act(() => {
      history.replaceState(null, '', '/')
      dispatchEvent(new PopStateEvent('popstate'))
    })
    expect(session.value.phase).toBe('finished')
    expect(session.value.phase === 'finished' && session.value.answers).toHaveLength(0)
  })
})

describe('the countdown and the home screen', () => {
  it('Enter skips the countdown, and Enter on Home starts unless a control has focus', () => {
    render(<App />)
    key('Enter')
    expect(session.value.phase).toBe('countdown')
    key('Escape')
    expect(session.value.phase).toBe('countdown')
    key('Enter')
    expect(session.value.phase).toBe('running')
    act(() => {
      abortRun()
    })
    go('/')
    fireEvent.click(screen.getByTestId('toggle-advanced'))
    fireEvent.keyDown(screen.getByTestId('seed'), { key: 'Enter' })
    expect(session.value.phase).toBe('finished')
    fireEvent.keyDown(screen.getByTestId('toggle-advanced'), { key: 'Enter' })
    expect(session.value.phase).toBe('finished')
    fireEvent.keyDown(screen.getByTestId('start'), { key: 'Enter' })
    expect(session.value.phase).toBe('finished')
  })
})

describe('the results keys', () => {
  it('Enter again, S same seed, M retry, R review; never from inside a field or a button', () => {
    render(<App />)
    finish(2)
    const first = session.value.phase === 'finished' ? session.value.run.questionIds[0] : ''
    expect(path.value).toBe('/results')

    key('r')
    expect(reviewOpen.value).toBe(true)
    key('R')
    expect(reviewOpen.value).toBe(false)

    fireEvent.keyDown(screen.getByTestId('toggle-review'), { key: 'Enter' })
    expect(session.value.phase).toBe('finished')
    const field = document.createElement('input')
    document.body.append(field)
    fireEvent.keyDown(field, { key: 's' })
    expect(session.value.phase).toBe('finished')
    field.remove()

    // Two skips are two misses: the deck is those two, in order.
    key('m')
    key('Enter')
    expect(question.value?.id).toBe(first)
    expect(session.value.phase === 'running' && session.value.run.questionIds).toHaveLength(2)
    expect(session.value.phase === 'running' && session.value.run.spec.kind).toBe('deck')
    act(() => {
      abortRun()
    })
    go('/results')
    key('s')
    expect(session.value.phase).toBe('countdown')
    key('Enter')
    expect(question.value?.id).toBe(first)
    act(() => {
      abortRun()
    })
    go('/results')
    key('Enter')
    key('Enter')
    expect(session.value.phase === 'running' && session.value.run.spec.kind).toBe('seeded')
    expect(question.value?.id).not.toBe(first)
  })
})

describe('routes and overlays', () => {
  it('shows a not-found page, and hands a malformed question path to the question screen', () => {
    render(<App />)
    go('/nowhere')
    expect(screen.getByTestId('not-found')).toBeTruthy()
    history.replaceState(null, '', '/q/%E0%A4%A')
    act(() => {
      dispatchEvent(new PopStateEvent('popstate'))
    })
    expect(screen.getByTestId('question-error')).toBeTruthy()
  })

  it('offers a waiting update only on Home and Results, and shows toasts', () => {
    render(<App />)
    act(() => {
      updateReady.value = true
    })
    expect(screen.getByTestId('update-toast')).toBeTruthy()
    go('/settings')
    expect(screen.queryByTestId('update-toast')).toBeNull()
    begin()
    expect(screen.queryByTestId('update-toast')).toBeNull()
    act(() => {
      abortRun()
    })
    expect(screen.getByTestId('update-toast')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Reload' }))

    act(() => {
      showToast('Hello', 100)
    })
    expect(screen.getByTestId('toast').textContent).toBe('Hello')
    act(() => {
      vi.advanceTimersByTime(100)
    })
    expect(screen.queryByTestId('toast')).toBeNull()
  })
})
