import { type Clocks, isSessionState, type SessionState } from '@80in8/core'

/**
 * In-progress checkpoint (DESIGN.md §7.7).
 *
 * Every `SessionState` is plain JSON by construction, so the checkpoint is a
 * `JSON.stringify` away. The clocks are stored with it because `performance.now()`
 * restarts at zero on reload: without them a recovered run would compute a nonsense
 * duration. A recovered run is never resumed — the clock kept running while the page
 * was gone — it is closed out as aborted and shown with a note.
 */

const KEY = '80in8:checkpoint:v1'

export interface Checkpoint {
  state: SessionState
  at: Clocks
  practice?: boolean
  startedAtWall?: number
}

export function saveCheckpoint(
  state: SessionState,
  at: Clocks,
  practice = false,
  startedAtWall = at.wall,
): void {
  try {
    sessionStorage.setItem(KEY, JSON.stringify({ state, at, practice, startedAtWall }))
  } catch {
    /* Storage is optional; losing a checkpoint only costs a recovered results screen. */
  }
}

export function readCheckpoint(): Checkpoint | null {
  try {
    const raw = sessionStorage.getItem(KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<Checkpoint> | null
    if (!parsed || !isSessionState(parsed.state) || parsed.state.phase === 'idle') return null
    if (!Number.isFinite(parsed.at?.mono) || !Number.isFinite(parsed.at?.wall)) return null
    if (parsed.practice !== undefined && typeof parsed.practice !== 'boolean') return null
    if (parsed.startedAtWall !== undefined && !Number.isFinite(parsed.startedAtWall)) return null
    const state = parsed.state
    if (state.questions.length !== state.run.questionIds.length) return null
    if (state.questions.some((question, index) => question.id !== state.run.questionIds[index])) return null
    if (state.phase !== 'countdown') {
      if (state.answers.length > state.questions.length) return null
      if (state.answers.some((answer, index) => answer.questionId !== state.run.questionIds[index]))
        return null
    }
    return parsed as Checkpoint
  } catch {
    return null
  }
}

export function clearCheckpoint(attemptId?: string): void {
  try {
    // A slow save from the previous run must never remove a newer checkpoint.
    if (attemptId !== undefined) {
      const state = readCheckpoint()?.state
      if (!state || state.phase === 'idle' || state.run.attemptId !== attemptId) return
    }
    sessionStorage.removeItem(KEY)
  } catch {
    /* ignored */
  }
}
