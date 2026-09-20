import { expect, type Page, test } from '@playwright/test'
import { answerCurrent, beginRun, CLASSIC, MCQ, openHome } from './helpers.js'
import { expectNoCollisions, lowContrast } from './scan.js'

/**
 * The dark theme, and the two OS preferences the app follows.
 *
 * Playwright's default colour scheme is light, so a contrast check that does not ask
 * for the dark theme has never looked at it. Both themes are the product.
 */

async function expectContrast(page: Page, label: string): Promise<void> {
  const bad = await lowContrast(page)
  expect(bad, `${label}:\n${bad.join('\n')}`).toEqual([])
}

test.describe('the dark theme', () => {
  test.beforeEach(async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'dark' })
    await page.goto('/settings')
    await page.getByTestId('setting-theme').selectOption('dark')
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  })

  test('every run of text on every screen clears AA', async ({ page }) => {
    await expectContrast(page, 'dark settings')

    await openHome(page, { profileRef: CLASSIC, mode: 'typed', seed: 7 })
    await expectContrast(page, 'dark home')
    await page.getByTestId('toggle-advanced').click()
    await expectContrast(page, 'dark home with the advanced panel open')

    await page.getByTestId('start').click()
    await page.getByTestId('countdown').waitFor()
    await expectContrast(page, 'dark countdown')
    await page.getByTestId('skip-countdown').click()
    await page.getByTestId('question').waitFor()
    await page.keyboard.type('12.5')
    await expectContrast(page, 'dark typed run')

    await page.keyboard.press('?')
    await page.getByTestId('shortcuts').waitFor()
    await expectContrast(page, 'dark shortcuts sheet')
    await page.keyboard.press('Escape')

    for (let index = 0; index < 6; index++) await answerCurrent(page, 'typed', index % 2 === 0)
    await page.keyboard.press('Escape')
    await page.getByTestId('abort-confirm').waitFor()
    await expectContrast(page, 'dark abort dialog')
    await page.getByTestId('abort-yes').click()
    await page.getByTestId('results').waitFor()
    await expectContrast(page, 'dark results')
    await page.keyboard.press('r')
    await page.getByTestId('review').waitFor()
    await expectContrast(page, 'dark results with the review open')

    await page.goto('/history')
    await page.getByTestId('history').waitFor()
    await expectContrast(page, 'dark history')

    await openHome(page, { profileRef: MCQ, mode: 'mcq', seed: 99 })
    await beginRun(page)
    await expectContrast(page, 'dark multiple-choice run')
  })

  test('every screen is free of collisions', async ({ page }) => {
    await expectNoCollisions(page, 'dark settings')
    await openHome(page, { profileRef: CLASSIC, mode: 'typed', seed: 7 })
    await expectNoCollisions(page, 'dark home')
    await beginRun(page)
    await page.keyboard.type('12.5')
    await expectNoCollisions(page, 'dark typed run')
    for (let index = 0; index < 6; index++) await answerCurrent(page, 'typed', index % 2 === 0)
    await page.keyboard.press('Escape')
    await page.getByTestId('abort-yes').click()
    await page.getByTestId('results').waitFor()
    await expectNoCollisions(page, 'dark results')
    await page.keyboard.press('r')
    await expectNoCollisions(page, 'dark results with the review open')
    await page.goto('/history')
    await page.getByTestId('history').waitFor()
    await expectNoCollisions(page, 'dark history')
  })
})

test.describe('following the operating system', () => {
  test('the system theme follows a colour-scheme change without a reload', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'light' })
    await page.goto('/settings')
    await expect(page.getByTestId('setting-theme')).toHaveValue('system')
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')

    await page.emulateMedia({ colorScheme: 'dark' })
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')

    // An explicit choice wins over the OS from then on.
    await page.getByTestId('setting-theme').selectOption('light')
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
    await page.emulateMedia({ colorScheme: 'dark' })
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
  })

  test('the OS reduced-motion preference is honoured and cannot be overridden back to full', async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.goto('/settings')
    await expect(page.locator('html')).toHaveAttribute('data-motion', 'reduced')
    await expect(page.getByRole('switch', { name: 'Reduce motion' })).not.toBeChecked()

    // The in-app setting can only ever turn motion down (DESIGN.md §7.6): toggling it
    // on and off again must leave the OS preference in force.
    await page.getByTestId('toggle-reducedMotion').click()
    await expect(page.locator('html')).toHaveAttribute('data-motion', 'reduced')
    await page.getByTestId('toggle-reducedMotion').click()
    await expect(page.locator('html')).toHaveAttribute('data-motion', 'reduced')

    await page.emulateMedia({ reducedMotion: 'no-preference' })
    await expect(page.locator('html')).toHaveAttribute('data-motion', 'full')
  })
})
