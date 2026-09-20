# @80in8/core

The whole 80-in-8 trainer minus the screen: exact arithmetic, seeded question
generation, stable question identity, answer parsing, scoring and the session state
machine.

Pure and dependency-free. No DOM, no timers, no storage, no network, no randomness that
is not seeded. Everything is a function of its arguments, which is what makes the test
suite worth trusting.

## Install

```bash
npm install @80in8/core
```

## A whole run in six lines

```ts
import { generateRun, materialise, PRESETS, resolvePreset, reduce, initialState } from '@80in8/core'

const run = generateRun(crypto.randomUUID(), 12345, PRESETS['optiver-classic'], 'typed')
const questions = materialise(run, resolvePreset)
const at = { mono: performance.now(), wall: Date.now() }

let state = reduce(initialState, { type: 'start', run, questions, at, countdownMs: 3000 })
state = reduce(state, { type: 'go', at })
state = reduce(state, { type: 'answer', raw: '128.9', at })
```

## The four things worth knowing

**Numbers are exact.** Every value is a reduced fraction, never a float. `0.1 + 0.2` is
`3/10` here, not `0.30000000000000004`. Values used in arithmetic are bounded to 2^26 so
that no intermediate product can leave the range where integers are exact, and the
bound is asserted rather than assumed. Typed input is capped at fifteen significant
digits, which is why `9007199254740993/4503599627370496` is rejected instead of quietly
comparing equal to `2`.

**Questions are their identifiers.** `questionFromId(q.id, resolve)` reproduces `q`
exactly, options included. Generation itself goes through that same path, so the
property holds by construction rather than by discipline.

**Time is an argument.** The session reducer never reads a clock. Each event carries
both `performance.now()` and `Date.now()`, and a deadline is enforced on whichever is
stricter. That is what stops a closed laptop lid handing out extra time, since
`performance.now()` may not advance while a device sleeps, and stops a wound-back system
clock doing the same.

**Every state is plain JSON.** No `Infinity`, no `Date`, no class instances. Saving a
half-finished run is `JSON.stringify`, and it comes back deep-equal. A property test
checks that for every state the model-based tests can reach.

## Profiles

A profile carries the question mix, number ranges, scoring rule, time limit and answer
policy. Built-in presets are versioned, and an old version stays resolvable forever, so
a question id written down today still means the same question after the parameters
change. A snapshot test fails if a preset's parameters move without a version bump.

## Tests

```bash
npm test          # unit and property tests, with coverage thresholds at 100%
npm run mutation  # Stryker, from the repository root
```

The suite is about 420 tests: example-based tests for behaviour, fast-check properties
for the invariants that matter (exact equations, exact divisions, four distinct options
with exactly one correct, a uniformly placed correct answer, a total reducer under
arbitrary event and clock sequences), and a fixture table shared with the design
document so the parser and its documentation cannot drift apart.
