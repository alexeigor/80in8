import { DEFAULT_SETTINGS, readSettings, type Settings } from '@80in8/core'
import { signal } from '@preact/signals'

const KEY = '80in8:settings:v1'

/**
 * Every storage call is wrapped: Safari private mode throws on `localStorage` access,
 * and an app that cannot remember a preference must still be an app.
 */
/**
 * The keypad exists for touch. On a device with a real keyboard it is in the way, so
 * the *first* visit picks a default from the pointer type; after that the stored
 * preference wins, whatever the device.
 */
function firstRunDefaults(): Settings {
  const coarse = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches
  return { ...DEFAULT_SETTINGS, keypad: coarse }
}

function read(): Settings {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return firstRunDefaults()
    const parsed: unknown = JSON.parse(raw)
    return readSettings(parsed)
  } catch {
    return firstRunDefaults()
  }
}

export const settings = signal<Settings>(read())

/** True when the last write was rejected, so the UI can say "preferences are not saved". */
export const settingsPersisted = signal(true)

function write(value: Settings): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(value))
    settingsPersisted.value = true
  } catch {
    settingsPersisted.value = false
  }
}

export function updateSettings(patch: Partial<Settings>): void {
  const next = { ...settings.value, ...patch }
  settings.value = next
  write(next)
  applyPreferences()
}

export function replaceSettings(value: Settings): void {
  settings.value = { ...DEFAULT_SETTINGS, ...value }
  write(settings.value)
  applyPreferences()
}

function query(feature: string): MediaQueryList | null {
  return typeof matchMedia === 'function' ? matchMedia(feature) : null
}

const LIGHT = '(prefers-color-scheme: light)'
const CALM = '(prefers-reduced-motion: reduce)'

/**
 * Motion is reduced when the OS asks for it *or* when the person asked for it here.
 * The setting can only ever turn motion down, never force it back on over an OS
 * preference — overriding that would be rude, and in some cases unsafe.
 */
export function prefersReducedMotion(): boolean {
  return settings.value.reducedMotion || (query(CALM)?.matches ?? false)
}

/**
 * Reflect both preferences onto `<html>`. Mirrors `public/theme.js`, which does the
 * same before the bundle exists so the first paint is never wrong.
 */
export function applyPreferences(): void {
  const choice = settings.value.theme
  document.documentElement.dataset.theme =
    choice === 'system' ? (query(LIGHT)?.matches ? 'light' : 'dark') : choice
  // The stylesheet also honours the media query on its own, so a failure here only
  // costs the forced-on setting, never the OS preference.
  document.documentElement.dataset.motion = prefersReducedMotion() ? 'reduced' : 'full'
}

/** Follow the OS for whichever of the two the user has not overridden. */
export function watchSystemPreferences(): () => void {
  const listener = () => applyPreferences()
  const queries = [query(LIGHT), query(CALM)].filter((q): q is MediaQueryList => q !== null)
  for (const q of queries) q.addEventListener('change', listener)
  return () => {
    for (const q of queries) q.removeEventListener('change', listener)
  }
}
