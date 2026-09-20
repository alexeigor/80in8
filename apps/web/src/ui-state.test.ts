import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { showToast, toast } from './ui-state.js'

beforeEach(() => vi.useFakeTimers())
afterEach(() => {
  vi.useRealTimers()
  toast.value = null
})

it('shows a toast for a while, and a newer one restarts the clock', () => {
  showToast('Copied')
  expect(toast.value).toBe('Copied')
  vi.advanceTimersByTime(2000)
  showToast('Saved', 500)
  expect(toast.value).toBe('Saved')
  vi.advanceTimersByTime(400)
  expect(toast.value).toBe('Saved')
  vi.advanceTimersByTime(100)
  expect(toast.value).toBeNull()
})
