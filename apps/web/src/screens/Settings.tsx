import { CURRENT_PRESETS, type Profile, type Settings as SettingsShape } from '@80in8/core'
import type { JSX } from 'preact'
import { useEffect, useState } from 'preact/hooks'
import { downloadExport, importExport } from '../adapters/history.js'
import { storageEstimate, storagePersisted } from '../adapters/idb.js'
import { resolveProfile } from '../adapters/profiles.js'
import { settings, settingsPersisted, updateSettings } from '../adapters/settings.js'
import { applyUpdate, updateReady } from '../adapters/sw.js'
import { Masthead } from '../components/Link.js'
import { isIos, isStandalone } from '../install.js'
import { showToast } from '../ui-state.js'

type ToggleField = {
  [Key in keyof SettingsShape]: SettingsShape[Key] extends boolean ? Key : never
}[keyof SettingsShape]

function Toggle({
  label,
  hint,
  field,
  disabled,
}: {
  label: string
  hint?: string
  field: ToggleField
  disabled?: boolean
}): JSX.Element {
  const value = settings.value[field]
  const id = `s-${field}`
  return (
    <label class="setting-toggle" for={id} data-disabled={disabled || undefined}>
      <span class="setting-toggle-copy">
        <span class="setting-toggle-label" id={`${id}-label`}>
          {label}
        </span>
        {hint ? (
          <span class="setting-toggle-hint" id={`${id}-hint`}>
            {hint}
          </span>
        ) : null}
      </span>
      <button
        id={id}
        type="button"
        class="setting-switch"
        role="switch"
        data-testid={`toggle-${field}`}
        aria-checked={value}
        aria-labelledby={`${id}-label`}
        aria-describedby={hint ? `${id}-hint` : undefined}
        disabled={disabled}
        onClick={() => updateSettings({ [field]: !value })}
      >
        <span class="switch-track" aria-hidden="true">
          <span class="switch-thumb" />
        </span>
      </button>
    </label>
  )
}

export function SettingsScreen(): JSX.Element {
  const [usage, setUsage] = useState<string>('—')
  const [persisted, setPersisted] = useState<boolean | null>(null)
  const current = settings.value

  useEffect(() => {
    void storagePersisted().then(setPersisted)
    void storageEstimate().then((estimate) => {
      if (!estimate) return
      setUsage(
        `${(estimate.usage / 1024 / 1024).toFixed(1)} MB of ${(estimate.quota / 1024 / 1024).toFixed(0)} MB`,
      )
    })
  }, [])

  const profile: Profile | undefined = resolveProfile(current.profileRef)

  return (
    <main class="page settings-page" data-testid="settings">
      <Masthead />
      <h1>Settings</h1>

      {!settingsPersisted.value ? (
        <p class="card" role="status">
          Preferences cannot be saved in this browser session, so they will reset on reload.
        </p>
      ) : null}

      <section class="card">
        <h2 class="small muted">Test</h2>
        <div class="grid2">
          <div class="field">
            <label for="s-profile">Default profile</label>
            <select
              id="s-profile"
              data-testid="setting-profile"
              value={current.profileRef}
              onChange={(event) => updateSettings({ profileRef: event.currentTarget.value })}
            >
              {CURRENT_PRESETS.map((preset) => (
                <option key={preset.id} value={`${preset.id}@${preset.version}`}>
                  {preset.name}
                </option>
              ))}
            </select>
          </div>
          <div class="field">
            <label for="s-mode">Default mode</label>
            <select
              id="s-mode"
              data-testid="setting-mode"
              value={current.mode}
              onChange={(event) =>
                updateSettings({ mode: event.currentTarget.value === 'mcq' ? 'mcq' : 'typed' })
              }
            >
              <option value="typed">Typed</option>
              <option value="mcq">Multiple choice</option>
            </select>
          </div>
          <div class="field">
            <label for="s-fractions">Fraction answers</label>
            <select
              id="s-fractions"
              data-testid="setting-fraction-policy"
              value={current.fractionPolicy}
              onChange={(event) =>
                updateSettings({
                  fractionPolicy: event.currentTarget.value === 'simplified' ? 'simplified' : 'equivalent',
                })
              }
            >
              <option value="equivalent">Any equivalent value</option>
              <option value="simplified">Lowest terms only</option>
            </select>
          </div>
          <div class="field">
            <label for="s-theme">Theme</label>
            <select
              id="s-theme"
              data-testid="setting-theme"
              value={current.theme}
              onChange={(event) =>
                updateSettings({ theme: event.currentTarget.value as SettingsShape['theme'] })
              }
            >
              <option value="system">Follow the system</option>
              <option value="dark">Dark</option>
              <option value="light">Light</option>
            </select>
          </div>
        </div>
      </section>

      <fieldset class="card" aria-labelledby="input-settings-title">
        <h2 class="small muted" id="input-settings-title">
          Input
        </h2>
        <Toggle
          label="On-screen keypad"
          hint="Keeps the OS keyboard closed; the physical keyboard still works."
          field="keypad"
        />
        <Toggle
          label="Auto-submit"
          hint={
            profile?.allowAutoSubmit
              ? 'Zetamac style: advance as soon as the typed value matches.'
              : 'Only available on drill profiles, where a wrong keystroke costs nothing.'
          }
          field="autoSubmit"
          disabled={!profile?.allowAutoSubmit}
        />
        <Toggle label="Stacked fractions" field="stackedFractions" />
      </fieldset>

      <fieldset class="card" aria-labelledby="run-settings-title">
        <h2 class="small muted" id="run-settings-title">
          During a run
        </h2>
        <Toggle
          label="Answer feedback"
          hint="A ✓ or ✗ in the top bar. Turn off for exam realism."
          field="feedback"
        />
        <Toggle label="Live score" field="showLiveScore" />
        <Toggle label="Sound" hint="A short tone on each answer and at ten seconds." field="sound" />
        <Toggle
          label="Announce the time"
          hint="Polite screen-reader announcements at 4:00, 2:00, 1:00, 0:30 and 0:10."
          field="announceTimer"
        />
        <Toggle
          label="Reduce motion"
          hint="Drops the fades and the shake. Already on whenever your system asks for it."
          field="reducedMotion"
        />
      </fieldset>

      <section class="card">
        <h2 class="small muted">Data</h2>
        <p class="muted small" data-testid="usage">
          Stored on this device: {usage}. Nothing is ever uploaded.{' '}
          {persisted === null
            ? ''
            : persisted
              ? 'The browser has agreed to keep it.'
              : 'The browser may evict it if it runs short of space.'}
        </p>
        <div class="row">
          <button type="button" data-testid="settings-export" onClick={downloadExport}>
            Export JSON
          </button>
          <label class="ghost" style="display:contents">
            <input
              type="file"
              accept="application/json,.json"
              class="sr-only"
              data-testid="settings-import-file"
              onChange={(event) => {
                const chosen = event.currentTarget.files?.[0]
                if (!chosen) return
                void chosen
                  .text()
                  .then(importExport)
                  .then((outcome) => showToast(`Imported ${outcome.added} new runs.`))
                  .catch((error: unknown) => showToast(`Import failed: ${(error as Error).message}`))
              }}
            />
          </label>
        </div>
      </section>

      <section class="card">
        <h2 class="small muted">App</h2>
        <p class="muted small" data-testid="version">
          Version {__APP_VERSION__} · build {__BUILD_ID__}
        </p>
        {updateReady.value ? (
          <button type="button" data-testid="apply-update" onClick={() => void applyUpdate()}>
            Update available — reload
          </button>
        ) : null}
        {isIos() && !isStandalone() ? (
          <p class="muted small">To install: Share → Add to Home Screen.</p>
        ) : null}
      </section>
    </main>
  )
}
