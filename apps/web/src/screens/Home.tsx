import { CURRENT_PRESETS, hash8, type Mode, type Profile } from '@80in8/core'
import type { JSX } from 'preact'
import { useEffect, useState } from 'preact/hooks'
import { runs } from '../adapters/history.js'
import { resolveProfile } from '../adapters/profiles.js'
import { params } from '../adapters/router.js'
import { settings, updateSettings } from '../adapters/settings.js'
import { readSharedRun } from '../adapters/share.js'
import { Link, Masthead } from '../components/Link.js'
import { installPrompt, promptInstall } from '../install.js'
import {
  deriveProfile,
  describeLimit,
  describeScoring,
  isPractice,
  PACE_LABELS,
  type Pace,
} from '../profile-choice.js'
import { randomSeed, runError, startRun } from '../session.js'

/** A typed seed may be any text; anything that is not a number is hashed to one. */
export function seedFromText(text: string): number {
  const trimmed = text.trim()
  if (trimmed === '') return randomSeed()
  if (/^\d+$/.test(trimmed)) return Number(trimmed) >>> 0
  return Number.parseInt(hash8(trimmed), 16) >>> 0
}

const DEFAULT_PRESET = CURRENT_PRESETS[0] as Profile

export function Home(): JSX.Element {
  const shared = readSharedRun(params())
  const [profileRef, setProfileRef] = useState(shared ? '' : settings.value.profileRef)
  // A link preselects its profile, but it must not lock the picker: choosing another
  // one has to drop the link's profile or the selection would do nothing.
  const [sharedProfile, setSharedProfile] = useState<Profile | null>(shared?.profile ?? null)
  const [mode, setMode] = useState<Mode>(shared?.mode ?? settings.value.mode)
  const [seedText, setSeedText] = useState(shared ? String(shared.seed) : '')
  const [pace, setPace] = useState<Pace>('timed')
  const [count, setCount] = useState<number | null>(null)
  const [more, setMore] = useState(false)

  const base = sharedProfile ?? resolveProfile(profileRef) ?? DEFAULT_PRESET
  const profile = deriveProfile(base, count ?? base.questionCount, pace, settings.value.fractionPolicy)

  useEffect(() => {
    document.title = '80 in 8'
  }, [])

  const start = (): void => {
    if (!sharedProfile) updateSettings({ profileRef, mode })
    startRun({
      profile,
      mode,
      seed: seedFromText(seedText),
      practice: isPractice(pace),
    })
  }

  const completed = runs.value.length

  return (
    <main class="page" data-testid="home">
      <Masthead />

      <section class="stack">
        <h1>80 questions. 8 minutes.</h1>
        <p class="muted">
          The Optiver-style mental arithmetic test, offline and exact. Nothing you do here leaves this device.
        </p>
      </section>

      {runError.value ? (
        <p class="card" data-testid="run-error" role="alert">
          {runError.value}
        </p>
      ) : null}

      <div class="grid2">
        <div class="field">
          <label for="profile">Profile</label>
          <select
            id="profile"
            data-testid="profile"
            value={sharedProfile ? 'shared' : profileRef}
            onChange={(event) => {
              const chosen = event.currentTarget.value
              if (chosen === 'shared') return
              setSharedProfile(null)
              setProfileRef(chosen)
              setCount(null)
              const next = resolveProfile(chosen)
              if (next) setMode(next.defaultMode)
            }}
          >
            {sharedProfile ? <option value="shared">{sharedProfile.name} (from link)</option> : null}
            {CURRENT_PRESETS.map((preset) => (
              <option key={preset.id} value={`${preset.id}@${preset.version}`}>
                {preset.name}
              </option>
            ))}
          </select>
        </div>

        <div class="field">
          <span class="lbl">Mode</span>
          <fieldset class="segmented">
            <legend class="sr-only">Answer mode</legend>
            <button
              type="button"
              id="mode-typed"
              data-testid="mode-typed"
              aria-pressed={mode === 'typed'}
              onClick={() => setMode('typed')}
            >
              Typed
            </button>
            <button
              type="button"
              id="mode-mcq"
              data-testid="mode-mcq"
              aria-pressed={mode === 'mcq'}
              onClick={() => setMode('mcq')}
            >
              Multiple choice
            </button>
          </fieldset>
        </div>
      </div>

      <p class="muted small" data-testid="disclosure">
        {profile.questionCount} questions · {describeLimit(profile)} · {describeScoring(profile)}
      </p>

      <div class="row">
        <button type="button" class="primary" data-testid="start" autofocus onClick={start}>
          Start
        </button>
        <span class="muted small keyboard-hint">
          or press <kbd>Enter</kbd>
        </span>
        <button
          type="button"
          class="ghost small"
          data-testid="toggle-advanced"
          aria-expanded={more}
          onClick={() => setMore(!more)}
        >
          {more ? 'Fewer options' : 'More options'}
        </button>
      </div>

      {more ? (
        <div class="card grid2" data-testid="advanced">
          <div class="field">
            <label for="seed">Seed (blank for a new one)</label>
            <input
              id="seed"
              type="text"
              data-testid="seed"
              inputMode="text"
              autocomplete="off"
              value={seedText}
              placeholder="random"
              onInput={(event) => setSeedText(event.currentTarget.value)}
            />
          </div>
          <div class="field">
            <label for="pace">Pace</label>
            <select
              id="pace"
              data-testid="pace"
              value={pace}
              onChange={(event) => setPace(event.currentTarget.value as Pace)}
            >
              {(Object.keys(PACE_LABELS) as Pace[]).map((value) => (
                <option key={value} value={value}>
                  {PACE_LABELS[value]}
                </option>
              ))}
            </select>
          </div>
          <div class="field">
            <label for="count">Questions</label>
            <input
              id="count"
              type="number"
              data-testid="count"
              min={1}
              max={500}
              value={count ?? base.questionCount}
              onInput={(event) => {
                const value = Number(event.currentTarget.value)
                setCount(Number.isFinite(value) && value >= 1 ? Math.min(500, Math.round(value)) : null)
              }}
            />
          </div>
          <p class="muted small">
            Practice pacing keeps the same questions, so a slow run still feeds your statistics — it is just
            marked as practice. Changing the count is a different paper, with question ids of its own.
          </p>
        </div>
      ) : null}

      <p class="muted small">
        <Link to="/history">Your history</Link> stays on this device.
      </p>

      {installPrompt.value && completed >= 2 ? (
        <div class="row">
          <button type="button" data-testid="install" onClick={() => void promptInstall()}>
            Install 80 in 8
          </button>
          <span class="muted small">Runs fully offline once installed.</span>
        </div>
      ) : null}
    </main>
  )
}
