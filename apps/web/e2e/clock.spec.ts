import { expect, test } from '@playwright/test'
import { answerCurrent, beginRun, CLASSIC, openHome, SLEEP_SHIM } from './helpers.js'

test.describe('the clock', () => {
  test('time running out ends the run and discards the answer in flight', async ({ page }) => {
    await page.clock.install()
    await openHome(page, { profileRef: CLASSIC, mode: 'typed', seed: 1 })
    await beginRun(page)

    await answerCurrent(page, 'typed')
    // Half an answer, never submitted.
    await page.keyboard.press('7')
    await expect(page.getByTestId('typed-input')).toHaveValue('7')

    await page.clock.fastForward('09:00')

    await expect(page.getByTestId('results')).toBeVisible()
    await expect(page.getByTestId('ended-by')).toHaveText('time')
    await expect(page.getByTestId('answered')).toHaveText('1/80')
  })

  test('the timer counts down in m:ss without moving the layout', async ({ page }) => {
    await page.clock.install()
    await openHome(page, { profileRef: CLASSIC, mode: 'typed', seed: 2 })
    await beginRun(page)

    await expect(page.getByTestId('timer')).toHaveText('8:00')
    const before = await page.getByTestId('question').boundingBox()

    await page.clock.fastForward('07:10')
    await expect(page.getByTestId('timer')).toHaveText('0:50')
    await expect(page.getByTestId('timer')).toHaveAttribute('data-urgency', 'soon')

    const after = await page.getByTestId('question').boundingBox()
    expect(after?.y).toBe(before?.y)
    expect(after?.height).toBe(before?.height)
  })

  test('sleeping through the deadline does not buy extra time', async ({ page, context }) => {
    // performance.now() stalls while the device sleeps; Date.now() does not. The core
    // takes the stricter of the two, so the run has to be over when the page wakes.
    await context.addInitScript(SLEEP_SHIM)
    await openHome(page, { profileRef: CLASSIC, mode: 'typed', seed: 4 })
    await beginRun(page)

    await answerCurrent(page, 'typed')
    await page.keyboard.press('5')

    await page.evaluate(() => {
      ;(window as unknown as { __sleep: (ms: number) => void }).__sleep(9 * 60_000)
    })
    await page.evaluate(() => window.dispatchEvent(new Event('pageshow')))

    await expect(page.getByTestId('results')).toBeVisible()
    await expect(page.getByTestId('ended-by')).toHaveText('time')
    await expect(page.getByTestId('answered')).toHaveText('1/80')
  })

  test('hiding the tab keeps the clock running and reports the time away', async ({ page }) => {
    await page.clock.install()
    await openHome(page, { profileRef: CLASSIC, mode: 'typed', seed: 5 })
    await beginRun(page)

    await page.evaluate(() => {
      Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' })
      document.dispatchEvent(new Event('visibilitychange'))
    })
    await page.clock.fastForward('00:30')
    await page.evaluate(() => {
      Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' })
      document.dispatchEvent(new Event('visibilitychange'))
    })

    // The exam does not pause, so thirty seconds away are thirty seconds gone.
    await expect(page.getByTestId('timer')).toHaveText('7:30')

    await page.keyboard.press('Escape')
    await expect(page.getByTestId('hidden')).toBeVisible()
  })
})

test.describe('announcements', () => {
  test('the polite live region calls out the milestones', async ({ page }) => {
    await page.clock.install()
    await openHome(page, { profileRef: CLASSIC, mode: 'typed', seed: 6 })
    await beginRun(page)

    const announcer = page.getByTestId('announcer')
    await expect(announcer).toHaveText('')

    await page.clock.fastForward('04:05')
    await expect(announcer).toHaveText('4 minutes remaining')

    await page.clock.fastForward('02:00')
    await expect(announcer).toHaveText('2 minutes remaining')

    // 1:55 left, minus 1:10, is 0:45: the one-minute mark has just gone by.
    await page.clock.fastForward('01:10')
    await expect(announcer).toHaveText('1 minute remaining')

    await page.clock.fastForward('00:20')
    await expect(announcer).toHaveText('30 seconds remaining')
  })
})
