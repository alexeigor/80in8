# 80 in 8 — Design Document

**Status:** Draft v2 (review findings 1–9 applied, see Changelog) · **Date:** 2026-09-19 · **Author:** Alexei Gorodilov (with research assistance)

A browser-only trainer for the Optiver-style "80 questions in 8 minutes" mental-arithmetic test. No backend, works offline on laptop and phone, two answer modes (4-option multiple choice and typed answer), built on a pure TypeScript core library with a rigorous test suite.

---

## Table of contents

1. [Summary](#1-summary)
2. [Goals and non-goals](#2-goals-and-non-goals)
3. [Background research](#3-background-research)
4. [Requirements](#4-requirements)
5. [Architecture overview](#5-architecture-overview)
6. [Core library design (`@80in8/core`)](#6-core-library-design-80in8core)
7. [Web app design (`apps/web`)](#7-web-app-design-appsweb)
8. [Data, persistence and privacy](#8-data-persistence-and-privacy)
9. [Testing strategy](#9-testing-strategy)
10. [Tooling, repository layout, CI and hosting](#10-tooling-repository-layout-ci-and-hosting)
11. [Risks, open questions and assumptions](#11-risks-open-questions-and-assumptions)
12. [Milestones](#12-milestones)
13. [Appendix A — Default question profile](#appendix-a--default-question-profile)
14. [Appendix B — Distractor catalogue](#appendix-b--distractor-catalogue)
15. [Appendix C — Answer-parsing grammar](#appendix-c--answer-parsing-grammar)
16. [Appendix D — References](#appendix-d--references)

---

## 1. Summary

Optiver's trading recruitment includes an 8-minute numerical test of 80 basic arithmetic questions (about 6 seconds per question). Candidates practise on a handful of free and freemium sites; almost none are open source, almost none have tests, they disagree on scoring rules, and most either gate features behind sign-up or ship a fixed question set.

This project builds a **static, installable web app** that:

- generates unlimited, reproducible 80-question tests matching the best-documented distribution of the real thing, where **every question has a unique ID that regenerates it exactly** (question, missing slot, and MCQ options), and a run is simply an ordered list of question IDs;
- supports **MCQ mode** (pick 1 of 4, with mistake-based distractors) and **typed mode** (keyboard or custom on-screen keypad);
- keeps all history on the device, with JSON export/import, and never makes a network request after install;
- separates a **pure, dependency-free core library** (numbers, generators, distractors, answer parsing, session state machine, scoring, stats) from a thin Preact UI, so the core can be tested to 100% line coverage, property-tested with fast-check, and mutation-tested with Stryker.

## 2. Goals and non-goals

### Goals

| # | Goal | Success signal |
|---|------|----------------|
| G1 | Faithful simulation of the 80-in-8 format (count, time, operations, number sizes, scoring) | Default profile matches the researched distribution in Appendix A; scoring rule presets cover every variant reported |
| G2 | Two answer modes: MCQ (1 of 4) and typed | Both modes share one question stream; switching mode changes only the input surface |
| G3 | Zero backend; works fully offline on laptop and mobile | Playwright test asserts no cross-origin requests; PWA installable on iOS Safari and Android Chrome; Lighthouse ≥ 0.9 on performance/a11y/best-practices |
| G4 | Well-tested core library | 100% line/branch coverage on `packages/core`, property tests for every generator invariant, Stryker mutation score ≥ 85% |
| G5 | Fast, keyboard-first, low-friction UX | Start-to-first-question in one keypress; restart with one key; no layout shift during a run (CLS ≈ 0) |
| G6 | Reproducible questions and runs | Every question is regenerable from its ID alone (`fromId(toId(q)) ≡ q`, options included); same run seed + profile ⇒ identical list of IDs; both encoded in shareable URLs |
| G7 | Useful local progress tracking | Per-run score, accuracy, seconds/question, per-category breakdown, history chart, weakest categories |

### Non-goals (v1)

- Accounts, sync, leaderboards, multiplayer races (would require a backend; a same-seed URL gives "race a friend" without one).
- Other firms' formats (Flow Traders 60-in-6, Akuna, IMC, Jane Street) beyond what a **profile** can express. Profiles are designed so these can be added as data later.
- Non-arithmetic Optiver OA sections (sequences, probability, memory, "Zap-N").
- Analytics, ads, telemetry of any kind.
- Native app store packaging.

## 3. Background research

Three research passes were done on 2026-09-19: (a) the real test format and existing clones, (b) UX of timed speed drills, (c) technical stack. Full references are in Appendix D.

### 3.1 The real test — what is verified vs. reported

Optiver's only first-party statement (indexed from `numericaltest.optiver.com`) is: *"an 8 minute numerical test containing basic mathematical calculations which you need to complete as quickly and as accurately as possible."* Everything else comes from prep sites and candidate reports, which **contradict each other**:

| Item | Consensus / most repeated | Disputed alternatives |
|------|---------------------------|-----------------------|
| Length | 80 questions, 8 minutes, one at a time, no going back, no calculator | — |
| Operations | `+ − × ÷` over integers, decimals, fractions | "missing operand" questions (`66 × ? = 138.6`); "light percentages"; "basic algebra" |
| Answer format | 4-option multiple choice (most 2024–26 sources, Glassdoor) | Typed/open (80in8.com, trademindapp); may have changed over the years |
| Scoring | +1 correct, −1 wrong | −2 wrong (older WSO posts; likely the "swing" misreported); skip = 0 / −1 / −2 / not allowed |
| Pass mark | ~55–56; 70+ competitive | 60, 65 |

**Design consequence:** the format is data, not code. A `Profile` object carries the question mix, number ranges, scoring rule and skip policy. The default profile encodes the consensus; presets encode the alternatives.

### 3.2 Existing tools and what they teach

| Tool | Input | Notable | Gap we fill |
|------|-------|---------|-------------|
| 80in8.com | Typed, Enter to advance | Clean 12-slot distribution (reverse-engineered by a clone, Appendix A); +1/−1/0 | No history, no MCQ, closed source |
| arithmetic.zetamac.com | Typed, auto-submit on correct digits | Instant flow, no submit key; integers only | No decimals/fractions/negatives, no penalty model, no stats |
| quantvault.org | 4-option MCQ | Immediate advance on selection; per-category breakdown; missing-operand questions | No typed mode, no history |
| tradermath.org | Both (premium) | Firm-specific lobbies, leaderboards | Decimals/fractions/hard mode paywalled |
| trademindapp, quantprep, everythingquant | Mixed | — | Fixed identical question set on the free tier |
| GitHub clones (manthan491/80in8, Kaxitron/mental_math, EdenReid/80-in-8, varunanant/Ranked80In8) | Mixed | Mistake-based distractors; seeded generators; PWA keypad | **No unit tests in any of them**; inconsistent scoring (−1 vs −2 bug); inconsistent fraction acceptance |

Best practices adopted from the field:

- **Zetamac:** no submit button for integer drills, restart with one key, config-first screen, canonical defaults so scores are comparable.
- **Monkeytype:** minimal UI during a run, out-of-focus warning, config persisted locally, JSON export/import, key-tip hints, everything reachable by keyboard.
- **quantvault / Kaxitron:** 4 options, keys 1–4, ~150 ms input lockout after a pick to defeat double taps, distractors modelled on real mistakes (digit transposition, ±1/±10, decimal-place shift, sign error, wrong operation).
- **80in8.com's distribution** as the default question mix, because it is the most widely used free simulator and its generator has been reverse-engineered in detail.

Anti-patterns to avoid (seen in the wild): timer drift from counting `setInterval` ticks; timers that freeze in background tabs; auto-submit that fires on `-` or trailing `.`; `type="number"` inputs; iOS numeric keypad with no minus key; layout shift as question length changes; results gated behind sign-up; ads or modals mid-run.

### 3.3 Technical findings that shape the design

- **Never use floats for decimals.** `0.1 + 0.2 !== 0.3`. All values are exact rationals (`num/den`, reduced, `den > 0`); decimals are rationals whose denominator is a power of ten. Operands never approach 2^53, so no BigInt.
- **Timer = end timestamp, not a counter.** `remaining = deadline − now()`, kept in both a monotonic and a wall clock because `performance.now()` may not tick during device sleep. Chrome aligns hidden-tab timers to 1 s and, after 5 minutes hidden, to 1/min; `requestAnimationFrame` stops entirely. Only an end-timestamp design survives this.
- **iOS keyboards:** `inputmode="numeric"` and `"decimal"` have **no minus key** on iOS; Android's `decimal` also lacks minus. A custom on-screen keypad is the only cross-platform option that gives `−`, `.`, `/`, `⌫`, big targets, and no keyboard-driven layout shift.
- **Storage:** `localStorage` (~5 MiB, synchronous) for settings; IndexedDB via `idb-keyval` for run history; `navigator.storage.persist()` after the first completed run; Safari evicts script-written storage after 7 days without interaction, so JSON export is the real backup.
- **PWA:** `vite-plugin-pwa` in `generateSW` mode precaching everything, `registerType: 'prompt'` so a mid-run user is never reloaded. Lighthouse 12 removed the PWA category, so installability is checked by a Playwright test instead.
- **Tooling versions (npm, 2026-09-19):** TypeScript 7.0, Vite 8.3, Vitest 5.0, fast-check 4.10, @fast-check/vitest 0.5, Stryker 10.0, Playwright 1.63, Preact 10.29, vite-plugin-pwa 1.3, idb-keyval 6.3, Biome 2.5, pnpm 12.4.

## 4. Requirements

### 4.1 Functional

| ID | Requirement |
|----|-------------|
| F1 | Run a timed test: N questions (default 80) in T seconds (default 480), one question at a time, no going back. |
| F2 | Question kinds: integer `+ − × ÷`, decimal `+ − × ÷`, fraction `+ − × ÷`, each optionally in **missing-operand** form (`a ⊕ ? = c`). Mix and number ranges come from a Profile. |
| F3 | **MCQ mode:** 4 options, exactly one correct, correct position uniformly random, distractors built from realistic error modes. Select with tap/click, keys `1–4`, or numpad. Advance immediately on selection. |
| F4 | **Typed mode:** answer via physical keyboard or on-screen keypad; accepts integers, negatives, decimals, fractions, mixed numbers (Appendix C); submit with Enter/✓. Optional Zetamac-style auto-submit for integer-only drill profiles (see §7.4 for why it is off in the Optiver profile). |
| F5 | Scoring rule from Profile: points for correct / wrong / skipped; skip allowed or not. Presets: `optiver-classic` (+1/−1/0, skip allowed), `optiver-strict` (+1/−1, no skip), `harsh` (+1/−2/−2), `count-only` (+1/0/0). |
| F6 | Ends exactly when time is up (in-flight input discarded) or when all questions are answered. Results screen shows score, correct/wrong/skipped, accuracy, seconds per question, per-category table, list of every question with the user's answer, and pass/competitive bands. |
| F7 | **Question identity:** every question has a globally unique, human-readable ID (§6.5) from which the question, its missing slot and its 4 MCQ options are regenerated deterministically, independent of mode. Runs have a run ID and are ordered lists of question IDs; URL `?p=<profile>&s=<seed>&m=<mode>` reproduces a run, `/q/<questionId>` opens a single question. |
| F13 | **Retry deck:** build a run from previously missed or slow question IDs ("Retry mistakes" on Results; "Weakest 80" on History). Regeneration from IDs means history stores IDs and answers, not question bodies. |
| F14 | Review screen lists each question with its ID, the user's answer, time taken, and a copyable link. |
| F8 | History: every completed run is stored locally with per-question detail; history screen with table, trend chart, per-category accuracy over time, weakest categories. |
| F9 | Export/import of settings and history as a versioned JSON file. Clear-all with confirmation. |
| F10 | Settings: profile, mode, duration/count overrides, keypad on/off, auto-submit (drill profiles only), theme, reduced motion, sound on/off, fraction display (inline `3/8` vs stacked), fraction answer strictness (equivalent vs simplified-only), timer announcements for screen readers. |
| F11 | Practice modes: untimed (`timeLimit.kind = 'untimed'`) and extended-time (`durationMs × 10`) variants of any profile, per WCAG 2.2.1 guidance for essential time limits. Marked as practice in history. |
| F12 | Restart with one key (Enter outside focused controls on the results screen); Esc aborts a run (confirm only if > 5 questions answered). One binding table (§7.8) governs every screen; no key has two meanings in the same context. |

### 4.2 Non-functional

| ID | Requirement |
|----|-------------|
| N1 | **No backend.** Static files only. Network contract: (a) **during a run, zero requests**; (b) at any time, the only permitted traffic is same-origin fetches of the app's own assets (`/`, `/assets/*`, `/sw.js`, `/manifest.webmanifest`) for service-worker precache and update checks; (c) no request ever carries user data. Enforced by CSP `default-src 'self'; connect-src 'self'` and by E2E tests that assert (a) and (b) literally. Gameplay is fully offline-capable. |
| N2 | **Offline & installable** on iOS Safari ≥ 16.4, Android Chrome, desktop Chrome/Edge/Firefox/Safari (last 2 versions). |
| N3 | **Performance:** ≤ 60 kB gzipped JS for the app shell; first question rendered < 1 s on a mid-range phone; input-to-next-question latency < 16 ms (one frame). |
| N4 | **Timing accuracy:** while the page is running, the run ends within 50 ms of the deadline; while suspended (background tab, device sleep) the deadline is enforced retroactively on resume using the stricter of the monotonic and wall clocks, so sleep never grants extra time; per-question timings use the monotonic clock. |
| N5 | **Accessibility:** WCAG 2.2 AA; touch targets ≥ 44×44 CSS px; inputs ≥ 16 px font; `prefers-reduced-motion` and `prefers-color-scheme` honoured; timer disclosed before start; polite live-region announcements. |
| N6 | **Correctness:** all arithmetic exact; no floating-point anywhere in the core. |
| N7 | **Testability:** core is pure and deterministic; RNG and clock are injected; no DOM, timers, or storage imports in `packages/core`. |
| N8 | **Privacy:** no cookies, no third-party scripts, no analytics. Data never leaves the device except through user-initiated export. |
| N9 | **Portability:** core published as ESM with types; UI framework replaceable. |

## 5. Architecture overview

```
┌──────────────────────────────────────────────────────────────────────┐
│ apps/web  (Preact + signals, Vite, vite-plugin-pwa)                  │
│                                                                      │
│  Screens: Home/Config → Countdown → Run → Results → History/Settings │
│  Adapters: BrowserClock · BrowserStorage (localStorage/IndexedDB)    │
│            Keyboard/Keypad input · WakeLock · Visibility · Router    │
└───────────────▲──────────────────────────────────────────────────────┘
                │ pure function calls, plain data (JSON-serialisable)
┌───────────────┴──────────────────────────────────────────────────────┐
│ packages/core  (pure TypeScript, zero runtime dependencies)          │
│                                                                      │
│  rational/     exact numbers: Rational, gcd, parse, format           │
│  rng/          seeded PRNG (splitmix32) + helpers (int, pick, shuffle)│
│  profile/      Profile schema, presets, validation                   │
│  identity/     QuestionId / RunId: encode, decode, regenerate        │
│  generate/     question generators per kind, missing-operand xform   │
│  distract/     distractor catalogue, MCQ option builder              │
│  answer/       typed-answer grammar → Rational, equality policy      │
│  session/      reducer: events → state; scoring; time accounting     │
│  stats/        per-run summary, history aggregates                   │
│  persist/      schema types + versioned migrations (no I/O)          │
└──────────────────────────────────────────────────────────────────────┘
```

**Key principle:** the core is a library of pure functions and a reducer. It knows nothing about the DOM, timers, or storage. The UI supplies `now()`, an RNG seed, and user events, and renders the returned state. This is what makes 100% coverage and mutation testing realistic, and it is the single most important difference from every existing clone.

## 6. Core library design (`@80in8/core`)

### 6.1 Exact numbers: `Rational`

```ts
// rational/rational.ts
export interface Rational { readonly num: number; readonly den: number } // den > 0, gcd(num,den) = 1

export const R = {
  of(num: number, den = 1): Rational,        // normalises sign and reduces
  add(a, b), sub(a, b), mul(a, b), div(a, b), // exact; div throws on zero
  eq(a, b): boolean,                          // structural: a.num === b.num && a.den === b.den (both reduced) — no cross-products
  cmp(a, b): -1 | 0 | 1,                      // cross-multiplies; only valid under the magnitude bound below (asserted)
  isInteger(r), isDecimal(r),                 // den === 1 ; den divides 10^k for k ≤ 6
  toDecimalString(r): string | null,          // "12.75" when isDecimal, else null
  toFractionString(r): string,                // "-3/8"
  toMixedString(r): string,                   // "2 1/4"
};
```

Invariants (all property-tested): reduced form is unique; `eq` is an equivalence relation; `add/sub/mul/div` agree with integer arithmetic on scaled values.

**Exactness bound.** JS numbers are exact integers only below 2^53, and `cmp`, `add`, `sub`, `mul`, `div` form products of two operands' components. The core therefore enforces a **magnitude bound `|num|, den ≤ 2^26`** (≈ 6.7 × 10^7) on every value it *computes with*, so any cross-product is ≤ 2^52 and exact. This is not a hope: `R.of` and every arithmetic function assert the bound on inputs and outputs in all builds (the check is one comparison), and a property test over the full profile space shows generated operands and answers stay far below it (the largest generated value is 999 × 9 = 8 991; decimals top out at 9 999/100). Typed input is handled separately: the parser (§6.8) accepts at most 15 digits across all numeric parts of the input, so every literal converts exactly, the mixed-number combination `whole × den + num` stays below 10^15 < 2^53, and reduction by `gcd` is exact. Because `eq` is structural on reduced values, comparing a parsed answer to the expected answer never multiplies anything, so a large-but-valid typed value is compared exactly and a value beyond 15 digits is rejected as `invalid` rather than silently rounded (e.g. `9007199254740993/4503599627370496`, 32 digits, is `invalid`, never "2"). Nothing in the core uses BigInt.

Decimal questions are generated as integers plus a scale (`x = 1234, scale = 2 ⇒ 12.34`) and stored as `Rational(1234, 100)`. Display is derived from the rational, never from a float.

### 6.2 Seeded RNG

```ts
// rng/rng.ts
export type Rng = () => number;               // uniform in [0, 1)
export function splitmix32(seed: number): Rng; // 32-bit state, full period, ~10 lines
export const rand = {
  int(rng, lo, hi): number,                    // inclusive both ends
  pick<T>(rng, items: readonly T[]): T,
  weighted<T>(rng, items: readonly [T, number][]): T,
  shuffle<T>(rng, items: readonly T[]): T[],   // Fisher–Yates, returns new array
  bool(rng, p): boolean,
};
```

`splitmix32` is chosen over `Math.random` (unseedable), `seedrandom` (larger, older) and `pure-rand` (excellent but a dependency; the core has none). fast-check uses its own PRNG for property tests, and property tests feed arbitrary seeds into `splitmix32` to ensure the generators are correct for *every* seed, not just the ones we looked at.

**Stream discipline:** randomness is layered so that every artefact is regenerable from the smallest thing that identifies it:

| Stream | Seeded from | Decides |
|--------|-------------|---------|
| run | `runSeed` | the sequence of `(kind, questionSeed)` pairs |
| question | `questionSeed` (32-bit, part of the QuestionId) | operands, missing slot |
| options | `hash(questionSeed, "options")` | distractor choice and option order |

Changing the distractor rules or the shuffle therefore never changes the questions, and a question's MCQ options are the same whether it was reached through a run, a retry deck, or a `/q/<id>` link.

### 6.3 Profile

```ts
// profile/profile.ts
export type TimeLimit = { kind: 'timed'; durationMs: number } | { kind: 'untimed' };  // tagged so JSON.stringify round-trips; Infinity would become null
export interface Profile {
  id: string;                    // "optiver-classic"
  name: string;
  questionCount: number;         // 80
  timeLimit: TimeLimit;          // { kind: 'timed', durationMs: 480_000 } | { kind: 'untimed' }  — never Infinity (JSON-safe)
  scoring: { correct: number; wrong: number; skipped: number; allowSkip: boolean };
  passScore?: number;            // 56  (shown as a band on results)
  competitiveScore?: number;     // 70
  mix: WeightedKind[];           // see Appendix A
  missingOperandShare: number;   // 0..1, share of questions rendered as "a ⊕ ? = c"
  negativeOperandShare: number;  // 0..1, for integer add/sub
  fraction: { denominators: number[]; maxLcd: number; allowMixed: boolean };
  decimal: { places: [number, number]; placesWeights: [number, number] }; // e.g. [1,2] with [0.75,0.25]
  answerPolicy: { fractions: 'equivalent' | 'simplified' };
}
```

Profiles are validated at load (weights positive and non-empty, ranges sane, `den ∈ denominators` all > 1). Built-in presets live in `profile/presets.ts` and are snapshot-tested so that a change to a preset is a visible diff in review.

### 6.4 Question model

```ts
// generate/types.ts
export type Kind =
  | 'int.add' | 'int.sub' | 'int.mul' | 'int.div'
  | 'dec.add' | 'dec.sub' | 'dec.mul' | 'dec.div'
  | 'frac.add' | 'frac.sub' | 'frac.mul' | 'frac.div';

export type Op = '+' | '-' | '×' | '÷';

export interface Question {
  id: QuestionId;                // unique, regenerates the question (§6.5); e.g. "1.optiver-classic@3.int-mul.00k7x2q"
  kind: Kind;
  op: Op;
  a: Rational; b: Rational; c: Rational;   // a op b = c, always true
  missing: 'a' | 'b' | 'c';      // which slot is the blank; 'c' is the ordinary form
  answer: Rational;              // the value in the missing slot
  display: { left: string; op: string; right: string; result: string }; // pre-rendered, blank shown as "?"
  options: readonly Option[];    // always present, length 4, derived from id (§6.7); typed mode ignores them
}
// A run is an ordered list of ids plus the spec that produced it. Two different things identify a run:
//  - RunSpec / RunId  : *what* was asked (deterministic; a seeded spec is rebuildable from its RunId, a deck is not)
//  - attemptId        : *this particular attempt* (random 128-bit, minted by the UI; distinct even for "Same seed")
export type RunSpec =
  | { kind: 'seeded'; profileRef: string; mode: Mode; seed: number }                                   // has a RunId
  | { kind: 'deck';   profileRef: string; mode: Mode; questionIds: readonly QuestionId[]; origin: 'retry' | 'weakest' | 'single' }; // carries its IDs
export interface Run { attemptId: string; spec: RunSpec; runId?: RunId /* seeded only */; profile: Profile; questionIds: readonly QuestionId[] }
export interface Option { text: string; value: Rational; correct: boolean; source: DistractorSource | 'answer' }
```

`display` strings are produced in the core (e.g. `"−17"`, `"12.4"`, `"3/8"`, `"2 1/4"`) so that UI and tests render identically; the UI may still choose to typeset a fraction stacked from `value`.

### 6.5 Question identity (`identity/`)

Every question is a pure function of three things: the **profile** (which fixes ranges, denominators, shares), the **kind**, and a 32-bit **question seed**. The `QuestionId` encodes exactly those, so the ID alone regenerates the question, its missing slot, and its MCQ options:

```
QuestionId := <v> "." <profileRef> "." <kind> "." <seed36>
  v          : ID format version ("1")
  profileRef : "<presetId>@<presetVersion>"  for built-in presets   e.g. optiver-classic@3
               "custom-<hash8>"               for user-defined profiles (hash of canonical JSON; the profile
                                              snapshot is stored alongside history so it can be resolved)
  kind       : Kind with "." replaced by "-"  e.g. int-mul
  seed36     : questionSeed in base-36, zero-padded to 7 chars

RunId      := <v> "." <profileRef> "." <mode> "." <runSeed36>       ; seeded runs only — a deck has no RunId
```

Examples: `1.optiver-classic@3.int-mul.00k7x2q`, `1.custom-9f3a1c2e.frac-add.01zzq0a`, run `1.optiver-classic@3.mcq.0a1b2c3`.

```ts
// identity/question.ts
export function toId(parts: { profileRef: string; kind: Kind; seed: number }): QuestionId;
export function parseId(id: string): { v: 1; profileRef: string; kind: Kind; seed: number } | { error: 'malformed' | 'unsupported-version' | 'unknown-kind' };
export function questionFromId(id: QuestionId, resolve: (profileRef: string) => Profile | undefined): Question | { error: 'unknown-profile' | ... };
export function runFromId(id: RunId, resolve): Omit<Run, 'attemptId'> | { error };   // seeded runs only: rebuilds questionIds from the run seed
```

Rules:

- **Generation goes through the ID.** `generateRun` draws `(kind, seed)` pairs from the run stream, builds IDs, and calls `questionFromId` for each. There is no second code path that produces a question without an ID, so `fromId(toId(q)) ≡ q` holds by construction and is also property-tested.
- **Presets are versioned.** Any change to a preset's ranges or shares bumps `presetVersion`; old IDs keep resolving through a frozen copy of each past version (`profile/presets/optiver-classic.v1.ts` …). A snapshot test fails if a preset's canonical JSON changes without a version bump.
- **Custom profiles travel with their IDs.** History and export files carry a `profiles: Record<profileRef, Profile>` map, and **share links for custom profiles embed the profile**: `/q/<id>?pf=<base64url canonical JSON>` (and `?p=custom-…&pf=…` for runs). The loader hashes the payload and refuses it if the hash does not match `hash8`. Custom profiles are < 1 kB, so URLs stay under 2 kB. A custom-profile ID that arrives without `pf` and is not in local storage is shown as "unavailable (custom profile not included in link)" rather than silently regenerated under a different profile. Built-in preset links need no payload.
- **Uniqueness.** Within a run, IDs are unique (the run stream redraws on a seed collision; with 80 draws from 2^32 this is ~1e-6). Across runs, the same ID can legitimately reappear, which is exactly what makes per-question statistics and retry decks possible.
- **Mode-independent.** The ID contains no mode; MCQ options are derived from the seed via the `options` stream, so a question missed in typed mode can be retried in MCQ mode under the same ID.
- **Short and typeable.** IDs are ASCII, case-insensitive on the base-36 part, and safe in URLs and file names.
- **RunId is not an attempt.** A RunId names a question sequence; it is intentionally the same for two attempts at the same seed. Storage, import de-duplication and the checkpoint are keyed by `attemptId` (random, minted by the UI on start, never by the core), so "Same seed" produces a second history row rather than overwriting the first.
- **Decks are explicit.** A retry deck or single-question run is an arbitrary ordered list that no seed can reproduce, so its `RunSpec` carries the IDs verbatim and it has no RunId. Only `kind: 'seeded'` specs round-trip through `runFromId`.

### 6.6 Generators

One generator per `Kind`, all with the same signature:

```ts
type KindGenerator = (rng: Rng, profile: Profile) => Omit<Question, 'id' | 'missing' | 'display' | 'options'>;
```

Design rules that every generator obeys (each is a property test, §9.2):

1. `a op b = c` exactly (`R.eq(R.apply(op, a, b), c)`).
2. Division questions are exact: `c` is an integer for `int.div`, a decimal with ≤ `places` for `dec.div`, a fraction with `den ≤ maxLcd` for `frac.div`.
3. Every operand and answer lies within the profile's declared bounds.
4. No degenerate questions: no `× 1`, `× 0`, `÷ 1`, `0 + x`, `x − x`, no fraction whose value is an integer unless allowed, no zero answer for fraction add/sub (redraw).
5. Generators are total: for every seed they terminate (redraw loops are bounded; on exhaustion they fall back to a deterministic simple instance and the fact is counted, so a test can assert fallback rate < 0.1%).

**Missing-operand transform** (`generate/missing.ts`): after generating `a op b = c`, with probability `missingOperandShare` pick slot `a` or `b` (uniform) as the blank. The answer is the hidden operand, which by construction is "nice" (it was generated to be). This is why the transform is applied after generation rather than generating "solve for x" problems directly.

**Run assembly** (`generate/run.ts`):

```ts
export function generateRun(attemptId: string, seed: number, profile: Profile, mode: Mode): Run                     // spec.kind = 'seeded'; ids only; cheap
export function generateRunFromIds(attemptId: string, ids: readonly QuestionId[], profile: Profile, mode: Mode, origin): Run // spec.kind = 'deck'
export function materialise(run: Run, resolve): Question[]                                                            // questionFromId for each id
```

Kinds are drawn independently per question from `mix` weights (matching 80in8.com's behaviour), not by fixed quotas, so the category counts vary slightly run to run; the stats page shows expected vs. actual. A `quota` strategy is a one-line alternative in the profile if fixed counts are ever wanted. Because a `Run` is just IDs, retry decks and shared single questions reuse the same session machinery with no special cases.

### 6.7 Distractors and MCQ options

`distract/build.ts` produces exactly 3 distractors for a question:

```ts
export function buildOptions(q: Omit<Question, 'options'>, profile: Profile): Option[]  // length 4, shuffled; rng = splitmix32(hash(seed(q.id), "options"))
```

Algorithm:

1. Run every applicable **distractor rule** from the catalogue (Appendix B) to get candidates tagged with their source (e.g. `off-by-ten`, `transposed-digits`, `decimal-shift`, `sign-flip`, `wrong-op`, `partial-product`, `unsimplified-fraction-trap`).
2. Filter: not equal to the answer; distinct from each other; same **shape** as the answer (integer distractors for integer answers, same decimal places, fraction with a denominator from the profile); within `[answer/10, answer×10]` magnitude or `|Δ| ≤ 100` for small answers; non-negative if the question domain is non-negative.
3. Take 3 by weighted pick over rule priorities (human-plausible errors first: off-by-one/ten, decimal shift, digit transposition), fill from a generic `±k` fallback if fewer than 3 survive.
4. Shuffle the 4 options with the `options` RNG stream (derived from the question's own seed, §6.2); correct position is therefore uniform, and the options are identical every time the ID is regenerated.

Properties tested: 4 distinct options; exactly one correct; correct index uniform over 10 000 questions (chi-square within tolerance); every distractor passes the shape filter; deterministic for an ID.

### 6.8 Typed-answer parsing and equality policy

`answer/parse.ts` implements the grammar in Appendix C and returns `Rational | { error: 'empty' | 'incomplete' | 'invalid' }`. Rules:

- Whitespace and thousands separators (`,` when followed by exactly 3 digits and a `.` decimal exists, otherwise `,` is a decimal separator) are normalised.
- Leading `+` allowed; `-` and `−` (U+2212) both accepted as minus.
- `.5`, `0.5`, `0.50`, `1/2`, `-1/2`, `2 1/4`, `2+1/4` all parse.
- `incomplete` is returned for `-`, `.`, `3/`, `2 ` so the UI can distinguish "keep typing" from "wrong".
- **Magnitude limit:** at most 15 digits in total across the whole, numerator, denominator and decimal parts (leading zeros excluded); more is `invalid`. This keeps every intermediate below 2^53 (§6.1). No plausible answer in any profile has more than 6 digits, so the limit is invisible to users and exists only to make exactness a proof rather than an assumption.

Equality: `R.eq(parsed, q.answer)` under `answerPolicy: 'equivalent'` (default). Under `'simplified'`, a fraction-form input must also be in lowest terms with a positive denominator (`14/20` is wrong for `7/10`; `0.7` is still accepted because the user did not write a fraction). This mirrors the strict behaviour of Ranked80In8 while defaulting to the friendlier policy used by most sites.

Property: for every Rational the generators can produce, `parse(format(r))` equals `r` in each of decimal, fraction and mixed formats where applicable.

### 6.9 Session state machine

```ts
// session/reducer.ts
export type SessionState =
  | { phase: 'idle' }
  | { phase: 'countdown'; run: Run; startsAt: number }
  | { phase: 'running'; run: Run; deadline?: Deadline; index: number; questionShownAt: number; answers: Answer[]; hiddenSince?: number }
  | { phase: 'finished'; run: Run; answers: Answer[]; endedBy: 'time' | 'completed' | 'aborted'; summary: RunSummary };

// Every event carries both clocks. `mono` is performance.now() (monotonic, for durations);
// `wall` is Date.now() (epoch ms, survives device sleep). Tests pass plain integers for both.
export interface Clocks { mono: number; wall: number }
export interface Deadline { mono: number; wall: number }   // absent when the profile's timeLimit is 'untimed'

export type SessionEvent =
  | { type: 'start'; run: Run; at: Clocks; countdownMs: number }   // run built by generateRun / generateRunFromIds
  | { type: 'go'; at: Clocks }                                     // countdown finished
  | { type: 'answer'; value: Rational | null; raw: string; at: Clocks }   // null = skip
  | { type: 'select'; optionIndex: number; at: Clocks }            // MCQ
  | { type: 'tick'; at: Clocks }                                   // UI heartbeat; may transition to finished
  | { type: 'visibility'; hidden: boolean; at: Clocks }
  | { type: 'abort'; at: Clocks };

export function reduce(state: SessionState, ev: SessionEvent): SessionState;   // pure, total
export function remainingMs(state, at: Clocks): number | null;                 // null when untimed; else max(0, min(deadline.mono − at.mono, deadline.wall − at.wall))
```

Behaviour:

- **Time sources are injected.** The UI passes `performance.now()` and `Date.now()`; tests pass integers. There is no `Date`, `setTimeout` or `requestAnimationFrame` in the core.
- **Two clocks, strictest wins.** `performance.now()` may not advance while the device sleeps (MDN: "ticking during sleep" is platform-dependent), so a monotonic-only deadline can hand out free time after a laptop lid closes mid-run. The deadline is therefore captured in both clocks on `go`, and remaining time is the **minimum** of the two. Sleep makes the wall clock stricter (correct: the 8 minutes kept elapsing); a user moving the system clock backwards makes the monotonic clock stricter (correct: no free time). A user moving the clock *forwards* ends the run early; this is accepted and noted in Risks (R12). Per-question `elapsedMs` always uses the monotonic clock.
- **End is decided by the reducer** on any event whose remaining time is `≤ 0`: the event's payload is discarded (an answer submitted after the deadline does not count) and the state becomes `finished` with `endedBy: 'time'`. This makes "ends exactly at zero" a unit-testable statement. While the page is suspended no code runs, so the end is enforced *retroactively* at the first event after resume (`visibilitychange`, `pageshow`, `focus` all dispatch a `tick`); the "ends within 50 ms" target in N4 applies only while the page is running.
- **Untimed runs** (`timeLimit.kind = 'untimed'`) have no `deadline`; `remainingMs` returns `null`, the timer shows elapsed time instead, and the run ends only by completion or abort.
- **Per-question timing:** `Answer` records `questionId`, `shownAt`, `answeredAt`, `elapsedMs`, `raw`, `value`, `correct`, `skipped`, and for MCQ the chosen option's `source` (so stats can say "you fall for decimal-shift traps"). Answers never embed the question body; it is regenerated from `questionId` when needed.
- **Visibility policy:** for timed runs the clock keeps running (fairness; the real test does not pause) but hidden intervals are recorded and surfaced on the results screen as "12 s hidden". For untimed runs hiding is irrelevant. A `pauseOnHide` profile flag exists for drills.
- **Serialisable by construction.** Every `SessionState` is plain JSON data with no `Infinity`, `NaN`, `undefined`-in-arrays, `Date` or class instances, so the `sessionStorage` checkpoint is `JSON.stringify(state)`. A property test asserts `JSON.parse(JSON.stringify(state))` deep-equals `state` for every state the model-based test reaches.
- **Scoring** is a pure fold over `answers` with the profile's rule; `summary` is computed once on finish.

The reducer is exhaustively tested with example tests, and model-based tested with `fc.commands` (§9.2) so that arbitrary interleavings of `answer`/`select`/`tick`/`visibility` with arbitrary (even inconsistent) clock pairs never produce an invalid state (index out of range, negative remaining time, answers after finish, double finish).

### 6.10 Stats

`stats/summary.ts` → per-run: score, correct/wrong/skipped, accuracy, mean/median seconds per question, per-kind and per-op breakdown, slowest 5 questions, distractor-source histogram (MCQ), hidden time.
`stats/history.ts` → over runs: best/mean score per profile+mode, trend series, per-kind accuracy over the last N runs, "weakest kinds" ranking, streak of consecutive days practised. Pure functions over arrays; no dates are computed inside (the UI passes "today" for streaks).
`stats/questions.ts` → per **question ID**: attempts, misses, mean time; `retryDeck(history, { size: 80, prefer: 'missed' | 'slow' })` returns a list of IDs (most recently missed first, then slowest, then unseen kinds the user is weak in) for F13.

### 6.11 Persistence schema and migrations (types only)

```ts
export interface StoredRun { schemaVersion: 1; attemptId: string /* storage key */; runId?: RunId /* seeded only */; spec: RunSpec;
                             startedAt: number /* epoch ms */; practice: boolean;
                             questionIds: QuestionId[]; summary: RunSummary; answers: Answer[] }
export interface ExportFile { schemaVersion: 1; exportedAt: number; app: '80in8'; settings: Settings;
                              profiles: Record<string /* profileRef */, Profile>; runs: StoredRun[] }
export function migrate(file: unknown): ExportFile;   // validates and upgrades any known older version, throws on unknown
```

Runs are keyed by `attemptId`, so repeated attempts at the same seed are separate rows; `runId` is kept for "show all attempts at this sequence" and for sharing. `spec.profileRef` (§6.5) plus the `profiles` map make every stored question ID resolvable forever, even after presets change. Storing IDs instead of question bodies keeps a run at ~3 kB. `migrate` is pure and tested with fixture files for every historical schema version.

## 7. Web app design (`apps/web`)

### 7.1 Stack

- **Preact 10 + @preact/signals**, `.tsx`. Smallest mainstream runtime (~4 kB), same TypeScript/Biome toolchain as the core, first-class Vitest browser renderer. Svelte 5 was the runner-up; rejected only to keep one language dialect across packages.
- **Vite 8**, **vite-plugin-pwa 1.3** (`generateSW`, `registerType: 'prompt'`), CSS with plain custom properties (no CSS framework; the UI is ~6 screens).
- Routing: hash-free history routing with a tiny in-house router (`/`, `/run`, `/results`, `/history`, `/settings`, `/q/:questionId`); `base` read from an env var for GitHub Pages sub-path deployment. A `404.html` copy of `index.html` makes deep links work on GitHub Pages.

### 7.2 Screens

```
Home / Config ──▶ Countdown (3·2·1, skippable on desktop) ──▶ Run ──▶ Results ──▶ Again / Home
      │                                                                   │
      ├──▶ History (table · trend chart · per-kind accuracy · weakest)   ├──▶ Review (every question, your answer, time)
      └──▶ Settings (profile · mode · keypad · display · data export)     └──▶ Share (copy URL with seed)
```

**Home/Config** is one screen: profile picker, mode toggle (MCQ / Typed), a "Start" button that is focused on load, and a "seed" field pre-filled from the URL if present. Pressing Enter on Start or outside interactive controls starts; focused controls keep their normal keyboard behavior. Time limit and scoring rule are displayed before start (WCAG 2.2.1 disclosure).

**Run** shows only: a slim top bar (question `n/80`, score if the profile reveals it live, remaining time with `font-variant-numeric: tabular-nums`), the question in a fixed-height box, and the input surface. Nothing else. Layout is a CSS grid with fixed row heights so question length never shifts the input.

**Results** shows the score with pass/competitive bands (from the profile), the breakdown table, and three buttons: "Again (Enter)" (new seed), "Same seed", and "Retry mistakes" (a run built from the IDs answered wrong or skipped, padded from the weakest kinds to the profile's count if the user wants a full 80). Review and Share are secondary links.

**Review** lists every question of the run with its ID, the user's answer, the correct answer, time taken, and a copy-link button for `/q/<id>` (with `?pf=` appended automatically for custom profiles, §6.5). Opening `/q/<id>` starts a single-question untimed deck, so a specific question can be shared or re-examined without the run.

### 7.3 MCQ mode input surface

- 2×2 grid on phones (portrait), 1×4 row on wide screens; each button ≥ 56 px tall with 12 px gaps; `touch-action: manipulation`.
- Key hints `1 2 3 4` rendered in the corner of each button; keyboard `1–4`, numpad `1–4`; `→` (ArrowRight) or the on-screen Skip button skips when the profile allows (§7.8).
- On selection the **next question renders in the same frame** (N3: < 16 ms); nothing waits for an animation. Feedback is a separate, non-blocking layer: a ✓/✗ glyph plus green/red tint in the top bar that fades over 300 ms (colour is never the only signal; no fade under reduced motion). The option buttons themselves never flash, because they already belong to the next question. Feedback can be disabled for "exam realism".
- **Duplicate-input suppression** is independent of feedback: after a selection, *pointer* events on the option grid are ignored for 150 ms (double-tap guard on touch); keyboard input is never locked out. Across 80 questions the forced delay is therefore zero for keyboard users and at most what a human needs to read the next question for touch users.
- Options never reflow: the grid has four fixed cells, so a second tap after advance lands on a stable target.

### 7.4 Typed mode input surface

**Why explicit submit in the Optiver profile.** Zetamac's auto-submit (advance the instant the typed digits equal the answer) works because Zetamac has integer answers and *no wrong-answer penalty*: a mistype only costs time. In a +1/−1 test, "wrong" must be a real event, and answers include `−`, `.`, `/`, so auto-submit would both abolish the penalty and fire on ambiguous prefixes. Therefore:

- Optiver-style profiles: **Enter / ✓ submits**, `→` (ArrowRight) or the Skip button skips (if allowed); Space is reserved for mixed-number entry and never skips. Submitting an `incomplete` or `invalid` string shakes the field (or outlines it under reduced motion) and does nothing else.
- Drill profiles (`count-only` scoring, integers only): **auto-submit** on exact match, never on Backspace, never on `-`/`.` states. Setting is visible only when the profile permits it.

**Keyboard vs. on-screen keypad.**

- Desktop/physical keyboard: a `<input type="text" inputmode="none" autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false">` with font ≥ 18 px, autofocused, refocused on `visibilitychange` and any click inside the run area. `type="number"` is never used.
- Touch devices (default on, toggleable): a **custom keypad** `0–9 · − / ⌫ ✓` in the thumb zone, plus `Skip` when allowed. The input is `inputmode="none"` + `readonly`-like handling so the OS keyboard never opens, which removes the iOS minus-key problem and keyboard-driven layout shift. Keypad buttons ≥ 48×48 px, `touch-action: manipulation`, haptic tick via `navigator.vibrate(10)` where available. A physical keyboard still works with the keypad shown.
- Fraction entry: `/` key; mixed numbers via Space on the keyboard or the `␣` key on the keypad (`2␣1/4`). The field shows a live, non-blocking hint of how the input parses (`= 9/4`).

### 7.5 Timer

- `deadline = { mono: performance.now() + durationMs, wall: Date.now() + durationMs }` captured on `go`. Display driven by `requestAnimationFrame` while visible; a `setTimeout(tick, remaining % 1000 || 1000)` fallback keeps the reducer ticking when rAF is paused; `visibilitychange → visible`, `pageshow` and window `focus` each dispatch an immediate `tick` with both clocks so a run that expired during sleep finishes on the spot.
- Display shows `m:ss`, turns amber at 60 s and red at 10 s (colour + a subtle weight change, not colour alone). No per-second sound by default; optional beep at 10 s.
- Screen Wake Lock is requested on `go` and re-requested on visibility restore; failures are silent.
- Polite `aria-live` region announces remaining time at 4:00, 2:00, 1:00, 0:30, 0:10 and the question text on change (the question box itself is `aria-live="polite"`).

### 7.6 Mobile and layout details

- `<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">`; **no** `maximum-scale`/`user-scalable=no`.
- `html, body { overscroll-behavior: none }` to stop pull-to-refresh mid-run; `100dvh` layout; safe-area padding on the keypad and top bar.
- Portrait-first; landscape puts the keypad/options to the right of the question.
- Fonts: system UI stack; fractions typeset stacked with `<span class="frac"><sup>3</sup>⁄<sub>8</sub></span>` when the "stacked" display setting is on (default on for ≥ 360 px widths).
- Dark mode via `prefers-color-scheme` with a manual override; feedback colours checked for 4.5:1 contrast in both themes.

### 7.7 Out-of-focus and interruption handling

- If the input/run area loses focus for > 1 s during a run, a non-modal overlay says "Click or press any key to continue"; the timer keeps running (shown in the overlay).
- Browser back during a run triggers the abort confirmation (only if > 5 answers).
- The run state is checkpointed to `sessionStorage` on every answer so an accidental reload resumes a run in `finished`/`aborted` form with a note, rather than losing it.

### 7.8 Key bindings

One table, resolved by screen context; a key never has two meanings in the same context. All bindings are shown as hints on screen and are not user-configurable in v1 (keeps E2E and docs honest).

| Context | Key | Action |
|---------|-----|--------|
| Home | `Enter` | Start (focus is on Start) |
| Countdown | `Enter` | Skip countdown (desktop only) |
| Run · both modes | `Esc` | Abort (confirm if > 5 answered) |
| Run · both modes | `→` ArrowRight | Skip (only if the profile allows; otherwise ignored) |
| Run · MCQ | `1`–`4`, numpad `1`–`4` | Select option |
| Run · Typed | `0`–`9`, numpad digits | Digit |
| Run · Typed | `.` `,` | Decimal separator |
| Run · Typed | `/` numpad `/` | Fraction bar |
| Run · Typed | `-` `−` numpad `-` | Toggle sign (any position) |
| Run · Typed | `Space` | Mixed-number separator (`2␣1/4`); ignored when the field is empty |
| Run · Typed | `Backspace` | Delete last character |
| Run · Typed | `Enter` numpad `Enter` | Submit (no-op on `incomplete`/`invalid`, with shake) |
| Results | `Enter` outside interactive controls | Again (new seed) |
| Anywhere | `Tab` / `Shift+Tab` | Next / previous control |
| Results | `S` | Same seed |
| Results | `M` | Retry mistakes |
| Results | `R` | Review |
| Any | `?` | Show this table |

Keys not listed are ignored during a run (no browser shortcut is overridden except `/` in Typed mode, where `preventDefault` stops Firefox quick-find).

### 7.9 PWA

- Manifest: `name`, `short_name: "80 in 8"`, `start_url` (with `base`), `display: standalone`, `theme_color`, 192/512 PNG + maskable icons, `apple-touch-icon` 180 px.
- Service worker precaches all built assets (`**/*.{js,css,html,svg,png,woff2,webmanifest}`); `cleanupOutdatedCaches`. Update flow: `registration.update()` on load and every 60 min **while not in a run** (the check is suspended between `go` and `finished`, satisfying N1(a)); if an update is waiting, show a toast **only on Home/Results**, never during a run. Update checks are the one intentional network activity and are same-origin GETs of `sw.js` only.
- Install hint on Home after the second completed run (Android `beforeinstallprompt`; iOS shows Share → Add to Home Screen instructions).

## 8. Data, persistence and privacy

| Data | Store | Notes |
|------|-------|-------|
| Settings (`Settings`) | `localStorage` key `80in8:settings:v1` | Tiny, synchronous, read before first paint to avoid theme flash |
| Run history (`StoredRun[]`) | IndexedDB via `idb-keyval` (store `80in8-runs`) | One key per attempt (`attemptId`); a small index doc for the list view; ~3 kB per run (IDs + answers, no question bodies) ⇒ 10 000 runs ≈ 30 MB, well within quota |
| Profile snapshots | IndexedDB (store `80in8-profiles`), keyed by `profileRef` | Written when a custom profile is first used; lets old IDs resolve |
| In-progress checkpoint | `sessionStorage` | Cleared on finish |
| Export | Downloaded JSON (`80in8-export-YYYY-MM-DD.json`) | Import merges by `attemptId`; an existing attempt is never overwritten; profiles are merged by `profileRef` |

- `navigator.storage.persist()` is requested after the first completed run; Settings shows `estimate()` usage and whether persistence was granted.
- All storage access is wrapped in try/catch; the app is fully usable with storage unavailable (private mode) and says so on the History screen.
- No cookies, no external requests, no fonts from CDNs, CSP `default-src 'self'; img-src 'self' data:` set via `<meta http-equiv>` (and as headers where the host supports `_headers`).

## 9. Testing strategy

The core is the product; the UI is a thin adapter. The test pyramid reflects that.

### 9.1 Layers and tools

| Layer | Scope | Tool | Gate |
|-------|-------|------|------|
| Unit (example-based) | every core module | Vitest 5 | 100% line and branch coverage on `packages/core`, `perFile: true` |
| Property-based | generators, rational, parser, distractors, reducer | fast-check 4 via `@fast-check/vitest` (`test.prop`) | ≥ 200 runs per property in CI, 1 000 nightly; failing seeds recorded in the test file |
| Model-based | session reducer | `fc.commands` | invariants hold for arbitrary event sequences |
| Snapshot | preset profiles; first 20 questions of `generateRun(seed=42)` per preset and mode | Vitest snapshots | any change is a reviewed diff |
| Statistical | option position uniformity; kind mix ≈ weights; fallback rate | Vitest with fixed seeds | chi-square / tolerance assertions |
| Mutation | `packages/core` | Stryker 10 `vitest-runner`, `incremental: true` | mutation score ≥ 85% (reported on PRs touching core; hard gate weekly) |
| Component | input surfaces, timer display, results table | Vitest browser mode (`@vitest/browser-playwright`, `vitest-browser-preact`) | ≥ 80% lines on `apps/web` |
| E2E | full runs in both modes on 3 device profiles; offline; install; no-network | Playwright 1.63 (`Desktop Chrome`, `iPhone 15`, `Pixel 7`), `page.clock` | all green; traces uploaded on failure |
| Accessibility | every screen | `@axe-core/playwright` | zero serious/critical violations |
| Performance | production build | Lighthouse CI (`@lhci/cli`) | performance, a11y, best-practices ≥ 0.9; JS ≤ 60 kB gz |

### 9.2 Property catalogue (core)

Rational
- `of(n,d)` is reduced, `den > 0`; `of` is idempotent.
- `eq` reflexive/symmetric/transitive; `add`/`mul` commutative and associative; `sub(add(a,b),b) = a`; `div(mul(a,b),b) = a` for `b ≠ 0`.
- `toDecimalString(r)` is non-null iff `den | 10^6`, and `parse(toDecimalString(r)) = r`.

RNG
- Same seed ⇒ identical sequence; different seeds ⇒ different first 8 values (collision rate < 1e-6 in sample).
- `int(lo,hi)` always in `[lo,hi]`; distribution roughly uniform over 10 000 draws.
- `shuffle` returns a permutation.

Generators (for every kind, every preset, arbitrary seed)
- `a op b = c` exactly; answer equals the missing slot.
- Divisions are exact; decimals have ≤ configured places; fraction results have `den ≤ maxLcd`.
- Operands and answer within profile bounds; no degenerate forms (§6.6 rule 4).
- Terminates; fallback rate over 10 000 questions < 0.1%.
- `display` strings round-trip through `parse` to the same Rational.
- `generateRun(seed, profile, mode)` is deterministic and has exactly `questionCount` questions; kind frequencies over 100 runs are within ±3 percentage points of weights.

Question identity
- `parseId(toId(x)) = x` for all valid parts; `parseId` never throws and returns the documented error for malformed, wrong-version, and unknown-kind strings (fuzzed with `fc.string()`).
- `questionFromId(q.id) ≡ q` (deep equality, options included) for every question produced by `generateRun` over arbitrary seeds and every preset.
- IDs within a run are unique. For `spec.kind = 'seeded'`: `runFromId(run.runId).questionIds = run.questionIds`. For `spec.kind = 'deck'`: `run.questionIds = spec.questionIds` and `runId` is absent.
- Two runs generated from the same seed with different `attemptId`s have equal `runId` and `questionIds` and unequal `attemptId`; storing both yields two rows.
- IDs are URL- and filename-safe (`/^[A-Za-z0-9.@-]+$/`) and ≤ 48 chars.
- Preset guard: canonical JSON of each preset version matches its frozen snapshot; a changed preset without a version bump fails the build.
- Golden IDs: a fixture of 30 hand-checked IDs → expected display strings and answers, so an accidental generator change is a readable diff.

Distractors
- Exactly 4 options, all texts distinct, all values distinct, exactly one `correct`.
- No distractor equals the answer; every distractor has the answer's shape (integer/decimal places/fraction).
- Correct index uniform: chi-square p > 0.01 over 10 000 questions.
- Deterministic per question ID; changing distractor rules changes options but never questions (the `questions` fixture snapshot is unaffected by a distractor-rule change).

Answer parser
- Every string in Appendix C's accepted set parses to the documented Rational; every rejected string yields the documented error.
- `parse` never throws; `parse(format(r))` round-trips in all formats.
- Under `simplified` policy, `n·k / d·k` for `k > 1` is rejected while `n/d` and its decimal form are accepted.

Session reducer
- Reducer is total: no thrown errors for any (state, event) pair generated by the model.
- `index ∈ [0, questionCount]`; `answers.length === index` while running; never exceeds `questionCount`.
- Any event whose `remainingMs` is `≤ 0` (under either clock) yields `finished` with `endedBy: 'time'` and does **not** record that event's answer.
- Once `finished`, every further event is a no-op (state identity).
- Score equals the fold of the scoring rule over `answers`; score is monotone in the number of correct answers and bounded by `[wrong × N, correct × N]`.
- `remainingMs` is never negative and is non-increasing in `now`.
- Hidden time accounting: sum of hidden intervals ≤ run duration; no unmatched `hidden: true`.
- Clock reconciliation: for any event where `wall` has advanced past `deadline.wall` (sleep), the run is finished regardless of `mono`; for any event where `mono` has advanced past `deadline.mono`, the run is finished regardless of `wall`; `remainingMs` is `null` iff the profile is untimed.
- Serialisability: `JSON.parse(JSON.stringify(state))` deep-equals `state` for every reachable state (no `Infinity`/`NaN`/`undefined`).

Stats & migrations
- Summary counts sum to the number of answers; accuracy = correct / (correct + wrong) with 0/0 → null.
- `migrate(export(x)) = x` for current schema; fixtures for each past version migrate without loss of run count.

### 9.3 Example-based unit tests worth calling out

- Golden questions: hand-written expectations for specific seeds ("seed 7, question 3 is `48 × 25 = ?`") to catch silent generator changes that snapshots would only show as a wall of diff.
- Scoring presets: each preset's `correct/wrong/skipped` applied to a fixed answer sheet.
- Deadline edge cases: answer at `deadline − 1` ms counts, at `deadline` does not; `tick` exactly at the deadline finishes; the same three cases with only the wall clock past the deadline (monotonic frozen, as after sleep); countdown `go` before `startsAt` is ignored.
- Parser table test driven from Appendix C (the appendix is the fixture file, so docs and tests cannot drift).

### 9.4 UI and E2E tests

Component (Vitest browser mode):
- Keypad emits the expected raw string for key sequences including `⌫`, `−` toggling and `␣`; Enter submits; `→` skips only when allowed; Space inserts the mixed-number separator and never skips.
- MCQ buttons: keys 1–4 select and the next question is in the DOM synchronously; a second pointer event within 150 ms is ignored while a second keypress is not; top-bar feedback glyph appears and does not animate under `prefers-reduced-motion`.
- Timer display formats `m:ss`, uses tabular numerals, and reads from injected `remainingMs`.

E2E (Playwright, three device projects):
- Typed run to completion with `page.clock` fast-forwarding; results score matches a core-computed expectation for the same seed (the test imports `@80in8/core`).
- MCQ run: select via taps on mobile, via keys on desktop; verify auto-advance and final score.
- Time-out path: fast-forward past 8:00 mid-question; assert results screen, `endedBy: time`, and the in-flight input was not counted.
- **Offline:** load once, `context.setOffline(true)`, reload, complete a run. **Network contract (N1):** (a) record requests from `go` to `finished` and assert the list is empty; (b) record requests for the whole session, with the clock advanced past the 60-minute update check, and assert every URL is same-origin **and** matches the asset allow-list (`/`, `/assets/`, `/sw.js`, `/manifest.webmanifest`), and that none is a POST or carries a query string.
- **Install:** fetch `manifest.webmanifest`, assert required fields and icon sizes; assert `navigator.serviceWorker.controller` is set after reload.
- Background tab: `page.evaluate` to dispatch `visibilitychange` hidden/visible with clock jumps; assert remaining time is wall-clock correct and hidden time is reported.
- Device sleep: freeze `performance.now()` while advancing `Date.now()` past the deadline (via `page.clock` plus an injected clock adapter), dispatch `pageshow`; assert the run is finished with `endedBy: time` and the in-flight answer was not counted.
- History: two runs → History shows two rows and a trend; export → clear → import restores both. "Same seed" twice → two rows with the same run ID; importing the export a second time adds no rows.
- Identity: copy a question link from Review, open `/q/<id>` in a fresh context, assert the same question text and (in MCQ) the same four options in the same order; "Retry mistakes" produces a run whose IDs equal the wrong/skipped IDs of the previous run.
- Accessibility: axe on Home, Run (both modes), Results, History, Settings.

### 9.5 CI gates

`lint` → `typecheck (tsc -b)` → `test:core (vitest --coverage, thresholds 100/100/100/100)` → `test:web (vitest, thresholds 80)` → `build` → `e2e (3 projects)` → `lhci`. Stryker runs on PRs that touch `packages/core` (incremental) and weekly on `main` as a hard gate. Coverage thresholds use `autoUpdate` so they only ratchet up.

## 10. Tooling, repository layout, CI and hosting

```
80in8/
├─ package.json            # pnpm workspace root; scripts fan out
├─ pnpm-workspace.yaml
├─ biome.json              # lint + format (single tool)
├─ tsconfig.base.json      # strict, noUncheckedIndexedAccess, exactOptionalPropertyTypes, noImplicitOverride, isolatedModules
├─ packages/core/          # @80in8/core — ESM, "sideEffects": false, exports map, d.ts; zero runtime deps
│   ├─ src/{rational,rng,profile,generate,distract,answer,session,stats,persist}/
│   ├─ src/**/*.test.ts    # co-located unit + property tests
│   ├─ test/fixtures/      # parser table (Appendix C), migration fixtures, golden seeds
│   ├─ vitest.config.ts    # coverage thresholds 100, perFile
│   └─ stryker.config.json
├─ apps/web/               # Preact + Vite + vite-plugin-pwa
│   ├─ src/{screens,components,adapters,styles}/
│   ├─ e2e/                # Playwright specs + playwright.config.ts (3 projects)
│   ├─ public/             # icons, manifest source, _headers (CSP)
│   └─ vite.config.ts      # base from env, PWA config
├─ docs/DESIGN.md          # this document (moved from repo root at M0)
└─ .github/workflows/{ci.yml,deploy.yml,mutation.yml}
```

- **TypeScript 7** strict; core compiled with `module: nodenext` for publishing, web with `moduleResolution: bundler`; project references so the app type-checks against core source.
- **Biome 2** for lint+format (one binary, fast). ESLint is not used.
- **Hosting:** GitHub Pages via `actions/deploy-pages` (`base: '/80in8/'`) by default; Cloudflare Pages or Netlify are drop-in (`pnpm build`, publish `apps/web/dist`) and support a `_headers` file for real CSP headers. All are static-only.
- **Releases:** semver tags; `@80in8/core` publishable to npm independently; the web app shows its version and commit on Settings.

## 11. Risks, open questions and assumptions

| # | Risk / question | Mitigation / decision |
|---|-----------------|-----------------------|
| R1 | The real test's answer format (MCQ vs typed) and scoring are not publicly verified and may have changed over time | Both modes are first-class; scoring is a preset; Home shows a one-line "format is based on candidate reports" note with a link to this doc's research section |
| R2 | Default question mix may be harder/easier than the real test | Mix is data (Appendix A); ship 2–3 presets (`classic`, `mcq-quantvault-style`, `hard`); stats let users compare |
| R3 | Distractors that are too easy make MCQ mode a poor simulation | Error-mode catalogue with priorities; statistical test for plausibility proxy (distractor within ±10% of answer at least 50% of the time); user feedback loop via GitHub issues |
| R4 | Typed-mode fraction acceptance: strict vs equivalent | Default `equivalent`; `simplified` toggle; both tested |
| R5 | Safari storage eviction after 7 days of no interaction | `persist()` request, visible storage status, export reminder after 20 runs |
| R6 | Timer fairness when backgrounded | Clock never pauses in timed runs; hidden time reported; practice runs unaffected |
| R7 | Missing-operand and percentage questions: include by default? | **Decision:** missing-operand share 0.2 in the default profile (cited by several sources); percentages **off** by default (only one source mentions them), available in the `hard` preset. Revisit after user feedback |
| R8 | Negative operands display (`−17` vs `(-17)`) and European `:` division | Display is a profile/display setting; default `−17` and `÷` |
| R9 | 100% coverage on core could encourage vacuous tests | Mutation score gate (≥ 85%) is the real quality signal; coverage is a floor |
| R10 | iOS PWA update behaviour and rAF throttling differ from Chrome | E2E Mobile Safari project; manual checklist on a real iPhone at each milestone |
| R11 | A generator bug fix changes what old question IDs regenerate to | Generators are versioned with the preset (`presetVersion` bumps on any behavioural change); frozen past versions stay in the package; the snapshot guard makes an unversioned change a failing build |
| R12 | User sets the system clock forward mid-run, making the wall-clock deadline fire early | Accepted: the stricter-clock rule (§6.9) prefers ending early over granting free time; the results screen notes "ended by clock adjustment" when the two clocks disagree by more than 5 s |

**Assumptions:** the user of this trainer wants both exam realism and drill flexibility; no server will ever be added to v1; English UI only (strings are centralised so i18n is possible later).

## 12. Milestones

| M | Deliverable | Exit criteria |
|---|-------------|---------------|
| M0 | Repo scaffold: pnpm workspace, TS 7, Biome, Vitest, CI skeleton, GitHub Pages deploy of a "hello" page | CI green; deployed URL loads offline after first visit |
| M1 | `@80in8/core`: rational, rng, profile + versioned presets, **question/run identity**, all 12 generators, missing-operand transform, run assembly | 100% coverage; all generator and identity properties (`fromId(toId(q)) ≡ q`); snapshots for presets and golden IDs |
| M2 | Core: answer parser + policy; session reducer; scoring; stats; migrations | Model-based reducer tests; parser table; Stryker ≥ 85% |
| M3 | Web: Home/Config, Countdown, Run in **typed mode** with keyboard + keypad, Results | Typed E2E on 3 devices; no-network and offline E2E; axe clean |
| M4 | Core distractor engine + Web **MCQ mode** | Distractor properties incl. uniformity; MCQ E2E; distractor-source stats |
| M5 | History, Review with per-question links, Retry deck, Export/Import, Settings, Share URL | History and identity E2E; persistence status; import/export round-trip |
| M6 | Polish: PWA install hints, wake lock, live regions, dark mode, reduced motion, Lighthouse CI, real-device pass | Lighthouse ≥ 0.9; manual iPhone/Android checklist signed off; v1.0 tag |

Each milestone ends with an update to this document where decisions changed.

---

## Changelog

- **v3 (2026-09-20), written while implementing:** the document above is the design as
  agreed; this entry records where the build knowingly departs from it, so the two can
  be read together.
  - **Package manager.** npm workspaces, not pnpm. pnpm was not installed on the build
    machine and nothing in the design depends on the choice.
  - **Preset versions.** Examples in section 6.5 show `optiver-classic@3`. Every preset
    ships at version 1, which is what a first release should say.
  - **Custom profile hashing, refined.** Section 6.5 said a custom reference hashes the
    profile's canonical JSON. Hashing all of it turned out to defeat the purpose: a
    practice variant with a longer clock, or the same paper marked more harshly, forked
    every question id, so those runs could never share per-question statistics or a
    retry deck with the profile they came from. The hash now covers only the fields
    that decide what questions come out (`questionCount`, `mix`, `missingOperandShare`,
    `integer`, `decimal`, `fraction`). Pacing, marking and presentation are excluded.
    `practiceVariant` exists to make the safe derivation the easy one.
  - **Skipping is its own event.** Section 6.9 modelled a skip as an `answer` event with
    a null value. It is a `skip` event instead, so the "may this profile skip" rule is a
    single guard and the null case disappears from the answer path.
  - **The session holds its questions.** The reducer has to judge answers, so `start`
    carries the materialised questions alongside the run. A run is still only a list of
    ids everywhere it is stored or shared.
  - **Scoring presets.** Section 4.1 F5 lists `harsh` and `count-only`. They ship as
    `optiver-harsh` (+1/-2/-2, same questions as the classic profile) and
    `zetamac-drill` (count-only, integers, two minutes).
  - **Mutation testing is blocked, not skipped.** Stryker 10 does not work against
    TypeScript 7 and Vitest 5: it crashes on TypeScript's changed compiler API, and with
    that bypassed it fails to activate mutants and reports almost everything as
    surviving. That was confirmed by hand, by deleting a `throw` that three tests catch
    and watching Stryker call the same mutant survived. In its place,
    `scripts/mutation-smoke.mjs` applies sixteen representative mutations one at a time
    and fails if the suite would not have noticed any of them; it runs in ordinary CI.
    The section 9.1 target of an 85% mutation score is therefore not yet measured.
  - **One deliberate coverage decision.** Several defensive branches turned out to be
    unreachable and were deleted rather than excused, which is what the 100% gate is
    for. The gate is met with no ignore directives.
- **v2 (2026-09-19):** applied all nine findings from `DESIGN_REVIEW.md`: (1) `attemptId` separates attempts from the deterministic `RunId`; (2) dual-clock deadline so device sleep never grants extra time, N4 reworded; (3) `RunSpec` is a tagged seeded/deck union and only seeded runs round-trip through `RunId`; (4) custom-profile share links embed the profile payload; (5) explicit exactness bound (2^26 for computed values, 15-digit parser cap, structural `eq`); (6) `TimeLimit` tagged type replaces `Infinity`, plus a JSON round-trip property; (7) single key-binding table, Space reserved for mixed numbers, `→` skips, `Esc` aborts; (8) MCQ advances in the same frame with feedback and double-tap suppression as separate layers; (9) network contract stated precisely and tested as stated.
- **v1 (2026-09-19):** initial draft; question identity added mid-review.

## Appendix A — Default question profile

`optiver-classic` — modelled on the 80in8.com distribution (as reverse-engineered in the open-source Ranked80In8 generator), extended with a missing-operand share reported by quantvault and Glassdoor candidates.

| Kind | Weight | Operands | Answer constraints |
|------|--------|----------|--------------------|
| `int.add` | 2 | 1–999 each; first operand negative with p = 0.25 | integer |
| `int.sub` | 2 | 1–999 each; first operand negative with p = 0.25 | integer (may be negative) |
| `int.mul` | 2 | 50%: 100–999 × 2–9; 50%: 2-digit × "friendly" 2-digit from {11–22, 24, 25, 27, 29, 30–33, 35, 36, 39–41, 44, 45, 48–51, 55, 60, 64, 72, 75, 80, 81, 90, 96, 99} | integer |
| `int.div` | 2 | divisor ∈ {12, 14, 15, 16, 18, 20, 22, 24, 25, 27, 32, 33, 35, 36, 40, 44, 45, 48, 50, 55, 60, 64, 72, 75, 80, 96}; quotient 3–20; dividend = divisor × quotient | exact integer |
| `dec.add` | 1 | 0.1–99.9 (1 dp, p = 0.75) or 0.01–99.99 (2 dp, p = 0.25) | ≤ 2 dp |
| `dec.sub` | 1 | as above | ≤ 2 dp, may be negative |
| `frac.add` | 1 | denominators ∈ {2, 3, 4, 5, 6, 8, 10, 12}, LCD ≤ 12, proper fractions | reduced fraction, non-zero |
| `frac.sub` | 1 | as above | reduced fraction, non-zero |
| `dec.mul`, `dec.div`, `frac.mul`, `frac.div` | 0 | (enabled in `hard` preset: e.g. 8.5 × 14.4, 3/4 ÷ 3/8) | — |

- `questionCount 80`, `timeLimit { kind: 'timed', durationMs: 480 000 }`, scoring `+1 / −1 / 0`, `allowSkip true`, `passScore 56`, `competitiveScore 70`.
- `missingOperandShare 0.2`: a question `a ⊕ b = c` is shown as `a ⊕ ? = c` or `? ⊕ b = c` with equal probability.
- Expected mix ≈ 33% integer ±, 17% ×, 17% ÷, 17% decimals, 17% fractions.

Other presets: `optiver-strict` (same, `allowSkip false`), `optiver-mcq` (same mix, MCQ default, `missingOperandShare 0.4` per the quantvault-style clones), `hard` (manthan491-style larger numbers, decimal × and ÷, mixed numbers, percentages), `zetamac-drill` (integers only, count-only scoring, auto-submit on, 120 s).

## Appendix B — Distractor catalogue

Each rule maps `(question, answer) → candidate[]`, tagged with a `source`. Priority 1 rules are tried first.

| Priority | Source | Construction | Applies to |
|----------|--------|--------------|------------|
| 1 | `off-by-one` | `answer ± 1` (± 0.1 / ± 1 ulp of the answer's decimal places) | all |
| 1 | `off-by-ten` | `answer ± 10` (± 1 in the tens/first decimal) — carry/borrow slip | int/dec |
| 1 | `decimal-shift` | `answer × 10`, `answer ÷ 10` | dec, and int.mul/div with results ≥ 100 |
| 1 | `sign-flip` | `−answer` | when answer ≠ 0 and domain allows negatives |
| 2 | `transposed-digits` | swap two adjacent digits of the integer part | answers with ≥ 2 distinct digits |
| 2 | `wrong-op` | `a − b` for `+`, `a + b` for `−`, `a ÷ b` for `×` (if exact), `a × b` for `÷` | direct-form questions |
| 2 | `partial-product` | `a × b ± a`, `a × b ± b`, `(a ± 1) × b` | int.mul |
| 2 | `last-digit` | correct except the last digit (`answer − (answer mod 10) + d`, `d ≠` original) | int |
| 2 | `unsimplified-trap` | `num·k / den·k` shown unsimplified when policy is `simplified`; otherwise `(num ± 1)/den`, `num/(den ± 1)` (skipping integer results) | frac |
| 2 | `cross-add` | `(n1 + n2)/(d1 + d2)` — the classic fraction-addition mistake | frac.add/sub |
| 3 | `missing-operand-echo` | `c` or the visible operand itself (candidate picks the wrong slot) | missing-operand form |
| 3 | `generic-offset` | `answer ± k` for `k ∈ {2, 3, 5, 20, 50, 100}` scaled to magnitude | fallback |

Filters (applied after generation): ≠ answer, pairwise distinct, same shape, magnitude window, domain sign, and text distinct after formatting.

## Appendix C — Answer-parsing grammar

The table below is also the fixture file `packages/core/test/fixtures/answers.tsv`; the parser table test is generated from it.

```
answer     := ws* sign? (mixed | fraction | decimal) ws*
sign       := '-' | '−' | '+'
mixed      := int (' ' | '+') fraction
fraction   := int '/' uint            ; uint ≠ 0
decimal    := digits ('.' digits?)? | '.' digits
digits     := [0-9]+ (',' [0-9]{3})*   ; ',' as thousands only when a '.' also appears; otherwise ',' means '.'
; global constraint: ≤ 15 digits in total across all parts (leading zeros excluded), else invalid
```

| Input | Result | Note |
|-------|--------|------|
| `42` | 42 | |
| `-42`, `−42`, `+42` | −42, −42, 42 | both minus glyphs |
| `0.5`, `.5`, `0.50`, `0,5` | 1/2 | comma as decimal separator |
| `1,234.5` | 2469/2 | comma as thousands separator when `.` present |
| `3/8`, `6/16` | 3/8 | `6/16` rejected under `simplified` |
| `-3/8`, `3/-8` | −3/8, **invalid** | sign only at front |
| `2 1/4`, `2+1/4` | 9/4 | mixed number |
| `-2 1/4` | −9/4 | sign applies to whole mixed number |
| `` (empty), `-`, `.`, `3/`, `2 ` | **incomplete** | UI: keep typing |
| `1/0`, `abc`, `1..2`, `1/2/3`, `--1` | **invalid** | UI: shake, do not submit |
| `9007199254740993/4503599627370496`, `1234567890123456` | **invalid** | more than 15 digits in total (exactness bound, §6.1) |

## Appendix D — References

Test format and clones
- Optiver numerical test (first-party, credential-gated): https://numericaltest.optiver.com/
- WSO "80 in 8 seems impossible" thread: https://www.wallstreetoasis.com/forum/trading/optiver-80-in-8-numerical-test-seems-impossible-is-it-even-possible-to-pass-this-test
- WSO "Optiver Trading Numerical Test": https://www.wallstreetoasis.com/forum/trading/optiver-trading-numerical-test
- Trade2Win (older candidate reports): https://www.trade2win.com/threads/information-on-optiver-tests.30067/page-4
- Prep sites: https://aptitude-test-prep.com/employers/trading-assessments/optiver-assessment/ · https://www.jobtestprep.com/optiver-test · https://www.quantt.co.uk/resources/optiver-interview · https://www.extern.com/post/optiver-internship-guide · https://www.quantblueprint.com/guides/how-to-get-a-job-at-optiver
- Simulators: https://80in8.com · https://arithmetic.zetamac.com · https://quantvault.org/optiver-80-in-8.html · https://www.tradermath.org/online-assessments · https://trademindapp.com/optiver-80-in-8 · https://www.quantguide.io/quantify · https://myquantjourney.app/ · https://mathtrainer.ai/
- Open-source clones: https://github.com/manthan491/80in8 · https://github.com/varunanant/Ranked80In8 · https://github.com/Kaxitron/mental_math · https://github.com/EdenReid/80-in-8 · https://github.com/SSASardar/personal_mental_maths_tracker · https://github.com/richard-li-998/zeta-mac-2.0
- Other firm formats: https://www.scribd.com/document/864905216/Flow-Traders-Math-Test-Instructions · https://www.tradinginterview.com/courses/mental-arithmetic/quizzes/akuna-capital-math-test/

UX
- Zetamac behaviour: https://quantvault.org/zetamac-practice.html · https://www.geoffreylee.me/zetamac
- Monkeytype settings (restart keys, out-of-focus warning, export): https://dev.monkeytype.com/settings
- Distractor research: https://arxiv.org/html/2404.02124v2 · https://arxiv.org/pdf/2406.19356
- Input modes and iOS minus key: https://www.brandonpugh.com/til/html/input-modes/ · https://github.com/mantinedev/mantine/issues/981
- Disable autocorrect: https://davidwalsh.name/disable-autocorrect
- Touch targets: https://blog.logrocket.com/ux-design/all-accessible-touch-target-sizes/ · https://tetralogical.com/blog/2022/12/20/foundations-target-size/
- Tap delay: https://developer.chrome.com/blog/300ms-tap-delay-gone-away
- Timer drift: https://dev.to/work_hau_cb718f47075930f9/javascript-countdown-timers-why-setinterval-drifts-and-how-to-fix-it-26fe
- Background throttling: https://developer.chrome.com/blog/timer-throttling-in-chrome-88 · https://nolanlawson.com/2025/08/31/why-do-browsers-throttle-javascript-timers/
- iOS zoom / overscroll / safe areas: https://css-tricks.com/16px-or-larger-text-prevents-ios-form-zoom/ · https://www.matuzo.at/blog/2022/100daysof-day53 · https://webkit.org/blog/7929/designing-websites-for-iphone-x/
- WCAG timing: https://www.makethingsaccessible.com/guides/outta-time-providing-users-with-adjustable-time-mechanisms-to-meet-wcag-2-2-1-timing-adjustable-level-a/
- Layout shift with numbers: https://gomakethings.com/preventing-layout-shift-with-numbers-using-css/ · https://web.dev/articles/optimize-cls
- Reduced motion: https://web.dev/articles/prefers-reduced-motion

Technical
- Vitest 5: https://vitest.dev/blog/vitest-5.html · coverage https://vitest.dev/guide/coverage · fake timers https://vitest.dev/config/faketimers · browser mode https://vitest.dev/guide/browser/
- fast-check: https://fast-check.dev/ · https://github.com/dubzzz/fast-check
- Stryker vitest runner: https://stryker-mutator.io/docs/stryker-js/vitest-runner/
- Playwright emulation: https://playwright.dev/docs/emulation
- splitmix32 / mulberry32: https://gist.github.com/tommyettinger/46a874533244883189143505d203312c
- Floating point: https://builtin.com/articles/0-1-0-2
- vite-plugin-pwa: https://vite-pwa-org.netlify.app/guide/ · https://vite-pwa-org.netlify.app/guide/prompt-for-update
- PWA installability: https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Guides/Making_PWAs_installable
- Storage quotas & eviction: https://developer.mozilla.org/en-US/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria
- performance.now: https://developer.mozilla.org/en-US/docs/Web/API/Performance/now
- Screen Wake Lock: https://developer.mozilla.org/en-US/docs/Web/API/Screen_Wake_Lock_API
- Vite static deploy: https://vite.dev/guide/static-deploy
- Lighthouse PWA category removal: https://github.com/GoogleChrome/lighthouse/issues/15535
- pnpm workspaces: https://pnpm.io/workspaces
