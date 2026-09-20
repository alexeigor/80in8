import { DEFAULT_SETTINGS } from '@80in8/core'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/preact'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { replaceSettings, settings, settingsPersisted } from '../adapters/settings.js'
import { updateReady } from '../adapters/sw.js'
import { SettingsScreen } from './Settings.js'

/** The settings screen against the real settings adapter and jsdom's localStorage. */

async function open() {
  const result = render(<SettingsScreen />)
  // The storage estimate resolves after the first paint.
  await act(() => Promise.resolve())
  return result
}

beforeEach(() => {
  replaceSettings({ ...DEFAULT_SETTINGS, keypad: false })
  settingsPersisted.value = true
  updateReady.value = false
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('the test section', () => {
  it('binds every select to its setting', async () => {
    await open()
    fireEvent.change(screen.getByTestId('setting-profile'), { target: { value: 'hard@1' } })
    expect(settings.value.profileRef).toBe('hard@1')
    fireEvent.change(screen.getByTestId('setting-mode'), { target: { value: 'mcq' } })
    expect(settings.value.mode).toBe('mcq')
    fireEvent.change(screen.getByTestId('setting-mode'), { target: { value: 'nonsense' } })
    expect(settings.value.mode).toBe('typed')
    fireEvent.change(screen.getByTestId('setting-fraction-policy'), { target: { value: 'simplified' } })
    expect(settings.value.fractionPolicy).toBe('simplified')
    fireEvent.change(screen.getByTestId('setting-fraction-policy'), { target: { value: 'nonsense' } })
    expect(settings.value.fractionPolicy).toBe('equivalent')
    fireEvent.change(screen.getByTestId('setting-theme'), { target: { value: 'light' } })
    expect(settings.value.theme).toBe('light')
    expect(document.documentElement.dataset.theme).toBe('light')
  })

  it('shows the question mix only for the classic test and maps it to the legacy preset', async () => {
    await open()
    const mix = screen.getByTestId<HTMLSelectElement>('setting-question-mix')
    expect(mix.value).toBe('0.2')
    fireEvent.change(mix, { target: { value: '0.4' } })
    expect(settings.value.profileRef).toBe('optiver-mcq@1')
    expect(screen.getByTestId<HTMLSelectElement>('setting-profile').value).toBe('optiver-classic@1')
    expect(screen.getByTestId<HTMLSelectElement>('setting-question-mix').value).toBe('0.4')
    fireEvent.change(screen.getByTestId('setting-question-mix'), { target: { value: '0.2' } })
    expect(settings.value.profileRef).toBe('optiver-classic@1')
    fireEvent.change(screen.getByTestId('setting-profile'), { target: { value: 'zetamac-drill@1' } })
    expect(screen.queryByTestId('setting-question-mix')).toBeNull()
  })
})

describe('the switches', () => {
  it('toggle their settings, and auto-submit is only offered on a drill profile', async () => {
    await open()
    const auto = screen.getByTestId<HTMLButtonElement>('toggle-autoSubmit')
    expect(auto.disabled).toBe(true)
    expect(
      screen.getByText('Only available on drill profiles, where a wrong keystroke costs nothing.'),
    ).toBeTruthy()

    fireEvent.change(screen.getByTestId('setting-profile'), { target: { value: 'zetamac-drill@1' } })
    expect(auto.disabled).toBe(false)
    expect(screen.getByText('Zetamac style: advance as soon as the typed value matches.')).toBeTruthy()
    fireEvent.click(auto)
    expect(settings.value.autoSubmit).toBe(true)
    expect(auto.getAttribute('aria-checked')).toBe('true')

    for (const field of [
      'keypad',
      'stackedFractions',
      'feedback',
      'showLiveScore',
      'sound',
      'announceTimer',
      'reducedMotion',
    ] as const) {
      const before = settings.value[field]
      fireEvent.click(screen.getByTestId(`toggle-${field}`))
      expect(settings.value[field]).toBe(!before)
    }
    expect(document.documentElement.dataset.motion).toBe('reduced')
    expect(screen.getAllByRole('switch')).toHaveLength(8)
  })
})

describe('data and app', () => {
  it('reports storage use and persistence, the version, and a waiting update', async () => {
    Object.defineProperty(navigator, 'storage', {
      value: {
        persisted: async () => true,
        estimate: async () => ({ usage: 2 * 1024 * 1024, quota: 100 * 1024 * 1024 }),
      },
      configurable: true,
    })
    await open()
    expect(screen.getByTestId('usage').textContent).toContain('2.0 MB of 100 MB')
    expect(screen.getByTestId('usage').textContent).toContain('The browser has agreed to keep it.')
    expect(screen.getByTestId('version').textContent).toBe('Version test · build test')
    expect(screen.queryByTestId('apply-update')).toBeNull()
    act(() => {
      updateReady.value = true
    })
    expect(screen.getByTestId('apply-update')).toBeTruthy()
    fireEvent.click(screen.getByTestId('apply-update'))
    Object.defineProperty(navigator, 'storage', { value: undefined, configurable: true })
  })

  it('says when the browser may evict, when preferences cannot be saved, and how iOS installs', async () => {
    Object.defineProperty(navigator, 'storage', {
      value: { persisted: async () => false, estimate: async () => ({ usage: 0, quota: 0 }) },
      configurable: true,
    })
    Object.defineProperty(navigator, 'userAgent', {
      value: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)',
      configurable: true,
    })
    settingsPersisted.value = false
    await open()
    expect(screen.getByTestId('usage').textContent).toContain('may evict it')
    expect(screen.getByText(/Preferences cannot be saved/)).toBeTruthy()
    expect(screen.getByText(/Add to Home Screen/)).toBeTruthy()
    Object.defineProperty(navigator, 'storage', { value: undefined, configurable: true })
    Object.defineProperty(navigator, 'userAgent', { value: 'Mozilla/5.0 (Macintosh)', configurable: true })
  })

  it('exports and imports from here too', async () => {
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined)
    Object.defineProperty(URL, 'createObjectURL', { value: () => 'blob:x', configurable: true })
    Object.defineProperty(URL, 'revokeObjectURL', { value: () => undefined, configurable: true })
    await open()
    fireEvent.click(screen.getByTestId('settings-export'))
    expect(click).toHaveBeenCalledOnce()

    const { toast } = await import('../ui-state.js')
    const input = screen.getByTestId<HTMLInputElement>('settings-import-file')
    fireEvent.change(input, { target: { files: [new File(['{}'], 'x.json', { type: 'application/json' })] } })
    await vi.waitFor(() => expect(toast.value).toMatch(/^Import failed:/))
    fireEvent.change(input, { target: { files: [] } })
  })
})
