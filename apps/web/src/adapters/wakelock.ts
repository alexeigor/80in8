/**
 * Screen Wake Lock (DESIGN.md §7.5). Requested on `go`, re-requested when the page
 * comes back (the lock is released automatically while hidden). Every failure is
 * silent: the feature is a nicety, not a requirement, and it is absent on iOS < 16.4.
 */

let lock: WakeLockSentinel | null = null
let wanted = false

export async function acquireWakeLock(): Promise<void> {
  wanted = true
  if (lock) return
  try {
    if (!navigator.wakeLock || document.visibilityState !== 'visible') return
    lock = await navigator.wakeLock.request('screen')
    lock.addEventListener('release', () => {
      lock = null
    })
  } catch {
    lock = null
  }
}

export function reacquireWakeLock(): void {
  if (wanted && !lock) void acquireWakeLock()
}

export function releaseWakeLock(): void {
  wanted = false
  const held = lock
  lock = null
  try {
    void held?.release()
  } catch {
    /* ignored */
  }
}
