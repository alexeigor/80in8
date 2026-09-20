# Test Report — 2026-09-20

## Results

All checks run passed after the fixes described below.

| Check | Result |
| --- | --- |
| Core unit and property tests | 500 passed |
| Web unit tests | 48 passed |
| Core coverage | 100% statements, branches, functions, and lines |
| Mutation smoke tests | All 16 representative mutations detected |
| Biome lint and formatting | Passed, no warnings |
| TypeScript checks | Passed, including E2E files |
| Production build | Passed |
| Full E2E matrix | 495 passed in 57.7 seconds, without retries |
| `/80in8/` subpath deployment | 10 additional checks passed |

The browser matrix runs 99 scenarios on each of five projects: desktop Chromium,
Pixel 7 emulation on Chromium, iPhone 15 emulation on WebKit, desktop WebKit, and
desktop Firefox. Local environment: macOS ARM64, Node.js 26.8.2, Playwright 1.63.0.

## Angles covered

- Complete typed and multiple-choice runs, scores, statistics, skips, retries,
  shared question identity, and repeated attempts at the same seed.
- Time expiration, simulated sleep, background visibility, reload recovery, and
  immediate navigation after ending a run.
- History export/import, conflicting attempt IDs, unsupported import versions,
  and denied browser storage.
- Keyboard activation and focus navigation, touch targets, narrow layouts,
  200% text sizing, contrast assertions, and preference persistence.
- Manifest assets, service-worker control, offline reload and training, network
  requests, deployment prefixes, deep links, and the static `404.html` fallback.
- Separate interactive Chrome check at 320 × 568 pixels: advanced settings,
  fraction entry (`1/4 − 1/2 = -0.25`), results, and console errors. No console
  errors were observed in that check.

## Defects fixed

1. **History import overwrote saved attempts.** Conflicting imports kept the
   original in memory but wrote the imported version to IndexedDB. Reload then
   changed the score. Persistence now follows the same deduplication as memory.
2. **History loading hid recovered runs.** An asynchronous startup read could
   replace a newly recovered run with an older snapshot. Loading now merges with
   current in-memory entries.
3. **Recovered practice lost its classification.** Checkpoints now preserve the
   practice flag, so reload recovery does not count those runs as graded attempts.
4. **Enter hijacked focused home controls.** Activating More options from the
   keyboard started a run. Focused controls now retain their native behavior.
5. **Tab on results started another run.** Tab and Shift+Tab now navigate controls;
   Enter still restarts from outside controls. Shortcut documentation was updated.
6. **Malformed URL escapes could crash routing.** Decoding failures now reach the
   existing invalid-question UI. The regression test supplies the static-hosting
   fallback because Vite itself rejects malformed escapes before serving the app.

Nine E2E scenarios were added in `resilience.spec.ts` and `hosting.spec.ts`.
CI now includes the full browser matrix and subpath checks.

## Follow-up: six coverage gaps

The follow-up adds 24 browser scenarios and 80 unit cases across all six requested
areas. Browser scenarios run on every project; adapter tests control asynchronous
completion and virtual time explicitly.

| Area | Regression coverage and resulting fixes |
| --- | --- |
| Invalid imports and stored data | Reject malformed nested runs, settings and profile snapshots before importing; ignore corrupt history rows and checkpoints; recover usable default preferences. |
| Actions after reload recovery | Same seed, Retry mistakes and Again work after recovery, preserve question identity as appropriate, and create distinct history attempts. |
| Storage races | Hold real IndexedDB writes across navigation; retain the final answer until persistence succeeds; prevent older saves from clearing newer checkpoints. Deferred unit reads cover startup/recovery and clear-history ordering. |
| Service-worker upgrades | Build two distinct production versions, discover the update during a run, delay activation, explicitly reload, retain history, then run offline with the new version. Reload now waits for controller change; fake-clock tests verify periodic checks pause during runs. |
| Custom sharing | Open generated run and question links in fresh recipient contexts; reject missing/tampered question payloads. Adapter tests verify explicit timing snapshots override a previously known profile with the same question hash, and reject invalid payloads even when a local copy exists. |
| Input and dialog accessibility | Cover permitted/forbidden/disabled auto-submit, native text input with Unicode minus and decimal commas, keypad-only completion with mobile taps, and modal focus entry, trapping, restoration and focused Enter activation. |

New browser files: `invalid-data.spec.ts`, `recovery.spec.ts`,
`updates.spec.ts`, `custom-sharing.spec.ts`, and `input-accessibility.spec.ts`.
New unit files: core `persist/validate.test.ts` and web adapter
`history.test.ts`, `share.test.ts`, and `sw.test.ts`.

## Settings switches

The settings now use labelled switches instead of wrapping On/Off buttons. The
control column stays aligned beside descriptions, with 52 × 44px tap targets,
keyboard operation, screen-reader names and descriptions, and reduced-motion support.

Seven scenarios in `settings-switches.spec.ts` cover label clicks, Space and Enter,
touch interaction, persistence for every switch, disabled auto-submit, and dark/light
layouts at 320px with both normal and 200% text. The enlarged-text checks also caught
and fixed a WebKit native-select overflow. Screenshots of both themes were reviewed.

## Mobile keypad availability

Touch detection now includes secondary coarse pointers and touch-point support,
while respecting saved preferences. A hidden keypad can be shown during a typed
run without losing the current answer. Enter and Space activate focused controls
instead of accidentally submitting. Flexible question spacing keeps Submit visible
on a 320 × 568 screen; enlarged text can scroll without overlapping controls.

Six scenarios in `keypad-availability.spec.ts` cover fresh phone/desktop defaults,
hybrid-device detection, restoring a hidden keypad by touch, persistence, keyboard
activation and focus, and every key fitting on a small phone screen. The iPhone
layout screenshot was reviewed.

## Offline testing limitation and resolution

WebKit's `context.setOffline(true)` caused an internal navigation error even in an
independent minimal service worker returning a hardcoded response, with both
temporary and persistent browser contexts. That isolated the failure from this app.

The offline regression now shuts down an isolated production server on every
engine and verifies that HTTP requests fail before reloading. Ordinary HTTP caching
is disabled on that server, so successful loading requires the service worker.
Chromium and Firefox additionally use Playwright's offline emulation. No browser
projects or offline assertions were skipped.

## Reproduction

```bash
npx playwright install chromium webkit firefox
npm run ci
E2E_CROSS_BROWSER=1 npm run e2e -w @80in8/web -- --workers=4
BASE_PATH=/80in8/ E2E_CROSS_BROWSER=1 npm run e2e -w @80in8/web -- e2e/hosting.spec.ts
```

Mobile coverage uses emulation, not physical phones. This was not a complete
accessibility audit or Lighthouse run. Full Stryker remains blocked by the existing
toolchain incompatibility documented in `stryker.config.json`; the mutation result
above refers only to the smoke suite. The results above describe the local test
session; [GitHub Actions](https://github.com/alexeigor/80in8/actions) reports CI
results separately. The first CI run exposed a missing core build before Playwright
test discovery on a fresh checkout; the E2E command now builds that dependency first.
