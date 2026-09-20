import { render } from 'preact'
import './styles/app.css'
import { loadHistory } from './adapters/history.js'
import { loadProfiles } from './adapters/profiles.js'
import { navigate, path, startRouter } from './adapters/router.js'
import { applyPreferences, watchSystemPreferences } from './adapters/settings.js'
import { registerServiceWorker } from './adapters/sw.js'
import { App } from './app.js'
import { watchInstallPrompt } from './install.js'
import { recoverCheckpoint } from './session.js'

applyPreferences()
watchSystemPreferences()
startRouter()
watchInstallPrompt()
registerServiceWorker()

// Custom profile snapshots first: a `/q/<id>` deep link cannot resolve without them.
void loadProfiles()
void loadHistory()

// A run that was interrupted leaves a checkpoint behind (§7.7). Close it out wherever
// the person happens to land, so the answers still reach history if they navigated
// away, and show the results screen only if they were on the run itself.
if (recoverCheckpoint() && (path.value === '/run' || path.value.startsWith('/q/'))) {
  navigate('/results', { replace: true })
}

const root = document.getElementById('app')
if (root) render(<App />, root)
