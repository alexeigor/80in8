import { expect, test } from '@playwright/test'
import { answerCurrent, MCQ, openHome } from './helpers.js'

test('shortcut hints suit the input device throughout a run, regardless of screen width', async ({
  page,
  isMobile,
}, testInfo) => {
  await page.clock.install({ time: new Date('2026-09-20T12:00:00Z') })
  await page.clock.pauseAt(new Date('2026-09-20T12:00:01Z'))
  await openHome(page, { profileRef: MCQ, mode: 'mcq' })
  const homeHint = page.getByText('or press Enter', { exact: true })
  for (const width of [390, 1024]) {
    await page.setViewportSize({ width, height: 800 })
    if (isMobile) await expect(homeHint).toBeHidden()
    else await expect(homeHint).toBeVisible()
  }
  await page.setViewportSize({ width: 390, height: 800 })
  await page.screenshot({ path: testInfo.outputPath('home-hints.png'), animations: 'disabled' })
  await page.getByRole('button', { name: 'Start', exact: true }).click()
  const skip = page.getByTestId('skip-countdown')
  await expect(skip).toHaveAccessibleName(isMobile ? 'Skip' : 'Skip (Enter)')
  await skip.click()
  await page.clock.resume()
  const end = page.getByTestId('abort')
  await expect(end).toHaveAccessibleName(isMobile ? 'End' : 'Esc')
  for (const hint of await page.getByTestId('mcq-grid').locator('.hint').all()) {
    if (isMobile) await expect(hint).toBeHidden()
    else await expect(hint).toBeVisible()
  }
  const option = page.getByTestId('option-0')
  if (isMobile) await option.tap()
  else await option.click()
  await expect(page.getByTestId('counter')).toHaveText('2/80')
  await end.click()
  await expect(page.getByTestId('again')).toHaveAccessibleName(isMobile ? 'Again' : 'Again Enter')
  await expect(page.getByTestId('same-seed')).toHaveAccessibleName(isMobile ? 'Same seed' : 'Same seed S')
  await expect(page.getByTestId('toggle-review')).toHaveAccessibleName(isMobile ? 'Review' : 'Review R')
  for (const hint of await page.getByTestId('results').locator('kbd').all()) {
    if (isMobile) await expect(hint).toBeHidden()
    else await expect(hint).toBeVisible()
  }
})

test('keyboard commands and explicit shortcut help still work on every input device', async ({ page }) => {
  await openHome(page)
  await page.keyboard.press('Enter')
  await expect(page.getByTestId('countdown')).toBeVisible()
  await page.keyboard.press('Enter')
  await expect(page.getByTestId('question')).toBeVisible()
  await answerCurrent(page, 'typed')
  await expect(page.getByTestId('counter')).toHaveText('2/80')
  await page.keyboard.press('Escape')
  await expect(page.getByTestId('score')).toHaveText('1')
  await page.keyboard.press('r')
  await expect(page.getByTestId('review')).toBeVisible()
  await page.keyboard.press('?')
  await expect(
    page.getByTestId('shortcuts').getByText('Enter (outside controls)', { exact: true }),
  ).toBeVisible()
})
