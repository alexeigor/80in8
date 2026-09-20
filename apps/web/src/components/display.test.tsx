import { BLANK, PRESETS, type Question } from '@80in8/core'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/preact'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { questionsFor } from '../test/fixtures.js'
import { Link, Masthead } from './Link.js'
import { QuestionBox } from './QuestionBox.js'
import { TopBar } from './TopBar.js'
import { parseHint, TypedInput } from './TypedInput.js'
import { Value } from './Value.js'

/** The small presentational pieces: what they say, and what they say to a screen reader. */

afterEach(cleanup)

describe('Value', () => {
  it('stacks a fraction, with words for assistive technology, and leaves everything else alone', () => {
    const { container } = render(<Value text="-2 3/8" />)
    expect(container.querySelector('.frac')?.getAttribute('aria-hidden')).toBe('true')
    expect(container.querySelector('.frac .num')?.textContent).toBe('3')
    expect(container.querySelector('.frac .den')?.textContent).toBe('8')
    expect(container.querySelector('.frac-whole')?.textContent).toBe('2')
    expect(container.querySelector('.sr-only')?.textContent).toBe('2 and 3 over 8')
    expect(container.textContent?.startsWith('-')).toBe(true)

    cleanup()
    const inline = render(<Value text="3/8" stacked={false} />)
    expect(inline.container.querySelector('.frac')).toBeNull()
    expect(inline.container.textContent).toBe('3/8')

    cleanup()
    const decimal = render(<Value text="12.5" />)
    expect(decimal.container.querySelector('.frac')).toBeNull()
    expect(decimal.container.textContent).toBe('12.5')
  })
})

describe('QuestionBox', () => {
  it('names the question by id, announces politely, and reads the blank as a missing value', () => {
    const question: Question = {
      ...(questionsFor(PRESETS['optiver-classic'])[0] as Question),
      display: { left: '48', op: '×', right: BLANK, result: '1200' },
    }
    render(<QuestionBox question={question} stacked={false} />)
    const box = screen.getByTestId('question')
    expect(box.dataset.questionId).toBe(question.id)
    expect(box.getAttribute('aria-live')).toBe('polite')
    expect(screen.getByTestId('blank').textContent).toBe('?')
    expect(box.querySelector('.sr-only')?.textContent).toBe('missing value')
    expect(box.textContent).toContain('48 × ?')
  })
})

describe('TopBar', () => {
  it('shows position, clock, optional score with a sign, the verdict, and the End control', () => {
    const onAbort = vi.fn()
    const { rerender } = render(
      <TopBar
        index={4}
        total={80}
        remaining={65_000}
        elapsed={0}
        score={3}
        showScore
        flash={{ correct: false, token: 1 }}
        onAbort={onAbort}
      />,
    )
    expect(screen.getByTestId('counter').textContent).toBe('5/80')
    expect(screen.getByTestId('timer').textContent).toBe('1:05')
    expect(screen.getByTestId('live-score').textContent).toBe('+3')
    expect(screen.getByTestId('feedback').dataset.correct).toBe('false')
    expect(screen.getByTestId('feedback').textContent).toBe('✗')
    fireEvent.click(screen.getByTestId('abort'))
    expect(onAbort).toHaveBeenCalledOnce()

    // The counter never runs past the total, and no score means no score.
    rerender(
      <TopBar
        index={80}
        total={80}
        remaining={null}
        elapsed={5000}
        score={-2}
        showScore={false}
        flash={null}
        onAbort={onAbort}
      />,
    )
    expect(screen.getByTestId('counter').textContent).toBe('80/80')
    expect(screen.queryByTestId('live-score')).toBeNull()
    expect(screen.queryByTestId('feedback')).toBeNull()
    expect(screen.getByTestId('timer').dataset.untimed).toBe('true')
  })
})

describe('TypedInput', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('is a plain text field the OS keyboard stays away from, forwarding only native input', () => {
    const onFallbackInput = vi.fn()
    render(<TypedInput value="12" shakeToken={0} reducedMotion={false} onFallbackInput={onFallbackInput} />)
    const input = screen.getByTestId<HTMLInputElement>('typed-input')
    expect(input.type).toBe('text')
    expect(input.getAttribute('inputmode')).toBe('none')
    expect(input.getAttribute('autocomplete')).toBe('off')
    expect(input.value).toBe('12')
    fireEvent.input(input, { target: { value: '−0,5' } })
    expect(onFallbackInput).toHaveBeenCalledWith('−0,5')
  })

  it('shakes for a moment on each new token, longer under reduced motion', () => {
    const { rerender } = render(
      <TypedInput value="" shakeToken={0} reducedMotion={false} onFallbackInput={() => {}} />,
    )
    const input = screen.getByTestId('typed-input')
    expect(input.dataset.shake).toBeUndefined()
    rerender(<TypedInput value="" shakeToken={1} reducedMotion={false} onFallbackInput={() => {}} />)
    expect(input.dataset.shake).toBe('true')
    act(() => {
      vi.advanceTimersByTime(240)
    })
    expect(input.dataset.shake).toBe('false')
    rerender(<TypedInput value="" shakeToken={2} reducedMotion onFallbackInput={() => {}} />)
    act(() => {
      vi.advanceTimersByTime(240)
    })
    expect(input.dataset.shake).toBe('true')
    act(() => {
      vi.advanceTimersByTime(360)
    })
    expect(input.dataset.shake).toBe('false')
  })

  it('parseHint explains an entry only when that adds something', () => {
    expect(parseHint('')).toBe('')
    expect(parseHint('-')).toBe('')
    expect(parseHint('2 1/4')).toBe('= 9/4')
    expect(parseHint('6/16')).toBe('= 3/8')
    expect(parseHint('3/8')).toBe('')
    expect(parseHint('0,5')).toBe('= 0.5')
    expect(parseHint('−0.5')).toBe('')
    expect(parseHint('1/3')).toBe('')
    expect(parseHint('abc')).toBe('not a number')
  })
})

describe('Link and Masthead', () => {
  it('renders real hrefs, routes plain clicks, and names the wordmark as one word', () => {
    render(
      <Masthead>
        <Link to="/settings" testid="extra">
          Extra
        </Link>
      </Masthead>,
    )
    const wordmark = screen.getByTestId<HTMLAnchorElement>('wordmark')
    expect(wordmark.getAttribute('href')).toBe('/')
    expect(wordmark.textContent).toBe('80in8')
    expect(screen.getByTestId('nav-history').getAttribute('href')).toBe('/history')
    expect(screen.getByTestId('nav-settings').getAttribute('href')).toBe('/settings')
    expect(screen.getByTestId('extra').getAttribute('href')).toBe('/settings')
    fireEvent.click(screen.getByTestId('nav-history'), { button: 0 })
    expect(location.pathname).toBe('/history')
    history.replaceState(null, '', '/')
  })
})
