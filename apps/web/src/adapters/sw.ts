import { signal } from '@preact/signals'

/**
 * Service worker registration and the update check (DESIGN.md §7.9, N1).
 *
 * The update check is the app's only intentional network activity, so it is suspended
 * for the whole of a run: `suspendUpdates()` on `go`, `resumeUpdates()` on `finished`.
 * That is what makes "zero requests between go and finished" true rather than likely.
 */

export const updateReady = signal(false)

const HOUR = 60 * 60 * 1000

let registration: ServiceWorkerRegistration | null = null
let suspended = false
let missedCheck = false
let timer: ReturnType<typeof setInterval> | undefined

export function suspendUpdates(): void {
  suspended = true
}

export function resumeUpdates(): void {
  suspended = false
  if (missedCheck) {
    missedCheck = false
    void check()
  }
}

async function check(): Promise<void> {
  if (!registration) return
  if (suspended) {
    missedCheck = true
    return
  }
  try {
    await registration.update()
  } catch {
    /* Offline, or the server is gone. Neither is the app's problem. */
  }
}

export async function applyUpdate(): Promise<void> {
  const waiting = registration?.waiting
  if (!waiting) return
  // Activation can take arbitrarily long. Reloading on a timer can load the old
  // shell again; listen before messaging so even immediate activation is caught.
  await new Promise<void>((resolve) => {
    navigator.serviceWorker.addEventListener('controllerchange', () => resolve(), { once: true })
    waiting.postMessage({ type: 'SKIP_WAITING' })
  })
  location.reload()
}

export function registerServiceWorker(): void {
  if (!('serviceWorker' in navigator) || import.meta.env.DEV) return
  addEventListener(
    'load',
    () => {
      navigator.serviceWorker
        .register(`${import.meta.env.BASE_URL}sw.js`, { scope: import.meta.env.BASE_URL })
        .then((reg) => {
          registration = reg
          if (reg.waiting) updateReady.value = true
          reg.addEventListener('updatefound', () => {
            const installing = reg.installing
            installing?.addEventListener('statechange', () => {
              if (installing.state === 'installed' && navigator.serviceWorker.controller) {
                updateReady.value = true
              }
            })
          })
          timer = setInterval(() => void check(), HOUR)
        })
        .catch(() => {
          /* An unregistered worker only costs offline support. */
        })
    },
    { once: true },
  )
}

export function stopUpdateChecks(): void {
  if (timer) clearInterval(timer)
}
