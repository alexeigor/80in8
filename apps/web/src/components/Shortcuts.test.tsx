import { act, cleanup, fireEvent, render, screen } from '@testing-library/preact'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Scroller } from './Scroller.js'
import { Shortcuts } from './Shortcuts.js'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

/** jsdom lays nothing out, so overflow is simulated on the prototype. */
function pretendWidths(scroll: number, client: number) {
  vi.spyOn(HTMLElement.prototype, 'scrollWidth', 'get').mockReturnValue(scroll)
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(client)
}

describe('Shortcuts', () => {
  it('renders the binding table from §7.8 with a close control', () => {
    const onClose = vi.fn()
    render(<Shortcuts onClose={onClose} />)
    const rows = screen.getAllByRole('row').slice(1)
    expect(rows.length).toBeGreaterThanOrEqual(18)
    expect(screen.getByText('Mixed-number separator (2␣1/4) — never skips')).toBeTruthy()
    expect(screen.getByText('Anywhere but a text field')).toBeTruthy()
    fireEvent.click(screen.getByTestId('shortcuts-close'))
    expect(onClose).toHaveBeenCalledOnce()
    fireEvent.click(screen.getByLabelText('Close'))
    expect(onClose).toHaveBeenCalledTimes(2)
  })
})

describe('Scroller', () => {
  it('is a tab stop exactly when its content overflows, and re-measures on resize', () => {
    pretendWidths(300, 300)
    render(
      <Scroller label="Table">
        <table />
      </Scroller>,
    )
    const region = screen.getByLabelText('Table')
    expect(region.tagName).toBe('SECTION')
    expect(region.hasAttribute('tabindex')).toBe(false)

    pretendWidths(600, 300)
    act(() => {
      window.dispatchEvent(new Event('resize'))
    })
    expect(region.getAttribute('tabindex')).toBe('0')
  })

  it('adds the extra class it is given', () => {
    render(
      <Scroller label="Stack" class="stack">
        <p>content</p>
      </Scroller>,
    )
    expect(screen.getByLabelText('Stack').className).toBe('scroller stack')
  })
})
