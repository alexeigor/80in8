import { expect, type Page, test } from '@playwright/test'
import { beginRun, CLASSIC, openHome } from './helpers.js'

async function startDerived(page: Page, count: number, pace: 'timed' | 'extended' | 'untimed') {
  await openHome(page, { profileRef: CLASSIC, mode: 'typed', seed: 4242 })
  await page.getByTestId('toggle-advanced').click()
  await page.getByTestId('count').fill(String(count))
  await page.getByTestId('pace').selectOption(pace)
  await beginRun(page)
  return page.getByTestId('question').getAttribute('data-question-id')
}

test.describe('derived profiles', () => {
  test('practising with a longer clock asks exactly the same questions', async ({ page }) => {
    // The whole point of hashing only the generative fields: an extended-time run and
    // the graded run it came from share ids, so they share statistics and retry decks.
    const graded = await startDerived(page, 40, 'timed')
    await expect(page.getByTestId('timer')).toHaveText('8:00')
    await page.keyboard.press('Escape')

    const extended = await startDerived(page, 40, 'extended')
    await expect(page.getByTestId('timer')).toHaveText('80:00')
    expect(extended).toBe(graded)
    await page.keyboard.press('Escape')

    const untimed = await startDerived(page, 40, 'untimed')
    await expect(page.getByTestId('timer')).toHaveAttribute('data-untimed', 'true')
    expect(untimed).toBe(graded)
  })

  test('a different question count is a different paper', async ({ page }) => {
    const forty = await startDerived(page, 40, 'timed')
    await page.keyboard.press('Escape')
    const twenty = await startDerived(page, 20, 'timed')
    expect(twenty).not.toBe(forty)
  })

  test('the harsh preset is offered and discloses its scoring before the start', async ({ page }) => {
    await openHome(page)
    await page.getByTestId('profile').selectOption('optiver-harsh@1')
    await expect(page.getByTestId('disclosure')).toHaveText(
      '80 questions · 8:00 · +1 correct · -2 wrong · -2 skipped',
    )
  })
})

test.describe('preferences', () => {
  test('reduce motion can be forced on and survives a reload', async ({ page }) => {
    await page.goto('/settings')
    await expect(page.locator('html')).toHaveAttribute('data-motion', 'full')

    await page.getByTestId('toggle-reducedMotion').click()
    await expect(page.locator('html')).toHaveAttribute('data-motion', 'reduced')

    await page.reload()
    await expect(page.locator('html')).toHaveAttribute('data-motion', 'reduced')
    await expect(page.getByRole('switch', { name: 'Reduce motion' })).toBeChecked()
  })

  test('the theme override applies before the first paint', async ({ page }) => {
    await page.goto('/settings')
    await page.getByTestId('setting-theme').selectOption('light')
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')

    await page.reload()
    // Set by public/theme.js, not by the bundle: no flash of the wrong theme.
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
  })
})
