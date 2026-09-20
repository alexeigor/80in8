# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

`AGENTS.md` holds the repository conventions (style, commit format, Python tooling) and applies here too.
This file adds the architecture and the invariants that only show up after reading several files.

## Commands

Node 22+ (CI uses 24), npm workspaces, run from the repository root. The everyday ones are in
`AGENTS.md`; these are the invocations that are easy to get wrong:

```bash
# One core test file. Do NOT use `npm run test:core -- <file>`: that script runs with
# --coverage, and the 100% thresholds fail on any filtered run.
cd packages/core && npx vitest run src/rng/rng.test.ts

# One web test file (no coverage thresholds, so the workspace script is fine).
npm run test:web -- src/run.test.tsx

# One browser spec, or fewer workers.
npm run e2e -w @80in8/web -- e2e/run.spec.ts --workers=2

# Cross-browser and sub-path hosting checks.
E2E_CROSS_BROWSER=1 npm run e2e
BASE_PATH=/80in8/ npm run e2e -w @80in8/web -- e2e/hosting.spec.ts
```

`npm run e2e` builds the core and the app and serves the **production** build via `vite preview` —
the service worker, manifest, offline behaviour and network contract do not exist in the dev server.

Full Stryker is blocked (Stryker 10 vs TypeScript 7 / Vitest 5 — the reasoning is in
`stryker.config.json`). `npm run mutation` runs `scripts/mutation-smoke.mjs` instead: it applies a
fixed list of hand-written mutations to the core one at a time and fails if the suite tolerates any.
When you change core behaviour and that script's `find` strings no longer match the source, fix the
mutation entries rather than deleting them.

## Architecture

Two workspaces with a hard boundary: `packages/core` (`@80in8/core`) is pure, dependency-free
TypeScript — no DOM, timers, storage or network — and `apps/web` is Preact plus adapters that feed
the core clocks, seeds and user events and render what comes back. Both dev and test resolve
`@80in8/core` to `packages/core/src/index.ts` via a Vite alias, so no build step is needed; only
`npm run build` and the `pree2e` hook compile the core to `dist`.

### Question identity is the load-bearing idea

A question is a pure function of (profile, kind, seed), and its id encodes exactly that:
`1.optiver-classic@1.int-mul.00k7x2q` (`identity/id.ts`). Hand the id plus a profile resolver back
to the core and you get the identical question, missing slot and option order. Consequences that
run through the whole codebase:

- A run is just a list of ids. Seeded runs, retry decks and a shared `/q/<id>` link all flow through
  the same machinery in `generate/run.ts` and the same session reducer.
- History stores ids, not question text.
- **Presets are versioned and frozen** (`profile/presets.ts`). Any change to a preset's generative
  parameters changes what existing ids regenerate to, so it requires a version bump plus a new
  entry; old versions stay in the registry forever. The snapshot test in `profile/presets.test.ts`
  fails otherwise — treat a snapshot update there as a red flag, not a chore.
- The profile reference hashes only the *generative* fields (`profile/canonical.ts`
  `generativeFingerprint`). Name, time limit, scoring rule and marking policy are deliberately
  excluded so that the same paper under a longer clock or stricter marking keeps sharing ids,
  statistics and retry decks. Adding a field to that fingerprint forks every existing id.
- Custom (non-preset) profiles are referenced as `custom-<hash8>` and the snapshot must travel with
  the ids: IndexedDB locally, the `pf` query parameter in a shared link (`adapters/profiles.ts`).
- `runId` identifies the paper; `attemptId` identifies the sitting. History is keyed by `attemptId`
  so a second attempt at the same seed is a second row.

### Session state and time

`session/reducer.ts` is pure and total: every (state, event) pair returns a valid state, and time
enters only as a `Clocks` value on each event. Every `SessionState` is plain JSON by construction,
which is what makes the in-progress checkpoint a `JSON.stringify` (`adapters/checkpoint.ts`).

`Clocks` carries both `mono` (`performance.now()`) and `wall` (`Date.now()`), and deadlines take the
stricter of the two, so neither sleeping the device nor moving the system clock buys extra time.
A recovered run is never resumed — it is closed out as aborted and shown with a note.

Keep clock reads in `apps/web/src/adapters/clock.ts` and the run loop; do not reach for `Date.now()`
inside the core or inside components.

### Web app shape

`apps/web/src/session.ts` is the single store: core reducer plus `@preact/signals`, browser
lifecycle, sound, wake lock and persistence effects. `ui-state.ts` holds the few UI-only signals.
`adapters/router.ts` is a ~40-line signal-based router over six routes (`/`, `/run`, `/results`,
`/history`, `/settings`, `/q/<id>`); paths inside the app are always base-relative and `href()` is
the only place `BASE_URL` is added, because GitHub Pages serves from `/80in8/`.

All keyboard bindings live in `handleKey` in `app.tsx` — one table, so a key never means two things
in the same context. The typed answer field is app-owned (not treated as a native editable) so that
the keypad and the physical keyboard produce identical strings.

Storage never throws: `adapters/idb.ts` degrades to "history is not saved" rather than breaking the
trainer in private browsing or on quota errors.

### Network contract

The app makes zero third-party requests and zero requests of any kind during a run. That is enforced
in three places that must stay in sync: the CSP in `apps/web/vite.config.ts` (also mirrored in
`_headers`), the PWA config (everything precached, `runtimeCaching: []`), and hand-rolled service
worker registration in `adapters/sw.ts` that suspends update checks while a run is live. `e2e/network.spec.ts`
guards it.

## Testing

- Core: Vitest plus fast-check properties, 100% coverage thresholds on lines, functions, branches
  and statements (`packages/core/vitest.config.ts`; `index.ts` and `**/types.ts` are excluded).
- Web: Vitest with jsdom and Testing Library for Preact.
- Browser: Playwright over three device projects (Desktop Chrome, iPhone 15, Pixel 7), with
  Safari/Firefox added by `E2E_CROSS_BROWSER=1`. E2E specs compute expected answers by importing
  `@80in8/core` and regenerating the question from the `data-question-id` in the DOM
  (`e2e/helpers.ts`), so they assert against the library rather than a copy of its logic. Screens
  expose `data-testid` hooks for this.

## Documentation

`DESIGN.md` is the source of truth for behaviour and is cited by section number throughout the code
(`§6.5` is identity, `§6.9` the session machine, `§7.8` the key bindings, Appendix A the default
profile). When you change behaviour a comment cites, update the section too. `DESIGN_REVIEW.md`
records the review findings that shaped the second draft; `docs/TEST_REPORT.md` is a point-in-time
run report, not a live document.
