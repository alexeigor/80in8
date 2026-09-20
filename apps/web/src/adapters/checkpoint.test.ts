import { generateRun, initialState, materialise, PRESETS, type Question, reduce } from '@80in8/core'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { clearCheckpoint, readCheckpoint, saveCheckpoint } from './checkpoint.js'

const KEY = '80in8:checkpoint:v1'
const profile = { ...PRESETS['optiver-classic'], questionCount: 3 }

function running() {
  const run = generateRun('attempt-1', 5, profile, 'typed', false)
  const questions = materialise(run, () => profile) as Question[]
  const at = { mono: 1000, wall: 1_700_000_000_000 }
  let state = reduce(initialState, { type: 'start', run, questions, at, countdownMs: 0 })
  state = reduce(state, { type: 'go', at })
  state = reduce(state, { type: 'skip', at: { mono: 2000, wall: at.wall + 1000 } })
  if (state.phase !== 'running') throw new Error('the fixture should be running')
  return state
}

beforeEach(() => sessionStorage.clear())

describe('the in-progress checkpoint', () => {
  it('round-trips a running state with its clocks and practice flag', () => {
    const state = running()
    const at = { mono: 2500, wall: 1_700_000_001_500 }
    saveCheckpoint(state, at, true, 1_700_000_000_000)
    expect(readCheckpoint()).toEqual({ state, at, practice: true, startedAtWall: 1_700_000_000_000 })
  })

  it('defaults the practice flag and the wall-clock start', () => {
    const state = running()
    saveCheckpoint(state, { mono: 1, wall: 2 })
    expect(readCheckpoint()).toMatchObject({ practice: false, startedAtWall: 2 })
  })

  it('refuses anything that is not a coherent session', () => {
    const state = running()
    const good = { state, at: { mono: 1, wall: 2 } }
    const bad = [
      '{',
      JSON.stringify({ state: { phase: 'idle' }, at: good.at }),
      JSON.stringify({ state: { phase: 'running' }, at: good.at }),
      JSON.stringify({ ...good, at: { mono: 'soon', wall: 2 } }),
      JSON.stringify({ ...good, practice: 'yes' }),
      JSON.stringify({ ...good, startedAtWall: 'then' }),
      JSON.stringify({ ...good, state: { ...state, questions: [] } }),
      JSON.stringify({
        ...good,
        state: { ...state, run: { ...state.run, questionIds: [...state.run.questionIds].reverse() } },
      }),
      JSON.stringify({
        ...good,
        state:
          state.phase === 'running'
            ? { ...state, answers: [...state.answers, ...state.answers, ...state.answers, ...state.answers] }
            : state,
      }),
      JSON.stringify({
        ...good,
        state:
          state.phase === 'running'
            ? { ...state, answers: [{ ...state.answers[0], questionId: 'someone-else' }] }
            : state,
      }),
    ]
    for (const value of bad) {
      sessionStorage.setItem(KEY, value)
      expect(readCheckpoint(), value.slice(0, 60)).toBeNull()
    }
  })

  it('clears only its own attempt when asked for one', () => {
    const state = running()
    saveCheckpoint(state, { mono: 1, wall: 2 })
    clearCheckpoint('some-other-attempt')
    expect(readCheckpoint()).not.toBeNull()
    clearCheckpoint('attempt-1')
    expect(readCheckpoint()).toBeNull()
    // Nothing there: still nothing, still no error.
    clearCheckpoint('attempt-1')
    saveCheckpoint(state, { mono: 1, wall: 2 })
    clearCheckpoint()
    expect(readCheckpoint()).toBeNull()
  })

  it('never throws when storage does', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('denied', 'SecurityError')
    })
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('denied', 'SecurityError')
    })
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
      throw new DOMException('denied', 'SecurityError')
    })
    expect(() => saveCheckpoint(running(), { mono: 1, wall: 2 })).not.toThrow()
    expect(readCheckpoint()).toBeNull()
    expect(() => clearCheckpoint()).not.toThrow()
  })
})
