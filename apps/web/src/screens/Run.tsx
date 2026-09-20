import { liveScore } from '@80in8/core'
import type { JSX } from 'preact'
import { useEffect, useRef, useState } from 'preact/hooks'
import { navigate } from '../adapters/router.js'
import { prefersReducedMotion, settings, updateSettings } from '../adapters/settings.js'
import { Keypad, type KeypadAction } from '../components/Keypad.js'
import { Link } from '../components/Link.js'
import { McqGrid } from '../components/McqGrid.js'
import { Modal } from '../components/Modal.js'
import { QuestionBox } from '../components/QuestionBox.js'
import { TopBar } from '../components/TopBar.js'
import { parseHint, TypedInput } from '../components/TypedInput.js'
import { draft, pressEdit, selectOption, shakeToken, skipQuestion, submitAnswer } from '../input/actions.js'
import {
  abortRun,
  announceText,
  clock,
  elapsedMs,
  feedback,
  question,
  remaining,
  session,
  skipCountdown,
} from '../session.js'
import { abortPending } from '../ui-state.js'

/** How long the run area may be unfocused before the "tap to continue" nudge appears. */
const BLUR_GRACE_MS = 1000

export function RunScreen(): JSX.Element {
  const state = session.value

  useEffect(() => {
    if (state.phase === 'finished') navigate('/results', { replace: true })
    if (state.phase === 'idle') navigate('/', { replace: true })
  }, [state.phase])

  if (state.phase === 'countdown') return <Countdown />
  if (state.phase !== 'running') {
    return (
      <main class="page" data-testid="run-empty">
        <p class="muted">No run in progress.</p>
        <Link to="/">Back to the start</Link>
      </main>
    )
  }

  return <Live />
}

function Countdown(): JSX.Element {
  const state = session.value
  const left = state.phase === 'countdown' ? state.startsAt - clock.value.mono : 0
  const n = Math.max(1, Math.ceil(left / 1000))
  return (
    <main class="countdown" data-testid="countdown">
      <div class="n nums" aria-live="assertive">
        {n}
      </div>
      <button type="button" class="ghost" data-testid="skip-countdown" onClick={skipCountdown}>
        Skip (Enter)
      </button>
    </main>
  )
}

function Live(): JSX.Element {
  const state = session.value
  if (state.phase !== 'running') return <div />
  const profile = state.run.profile
  const mode = state.run.spec.mode
  const current = question.value
  const [away, setAway] = useState(false)
  const field = useRef<HTMLDivElement>(null)

  // §7.7: a non-modal nudge when the run area has been unfocused for a moment. The
  // clock keeps running — the real test does not pause either.
  useEffect(() => {
    let handle: ReturnType<typeof setTimeout> | undefined
    const onBlur = () => {
      handle = setTimeout(() => setAway(true), BLUR_GRACE_MS)
    }
    const onFocus = () => {
      if (handle) clearTimeout(handle)
      setAway(false)
    }
    addEventListener('blur', onBlur)
    addEventListener('focus', onFocus)
    return () => {
      if (handle) clearTimeout(handle)
      removeEventListener('blur', onBlur)
      removeEventListener('focus', onFocus)
    }
  }, [])

  // The answer field must hold focus for the physical keyboard; a tap anywhere in the
  // run area puts it back.
  useEffect(() => {
    if (mode !== 'typed') return
    const input = field.current?.querySelector<HTMLInputElement>('[data-testid="typed-input"]')
    input?.focus()
  }, [mode])

  const onKeypad = (action: KeypadAction): void => {
    if (action.kind === 'edit') pressEdit(action.key)
    else if (action.kind === 'submit') submitAnswer()
    else skipQuestion()
  }

  const stacked = settings.value.stackedFractions
  const keypad = mode === 'typed' && settings.value.keypad

  return (
    <div
      class="run"
      data-testid="run"
      // Without a keypad the field belongs just under the question; with one it
      // belongs in the thumb zone at the bottom.
      data-layout={mode === 'typed' && !keypad ? 'centred' : 'stage'}
      ref={field}
      onPointerDown={(event) => {
        if (mode !== 'typed' || (event.target instanceof Element && event.target.closest('[role="dialog"]')))
          return
        field.current?.querySelector<HTMLInputElement>('[data-testid="typed-input"]')?.focus()
      }}
    >
      <TopBar
        index={state.index}
        total={state.questions.length}
        remaining={remaining.value}
        elapsed={elapsedMs.value}
        score={liveScore(state)}
        showScore={settings.value.showLiveScore}
        flash={feedback.value}
        onAbort={() => {
          abortPending.value = state.answers.length > 5
          if (!abortPending.value) abortRun()
        }}
      />

      <div class="stage">
        {current ? <QuestionBox question={current} stacked={stacked} /> : null}
        {mode === 'mcq' && current ? (
          <McqGrid question={current} stacked={stacked} onSelect={selectOption} />
        ) : null}
        {current ? (
          // The id regenerates this exact question, so it is worth being able to read
          // and copy one mid-run. It sits inside the stage rather than in a row of its
          // own, so it consumes existing slack and cannot push the keypad off a short
          // screen. One click selects the whole string.
          <p class="qid">
            <span class="sr-only">Question id: </span>
            {/* The id is its own element so that selecting it copies the id and
                nothing else; the label above must stay out of the selection. */}
            <span data-testid="question-id" class="qid-value">
              {current.id}
            </span>
          </p>
        ) : null}
      </div>

      {mode === 'typed' ? (
        <div class="inputarea">
          <TypedInput
            value={draft.value}
            shakeToken={shakeToken.value}
            reducedMotion={prefersReducedMotion()}
            onFallbackInput={(value) => {
              // Keep decimal commas and invalid input for the parser. Silently
              // stripping paste characters can change the submitted number.
              draft.value = value.replace(/−/g, '-')
            }}
          />
          <div class="hintline nums" data-testid="parse-hint">
            {parseHint(draft.value)}
          </div>
          {keypad ? (
            <Keypad onAction={onKeypad} allowSkip={profile.scoring.allowSkip} />
          ) : (
            <button
              type="button"
              class="ghost show-keypad"
              data-testid="show-keypad"
              onClick={() => {
                updateSettings({ keypad: true })
                field.current?.querySelector<HTMLInputElement>('[data-testid="typed-input"]')?.focus()
              }}
            >
              Show keypad
            </button>
          )}
        </div>
      ) : (
        <div class="inputarea">
          <div class="row" style="justify-content:center">
            {profile.scoring.allowSkip ? (
              <button type="button" class="ghost" data-testid="skip" onClick={skipQuestion}>
                Skip →
              </button>
            ) : null}
          </div>
        </div>
      )}

      <div class="sr-only" role="status" aria-live="polite" data-testid="announcer">
        {announceText.value}
      </div>

      {away ? (
        <div class="blurred" data-testid="blurred">
          Click or press any key to continue — the clock is still running.
        </div>
      ) : null}

      {abortPending.value ? (
        <Modal
          label="End this run?"
          testId="abort-confirm"
          onClose={() => {
            abortPending.value = false
          }}
        >
          <div class="sheet stack">
            <h2>End this run?</h2>
            <p class="muted">You have answered {state.answers.length} questions. They will be kept.</p>
            <div class="row">
              <button
                type="button"
                class="primary"
                data-testid="abort-yes"
                onClick={() => {
                  abortPending.value = false
                  abortRun()
                }}
              >
                End run
              </button>
              <button
                type="button"
                data-testid="abort-no"
                data-autofocus
                onClick={() => {
                  abortPending.value = false
                }}
              >
                Keep going
              </button>
            </div>
          </div>
        </Modal>
      ) : null}
    </div>
  )
}
