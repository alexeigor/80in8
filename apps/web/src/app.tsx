import type { JSX } from 'preact'
import { useEffect } from 'preact/hooks'
import { navigate, path } from './adapters/router.js'
import { applyUpdate, updateReady } from './adapters/sw.js'
import { Link } from './components/Link.js'
import { Shortcuts } from './components/Shortcuts.js'
import { pressEdit, selectOption, skipQuestion, submitAnswer } from './input/actions.js'
import { keyToEdit } from './input/edit.js'
import { History } from './screens/History.js'
import { Home } from './screens/Home.js'
import { QuestionScreen } from './screens/Question.js'
import { Results } from './screens/Results.js'
import { RunScreen } from './screens/Run.js'
import { SettingsScreen } from './screens/Settings.js'
import {
  abortRun,
  again,
  answeredCount,
  installLifecycleListeners,
  retryMistakes,
  sameSeed,
  session,
  skipCountdown,
} from './session.js'
import { abortPending, reviewOpen, shortcutsOpen, toast } from './ui-state.js'

/** How many answers make an abort worth confirming (§7.8). */
const CONFIRM_AFTER = 5

function editable(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  const tag = target.tagName
  // The answer field is deliberately *not* editable in this sense: the app owns its
  // keystrokes so the keypad and the keyboard produce identical strings.
  if (target.dataset.testid === 'typed-input') return false
  return tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA' || target.isContentEditable
}

function interactive(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && target.closest('button, a[href], input, select, textarea') !== null
}

/**
 * The binding table of §7.8, in one place. A key never means two things in the same
 * context, which is why this is a single function rather than per-component handlers.
 */
export function handleKey(event: KeyboardEvent): void {
  if (event.metaKey || event.ctrlKey || event.altKey || event.isComposing) return

  if (event.key === '?' && !abortPending.value) {
    event.preventDefault()
    shortcutsOpen.value = !shortcutsOpen.value
    return
  }
  if (shortcutsOpen.value) {
    if (event.key === 'Escape' || event.key === 'Enter') {
      event.preventDefault()
      shortcutsOpen.value = false
    }
    return
  }

  const state = session.value
  const route = path.value

  if (abortPending.value) {
    if (event.key === 'Escape') {
      event.preventDefault()
      abortPending.value = false
    }
    if (event.key === 'Enter' && !interactive(event.target)) {
      event.preventDefault()
      abortPending.value = false
      abortRun()
    }
    return
  }

  if (state.phase === 'countdown') {
    if (event.key === 'Enter') {
      event.preventDefault()
      skipCountdown()
    }
    return
  }

  if (state.phase === 'running') {
    runKey(event, state.run.spec.mode, state.answers.length, state.run.profile.scoring.allowSkip)
    return
  }

  if (route === '/results' && state.phase === 'finished') {
    resultsKey(event)
    return
  }

  if (route === '/' && event.key === 'Enter' && !editable(event.target) && !interactive(event.target)) {
    const start = document.querySelector<HTMLButtonElement>('[data-testid="start"]')
    if (start) {
      event.preventDefault()
      start.click()
    }
  }
}

function runKey(event: KeyboardEvent, mode: string, answered: number, allowSkip: boolean): void {
  if (event.key === 'Escape') {
    event.preventDefault()
    if (answered > CONFIRM_AFTER) abortPending.value = true
    else abortRun()
    return
  }

  // Enter/Space activate a focused button (including Show keypad). They only
  // submit/edit an answer when focus is on the answer field or the run itself.
  if (
    (event.key === 'Enter' || event.key === ' ') &&
    event.target instanceof HTMLElement &&
    event.target.closest('button, a[href]')
  )
    return

  // ArrowRight skips. Space never does — it is the mixed-number separator.
  if (event.key === 'ArrowRight') {
    event.preventDefault()
    if (allowSkip) skipQuestion()
    return
  }

  if (mode === 'mcq') {
    const index = '1234'.indexOf(event.key)
    if (index !== -1) {
      event.preventDefault()
      // Straight into the reducer: the next question is rendered before the browser
      // paints, and no keystroke is ever suppressed by the pointer double-tap guard.
      selectOption(index)
    }
    return
  }

  if (event.key === 'Enter') {
    event.preventDefault()
    submitAnswer()
    return
  }

  const edit = keyToEdit(event.key)
  if (edit !== null) {
    // '/' would open Firefox's quick-find, and Space would scroll the page.
    event.preventDefault()
    pressEdit(edit)
  }
}

function resultsKey(event: KeyboardEvent): void {
  const key = event.key.toLowerCase()
  if (editable(event.target)) return
  if (event.key === 'Enter' && !interactive(event.target)) {
    event.preventDefault()
    again()
    return
  }
  if (key === 's') {
    event.preventDefault()
    sameSeed()
    return
  }
  if (key === 'm') {
    event.preventDefault()
    retryMistakes()
    return
  }
  if (key === 'r') {
    event.preventDefault()
    reviewOpen.value = !reviewOpen.value
  }
}

function Screen(): JSX.Element {
  const route = path.value
  if (route === '/') return <Home />
  if (route === '/run') return <RunScreen />
  if (route === '/results') return <Results />
  if (route === '/history') return <History />
  if (route === '/settings') return <SettingsScreen />
  if (route.startsWith('/q/')) {
    let id = route.slice(3)
    try {
      id = decodeURIComponent(id)
    } catch {
      // Leave invalid escapes for the question parser to report in the normal UI.
    }
    return <QuestionScreen id={id} />
  }
  return (
    <main class="page" data-testid="not-found">
      <h1>Nothing here</h1>
      <Link to="/">Back to the start</Link>
    </main>
  )
}

/**
 * The browser's Back button during a run (§7.7). It cannot silently drop the run, and
 * it cannot silently ignore the person either: few answers means end it, many means
 * ask, and asking implies staying on the run screen.
 */
function onPopState(): void {
  const phase = session.value.phase
  if (phase !== 'running' && phase !== 'countdown') return
  if (path.value === '/run' || path.value.startsWith('/q/')) return
  if (answeredCount() > CONFIRM_AFTER) {
    abortPending.value = true
    navigate('/run', { replace: true })
    return
  }
  abortRun()
}

export function App(): JSX.Element {
  useEffect(() => {
    addEventListener('keydown', handleKey)
    // Registered after the router's own listener, so `path` is already up to date.
    addEventListener('popstate', onPopState)
    // Visibility, pageshow and focus all have to reach the reducer: a run that
    // expired while the device slept must finish the moment the page is back.
    const stopLifecycle = installLifecycleListeners()
    return () => {
      removeEventListener('keydown', handleKey)
      removeEventListener('popstate', onPopState)
      stopLifecycle()
    }
  }, [])

  return (
    <>
      <Screen />
      {shortcutsOpen.value ? (
        <Shortcuts
          onClose={() => {
            shortcutsOpen.value = false
          }}
        />
      ) : null}
      {/* §7.9: an update is only ever offered where it cannot interrupt anything. */}
      {updateReady.value && (path.value === '/' || path.value === '/results') ? (
        <div class="toast" role="status" data-testid="update-toast">
          A new version is ready.{' '}
          <button type="button" class="ghost small" onClick={() => void applyUpdate()}>
            Reload
          </button>
        </div>
      ) : null}
      {toast.value ? (
        <div class="toast" role="status" data-testid="toast">
          {toast.value}
        </div>
      ) : null}
    </>
  )
}
