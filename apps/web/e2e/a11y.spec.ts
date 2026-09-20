import AxeBuilder from '@axe-core/playwright'
import { expect, type Page, test } from '@playwright/test'
import { answerCurrent, beginRun, CLASSIC, MCQ, openHome } from './helpers.js'

/**
 * axe on every screen (DESIGN.md §9.1, §9.4): zero serious or critical violations.
 * The hand-rolled contrast and target-size scans catch what axe cannot see; axe
 * catches the names, roles and structure the hand-rolled scans do not look at.
 */

async function expectNoSeriousViolations(page: Page, label: string): Promise<void> {
  const results = await new AxeBuilder({ page }).analyze()
  const serious = results.violations
    .filter((violation) => violation.impact === 'serious' || violation.impact === 'critical')
    .map(
      (violation) =>
        `${violation.id} (${violation.impact}): ${violation.help}\n  ${violation.nodes
          .map((node) => node.target.join(' '))
          .join('\n  ')}`,
    )
  expect(serious, `${label}:\n${serious.join('\n')}`).toEqual([])
}

test.describe('accessibility audit', () => {
  test('home, in both states', async ({ page }) => {
    await openHome(page, { profileRef: CLASSIC, mode: 'typed', seed: 7 })
    await expectNoSeriousViolations(page, 'home')
    await page.getByTestId('toggle-advanced').click()
    await expectNoSeriousViolations(page, 'home with the advanced panel open')
  })

  test('a typed run, the shortcuts sheet and the abort dialog', async ({ page }) => {
    await openHome(page, { profileRef: CLASSIC, mode: 'typed', seed: 7 })
    await beginRun(page)
    await page.keyboard.type('12.5')
    await expectNoSeriousViolations(page, 'typed run')
    await page.keyboard.press('?')
    await page.getByTestId('shortcuts').waitFor()
    await expectNoSeriousViolations(page, 'shortcuts sheet')
    await page.keyboard.press('Escape')
    for (let index = 0; index < 6; index++) await answerCurrent(page, 'typed', index % 2 === 0)
    await page.keyboard.press('Escape')
    await page.getByTestId('abort-confirm').waitFor()
    await expectNoSeriousViolations(page, 'abort dialog')
  })

  test('a multiple-choice run', async ({ page }) => {
    await openHome(page, { profileRef: MCQ, mode: 'mcq', seed: 99 })
    await beginRun(page)
    await expectNoSeriousViolations(page, 'multiple-choice run')
  })

  test('results with the review open, history and settings', async ({ page }) => {
    await openHome(page, { profileRef: MCQ, mode: 'mcq', seed: 99 })
    await beginRun(page)
    for (let index = 0; index < 6; index++) await answerCurrent(page, 'mcq', index % 2 === 0)
    await page.keyboard.press('Escape')
    await page.getByTestId('abort-yes').click()
    await page.getByTestId('results').waitFor()
    await expectNoSeriousViolations(page, 'results')
    await page.keyboard.press('r')
    await page.getByTestId('review').waitFor()
    await expectNoSeriousViolations(page, 'results with the review open')
    await page.goto('/history')
    await page.getByTestId('history-row').first().waitFor()
    await expectNoSeriousViolations(page, 'history')
    await page.goto('/settings')
    await page.getByTestId('settings').waitFor()
    await expectNoSeriousViolations(page, 'settings')
  })
})
