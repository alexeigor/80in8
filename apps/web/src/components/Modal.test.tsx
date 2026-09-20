import { cleanup, fireEvent, render, screen } from '@testing-library/preact'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Modal } from './Modal.js'

afterEach(cleanup)

function Sheet({ onClose, autofocusSecond = false }: { onClose: () => void; autofocusSecond?: boolean }) {
  return (
    <div>
      <button type="button" data-testid="outside">
        Outside
      </button>
      <Modal label="Example" testId="sheet" onClose={onClose}>
        <button type="button" data-testid="first">
          First
        </button>
        <button type="button" data-testid="second" data-autofocus={autofocusSecond || undefined}>
          Second
        </button>
        <button type="button" data-testid="off" disabled>
          Disabled
        </button>
      </Modal>
    </div>
  )
}

describe('Modal', () => {
  it('takes focus on open, prefers the autofocus control, and gives focus back on close', () => {
    const { unmount } = render(<Sheet onClose={() => {}} />)
    expect(screen.getByTestId('first')).toBe(document.activeElement)
    unmount()

    const outside = document.createElement('button')
    document.body.append(outside)
    outside.focus()
    const second = render(<Sheet onClose={() => {}} autofocusSecond />)
    expect(screen.getByTestId('second')).toBe(document.activeElement)
    second.unmount()
    expect(document.activeElement).toBe(outside)
    outside.remove()
  })

  it('cycles Tab and Shift+Tab through its own enabled controls only', () => {
    render(<Sheet onClose={() => {}} />)
    const first = screen.getByTestId('first')
    const second = screen.getByTestId('second')
    fireEvent.keyDown(document, { key: 'Tab' })
    expect(document.activeElement).toBe(second)
    fireEvent.keyDown(document, { key: 'Tab' })
    expect(document.activeElement).toBe(first)
    fireEvent.keyDown(document, { key: 'Tab', shiftKey: true })
    expect(document.activeElement).toBe(second)
    fireEvent.keyDown(document, { key: 'Tab', shiftKey: true })
    expect(document.activeElement).toBe(first)
  })

  it('closes on Escape and stops the key going any further', () => {
    const onClose = vi.fn()
    const outer = vi.fn()
    window.addEventListener('keydown', outer)
    render(<Sheet onClose={onClose} />)
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledOnce()
    expect(outer).not.toHaveBeenCalled()
    window.removeEventListener('keydown', outer)
  })

  it('makes everything outside inert and pulls focus back if it strays', () => {
    const { unmount } = render(<Sheet onClose={() => {}} />)
    const outside = screen.getByTestId('outside')
    expect(outside.inert).toBe(true)
    outside.focus()
    fireEvent.focusIn(outside)
    expect(document.activeElement).toBe(screen.getByTestId('first'))
    unmount()
    expect(outside.inert).toBeFalsy()
  })
})
