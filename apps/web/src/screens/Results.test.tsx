import { PRESETS, type RunSummary, summariseRun } from '@80in8/core'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/preact'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { navigate, path } from '../adapters/router.js'
import { App } from '../app.js'
import { abortRun, dispatch, question, recovered, session, startRun } from '../session.js'
import { reviewOpen, toast } from '../ui-state.js'
import { bandOf } from './Results.js'

const CLASSIC = PRESETS['optiver-classic']
const now = () => ({ mono: performance.now(), wall: Date.now() })

function begin(mode: 'typed' | 'mcq' = 'typed', count = 4) {
  act(() => {
    startRun({
      profile: { ...CLASSIC, questionCount: count },
      mode,
      seed: 21,
      practice: false,
      countdownMs: 0,
    })
  })
}

function answer(correct: boolean) {
  const current = question.value
  if (!current) throw new Error('no question')
  act(() => {
    dispatch({
      type: 'answer',
      raw: correct ? `${current.answer.num}/${current.answer.den}` : '999999',
      at: now(),
    })
  })
}

beforeEach(() => {
  vi.useFakeTimers()
  reviewOpen.value = false
  recovered.value = false
  toast.value = null
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

describe('bandOf', () => {
  const summary = (score: number) => ({ score }) as RunSummary
  it('grades against the profile marks, or not at all', () => {
    expect(bandOf(summary(70), CLASSIC)).toBe('competitive')
    expect(bandOf(summary(56), CLASSIC)).toBe('pass')
    expect(bandOf(summary(55), CLASSIC)).toBe('below')
    expect(bandOf(summary(400), PRESETS['zetamac-drill'])).toBeNull()
    const { competitiveScore: _competitive, ...passOnly } = CLASSIC
    expect(bandOf(summary(-1), passOnly)).toBe('below')
  })
})

describe('the results screen', () => {
  it('reads the summary off the run: score, counts, accuracy, band, and the review', () => {
    render(<App />)
    begin()
    answer(true)
    answer(false)
    act(() => {
      dispatch({ type: 'skip', at: now() })
    })
    act(() => {
      vi.advanceTimersByTime(1500)
    })
    act(() => {
      abortRun()
    })
    expect(path.value).toBe('/results')

    expect(screen.getByTestId('score').textContent).toBe('0')
    expect(screen.getByText('1 correct · 1 wrong · 1 skipped')).toBeTruthy()
    expect(screen.getByTestId('accuracy').textContent).toBe('50%')
    expect(screen.getByTestId('answered').textContent).toBe('3/4')
    expect(screen.getByTestId('ended-by').textContent).toBe('aborted')
    expect(screen.getByTestId('per-question').textContent).toMatch(/^\d+\.\ds$/)
    expect(screen.getByTestId('band').textContent).toBe('Below the pass mark')
    expect(screen.queryByTestId('hidden')).toBeNull()
    expect(screen.getByTestId('retry').textContent).toContain('Retry 2 mistakes')
    expect(screen.getByTestId('share-run')).toBeTruthy()
    expect(screen.queryByTestId('recovered')).toBeNull()

    const rows = screen.getByTestId('by-kind').querySelectorAll('tbody tr')
    const asked = [...rows].reduce((sum, row) => sum + Number(row.children[1]?.textContent), 0)
    expect(asked).toBe(3)

    fireEvent.click(screen.getByTestId('toggle-review'))
    expect(screen.getByTestId('review').textContent).toContain('1 never came up')
    expect(screen.getByTestId('review-row-0').dataset.correct).toBe('true')
    expect(screen.getByTestId('review-row-1').dataset.correct).toBe('false')
    expect(screen.getByTestId('review-row-1').textContent).toContain('you: 999999')
    expect(screen.getByTestId('review-row-1').textContent).toContain('answer:')
    expect(screen.getByTestId('review-row-2').textContent).toContain('skipped')
    expect(screen.queryByTestId('review-row-3')).toBeNull()
  })

  it('copies links, falling back to showing the link when the clipboard refuses', async () => {
    render(<App />)
    begin()
    answer(true)
    act(() => {
      abortRun()
    })
    const id = session.value.phase === 'finished' ? session.value.run.questionIds[0] : ''

    fireEvent.click(screen.getByTestId('share-run'))
    await act(() => Promise.resolve())
    // Four questions is a custom paper, so the link carries its snapshot.
    expect(toast.value).toMatch(/\/\?p=custom-[0-9a-f]{8}&s=21&m=typed&pf=/)

    fireEvent.click(screen.getByTestId('toggle-review'))
    fireEvent.click(screen.getByTestId('copy-link-0'))
    await act(() => Promise.resolve())
    expect(toast.value).toContain(`${location.origin}/q/${id}?pf=`)

    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
    fireEvent.click(screen.getByTestId('copy-link-0'))
    await act(() => Promise.resolve())
    expect(toast.value).toBe('Question link copied')
    fireEvent.click(screen.getByTestId('share-run'))
    await act(() => Promise.resolve())
    expect(toast.value).toBe('Run link copied')
    Object.defineProperty(navigator, 'clipboard', { value: undefined, configurable: true })
  })

  it('reports hidden time, a recovered run, and the traps that caught multiple-choice picks', () => {
    render(<App />)
    begin('mcq', 6)
    for (let index = 0; index < 4; index++) {
      const current = question.value
      const wrong = current?.options.findIndex((option) => !option.correct) ?? 0
      act(() => {
        dispatch({ type: 'select', optionIndex: wrong, at: now() })
      })
    }
    act(() => {
      dispatch({ type: 'visibility', hidden: true, at: now() })
    })
    act(() => {
      vi.advanceTimersByTime(2500)
    })
    act(() => {
      dispatch({ type: 'visibility', hidden: false, at: now() })
    })
    act(() => {
      recovered.value = true
    })
    act(() => {
      abortRun()
    })
    expect(screen.getByTestId('hidden').textContent).toBe('3s')
    expect(screen.getByTestId('recovered')).toBeTruthy()
    expect(screen.getByText('What tripped you up')).toBeTruthy()
    expect(screen.getByText('What tripped you up').nextElementSibling?.textContent).toMatch(/×\d/)
    expect(screen.getByTestId('retry').hasAttribute('disabled')).toBe(false)
    expect(screen.queryByTestId('band')).toBeTruthy()
  })

  it('disables retry after a clean run, hides the run link for a deck, and goes home with nothing to show', () => {
    render(<App />)
    begin('typed', 1)
    answer(true)
    expect(session.value.phase).toBe('finished')
    expect(screen.getByTestId('retry').hasAttribute('disabled')).toBe(true)
    expect(screen.getByTestId('band').textContent).toBe('Below the pass mark')
    expect(screen.queryByText('What tripped you up')).toBeNull()

    const id = session.value.phase === 'finished' ? session.value.run.questionIds[0] : ''
    act(() => {
      startRun({
        profile: CLASSIC,
        mode: 'typed',
        seed: 0,
        practice: true,
        deck: { ids: [id ?? ''], origin: 'retry' },
        countdownMs: 0,
      })
    })
    answer(false)
    expect(screen.queryByTestId('share-run')).toBeNull()
    expect(screen.getByTestId('retry').textContent).toContain('Retry 1 mistakes')

    act(() => {
      session.value = { phase: 'idle' }
    })
    act(() => {
      navigate('/results')
    })
    expect(path.value).toBe('/')
  })

  it('names the categories the way the rest of the app does', () => {
    const summary = summariseRun([], CLASSIC, { endedBy: 'completed', totalMs: 0, hiddenMs: 0 })
    expect(summary.byKind).toEqual([])
  })
})
