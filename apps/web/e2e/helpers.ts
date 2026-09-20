import { formatCanonical, type Mode, type Question, questionFromIdOrThrow, resolvePreset } from '@80in8/core'
import { expect, type Page } from '@playwright/test'

/**
 * E2E helpers. The expected answers are computed by importing `@80in8/core` and
 * regenerating the question from the id in the DOM, so the tests assert against the
 * library rather than against a copy of its logic.
 */

export const CLASSIC = 'optiver-classic@1'
export const MCQ = 'optiver-mcq@1'
export const STRICT = 'optiver-strict@1'

export interface RunOptions {
  profileRef?: string
  mode?: Mode
  seed?: number
}

export function homeUrl({ profileRef = CLASSIC, mode = 'typed', seed = 4242 }: RunOptions = {}): string {
  return `/?p=${encodeURIComponent(profileRef)}&s=${seed}&m=${mode}`
}

export async function openHome(page: Page, options: RunOptions = {}): Promise<void> {
  await page.goto(homeUrl(options))
  await expect(page.getByTestId('home')).toBeVisible()
}

/** Start and jump straight past the countdown; returns once the first question is up. */
export async function beginRun(page: Page): Promise<void> {
  await page.getByTestId('start').click()
  await page.getByTestId('skip-countdown').click()
  await expect(page.getByTestId('question')).toBeVisible()
}

export async function currentQuestion(page: Page): Promise<Question> {
  const id = await page.getByTestId('question').getAttribute('data-question-id')
  if (!id) throw new Error('no question id in the DOM')
  return questionFromIdOrThrow(id, resolvePreset)
}

/** The answer as the parser will accept it, with the typographic minus normalised. */
export function typeableAnswer(question: Question): string {
  return formatCanonical(question.answer).replace(/−/g, '-')
}

export async function answerCurrent(page: Page, mode: Mode, correct = true): Promise<Question> {
  const question = await currentQuestion(page)
  if (mode === 'mcq') {
    const index = question.options.findIndex((option) => option.correct === correct)
    await page.keyboard.press(String((index === -1 ? 0 : index) + 1))
  } else {
    const text = correct ? typeableAnswer(question) : '999999'
    for (const character of text) await page.keyboard.press(keyFor(character))
    await page.keyboard.press('Enter')
  }
  return question
}

function keyFor(character: string): string {
  if (character === ' ') return 'Space'
  if (character === '.') return 'Period'
  if (character === '/') return 'Slash'
  if (character === '-') return 'Minus'
  return character
}

/** Answer the whole run. Returns every question asked, in order. */
export async function completeRun(page: Page, mode: Mode, limit = 200): Promise<Question[]> {
  const asked: Question[] = []
  for (let index = 0; index < limit; index++) {
    if (await page.getByTestId('results').isVisible()) break
    if (!(await page.getByTestId('question').isVisible())) break
    asked.push(await answerCurrent(page, mode))
  }
  await expect(page.getByTestId('results')).toBeVisible()
  return asked
}

export async function abortAfter(page: Page, mode: Mode, answers: number): Promise<Question[]> {
  const asked: Question[] = []
  for (let index = 0; index < answers; index++) asked.push(await answerCurrent(page, mode))
  await page.keyboard.press('Escape')
  await expect(page.getByTestId('results')).toBeVisible()
  return asked
}

/**
 * Freezes `performance.now()` on demand while letting `Date.now()` jump forward: a
 * device going to sleep, which must not hand out extra time.
 */
export const SLEEP_SHIM = `
  (() => {
    const realMono = performance.now.bind(performance)
    const realDate = Date.now.bind(Date)
    window.__skewMs = 0
    window.__frozenMono = null
    performance.now = () => (window.__frozenMono === null ? realMono() : window.__frozenMono)
    Date.now = () => realDate() + window.__skewMs
    window.__sleep = (ms) => {
      window.__frozenMono = realMono()
      window.__skewMs += ms
    }
  })()
`
