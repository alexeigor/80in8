# Design review findings

Reviewed: [DESIGN.md](DESIGN.md), Draft v1, dated 2026-09-19.

Scope: design-only review. Line references refer to the reviewed draft. P1 denotes high priority; P2 denotes medium priority.

## 1. [P1] Repeated attempts collide in storage

`RunId` depends only on profile, mode, and seed, while history storage and import deduplicate by that ID. Clicking “Same seed” therefore reuses the previous attempt’s identity.

**Recommendation:** Add a unique `attemptId`; keep the deterministic ID for the question sequence.

References: DESIGN.md, lines 289 and 498–501.

## 2. [P1] The timer can grant extra time after device sleep

A `performance.now()` deadline does not reliably include sleep across supported platforms, as [MDN documents](https://developer.mozilla.org/en-US/docs/Web/API/Performance/now#ticking_during_sleep).

**Recommendation:** Define wall-clock reconciliation on resume while retaining monotonic measurements for question timings. Distinguish deadline enforcement from the impossible guarantee of executing within 50 ms while suspended.

References: DESIGN.md, lines 138, 394–395, and 468.

## 3. [P2] Retry decks cannot round-trip through RunId

An arbitrary ordered list of missed questions cannot be reconstructed from profile, mode, and seed. Yet `generateRunFromIds` returns the same `Run` type, and the tests require reconstruction from every run ID.

**Recommendation:** Use distinct seeded and explicit-deck descriptors; explicit decks must carry their ordered IDs.

References: DESIGN.md, lines 289, 299, 331–334, and 549.

## 4. [P2] Custom question links fail on another device

`custom-<hash8>` requires a profile snapshot stored locally, but `/q/<id>` carries only the hash. Opening a shared custom question in a fresh browser necessarily produces “unavailable.”

**Recommendation:** Include the profile payload in the share format, or explicitly restrict standalone links to built-in profiles.

References: DESIGN.md, lines 284–285, 306, and 444.

## 5. [P2] The arithmetic bounds do not establish exactness

Numerators and denominators below `2^31` can still produce cross-products near `2^62`, beyond safe integer precision. Typed input also has no magnitude limit: parsing `9007199254740993/4503599627370496` through `number` can incorrectly produce exactly `2`.

**Recommendation:** Specify production checks for input and intermediate values, or use exact integer intermediates.

References: DESIGN.md, lines 180–194 and 358–365.

## 6. [P2] Untimed sessions break ordinary JSON round-tripping

Practice uses `durationMs = Infinity`, but `JSON.stringify` converts infinity to `null`. Profile exports and session checkpoints therefore lose the intended value unless explicitly encoded.

**Recommendation:** Represent timing as a tagged timed/untimed type, or define a serialization codec.

References: DESIGN.md, lines 397, 414–415, and 485.

## 7. [P2] Keyboard bindings conflict with supported input

Space skips a question but is also required for `2 1/4`; Esc means both skip and abort.

**Recommendation:** Define one binding table with input-context precedence. Reserve Space for mixed-number entry and give skipping an unambiguous action.

References: DESIGN.md, lines 129, 449, 457, and 464.

## 8. [P2] MCQ feedback contradicts the advancement target

Waiting for a 200 ms flash before showing the next question violates immediate advancement and the stated `<16 ms` latency target. Across 80 questions, that introduces roughly 16 seconds of forced delay.

**Recommendation:** Render the next question immediately and define feedback and duplicate-input suppression separately.

References: DESIGN.md, lines 118, 137, and 450.

## 9. [P2] Zero network requests conflicts with update checks and its test

Checking for service-worker updates on load and hourly requires network activity. Meanwhile, asserting that requests are same-origin permits arbitrary network traffic.

**Recommendation:** Define the intended boundary—such as offline-capable gameplay with permitted update checks—and test that exact contract.

References: DESIGN.md, lines 135, 490, and 596.
