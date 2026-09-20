import { afterEach, describe, expect, it, vi } from 'vitest'

function stubWakeLock() {
  const sentinel = { release: vi.fn().mockResolvedValue(undefined), addEventListener: vi.fn() }
  const request = vi.fn().mockResolvedValue(sentinel)
  vi.stubGlobal('navigator', { wakeLock: { request } })
  return { request, sentinel }
}

async function load() {
  vi.resetModules()
  return import('./wakelock.js')
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('the screen wake lock', () => {
  it('is requested once, re-requested only after the browser released it, and released on demand', async () => {
    const { request, sentinel } = stubWakeLock()
    const lock = await load()
    await lock.acquireWakeLock()
    await lock.acquireWakeLock()
    expect(request).toHaveBeenCalledTimes(1)
    expect(request).toHaveBeenCalledWith('screen')

    // Still held: nothing to do.
    lock.reacquireWakeLock()
    expect(request).toHaveBeenCalledTimes(1)

    // The browser let go (the tab was hidden); coming back asks again.
    const onRelease = sentinel.addEventListener.mock.calls[0]?.[1] as () => void
    onRelease()
    lock.reacquireWakeLock()
    await Promise.resolve()
    expect(request).toHaveBeenCalledTimes(2)

    lock.releaseWakeLock()
    expect(sentinel.release).toHaveBeenCalledTimes(1)
    // Released deliberately: a later wake-up must not bring it back.
    lock.reacquireWakeLock()
    expect(request).toHaveBeenCalledTimes(2)
  })

  it('does nothing without the API, while hidden, or when the request is refused', async () => {
    vi.stubGlobal('navigator', {})
    let lock = await load()
    await expect(lock.acquireWakeLock()).resolves.toBeUndefined()
    expect(() => lock.releaseWakeLock()).not.toThrow()

    const { request } = stubWakeLock()
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden')
    lock = await load()
    await lock.acquireWakeLock()
    expect(request).not.toHaveBeenCalled()

    vi.restoreAllMocks()
    request.mockRejectedValue(new DOMException('not allowed', 'NotAllowedError'))
    lock = await load()
    await expect(lock.acquireWakeLock()).resolves.toBeUndefined()
    lock.releaseWakeLock()
  })
})
