# 80 in 8

A browser trainer for the Optiver-style "80 questions in 8 minutes" mental arithmetic
test. No backend, no accounts, no network after the first load. Works on a laptop and
on a phone, with two answer modes: pick one of four, or type the answer.

**Use the app:** [alexeigor.github.io/80in8](https://alexeigor.github.io/80in8/).

The design and the research behind it are in [DESIGN.md](DESIGN.md).

## Layout

| Path | What it is |
|------|------------|
| `packages/core` | `@80in8/core`: exact arithmetic, question generation, identity, scoring, session state. Pure TypeScript, zero runtime dependencies, 100% test coverage. |
| `apps/web` | The Preact application: screens, input surfaces, storage adapters, offline support. |
| `DESIGN.md` | The design document, including the research the question mix is based on. |
| `DESIGN_REVIEW.md` | The review whose findings shaped the second draft. |

## Getting started

```bash
npm install
npm run dev          # start the app
npm test             # core and web unit tests
npm run typecheck    # tsc across both packages
npm run lint         # Biome
npm run ci           # lint, types, unit tests, mutation checks, build
```

Browser tests run separately against the production build:

```bash
npx playwright install chromium webkit firefox
npm run e2e          # desktop and two phone layouts on Chromium
E2E_CROSS_BROWSER=1 npm run e2e  # also Safari/WebKit and Firefox; iPhone uses WebKit
```

The E2E command builds the core package first, so test discovery works from a fresh checkout.

To select tests or control workers, pass arguments directly to the web workspace:
`npm run e2e -w @80in8/web -- e2e/resilience.spec.ts --workers=2`.
CI runs the full browser matrix in addition to `npm run ci`.
To check GitHub Pages-style subpath hosting, run
`BASE_PATH=/80in8/ E2E_CROSS_BROWSER=1 npm run e2e -w @80in8/web -- e2e/hosting.spec.ts`.

## Deployment

Pushing to `main` publishes the production build to GitHub Pages through
`.github/workflows/deploy.yml`. The workflow builds with `BASE_PATH=/80in8/`,
including matching asset URLs, the service worker scope, and a `404.html` fallback
for shared question links. GitHub Pages must use **GitHub Actions** as its source.
The Deploy workflow can also be run manually from the repository's Actions tab.

Mutation testing on the core is a separate, slower command:

```bash
npm run mutation
```

## The idea the whole thing rests on

Every question is a pure function of three things: a profile, a question kind, and a
32-bit seed. Its identifier encodes exactly those:

```
1.optiver-classic@1.int-mul.00k7x2q
│ │                 │        └ seed, base 36
│ │                 └ kind
│ └ profile, with its version
└ id format version
```

Give that string back to the library and you get the identical question, the identical
missing slot, and the identical four options in the identical order. A run is therefore
just a list of these strings, which is what makes three otherwise awkward features fall
out for free: history that stores ids rather than question text, a retry deck built from
the questions you actually got wrong, and a link that shows someone else the exact
question you are looking at.

Two attempts at the same seed share a run id but get different attempt ids, so
practising the same paper twice gives you two rows in your history rather than one
overwriting the other.

## What is deliberately not here

No accounts, no leaderboards, no analytics, no third-party requests. History lives in
your browser and leaves it only when you export it. A shared link carries a seed, not
your data.

## Honest notes

- The exact format of Optiver's real test is not published. The default profile follows
  the most consistently reported description and the distribution used by the widely
  used free simulators; the scoring variants people disagree about are available as
  presets. See DESIGN.md section 3.1 for what is verified and what is not.
- The project uses npm workspaces rather than pnpm, which the design document assumed,
  because pnpm was not available on the machine it was built on. Nothing depends on the
  choice.
