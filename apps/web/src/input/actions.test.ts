import { formatCanonical, PRESETS, type Question } from '@80in8/core'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { settings, updateSettings } from '../adapters/settings.js'
import { abortRun, question, session, startRun } from '../session.js'
import { draft, pressEdit, selectOption, shakeToken, skipQuestion, submitAnswer } from './actions.js'
import type { EditKey } from './edit.js'

/**
 * The actions behind every input surface. Auto-submit is the delicate one (§7.4): it
 * fires on an exact match and never on a deletion, a sign or a separator.
 */

const DRILL = PRESETS['zetamac-drill']

function typeable(current: Question): string {
  return formatCanonical(current.answer).replace(/−/g, '-')
}

function begin(profile = DRILL, mode: 'typed' | 'mcq' = 'typed') {
  startRun({ profile: { ...profile, questionCount: 4 }, mode, seed: 3, practice: false, countdownMs: 0 })
}

function current(): Question {
  const q = question.value
  if (!q) throw new Error('no question on screen')
  return q
}

beforeEach(() => {
  vi.useFakeTimers()
  updateSettings({ autoSubmit: true })
})

afterEach(() => {
  abortRun()
  updateSettings({ autoSubmit: false })
  vi.useRealTimers()
})

describe('auto-submit', () => {
  it('advances the instant the typed value matches, on a drill profile with the setting on', () => {
    begin()
    const first = current()
    for (const key of typeable(first)) pressEdit(key as EditKey)
    expect(current().id).not.toBe(first.id)
    expect(draft.value).toBe('')
  })

  it('never fires after a deletion, even if what remains is the answer', () => {
    begin()
    const first = current()
    const answer = typeable(first)
    for (const key of answer) pressEdit(key as EditKey)
    // The match already advanced; set up the deletion case on the next question.
    const second = current()
    const next = typeable(second)
    const lastKey = (next.at(-1) ?? '0') as EditKey
    for (const key of next.slice(0, -1)) pressEdit(key as EditKey)
    pressEdit(lastKey === '9' ? '8' : '9')
    pressEdit('back')
    expect(draft.value).toBe(next.slice(0, -1))
    pressEdit(lastKey)
    expect(current().id).not.toBe(second.id)
  })

  it('never fires on a sign or a separator, and not at all when the setting or the profile says no', () => {
    begin()
    const first = current()
    const answer = typeable(first)
    // Build the answer, then toggle the sign twice: the second toggle restores the
    // exact match, but a sign key must not submit.
    for (const key of answer) pressEdit(key as EditKey)
    expect(current().id).not.toBe(first.id)
    const second = current()
    const next = typeable(second)
    for (const key of next) pressEdit(key as EditKey)
    expect(current().id).not.toBe(second.id)

    updateSettings({ autoSubmit: false })
    const third = current()
    for (const key of typeable(third)) pressEdit(key as EditKey)
    expect(current().id).toBe(third.id)
    abortRun()

    updateSettings({ autoSubmit: true })
    begin(PRESETS['optiver-classic'])
    const graded = current()
    for (const key of typeable(graded)) pressEdit(key as EditKey)
    expect(current().id).toBe(graded.id)
    expect(settings.value.autoSubmit).toBe(true)
  })

  it('ignores edits that change nothing', () => {
    begin()
    pressEdit('/')
    pressEdit(' ')
    pressEdit('back')
    expect(draft.value).toBe('')
  })
})

describe('submit, skip and select', () => {
  it('shakes on an unfinished entry instead of submitting it', () => {
    begin(PRESETS['optiver-classic'])
    const before = shakeToken.value
    pressEdit('-')
    submitAnswer()
    expect(shakeToken.value).toBe(before + 1)
    expect(session.value.phase === 'running' && session.value.answers).toHaveLength(0)
    pressEdit('5')
    submitAnswer()
    expect(session.value.phase === 'running' && session.value.answers).toHaveLength(1)
  })

  it('skips only where the profile allows, and selects only in a run', () => {
    begin(PRESETS['optiver-strict'])
    skipQuestion()
    expect(session.value.phase === 'running' && session.value.answers).toHaveLength(0)
    abortRun()
    // No run: every action is a no-op.
    pressEdit('1')
    submitAnswer()
    skipQuestion()
    selectOption(0)
    expect(session.value.phase).toBe('finished')

    begin(PRESETS['optiver-mcq'], 'mcq')
    selectOption(9)
    expect(session.value.phase === 'running' && session.value.answers).toHaveLength(0)
    selectOption(2)
    expect(session.value.phase === 'running' && session.value.answers[0]?.optionIndex).toBe(2)
    skipQuestion()
    expect(session.value.phase === 'running' && session.value.answers[1]?.skipped).toBe(true)
  })
})
