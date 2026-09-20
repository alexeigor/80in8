import { signal } from '@preact/signals'

/**
 * The install hint (DESIGN.md §7.9). Offered on Home after the second completed run,
 * never mid-session. iOS has no `beforeinstallprompt`, so there the Settings screen
 * spells out Share → Add to Home Screen instead.
 */

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
}

export const installPrompt = signal<BeforeInstallPromptEvent | null>(null)

export function watchInstallPrompt(): () => void {
  const listener = (event: Event) => {
    event.preventDefault()
    installPrompt.value = event as BeforeInstallPromptEvent
  }
  addEventListener('beforeinstallprompt', listener)
  return () => removeEventListener('beforeinstallprompt', listener)
}

export async function promptInstall(): Promise<void> {
  const event = installPrompt.value
  if (!event) return
  installPrompt.value = null
  try {
    await event.prompt()
  } catch {
    /* Dismissed, or the browser changed its mind. */
  }
}

export function isIos(): boolean {
  return /iphone|ipad|ipod/i.test(navigator.userAgent)
}

export function isStandalone(): boolean {
  return matchMedia('(display-mode: standalone)').matches
}
