#!/usr/bin/env node
/**
 * A narrow mutation check that actually runs on this toolchain.
 *
 * Stryker is the tool for this job, but Stryker 10 cannot run against TypeScript 7 and
 * Vitest 5 (see stryker.config.json for the detail). Until that is fixed, this script
 * gives a real if narrow version of the same signal: it applies a set of representative
 * mutations to the core, one at a time, and asserts the test suite notices each one.
 *
 * Coverage says a line ran. This says the tests would complain if it changed.
 *
 * Usage: node scripts/mutation-smoke.mjs
 */
import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const coreRoot = join(repoRoot, 'packages', 'core')

/**
 * Each mutation changes behaviour in a way a careless edit plausibly would. None of
 * them touch an error message or a comment, because a test that pins wording is not
 * the kind of test this project wants.
 */
const MUTATIONS = [
  {
    label: 'rational: reduce stops normalising the sign of the denominator',
    file: 'src/rational/rational.ts',
    find: '  if (d < 0) {\n    n = -n\n    d = -d\n  }',
    replace: '  if (false) {\n    n = -n\n    d = -d\n  }',
  },
  {
    label: 'rational: equality ignores the denominator',
    file: 'src/rational/rational.ts',
    find: '  return a.num === b.num && a.den === b.den',
    replace: '  return a.num === b.num',
  },
  {
    label: 'rational: the exactness bound is never enforced',
    file: 'src/rational/rational.ts',
    find: '  if (r.num > MAX_EXACT_MAGNITUDE || r.num < -MAX_EXACT_MAGNITUDE || r.den > MAX_EXACT_MAGNITUDE) {',
    replace: '  if (false) {',
  },
  {
    label: 'rng: int loses its upper bound',
    file: 'src/rng/rng.ts',
    find: '  return lo + Math.floor(rng() * (hi - lo + 1))',
    replace: '  return lo + Math.floor(rng() * (hi - lo + 2))',
  },
  {
    label: 'identity: the seed stops being part of the question id',
    file: 'src/identity/id.ts',
    find: '  return (seed >>> 0).toString(36).padStart(SEED_CHARS, \'0\')',
    replace: '  return (0).toString(36).padStart(SEED_CHARS, \'0\')',
  },
  {
    label: 'generators: division no longer comes out exact',
    file: 'src/generate/kinds.ts',
    find: '  return { kind: \'int.div\', op: \'÷\', a: R.mul(b, c), b, c }',
    replace: '  return { kind: \'int.div\', op: \'÷\', a: R.add(R.mul(b, c), R.of(1)), b, c }',
  },
  {
    label: 'generators: zero answers are no longer rejected for fractions',
    file: 'src/generate/kinds.ts',
    find: '      if (R.isZero(c) || R.isInteger(c) || c.den > profile.fraction.maxLcd) return null',
    replace: '      if (c.den > profile.fraction.maxLcd) return null',
  },
  {
    // Not "may a distractor equal the answer" on its own: the answer's rendered text
    // is seeded into the deduplication map, so either guard alone covers the other and
    // removing one is an equivalent mutation. Removing both is not.
    label: 'distractors: both guards against repeating the answer are removed',
    file: 'src/distract/build.ts',
    find: '  if (R.eq(candidate, ctx.answer)) return false',
    replace: '  if (false) return false',
    also: {
      find: "  const taken = new Map<string, Rational>([[answerText, answer]])",
      replace: '  const taken = new Map<string, Rational>()',
    },
  },
  {
    label: 'distractors: the correct option is no longer placed at random',
    file: 'src/distract/build.ts',
    find: '  return rand.shuffle(rng, options)',
    replace: '  return options',
  },
  {
    label: 'parser: the digit cap is lifted, so long input rounds instead of failing',
    file: 'src/answer/parse.ts',
    find: '  if (digits > MAX_SIGNIFICANT_DIGITS) return null',
    replace: '  if (digits > 1e9) return null',
  },
  {
    label: 'parser: a trailing fraction bar counts as complete',
    file: 'src/answer/parse.ts',
    find: "  if (/[/+]$/.test(rest)) return { ok: false, error: 'incomplete' }",
    replace: "  if (/[@]$/.test(rest)) return { ok: false, error: 'incomplete' }",
  },
  {
    label: 'session: the deadline is only checked on the monotonic clock',
    file: 'src/session/reducer.ts',
    find: '  return at.mono >= state.deadline.mono || at.wall >= state.deadline.wall',
    replace: '  return at.mono >= state.deadline.mono',
  },
  {
    label: 'session: an answer after the deadline is still scored',
    file: 'src/session/reducer.ts',
    find: "  if (isExpired(state, event.at)) return finish(state, event.at, 'time')",
    replace: '  if (false) return state',
  },
  {
    label: 'session: skipping is allowed even when the profile forbids it',
    file: 'src/session/reducer.ts',
    find: '      if (!question || !state.run.profile.scoring.allowSkip) return state',
    replace: '      if (!question) return state',
  },
  {
    label: 'scoring: a wrong answer costs nothing',
    file: 'src/stats/summary.ts',
    find: '    else score += profile.scoring.wrong',
    replace: '    else score += 0',
  },
  {
    label: 'persistence: imported runs overwrite existing attempts',
    file: 'src/persist/schema.ts',
    find: '  for (const run of incoming) if (!byId.has(run.attemptId)) byId.set(run.attemptId, run)',
    replace: '  for (const run of incoming) byId.set(run.attemptId, run)',
  },
]

function runSuite() {
  try {
    execFileSync('npx', ['vitest', 'run', '--coverage.enabled=false', '--silent'], {
      cwd: coreRoot,
      stdio: 'pipe',
    })
    return true
  } catch {
    return false
  }
}

let survived = 0
console.log(`Applying ${MUTATIONS.length} mutations to @80in8/core\n`)

for (const mutation of MUTATIONS) {
  const path = join(coreRoot, mutation.file)
  const original = readFileSync(path, 'utf8')
  const occurrences = original.split(mutation.find).length - 1
  if (occurrences !== 1) {
    console.error(`  SETUP FAILED  ${mutation.label}`)
    console.error(`                expected one match in ${mutation.file}, found ${occurrences}`)
    process.exitCode = 1
    continue
  }
  try {
    let mutated = original.replace(mutation.find, mutation.replace)
    if (mutation.also) {
      if (!mutated.includes(mutation.also.find)) {
        console.error(`  SETUP FAILED  ${mutation.label} (second edit did not match)`)
        process.exitCode = 1
        continue
      }
      mutated = mutated.replace(mutation.also.find, mutation.also.replace)
    }
    writeFileSync(path, mutated)
    const passed = runSuite()
    if (passed) {
      survived += 1
      console.log(`  SURVIVED  ${mutation.label}`)
    } else {
      console.log(`  killed    ${mutation.label}`)
    }
  } finally {
    writeFileSync(path, original)
  }
}

console.log(`\n${MUTATIONS.length - survived}/${MUTATIONS.length} mutations caught by the suite`)
if (survived > 0) {
  console.error('A surviving mutation means the tests would not notice that change.')
  process.exitCode = 1
}
