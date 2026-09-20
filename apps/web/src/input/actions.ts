import { checkAnswer, isAutoSubmitMatch } from '@80in8/core'
import { effect, signal } from '@preact/signals'
import { now } from '../adapters/clock.js'
import { settings } from '../adapters/settings.js'
import { dispatch, question, session } from '../session.js'
import { applyKey, type EditKey } from './edit.js'

/**
 * Everything the run screen can do, in one place, so the physical keyboard, the
 * keypad and the on-screen buttons cannot behave differently from one another.
 */

export const draft = signal('')
/** Bumped to restart the shake animation; not a boolean, so twice in a row still shows. */
export const shakeToken = signal(0)

// A new question always starts from an empty field, including after a skip, a
// recovered run, or the jump into a fresh run.
effect(() => {
  void question.value?.id
  draft.value = ''
})

export function pressEdit(key: EditKey): void {
  const state = session.value
  if (state.phase !== 'running') return
  const next = applyKey(draft.value, key)
  if (next === draft.value) return
  draft.value = next

  // Zetamac-style advance-on-match, and only where a wrong keystroke costs nothing.
  // Never after a deletion, and never on a half-typed sign or separator.
  const current = question.value
  const profile = state.run.profile
  if (!current || !profile.allowAutoSubmit || !settings.value.autoSubmit) return
  if (key === 'back' || key === 'clear' || key === '-' || key === '.' || key === '/' || key === ' ') return
  if (isAutoSubmitMatch(next, current.answer)) submitAnswer()
}

export function submitAnswer(): void {
  const state = session.value
  if (state.phase !== 'running') return
  const current = question.value
  if (!current) return
  // The reducer would ignore a half-typed entry anyway; asking first is what lets the
  // field shake instead of silently doing nothing.
  const verdict = checkAnswer(draft.value, current.answer, state.run.profile.answerPolicy)
  if (verdict.status === 'pending') {
    shakeToken.value += 1
    return
  }
  dispatch({ type: 'answer', raw: draft.value, at: now() })
}

export function skipQuestion(): void {
  const state = session.value
  if (state.phase !== 'running' || !state.run.profile.scoring.allowSkip) return
  dispatch({ type: 'skip', at: now() })
}

export function selectOption(index: number): void {
  if (session.value.phase !== 'running') return
  dispatch({ type: 'select', optionIndex: index, at: now() })
}
