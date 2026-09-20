import {
  accuracyByKind,
  CURRENT_PRESETS,
  graded,
  type Profile,
  practiceStreak,
  retryDeck,
  trend,
  weakestKinds,
} from '@80in8/core'
import type { JSX } from 'preact'
import { useEffect, useRef, useState } from 'preact/hooks'
import {
  clearHistory,
  downloadExport,
  historyEntries,
  historyLoaded,
  importExport,
  loadHistory,
  runs,
  storageWorks,
} from '../adapters/history.js'
import { resolveProfile } from '../adapters/profiles.js'
import { settings } from '../adapters/settings.js'
import { Masthead } from '../components/Link.js'
import { Scroller } from '../components/Scroller.js'
import { labelOf } from '../labels.js'
import { startRun } from '../session.js'
import { showToast } from '../ui-state.js'

const DEFAULT_PRESET = CURRENT_PRESETS[0] as Profile

function day(ms: number): string {
  return new Date(ms).toLocaleString(undefined, {
    dateStyle: 'short',
    timeStyle: 'short',
  })
}

/** A sparkline of scores over time. Twenty lines of SVG beats a charting library. */
function Trend({ points }: { points: { startedAt: number; score: number }[] }): JSX.Element | null {
  if (points.length < 2) return null
  const width = 600
  const height = 120
  const scores = points.map((p) => p.score)
  const min = Math.min(...scores, 0)
  const max = Math.max(...scores, 1)
  const span = max - min || 1
  const step = width / (points.length - 1)
  const path = points
    .map((point, index) => {
      const x = index * step
      const y = height - ((point.score - min) / span) * (height - 12) - 6
      return `${index === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`
    })
    .join(' ')
  // A wash under the line. The chart is stretched to fit, so it carries no dots or
  // axes that a non-uniform scale would distort.
  const area = `${path} L${width},${height} L0,${height} Z`
  return (
    <svg
      class="trend"
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      role="img"
      aria-label={`Score trend over ${points.length} runs, from ${scores[0]} to ${scores.at(-1)}`}
      data-testid="trend"
    >
      <path d={area} fill="color-mix(in srgb, var(--accent) 12%, transparent)" stroke="none" />
      <path
        d={path}
        fill="none"
        stroke="var(--accent)"
        stroke-width="2.5"
        vector-effect="non-scaling-stroke"
      />
    </svg>
  )
}

export function History(): JSX.Element {
  const file = useRef<HTMLInputElement>(null)
  const [confirming, setConfirming] = useState(false)

  useEffect(() => {
    if (!historyLoaded.value) void loadHistory()
  }, [])

  const list = runs.value
  const entries = historyEntries(list)
  const gradedEntries = graded(entries)
  const points = trend(gradedEntries)
  const kinds = accuracyByKind(entries)
  const weakest = weakestKinds(entries)
  const streak = practiceStreak(entries, Date.now(), -new Date().getTimezoneOffset())

  const startWeakest = (): void => {
    const ids = retryDeck(
      list.map((run) => ({ startedAt: run.startedAt, answers: run.answers })),
      { size: 80, prefer: 'missed' },
    )
    if (ids.length === 0) {
      showToast('Nothing to revisit yet.')
      return
    }
    const profile = resolveProfile(settings.value.profileRef) ?? DEFAULT_PRESET
    startRun({
      profile,
      mode: settings.value.mode,
      seed: 0,
      practice: true,
      deck: { ids, origin: 'weakest' },
    })
  }

  return (
    <main class="page" data-testid="history">
      <Masthead />
      <h1>History</h1>

      {!storageWorks.value ? (
        <p class="card" data-testid="storage-warning" role="status">
          This browser is not letting the page store anything (private mode, most likely). You can still
          train; runs just will not be remembered.
        </p>
      ) : null}

      {list.length === 0 ? (
        <p class="muted" data-testid="history-empty">
          No runs yet.
        </p>
      ) : (
        <>
          <section class="stats">
            <div class="stat">
              <div class="k">Runs</div>
              <div class="v" data-testid="run-count">
                {list.length}
              </div>
            </div>
            <div class="stat">
              <div class="k">Best</div>
              <div class="v">
                {gradedEntries.length ? Math.max(...gradedEntries.map((e) => e.summary.score)) : '—'}
              </div>
            </div>
            <div class="stat">
              <div class="k">Day streak</div>
              <div class="v">{streak}</div>
            </div>
          </section>

          {/* A single run is a dot, not a trend. The heading waits for the chart. */}
          {points.length >= 2 ? (
            <div class="stack" data-testid="trend-section">
              <h2 class="small muted">Score over time</h2>
              <Trend points={points} />
            </div>
          ) : null}

          <Scroller label="Runs">
            <table data-testid="history-table">
              <thead>
                <tr>
                  <th>When</th>
                  <th>Profile</th>
                  <th>Mode</th>
                  <th>Score</th>
                  <th>Accuracy</th>
                  <th>Answered</th>
                </tr>
              </thead>
              <tbody>
                {list.map((run) => (
                  <tr
                    key={run.attemptId}
                    data-testid="history-row"
                    data-attempt-id={run.attemptId}
                    data-run-id={run.runId ?? ''}
                  >
                    <td>{day(run.startedAt)}</td>
                    <td>
                      {run.spec.profileRef}
                      {run.practice ? ' · practice' : ''}
                    </td>
                    <td>{run.spec.mode}</td>
                    <td class="num">{run.summary.score}</td>
                    <td class="num">
                      {run.summary.accuracy === null ? '—' : `${Math.round(run.summary.accuracy * 100)}%`}
                    </td>
                    <td class="num">
                      {run.summary.answered}/{run.summary.questionCount}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Scroller>

          <Scroller label="Accuracy by category" class="stack">
            <h2 class="small muted">Accuracy by category (last 20 runs)</h2>
            <table data-testid="kind-table">
              <thead>
                <tr>
                  <th>Category</th>
                  <th>Asked</th>
                  <th>Right</th>
                  <th>Accuracy</th>
                  <th>Mean</th>
                </tr>
              </thead>
              <tbody>
                {kinds.map((row) => (
                  <tr key={row.kind}>
                    <td>{labelOf(row.kind)}</td>
                    <td class="num">{row.answered}</td>
                    <td class="num">{row.correct}</td>
                    <td class="num">{row.accuracy === null ? '—' : `${Math.round(row.accuracy * 100)}%`}</td>
                    <td class="num">{row.meanMs === null ? '—' : `${(row.meanMs / 1000).toFixed(1)}s`}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Scroller>

          {weakest.length > 0 ? (
            <p class="muted small" data-testid="weakest">
              Weakest:{' '}
              {weakest
                .slice(0, 3)
                .map((k) => labelOf(k.kind))
                .join(', ')}
            </p>
          ) : null}

          <div class="row">
            {/* The deck prefers questions that were missed and falls back to the
                slowest, so after a flawless run it still has something useful to
                offer. The label says which of the two you are about to get. */}
            <button type="button" data-testid="weakest-80" onClick={startWeakest}>
              {weakest.length > 0 ? 'Weakest 80' : 'Slowest 80'}
            </button>
          </div>
        </>
      )}

      <section class="card stack">
        <h2 class="small muted">Your data</h2>
        <div class="row">
          <button type="button" data-testid="export" onClick={downloadExport}>
            Export JSON
          </button>
          <button type="button" data-testid="import" onClick={() => file.current?.click()}>
            Import
          </button>
          <button type="button" class="ghost" data-testid="clear" onClick={() => setConfirming(true)}>
            Clear everything
          </button>
        </div>
        <input
          ref={file}
          type="file"
          accept="application/json,.json"
          class="sr-only"
          aria-label="Import a JSON export"
          data-testid="import-file"
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
        {confirming ? (
          <div class="row" data-testid="clear-confirm">
            <span class="small">Delete every run on this device?</span>
            <button
              type="button"
              class="primary"
              data-testid="clear-yes"
              onClick={() => {
                setConfirming(false)
                void clearHistory().then(() => showToast('History cleared.'))
              }}
            >
              Delete
            </button>
            <button type="button" data-testid="clear-no" onClick={() => setConfirming(false)}>
              Cancel
            </button>
          </div>
        ) : null}
      </section>
    </main>
  )
}
