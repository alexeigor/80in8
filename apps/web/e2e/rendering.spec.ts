import { expect, test } from '@playwright/test'
import { answerCurrent, beginRun, CLASSIC, MCQ, openHome } from './helpers.js'
import { lowContrast } from './scan.js'

/**
 * Checks on what actually reaches the screen, as opposed to what the markup says.
 *
 * These exist because the CSS cascade and asynchronous storage both fail quietly: a
 * component rule can be outranked by a base rule and simply not apply, and a write
 * can be abandoned by a navigation. Neither shows up in a unit test.
 */

test.describe('the answer field', () => {
  test('is rendered at the size and in the face it is styled for', async ({ page }) => {
    await openHome(page, { profileRef: CLASSIC, mode: 'typed', seed: 7 })
    await beginRun(page)

    const style = await page.getByTestId('typed-input').evaluate((el) => {
      const s = getComputedStyle(el)
      return { size: Number.parseFloat(s.fontSize), family: s.fontFamily.toLowerCase() }
    })
    // The base `input[type="text"]` rule carries an attribute selector, so it outranks
    // a plain class and once reset this field to 16px system font without a trace.
    expect(style.size).toBeGreaterThanOrEqual(18)
    expect(style.family).toMatch(/mono/)

    // It must also read as part of the same composition as the question above it.
    const question = await page
      .getByTestId('question')
      .evaluate((el) => getComputedStyle(el).fontFamily.toLowerCase())
    expect(question).toMatch(/mono/)
  })

  test('never drops below the size that makes iOS zoom the page', async ({ page }) => {
    await openHome(page, { profileRef: CLASSIC, mode: 'typed', seed: 7 })
    const sizes = await page.evaluate(() =>
      [...document.querySelectorAll('input, select, textarea')].map((el) =>
        Number.parseFloat(getComputedStyle(el).fontSize),
      ),
    )
    for (const size of sizes) expect(size).toBeGreaterThanOrEqual(16)
  })
})

test.describe('layout on the device it is running on', () => {
  test('a run fits the viewport with nothing clipped and nothing too small to hit', async ({ page }) => {
    await openHome(page, { profileRef: CLASSIC, mode: 'typed', seed: 7 })
    await beginRun(page)

    const metrics = await page.evaluate(() => {
      const root = document.documentElement
      const tooSmall = [...document.querySelectorAll('button, a, select, input')]
        .map((el) => ({ el, r: el.getBoundingClientRect() }))
        .filter(({ r }) => r.width > 0 && r.height > 0 && (r.width < 44 || r.height < 44))
        .map(
          ({ el, r }) =>
            `${el.tagName} "${(el.textContent ?? '').trim().slice(0, 10)}" ${Math.round(r.width)}x${Math.round(r.height)}`,
        )
      const offBottom = [...document.querySelectorAll('button')]
        .map((el) => el.getBoundingClientRect())
        .filter((r) => r.height > 0 && r.bottom > window.innerHeight + 1).length
      return {
        horizontal: root.scrollWidth - root.clientWidth,
        vertical: root.scrollHeight - window.innerHeight,
        tooSmall,
        offBottom,
      }
    })

    expect(metrics.horizontal).toBeLessThanOrEqual(0)
    expect(metrics.vertical).toBeLessThanOrEqual(0)
    expect(metrics.tooSmall).toEqual([])
    expect(metrics.offBottom).toBe(0)
  })

  test('the multiple-choice options are comfortably tappable', async ({ page }) => {
    await openHome(page, { profileRef: MCQ, mode: 'mcq', seed: 99 })
    await beginRun(page)
    for (let index = 0; index < 4; index++) {
      const box = await page.getByTestId(`option-${index}`).boundingBox()
      expect(box).not.toBeNull()
      expect(box?.height ?? 0).toBeGreaterThanOrEqual(44)
      expect(box?.width ?? 0).toBeGreaterThanOrEqual(44)
    }
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    )
    expect(overflow).toBeLessThanOrEqual(0)
  })
})

test.describe('an interrupted run', () => {
  test('reaches history even when the page is torn down the instant it ends', async ({ page }) => {
    await openHome(page, { profileRef: MCQ, mode: 'mcq', seed: 99 })
    await beginRun(page)
    for (let index = 0; index < 6; index++) await answerCurrent(page, 'mcq', true)
    await page.keyboard.press('Escape')
    await page.getByTestId('abort-yes').click()

    // No pause: a full navigation here used to abandon the storage write mid-flight,
    // and the checkpoint had already been cleared, so the run was lost twice over.
    await page.goto('/history')
    await expect(page.getByTestId('history')).toBeVisible()
    await expect(page.getByTestId('history-empty')).toHaveCount(0)
    await expect(page.getByTestId('history-row')).toHaveCount(1)

    // And it is really in storage, not just in memory.
    await page.reload()
    await expect(page.getByTestId('history-row')).toHaveCount(1)
  })

  test('leaves no history row behind when nothing was answered', async ({ page }) => {
    await openHome(page, { profileRef: MCQ, mode: 'mcq', seed: 99 })
    await beginRun(page)
    await page.keyboard.press('Escape')
    await page.goto('/history')
    await expect(page.getByTestId('history-empty')).toBeVisible()
  })
})

test.describe('text contrast', () => {
  test('every run of text on the run screen clears AA', async ({ page }) => {
    await openHome(page, { profileRef: CLASSIC, mode: 'typed', seed: 7 })
    expect(await lowContrast(page)).toEqual([])
    await beginRun(page)
    await page.keyboard.type('12.5')
    expect(await lowContrast(page)).toEqual([])
  })

  test('and on the results and history screens', async ({ page }) => {
    await openHome(page, { profileRef: MCQ, mode: 'mcq', seed: 99 })
    await beginRun(page)
    expect(await lowContrast(page)).toEqual([])
    for (let index = 0; index < 6; index++) await answerCurrent(page, 'mcq', index % 2 === 0)
    await page.keyboard.press('Escape')
    await page.getByTestId('abort-yes').click()
    await expect(page.getByTestId('results')).toBeVisible()
    expect(await lowContrast(page)).toEqual([])
    await page.goto('/history')
    await expect(page.getByTestId('history')).toBeVisible()
    expect(await lowContrast(page)).toEqual([])
    await page.goto('/settings')
    await expect(page.getByTestId('settings')).toBeVisible()
    expect(await lowContrast(page)).toEqual([])
  })
})
