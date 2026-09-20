import { expect, test } from '@playwright/test'
import { beginRun, CLASSIC, MCQ, openHome, STRICT } from './helpers.js'

/**
 * The on-screen ways to skip (§7.3, §7.4), and their absence under a profile that
 * forbids skipping. The keyboard paths are covered in `run.spec.ts`.
 */

test('the multiple-choice Skip button advances, and the strict profile has none', async ({ page }) => {
  await openHome(page, { profileRef: MCQ, mode: 'mcq', seed: 5 })
  await beginRun(page)
  await page.getByTestId('skip').click()
  await expect(page.getByTestId('counter')).toHaveText('2/80')
  await page.keyboard.press('Escape')
  await expect(page.getByTestId('results')).toBeVisible()
  await page.keyboard.press('r')
  await expect(page.getByTestId('review-row-0')).toContainText('skipped')

  await openHome(page, { profileRef: STRICT, mode: 'mcq', seed: 5 })
  await beginRun(page)
  await expect(page.getByTestId('skip')).toHaveCount(0)
})

test('the keypad offers Skip, which also clears the draft, or Clear when skipping is forbidden', async ({
  page,
}) => {
  await page.goto('/settings')
  const keypad = page.getByTestId('toggle-keypad')
  if (!(await keypad.isChecked())) await keypad.click()

  await openHome(page, { profileRef: CLASSIC, mode: 'typed', seed: 5 })
  await beginRun(page)
  await page.keyboard.type('12')
  await page.getByTestId('key-skip').click()
  await expect(page.getByTestId('counter')).toHaveText('2/80')
  await expect(page.getByTestId('typed-input')).toHaveValue('')
  await page.keyboard.press('Escape')

  await openHome(page, { profileRef: STRICT, mode: 'typed', seed: 5 })
  await beginRun(page)
  await expect(page.getByTestId('key-skip')).toHaveCount(0)
  await page.keyboard.type('12')
  await page.getByTestId('key-clear').click()
  await expect(page.getByTestId('typed-input')).toHaveValue('')
  await expect(page.getByTestId('counter')).toHaveText('1/80')
})

test('a real double tap on an option answers one question, not two', async ({ page, isMobile }) => {
  test.skip(!isMobile, 'the pointer lockout is for touch')
  await openHome(page, { profileRef: MCQ, mode: 'mcq', seed: 5 })
  await beginRun(page)
  const box = await page.getByTestId('option-0').boundingBox()
  if (!box) throw new Error('option not laid out')
  const x = box.x + box.width / 2
  const y = box.y + box.height / 2

  // Two taps inside the 150 ms window: the second lands on the next question's
  // button and must be ignored (§7.3).
  await page.touchscreen.tap(x, y)
  await page.touchscreen.tap(x, y)
  await expect(page.getByTestId('counter')).toHaveText('2/80')

  // Two taps far enough apart are two answers. The lockout runs from the first tap,
  // so let it lapse before the next pair.
  await page.waitForTimeout(200)
  await page.touchscreen.tap(x, y)
  await page.waitForTimeout(400)
  await page.touchscreen.tap(x, y)
  await expect(page.getByTestId('counter')).toHaveText('4/80')
})
