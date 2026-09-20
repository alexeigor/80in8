import { afterEach, describe, expect, it, vi } from 'vitest'
import { installPrompt, isIos, isStandalone, promptInstall, watchInstallPrompt } from './install.js'

afterEach(() => {
  installPrompt.value = null
  vi.unstubAllGlobals()
})

describe('the install prompt', () => {
  it('captures the browser event, stops its default banner, and prompts once when asked', async () => {
    const stop = watchInstallPrompt()
    const event = Object.assign(new Event('beforeinstallprompt', { cancelable: true }), {
      prompt: vi.fn().mockResolvedValue(undefined),
    })
    dispatchEvent(event)
    expect(event.defaultPrevented).toBe(true)
    expect(installPrompt.value).toBe(event)

    await promptInstall()
    expect(event.prompt).toHaveBeenCalledTimes(1)
    // Single use: the button goes away and asking again does nothing.
    expect(installPrompt.value).toBeNull()
    await promptInstall()
    expect(event.prompt).toHaveBeenCalledTimes(1)

    stop()
    dispatchEvent(event)
    expect(installPrompt.value).toBeNull()
  })

  it('swallows a prompt the browser refuses', async () => {
    installPrompt.value = Object.assign(new Event('beforeinstallprompt'), {
      prompt: vi.fn().mockRejectedValue(new Error('dismissed')),
    })
    await expect(promptInstall()).resolves.toBeUndefined()
  })
})

describe('platform sniffing', () => {
  it('recognises iOS by user agent and standalone by display mode', () => {
    vi.stubGlobal('navigator', { userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)' })
    expect(isIos()).toBe(true)
    vi.stubGlobal('navigator', { userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0)' })
    expect(isIos()).toBe(false)

    vi.stubGlobal('matchMedia', (query: string) => ({ matches: query === '(display-mode: standalone)' }))
    expect(isStandalone()).toBe(true)
    vi.stubGlobal('matchMedia', () => ({ matches: false }))
    expect(isStandalone()).toBe(false)
  })
})
