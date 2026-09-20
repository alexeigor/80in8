import { cleanup, fireEvent, render, screen } from '@testing-library/preact'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MCQ_PROFILE, questionsFor } from '../test/fixtures.js'
import { McqGrid, POINTER_LOCKOUT_MS } from './McqGrid.js'

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

beforeEach(() => {
  vi.useFakeTimers()
})

describe('McqGrid', () => {
  it('renders four stable cells with their key hints', () => {
    const [question] = questionsFor(MCQ_PROFILE)
    if (!question) throw new Error('no fixture question')
    render(<McqGrid question={question} stacked={false} onSelect={() => {}} />)
    for (let index = 0; index < 4; index++) {
      const button = screen.getByTestId(`option-${index}`)
      expect(button.dataset.optionText).toBe(question.options[index]?.text)
      expect(button.textContent).toContain(String(index + 1))
    }
  })

  it('ignores a second pointer event inside the double-tap window and accepts it after', () => {
    const [question] = questionsFor(MCQ_PROFILE)
    if (!question) throw new Error('no fixture question')
    const onSelect = vi.fn()
    render(<McqGrid question={question} stacked={false} onSelect={onSelect} />)

    fireEvent.click(screen.getByTestId('option-0'))
    fireEvent.click(screen.getByTestId('option-1'))
    expect(onSelect).toHaveBeenCalledTimes(1)
    expect(onSelect).toHaveBeenCalledWith(0)

    vi.advanceTimersByTime(POINTER_LOCKOUT_MS + 1)
    fireEvent.click(screen.getByTestId('option-1'))
    expect(onSelect).toHaveBeenCalledTimes(2)
    expect(onSelect).toHaveBeenLastCalledWith(1)
  })
})
