import { cleanup, render, screen } from '@testing-library/preact'
import { afterEach, describe, expect, it } from 'vitest'
import { formatClock, Timer, urgencyOf } from './Timer.js'

afterEach(cleanup)

describe('formatClock', () => {
  it('formats m:ss, rounding up so "0:00" only means zero', () => {
    expect(formatClock(480_000)).toBe('8:00')
    expect(formatClock(65_000)).toBe('1:05')
    expect(formatClock(9_400)).toBe('0:10')
    expect(formatClock(1)).toBe('0:01')
    expect(formatClock(0)).toBe('0:00')
    expect(formatClock(-500)).toBe('0:00')
  })
})

describe('urgencyOf', () => {
  it('turns amber at a minute and red at ten seconds', () => {
    expect(urgencyOf(120_000)).toBe('calm')
    expect(urgencyOf(60_000)).toBe('soon')
    expect(urgencyOf(10_000)).toBe('now')
    expect(urgencyOf(null)).toBe('calm')
  })
})

describe('Timer', () => {
  it('renders the injected remaining time with tabular numerals', () => {
    render(<Timer ms={65_000} />)
    const timer = screen.getByTestId('timer')
    expect(timer.textContent).toBe('1:05')
    expect(timer.className).toContain('nums')
    expect(timer.getAttribute('aria-label')).toBe('1:05 remaining')
  })

  it('shows elapsed time for an untimed run', () => {
    render(<Timer ms={null} elapsed={125_000} />)
    const timer = screen.getByTestId('timer')
    expect(timer.textContent).toBe('2:05')
    expect(timer.dataset.untimed).toBe('true')
    expect(timer.getAttribute('aria-label')).toBe('2:05 elapsed')
  })
})
