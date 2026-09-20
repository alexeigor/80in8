/**
 * The session state machine (DESIGN.md §6.9).
 *
 * Pure and total: every (state, event) pair returns a valid state, and no clock, timer,
 * DOM or storage is touched. Time enters only through the `Clocks` on each event, which
 * is what makes "the run ends exactly at zero" a unit test rather than a stopwatch.
 *
 * Every state is plain JSON data, so the in-progress checkpoint is a `JSON.stringify`
 * away and comes back deep-equal.
 */
import { checkAnswer } from '../answer/check.js'
import type { Question } from '../generate/types.js'
import { summariseRun } from '../stats/summary.js'
import type { Answer, Clocks, Deadline, EndReason, SessionEvent, SessionState } from './types.js'

export type { SessionEvent, SessionState } from './types.js'

export const initialState: SessionState = { phase: 'idle' }

function deadlineFrom(at: Clocks, durationMs: number): Deadline {
  return { mono: at.mono + durationMs, wall: at.wall + durationMs }
}

/**
 * Remaining time under the stricter of the two clocks.
 *
 * Returns null both for an untimed run and for a session that is not running, so read
 * `state.phase` alongside it when the difference matters.
 */
export function remainingMs(state: SessionState, at: Clocks): number | null {
  if (state.phase !== 'running' || !state.deadline) return null
  const byMono = state.deadline.mono - at.mono
  const byWall = state.deadline.wall - at.wall
  return Math.max(0, Math.min(byMono, byWall))
}

function isExpired(state: Extract<SessionState, { phase: 'running' }>, at: Clocks): boolean {
  if (!state.deadline) return false
  return at.mono >= state.deadline.mono || at.wall >= state.deadline.wall
}

function hiddenTotal(state: Extract<SessionState, { phase: 'running' }>, at: Clocks): number {
  if (state.hiddenSince === undefined) return state.hiddenMs
  return state.hiddenMs + Math.max(0, at.mono - state.hiddenSince)
}

function finish(
  state: Extract<SessionState, { phase: 'running' }>,
  at: Clocks,
  endedBy: EndReason,
): SessionState {
  const totalMs = Math.max(0, at.mono - state.startedAt)
  const hiddenMs = hiddenTotal(state, at)
  return {
    phase: 'finished',
    run: state.run,
    questions: state.questions,
    answers: state.answers,
    endedBy,
    summary: summariseRun(state.answers, state.run.profile, { endedBy, totalMs, hiddenMs }),
  }
}

function record(
  state: Extract<SessionState, { phase: 'running' }>,
  at: Clocks,
  answer: Answer,
): SessionState {
  const answers = [...state.answers, answer]
  const nextIndex = state.index + 1
  const next: Extract<SessionState, { phase: 'running' }> = {
    ...state,
    index: nextIndex,
    questionShownAt: at.mono,
    answers,
  }
  if (nextIndex >= state.questions.length) return finish(next, at, 'completed')
  return next
}

function currentQuestion(state: Extract<SessionState, { phase: 'running' }>): Question | undefined {
  return state.questions[state.index]
}

function baseAnswer(
  state: Extract<SessionState, { phase: 'running' }>,
  question: Question,
  at: Clocks,
): Pick<Answer, 'questionId' | 'shownAt' | 'answeredAt' | 'elapsedMs'> {
  return {
    questionId: question.id,
    shownAt: state.questionShownAt,
    answeredAt: at.mono,
    elapsedMs: Math.max(0, at.mono - state.questionShownAt),
  }
}

/** `start` is handled before the phase switch, so it never reaches here. */
type RunningEvent = Exclude<SessionEvent, { type: 'start' }>

function reduceRunning(
  state: Extract<SessionState, { phase: 'running' }>,
  event: RunningEvent,
): SessionState {
  // The deadline is enforced before the payload is looked at, so an answer that lands
  // after time is up is discarded rather than scored. After a suspend this happens
  // retroactively, on the first event the page delivers once it wakes.
  if (isExpired(state, event.at)) return finish(state, event.at, 'time')

  switch (event.type) {
    case 'tick':
      return state

    case 'abort':
      return finish(state, event.at, 'aborted')

    case 'visibility': {
      if (event.hidden) {
        if (state.hiddenSince !== undefined) return state
        return { ...state, hiddenSince: event.at.mono }
      }
      if (state.hiddenSince === undefined) return state
      const away = Math.max(0, event.at.mono - state.hiddenSince)
      const { hiddenSince: _hiddenSince, ...rest } = state
      const resumed: Extract<SessionState, { phase: 'running' }> = {
        ...rest,
        hiddenMs: state.hiddenMs + away,
      }
      // Practice profiles may stop the clock while the page is away; exam-realistic
      // ones deliberately do not, because the real test does not pause either.
      if (state.run.profile.pauseOnHide && state.deadline) {
        resumed.deadline = { mono: state.deadline.mono + away, wall: state.deadline.wall + away }
      }
      return resumed
    }

    case 'skip': {
      const question = currentQuestion(state)
      if (!question || !state.run.profile.scoring.allowSkip) return state
      return record(state, event.at, {
        ...baseAnswer(state, question, event.at),
        raw: '',
        value: null,
        correct: false,
        skipped: true,
      })
    }

    case 'answer': {
      const question = currentQuestion(state)
      if (!question) return state
      const verdict = checkAnswer(event.raw, question.answer, state.run.profile.answerPolicy)
      // A half-typed or unparseable entry is neither right nor wrong: nothing happens.
      if (verdict.status === 'pending') return state
      return record(state, event.at, {
        ...baseAnswer(state, question, event.at),
        raw: event.raw,
        value: verdict.value,
        correct: verdict.status === 'correct',
        skipped: false,
      })
    }

    case 'select': {
      const question = currentQuestion(state)
      if (!question) return state
      const option = question.options[event.optionIndex]
      if (!option) return state
      return record(state, event.at, {
        ...baseAnswer(state, question, event.at),
        raw: option.text,
        value: option.value,
        correct: option.correct,
        skipped: false,
        optionIndex: event.optionIndex,
        source: option.source,
      })
    }

    case 'go':
      return state
  }
}

function begin(state: Extract<SessionState, { phase: 'countdown' }>, at: Clocks): SessionState {
  const limit = state.run.profile.timeLimit
  const running: Extract<SessionState, { phase: 'running' }> = {
    phase: 'running',
    run: state.run,
    questions: state.questions,
    startedAt: at.mono,
    index: 0,
    questionShownAt: at.mono,
    answers: [],
    hiddenMs: 0,
  }
  if (limit.kind === 'timed') running.deadline = deadlineFrom(at, limit.durationMs)
  // A run with no questions is finished the moment it starts.
  if (state.questions.length === 0) return finish(running, at, 'completed')
  return running
}

/** Pure, total transition. Unknown events and events in the wrong phase are no-ops. */
export function reduce(state: SessionState, event: SessionEvent): SessionState {
  if (event.type === 'start') {
    return {
      phase: 'countdown',
      run: event.run,
      questions: event.questions,
      startsAt: event.at.mono + Math.max(0, event.countdownMs),
    }
  }

  switch (state.phase) {
    case 'idle':
      return state

    case 'countdown': {
      if (event.type === 'go') return begin(state, event.at)
      if (event.type === 'tick' && event.at.mono >= state.startsAt) return begin(state, event.at)
      if (event.type === 'abort') {
        return {
          phase: 'finished',
          run: state.run,
          questions: state.questions,
          answers: [],
          endedBy: 'aborted',
          summary: summariseRun([], state.run.profile, {
            endedBy: 'aborted',
            totalMs: 0,
            hiddenMs: 0,
          }),
        }
      }
      return state
    }

    case 'running':
      return reduceRunning(state, event)

    case 'finished':
      // Terminal. Starting a new run goes through `start`, handled above.
      return state
  }
}

/** The question currently on screen, if any. */
export function activeQuestion(state: SessionState): Question | undefined {
  if (state.phase !== 'running') return undefined
  return state.questions[state.index]
}

/** Running score, for profiles that show it live. */
export function liveScore(state: SessionState): number {
  if (state.phase === 'finished') return state.summary.score
  if (state.phase !== 'running') return 0
  const scoring = state.run.profile.scoring
  let score = 0
  for (const answer of state.answers) {
    if (answer.skipped) score += scoring.skipped
    else if (answer.correct) score += scoring.correct
    else score += scoring.wrong
  }
  return score
}

/** Ids of the questions answered wrongly or skipped, in order: the retry deck for a run. */
export function missedQuestionIds(state: SessionState): string[] {
  if (state.phase !== 'finished') return []
  return state.answers.filter((a) => !a.correct).map((a) => a.questionId)
}
