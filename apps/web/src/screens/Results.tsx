import { type Answer, formatValue, type Profile, type Question, type RunSummary } from '@80in8/core'
import type { JSX } from 'preact'
import { useEffect } from 'preact/hooks'
import { navigate } from '../adapters/router.js'
import { copyText, questionLink, runLink } from '../adapters/share.js'
import { Link, Masthead } from '../components/Link.js'
import { Value } from '../components/Value.js'
import { labelOf } from '../labels.js'
import { again, recovered, retryMistakes, sameSeed, session } from '../session.js'
import { reviewOpen, showToast } from '../ui-state.js'

function seconds(ms: number | null): string {
  return ms === null ? '—' : `${(ms / 1000).toFixed(1)}s`
}

function percent(value: number | null): string {
  return value === null ? '—' : `${Math.round(value * 100)}%`
}

export function bandOf(summary: RunSummary, profile: Profile): 'competitive' | 'pass' | 'below' | null {
  if (profile.competitiveScore !== undefined && summary.score >= profile.competitiveScore) {
    return 'competitive'
  }
  if (profile.passScore !== undefined) return summary.score >= profile.passScore ? 'pass' : 'below'
  return null
}

const BAND_TEXT: Record<'competitive' | 'pass' | 'below', string> = {
  competitive: 'Competitive',
  pass: 'Pass',
  below: 'Below the pass mark',
}

export function Results(): JSX.Element {
  const state = session.value

  useEffect(() => {
    if (state.phase !== 'finished') navigate('/', { replace: true })
  }, [state.phase])

  if (state.phase !== 'finished') {
    return (
      <main class="page" data-testid="results-empty">
        <p class="muted">No finished run to show.</p>
        <Link to="/">Back to the start</Link>
      </main>
    )
  }

  const { summary, run, answers, questions } = state
  const band = bandOf(summary, run.profile)
  const mistakes = answers.filter((a) => !a.correct).length

  return (
    <main class="page" data-testid="results" data-ended-by={summary.endedBy}>
      <Masthead />

      {recovered.value ? (
        <p class="card" data-testid="recovered" role="status">
          This run was closed out after the page reloaded. Answers up to that point were kept.
        </p>
      ) : null}

      <section class="score">
        <span class="value nums" data-testid="score">
          {summary.score}
        </span>
        <div>
          <div class="muted">
            {summary.correct} correct · {summary.wrong} wrong · {summary.skipped} skipped
          </div>
          {band ? (
            <span class="band" data-band={band} data-testid="band">
              {BAND_TEXT[band]}
            </span>
          ) : null}
        </div>
      </section>

      <section class="stats">
        <Stat k="Accuracy" v={percent(summary.accuracy)} testid="accuracy" />
        <Stat k="Answered" v={`${summary.answered}/${summary.questionCount}`} testid="answered" />
        <Stat k="Per question" v={seconds(summary.meanMsPerQuestion)} testid="per-question" />
        <Stat k="Ended by" v={summary.endedBy} testid="ended-by" />
        {summary.hiddenMs > 1000 ? (
          <Stat k="Hidden" v={`${Math.round(summary.hiddenMs / 1000)}s`} testid="hidden" />
        ) : null}
      </section>

      <div class="row">
        <button type="button" class="primary" data-testid="again" onClick={again}>
          Again <kbd>Enter</kbd>
        </button>
        <button type="button" data-testid="same-seed" onClick={sameSeed}>
          Same seed <kbd>S</kbd>
        </button>
        <button type="button" data-testid="retry" disabled={mistakes === 0} onClick={retryMistakes}>
          Retry {mistakes} mistakes <kbd>M</kbd>
        </button>
        <button
          type="button"
          class="ghost"
          data-testid="toggle-review"
          aria-expanded={reviewOpen.value}
          onClick={() => {
            reviewOpen.value = !reviewOpen.value
          }}
        >
          Review <kbd>R</kbd>
        </button>
        {run.spec.kind === 'seeded' ? (
          <button
            type="button"
            class="ghost"
            data-testid="share-run"
            onClick={() => {
              void copyText(runLink(run)).then((ok) => showToast(ok ? 'Run link copied' : runLink(run)))
            }}
          >
            Copy run link
          </button>
        ) : null}
      </div>

      {summary.byKind.length > 0 ? (
        <section class="scroller">
          <h2 class="small muted">By category</h2>
          <table data-testid="by-kind">
            <thead>
              <tr>
                <th>Category</th>
                <th>Asked</th>
                <th>Right</th>
                <th>Wrong</th>
                <th>Skipped</th>
                <th>Mean</th>
              </tr>
            </thead>
            <tbody>
              {summary.byKind.map((row) => (
                <tr key={row.kind}>
                  <td>{labelOf(row.kind)}</td>
                  <td class="num">{row.answered}</td>
                  <td class="num">{row.correct}</td>
                  <td class="num">{row.wrong}</td>
                  <td class="num">{row.skipped}</td>
                  <td class="num">{seconds(row.meanMs)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ) : null}

      {summary.distractorSources.length > 0 ? (
        <section>
          <h2 class="small muted">What tripped you up</h2>
          {/* The core reports only the distractors that were actually fallen for;
              correct choices are already filtered out of this list. */}
          <p class="small">
            {summary.distractorSources
              .map((entry) => `${entry.source.replace(/-/g, ' ')} ×${entry.count}`)
              .join(' · ')}
          </p>
        </section>
      ) : null}

      {reviewOpen.value ? <Review questions={questions} answers={answers} profile={run.profile} /> : null}
    </main>
  )
}

function Stat({ k, v, testid }: { k: string; v: string; testid: string }): JSX.Element {
  return (
    <div class="stat">
      <div class="k">{k}</div>
      <div class="v" data-testid={testid}>
        {v}
      </div>
    </div>
  )
}

/**
 * Every question with what you answered and what it should have been. The id is shown
 * because it is the thing that regenerates the question: copying the link is how a
 * single question travels (§6.5, F14).
 */
function Review({
  questions,
  answers,
  profile,
}: {
  questions: readonly Question[]
  answers: readonly Answer[]
  profile: Profile
}): JSX.Element {
  // Inline fractions here: stacked ones are unreadable at review-row size.
  const stacked = false
  // Only what was actually asked: eighty "not reached" rows after an abort are noise.
  const reached = questions.slice(0, Math.max(answers.length, 0))
  return (
    <section class="review" data-testid="review">
      <h2 class="small muted">
        Every question asked
        {reached.length < questions.length ? ` · ${questions.length - reached.length} never came up` : ''}
      </h2>
      {reached.map((q, index) => {
        const answer = answers[index]
        const correctText = formatValue(q.answer, q.kind, profile)
        return (
          <div
            class="review-row"
            key={q.id}
            data-testid={`review-row-${index}`}
            data-question-id={q.id}
            data-correct={answer ? String(answer.correct) : 'unanswered'}
          >
            <span class="muted nums">{index + 1}</span>
            <div>
              <div class="nums">
                <Value text={q.display.left} stacked={stacked} /> {q.display.op}{' '}
                <Value text={q.display.right} stacked={stacked} /> ={' '}
                <Value text={q.display.result} stacked={stacked} />
              </div>
              <div class="small muted">
                {answer
                  ? answer.skipped
                    ? 'skipped'
                    : `you: ${answer.raw || '—'} · ${seconds(answer.elapsedMs)}`
                  : 'not reached'}
                {answer?.correct ? '' : ` · answer: ${correctText}`}
              </div>
              <div class="qid">{q.id}</div>
            </div>
            <button
              type="button"
              class="ghost small"
              data-testid={`copy-link-${index}`}
              onClick={() => {
                const link = questionLink(q.id)
                void copyText(link).then((ok) => showToast(ok ? 'Question link copied' : link))
              }}
            >
              Copy link
            </button>
          </div>
        )
      })}
    </section>
  )
}
