import { signal } from '@preact/signals'

/** Small pieces of UI state that both the key handler and the screens need to see. */

export const shortcutsOpen = signal(false)
export const abortPending = signal(false)
export const toast = signal<string | null>(null)
/** Results screen: whether the per-question review is expanded. */
export const reviewOpen = signal(false)

let toastTimer: ReturnType<typeof setTimeout> | undefined

export function showToast(message: string, ms = 2200): void {
  toast.value = message
  if (toastTimer) clearTimeout(toastTimer)
  toastTimer = setTimeout(() => {
    toast.value = null
  }, ms)
}
