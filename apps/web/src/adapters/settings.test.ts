import { DEFAULT_SETTINGS } from '@80in8/core'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * The settings adapter reads storage when the module loads, so each case imports a
 * fresh copy after arranging the browser it should find.
 */

const KEY = '80in8:settings:v1'

type MediaStub = { matches: boolean; listeners: Set<() => void> }
const media = new Map<string, MediaStub>()

function stubMatchMedia(matching: string[] = []): void {
  media.clear()
  vi.stubGlobal('matchMedia', (query: string) => {
    const stub = media.get(query) ?? { matches: matching.includes(query), listeners: new Set() }
    media.set(query, stub)
    return {
      get matches() {
        return stub.matches
      },
      media: query,
      addEventListener: (_: string, listener: () => void) => stub.listeners.add(listener),
      removeEventListener: (_: string, listener: () => void) => stub.listeners.delete(listener),
    }
  })
}

async function load() {
  vi.resetModules()
  return import('./settings.js')
}

beforeEach(() => {
  localStorage.clear()
  stubMatchMedia()
  Object.defineProperty(navigator, 'maxTouchPoints', { value: 0, configurable: true })
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('first run', () => {
  it('starts from the defaults with the keypad off on a mouse-only device', async () => {
    const { settings } = await load()
    expect(settings.value).toEqual({ ...DEFAULT_SETTINGS, keypad: false })
  })

  for (const [why, arrange] of [
    ['a coarse primary pointer', () => stubMatchMedia(['(pointer: coarse)'])],
    ['any coarse pointer', () => stubMatchMedia(['(any-pointer: coarse)'])],
    [
      'touch points',
      () => Object.defineProperty(navigator, 'maxTouchPoints', { value: 5, configurable: true }),
    ],
  ] as const) {
    it(`turns the keypad on for ${why}`, async () => {
      arrange()
      const { settings } = await load()
      expect(settings.value.keypad).toBe(true)
    })
  }

  it('keeps a stored preference over the device heuristics', async () => {
    stubMatchMedia(['(pointer: coarse)'])
    localStorage.setItem(KEY, JSON.stringify({ keypad: false }))
    const { settings } = await load()
    expect(settings.value.keypad).toBe(false)
  })

  it('falls back to defaults when the stored value is corrupt or invalid', async () => {
    localStorage.setItem(KEY, '{not json')
    expect((await load()).settings.value).toEqual({ ...DEFAULT_SETTINGS, keypad: false })
    localStorage.setItem(KEY, JSON.stringify({ theme: 'sepia' }))
    expect((await load()).settings.value).toEqual({ ...DEFAULT_SETTINGS, keypad: false })
  })
})

describe('writing', () => {
  it('persists a patch and reports success', async () => {
    const { settings, settingsPersisted, updateSettings } = await load()
    updateSettings({ sound: true, theme: 'dark' })
    expect(settings.value.sound).toBe(true)
    expect(JSON.parse(localStorage.getItem(KEY) ?? '{}')).toMatchObject({ sound: true, theme: 'dark' })
    expect(settingsPersisted.value).toBe(true)
  })

  it('keeps working in memory when storage refuses the write', async () => {
    const { settings, settingsPersisted, updateSettings } = await load()
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('quota', 'QuotaExceededError')
    })
    updateSettings({ sound: true })
    expect(settings.value.sound).toBe(true)
    expect(settingsPersisted.value).toBe(false)
  })

  it('replaceSettings fills anything an import left out with the defaults', async () => {
    const { settings, replaceSettings } = await load()
    replaceSettings({ ...DEFAULT_SETTINGS, mode: 'mcq' })
    expect(settings.value).toEqual({ ...DEFAULT_SETTINGS, mode: 'mcq' })
  })
})

describe('preferences on the document', () => {
  it('follows the OS for theme and motion until overridden', async () => {
    stubMatchMedia(['(prefers-color-scheme: light)'])
    const { applyPreferences, updateSettings, prefersReducedMotion } = await load()
    applyPreferences()
    expect(document.documentElement.dataset.theme).toBe('light')
    expect(document.documentElement.dataset.motion).toBe('full')
    expect(prefersReducedMotion()).toBe(false)

    updateSettings({ theme: 'dark', reducedMotion: true })
    expect(document.documentElement.dataset.theme).toBe('dark')
    expect(document.documentElement.dataset.motion).toBe('reduced')
  })

  it('the setting can only ever turn motion down, never back on over the OS', async () => {
    stubMatchMedia(['(prefers-reduced-motion: reduce)'])
    const { applyPreferences, updateSettings, prefersReducedMotion } = await load()
    applyPreferences()
    expect(prefersReducedMotion()).toBe(true)
    updateSettings({ reducedMotion: false })
    expect(document.documentElement.dataset.motion).toBe('reduced')
  })

  it('re-applies when the OS preference changes, and stops after unwatching', async () => {
    stubMatchMedia()
    const { watchSystemPreferences } = await load()
    const stop = watchSystemPreferences()
    const light = media.get('(prefers-color-scheme: light)')
    if (!light) throw new Error('the theme query was not registered')
    light.matches = true
    for (const listener of light.listeners) listener()
    expect(document.documentElement.dataset.theme).toBe('light')

    stop()
    expect(light.listeners.size).toBe(0)
  })

  it('survives a browser without matchMedia', async () => {
    vi.stubGlobal('matchMedia', undefined)
    const { applyPreferences, prefersReducedMotion } = await load()
    applyPreferences()
    expect(document.documentElement.dataset.theme).toBe('dark')
    expect(prefersReducedMotion()).toBe(false)
  })
})
