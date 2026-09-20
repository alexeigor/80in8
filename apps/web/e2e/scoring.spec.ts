import { expect, test } from '@playwright/test'
import { answerCurrent, beginRun, CLASSIC, MCQ, openHome } from './helpers.js'

/**
 * Scoring presets and the bands, read off the results screen (F5, F6). The disclosure
 * line says what a preset will do; these check that it did it.
 */

test('the harsh preset takes two off for a wrong answer and two for a skip', async ({ page }) => {
  await openHome(page, { profileRef: 'optiver-harsh@1', mode: 'typed', seed: 3 })
  await beginRun(page)
  await answerCurrent(page, 'typed', true)
  await answerCurrent(page, 'typed', false)
  await page.keyboard.press('ArrowRight')
  await page.keyboard.press('Escape')
  await expect(page.getByTestId('results')).toBeVisible()
  await expect(page.getByTestId('score')).toHaveText('-3')
  await expect(page.getByTestId('results')).toContainText('1 correct · 1 wrong · 1 skipped')
  await expect(page.getByTestId('band')).toHaveText('Below the pass mark')
})

test('the Zetamac drill counts only what was right, in two minutes, with no bands', async ({ page }) => {
  await page.clock.install()
  await openHome(page, { profileRef: 'zetamac-drill@1', mode: 'typed', seed: 3 })
  await beginRun(page)
  await expect(page.getByTestId('timer')).toHaveText('2:00')
  await expect(page.getByTestId('counter')).toHaveText('1/500')
  await answerCurrent(page, 'typed', false)
  await answerCurrent(page, 'typed', true)
  await answerCurrent(page, 'typed', true)
  await page.clock.fastForward('02:01')
  await expect(page.getByTestId('results')).toBeVisible()
  await expect(page.getByTestId('ended-by')).toHaveText('time')
  await expect(page.getByTestId('score')).toHaveText('2')
  await expect(page.getByTestId('band')).toHaveCount(0)
})

test('the pass band sits between the pass mark and the competitive mark', async ({ page }) => {
  await openHome(page, { profileRef: CLASSIC, mode: 'typed', seed: 20_240_101 })
  await beginRun(page)
  // passScore 56, competitiveScore 70 (Appendix A).
  for (let index = 0; index < 56; index++) await answerCurrent(page, 'typed')
  await page.keyboard.press('Escape')
  await page.getByTestId('abort-yes').click()
  await expect(page.getByTestId('score')).toHaveText('56')
  await expect(page.getByTestId('band')).toHaveText('Pass')
})

test('a short run is below the pass mark', async ({ page }) => {
  await openHome(page, { profileRef: CLASSIC, mode: 'typed', seed: 20_240_101 })
  await beginRun(page)
  for (let index = 0; index < 3; index++) await answerCurrent(page, 'typed')
  await page.keyboard.press('Escape')
  await expect(page.getByTestId('band')).toHaveText('Below the pass mark')
})

test('wrong multiple-choice picks are explained by the trap they fell for', async ({ page }) => {
  await openHome(page, { profileRef: MCQ, mode: 'mcq', seed: 99 })
  await beginRun(page)
  for (let index = 0; index < 6; index++) await answerCurrent(page, 'mcq', false)
  await page.keyboard.press('Escape')
  await page.getByTestId('abort-yes').click()
  await expect(page.getByTestId('results')).toBeVisible()
  const section = page.getByText('What tripped you up')
  await expect(section).toBeVisible()
  // Six wrong picks are six counted sources, whatever their names.
  const counts = await section
    .locator('xpath=following-sibling::p')
    .evaluate((el) => [...(el.textContent ?? '').matchAll(/×(\d+)/g)].map((m) => Number(m[1])))
  expect(counts.reduce((sum, n) => sum + n, 0)).toBe(6)
})

test.describe('the last ten seconds', () => {
  test('the clock turns urgent, the announcer says so, and the tone sounds when enabled', async ({
    page,
  }) => {
    await page.addInitScript(`
      window.__tones = 0
      class FakeGain { constructor() { this.gain = { setValueAtTime() {}, exponentialRampToValueAtTime() {} } } connect(node) { return node } }
      class FakeOscillator { constructor() { this.frequency = { value: 0 }; this.type = 'sine' } connect(node) { return node } start() {} stop() {} }
      window.AudioContext = class { constructor() { this.currentTime = 0; this.destination = {} } createOscillator() { window.__tones += 1; return new FakeOscillator() } createGain() { return new FakeGain() } }
    `)
    await page.clock.install()
    await page.goto('/settings')
    await page.getByTestId('toggle-sound').click()
    await openHome(page, { profileRef: CLASSIC, mode: 'typed', seed: 6 })
    await beginRun(page)
    await page.clock.fastForward('07:35')
    await expect(page.getByTestId('timer')).toHaveText('0:25')
    await expect(page.getByTestId('timer')).toHaveAttribute('data-urgency', 'soon')
    await expect(page.getByTestId('announcer')).toHaveText('30 seconds remaining')
    expect(await page.evaluate(() => (window as unknown as { __tones: number }).__tones)).toBe(0)

    await page.clock.fastForward('00:16')
    await expect(page.getByTestId('timer')).toHaveText('0:09')
    await expect(page.getByTestId('timer')).toHaveAttribute('data-urgency', 'now')
    await expect(page.getByTestId('announcer')).toHaveText('10 seconds remaining')
    expect(await page.evaluate(() => (window as unknown as { __tones: number }).__tones)).toBe(1)
  })

  test('after one long jump only the milestone that is now true is announced', async ({ page }) => {
    // A device that slept through six minutes must not wake to "4 minutes remaining".
    await page.clock.install()
    await openHome(page, { profileRef: CLASSIC, mode: 'typed', seed: 6 })
    await beginRun(page)
    await page.clock.fastForward('07:51')
    await expect(page.getByTestId('timer')).toHaveText('0:09')
    expect(await page.getByTestId('announcer').innerText()).toBe('10 seconds remaining')
  })
})
