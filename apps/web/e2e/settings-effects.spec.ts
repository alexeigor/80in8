import { expect, type Page, test } from '@playwright/test'
import { answerCurrent, beginRun, CLASSIC, currentQuestion, openHome } from './helpers.js'

/**
 * Settings, judged by what they do to a run rather than by whether the switch moved.
 */

/** Answer correctly until the question on screen is of a fraction kind. */
async function reachFractionQuestion(page: Page) {
  for (let index = 0; index < 80; index++) {
    const question = await currentQuestion(page)
    if (question.kind.startsWith('frac')) return question
    await answerCurrent(page, 'typed')
  }
  throw new Error('no fraction question in eighty draws')
}

/** A stand-in for the Web Audio API that counts the tones the app tries to play. */
const AUDIO_STUB = `
  window.__tones = 0
  class FakeGain { constructor() { this.gain = { setValueAtTime() {}, exponentialRampToValueAtTime() {} } } connect(node) { return node } }
  class FakeOscillator { constructor() { this.frequency = { value: 0 }; this.type = 'sine' } connect(node) { return node } start() {} stop() {} }
  window.AudioContext = class { constructor() { this.currentTime = 0; this.destination = {} } createOscillator() { window.__tones += 1; return new FakeOscillator() } createGain() { return new FakeGain() } }
`

test('answer feedback off removes the verdict from the top bar', async ({ page }) => {
  await page.goto('/settings')
  await page.getByTestId('toggle-feedback').click()
  await expect(page.getByTestId('toggle-feedback')).not.toBeChecked()
  await openHome(page, { profileRef: CLASSIC, mode: 'typed', seed: 3 })
  await beginRun(page)
  await answerCurrent(page, 'typed', false)
  await expect(page.getByTestId('counter')).toHaveText('2/80')
  await expect(page.getByTestId('feedback')).toHaveCount(0)

  // And on, the verdict is there and says which way it went.
  await page.goto('/settings')
  await page.getByTestId('toggle-feedback').click()
  await openHome(page, { profileRef: CLASSIC, mode: 'typed', seed: 3 })
  await beginRun(page)
  await answerCurrent(page, 'typed', false)
  await expect(page.getByTestId('feedback')).toHaveAttribute('data-correct', 'false')
})

test('the live score follows the scoring rule, with a sign', async ({ page }) => {
  await page.goto('/settings')
  await page.getByTestId('toggle-showLiveScore').click()
  await openHome(page, { profileRef: CLASSIC, mode: 'typed', seed: 3 })
  await beginRun(page)
  await expect(page.getByTestId('live-score')).toHaveText('0')
  await answerCurrent(page, 'typed', false)
  await expect(page.getByTestId('live-score')).toHaveText('-1')
  await answerCurrent(page, 'typed', true)
  await answerCurrent(page, 'typed', true)
  await expect(page.getByTestId('live-score')).toHaveText('+1')
  await page.keyboard.press('ArrowRight')
  await expect(page.getByTestId('live-score')).toHaveText('+1')
})

test('the live score is absent by default', async ({ page }) => {
  await openHome(page, { profileRef: CLASSIC, mode: 'typed', seed: 3 })
  await beginRun(page)
  await expect(page.getByTestId('live-score')).toHaveCount(0)
})

test('announcements can be switched off', async ({ page }) => {
  await page.clock.install()
  await page.goto('/settings')
  await page.getByTestId('toggle-announceTimer').click()
  await openHome(page, { profileRef: CLASSIC, mode: 'typed', seed: 6 })
  await beginRun(page)
  await page.clock.fastForward('04:05')
  await expect(page.getByTestId('timer')).toHaveText('3:55')
  expect(await page.getByTestId('announcer').innerText()).toBe('')
})

test('fractions are stacked when the setting is on and inline when it is off', async ({ page }) => {
  await openHome(page, { profileRef: CLASSIC, mode: 'typed', seed: 11 })
  await beginRun(page)
  await reachFractionQuestion(page)
  const box = page.getByTestId('question')
  await expect(box.locator('.frac').first()).toBeVisible()
  // The stacked glyphs are hidden from assistive technology; the words are not.
  await expect(box.locator('.frac').first()).toHaveAttribute('aria-hidden', 'true')
  await expect(box.locator('.sr-only').filter({ hasText: /over/ }).first()).toHaveText(/\d+ over \d+/)

  await page.keyboard.press('Escape')
  await page.goto('/settings')
  await page.getByTestId('toggle-stackedFractions').click()
  await openHome(page, { profileRef: CLASSIC, mode: 'typed', seed: 11 })
  await beginRun(page)
  const question = await reachFractionQuestion(page)
  await expect(box.locator('.frac')).toHaveCount(0)
  // Inline means the bar is a character on screen.
  await expect(box).toContainText('/')
  void question
})

test('sound plays a tone per answer only when it is on', async ({ page }) => {
  await page.addInitScript(AUDIO_STUB)
  const tones = () => page.evaluate(() => (window as unknown as { __tones: number }).__tones)

  await openHome(page, { profileRef: CLASSIC, mode: 'typed', seed: 3 })
  await beginRun(page)
  await answerCurrent(page, 'typed')
  await answerCurrent(page, 'typed', false)
  expect(await tones()).toBe(0)

  await page.keyboard.press('Escape')
  await page.goto('/settings')
  await page.getByTestId('toggle-sound').click()
  await openHome(page, { profileRef: CLASSIC, mode: 'typed', seed: 3 })
  await beginRun(page)
  await answerCurrent(page, 'typed')
  await answerCurrent(page, 'typed', false)
  expect(await tones()).toBe(2)
})

test.describe('fraction marking', () => {
  test('lowest terms only rejects an unsimplified fraction that any-equivalent accepts', async ({ page }) => {
    for (const policy of ['simplified', 'equivalent'] as const) {
      await page.goto('/settings')
      await page.getByTestId('setting-fraction-policy').selectOption(policy)
      await openHome(page, { profileRef: CLASSIC, mode: 'typed', seed: 11 })
      await beginRun(page)
      const question = await reachFractionQuestion(page)
      const { num, den } = question.answer
      // The same value, written with a common factor of two.
      if (num < 0) await page.keyboard.press('Minus')
      await page.keyboard.type(`${Math.abs(num) * 2}/${den * 2}`)
      await page.keyboard.press('Enter')
      await expect(page.getByTestId('question')).not.toHaveAttribute('data-question-id', question.id)
      await page.keyboard.press('Escape')
      await page
        .getByTestId('abort-yes')
        .click({ timeout: 1000 })
        .catch(() => undefined)
      await expect(page.getByTestId('results')).toBeVisible()
      await page.keyboard.press('r')
      await expect(page.locator(`[data-question-id="${question.id}"]`)).toHaveAttribute(
        'data-correct',
        policy === 'simplified' ? 'false' : 'true',
      )
    }
  })
})

test.describe('a preset and its practice variants', () => {
  /**
   * The whole point of hashing only the generative fields (§6.5, CLAUDE.md): a longer
   * clock or stricter marking is the same paper, so it must share ids, statistics
   * and retry decks with the graded run. This is checked at the preset's own count;
   * `settings.spec.ts` checks it between derived profiles.
   */
  for (const [label, prepare] of [
    [
      'extended time',
      async (page: Page) => {
        await page.getByTestId('toggle-advanced').click()
        await page.getByTestId('pace').selectOption('extended')
      },
    ],
    [
      'untimed',
      async (page: Page) => {
        await page.getByTestId('toggle-advanced').click()
        await page.getByTestId('pace').selectOption('untimed')
      },
    ],
    [
      'lowest terms only',
      async (page: Page) => {
        await page.goto('/settings')
        await page.getByTestId('setting-fraction-policy').selectOption('simplified')
        await openHome(page, { profileRef: CLASSIC, mode: 'typed', seed: 4242 })
      },
    ],
  ] as const) {
    test(`${label} asks exactly the same questions as the graded preset`, async ({ page }) => {
      await openHome(page, { profileRef: CLASSIC, mode: 'typed', seed: 4242 })
      await beginRun(page)
      const graded = await page.getByTestId('question').getAttribute('data-question-id')
      await page.keyboard.press('Escape')

      await openHome(page, { profileRef: CLASSIC, mode: 'typed', seed: 4242 })
      await prepare(page)
      await beginRun(page)
      await expect(page.getByTestId('question')).toHaveAttribute('data-question-id', graded ?? '')
    })
  }
})
