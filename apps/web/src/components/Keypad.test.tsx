import { cleanup, fireEvent, render, screen } from '@testing-library/preact'
import { useState } from 'preact/hooks'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { applyKey } from '../input/edit.js'
import { Keypad, type KeypadAction } from './Keypad.js'

afterEach(cleanup)

function Harness({ onSubmit, onSkip }: { onSubmit?: () => void; onSkip?: () => void }) {
  const [draft, setDraft] = useState('')
  const onAction = (action: KeypadAction) => {
    if (action.kind === 'edit') setDraft((current) => applyKey(current, action.key))
    else if (action.kind === 'submit') onSubmit?.()
    else onSkip?.()
  }
  return (
    <>
      <output data-testid="draft">{draft}</output>
      <Keypad onAction={onAction} allowSkip={true} />
    </>
  )
}

const press = (testid: string) => fireEvent.click(screen.getByTestId(testid))
const draft = () => screen.getByTestId('draft').textContent

describe('Keypad', () => {
  it('builds a mixed number from digits, the fraction bar and the separator', () => {
    render(<Harness />)
    press('key-2')
    press('key-space')
    press('key-1')
    press('key-slash')
    press('key-4')
    expect(draft()).toBe('2 1/4')
  })

  it('deletes with ⌫ and toggles the sign with −', () => {
    render(<Harness />)
    press('key-1')
    press('key-2')
    press('key-3')
    press('key-back')
    expect(draft()).toBe('12')
    press('key-minus')
    expect(draft()).toBe('-12')
    press('key-minus')
    expect(draft()).toBe('12')
  })

  it('types decimals', () => {
    render(<Harness />)
    press('key-0')
    press('key-dot')
    press('key-7')
    press('key-5')
    expect(draft()).toBe('0.75')
  })

  it('submits and skips through the action channel, not the draft', () => {
    const onSubmit = vi.fn()
    const onSkip = vi.fn()
    render(<Harness onSubmit={onSubmit} onSkip={onSkip} />)
    press('key-5')
    press('key-submit')
    press('key-skip')
    expect(onSubmit).toHaveBeenCalledTimes(1)
    expect(onSkip).toHaveBeenCalledTimes(1)
    expect(draft()).toBe('5')
  })

  it('offers a clear key instead of skip when the profile forbids skipping', () => {
    render(<Keypad onAction={() => {}} allowSkip={false} />)
    expect(screen.queryByTestId('key-skip')).toBeNull()
    expect(screen.getByTestId('key-clear')).toBeTruthy()
  })
})
