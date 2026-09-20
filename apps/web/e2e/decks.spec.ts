import { readFile } from 'node:fs/promises'
import type { ExportFile } from '@80in8/core'
import { expect, test } from '@playwright/test'
import { answerCurrent, beginRun, CLASSIC, openHome } from './helpers.js'

/**
 * Runs that are lists of ids rather than seeds (§6.5, F13): the deck from history,
 * the deck from a shared question, and the profiles that have to travel with them.
 */

test('"Weakest 80" starts a practice deck of what history holds', async ({ page }) => {
  await openHome(page, { profileRef: CLASSIC, mode: 'typed', seed: 8080 })
  await beginRun(page)
  for (let index = 0; index < 8; index++) await answerCurrent(page, 'typed', index % 2 === 0)
  await page.keyboard.press('Escape')
  await page.getByTestId('abort-yes').click()
  await expect(page.getByTestId('results')).toBeVisible()

  await page.goto('/history')
  await page.getByTestId('weakest-80').click()
  await page.getByTestId('skip-countdown').click()
  // Eight questions seen, so eight in the deck.
  await expect(page.getByTestId('counter')).toHaveText('1/8')
  await answerCurrent(page, 'typed')
  await page.keyboard.press('Escape')
  await expect(page.getByTestId('results')).toBeVisible()
  // A deck has no seed, so there is no run link to copy.
  await expect(page.getByTestId('share-run')).toHaveCount(0)

  await page.getByTestId('nav-history').click()
  const rows = page.getByTestId('history-row')
  await expect(rows).toHaveCount(2)
  await expect(rows.first()).toContainText('practice')
  await expect(rows.first()).toHaveAttribute('data-run-id', '')
  await expect(rows.last()).not.toContainText('practice')
})

test('practice runs are kept out of the best score and the trend', async ({ page }) => {
  await openHome(page, { profileRef: CLASSIC, mode: 'typed', seed: 4242 })
  await beginRun(page)
  for (let index = 0; index < 3; index++) await answerCurrent(page, 'typed')
  await page.keyboard.press('Escape')
  await expect(page.getByTestId('score')).toHaveText('3')

  await openHome(page, { profileRef: CLASSIC, mode: 'typed', seed: 4242 })
  await page.getByTestId('toggle-advanced').click()
  await page.getByTestId('pace').selectOption('untimed')
  await beginRun(page)
  for (let index = 0; index < 5; index++) await answerCurrent(page, 'typed')
  await page.keyboard.press('Escape')
  await expect(page.getByTestId('score')).toHaveText('5')

  await page.goto('/history')
  await expect(page.getByTestId('run-count')).toHaveText('2')
  await expect(page.locator('.stat').filter({ hasText: 'Best' }).locator('.v')).toHaveText('3')
  // One graded run is a dot, not a trend, however many practice runs sit beside it.
  await expect(page.getByTestId('trend-section')).toHaveCount(0)
})

test.describe('after a shared question', () => {
  for (const action of ['same-seed', 'again', 'retry'] as const) {
    test(`${action} puts a run on screen`, async ({ page }) => {
      await openHome(page, { profileRef: CLASSIC, mode: 'typed', seed: 3 })
      await beginRun(page)
      const id = await page.getByTestId('question').getAttribute('data-question-id')
      await page.keyboard.press('Escape')

      await page.goto(`/q/${id}`)
      await expect(page.getByTestId('question')).toHaveAttribute('data-question-id', id ?? '')
      await answerCurrent(page, 'typed', false)
      await expect(page.getByTestId('results')).toBeVisible()
      await expect(page.getByTestId('share-run')).toHaveCount(0)

      await page.getByTestId(action).click()
      await page
        .getByTestId('skip-countdown')
        .click({ timeout: 1000 })
        .catch(() => undefined)
      // Whatever the action starts, the person must be looking at it.
      await expect(page.getByTestId('question')).toBeVisible()
      expect(new URL(page.url()).pathname).toBe('/run')
      if (action === 'same-seed' || action === 'retry') {
        await expect(page.getByTestId('question')).toHaveAttribute('data-question-id', id ?? '')
      } else {
        await expect(page.getByTestId('question')).not.toHaveAttribute('data-question-id', id ?? '')
      }
      // And Enter from there must not be swallowed by a run the person cannot see.
      await answerCurrent(page, 'typed')
      await expect(page.getByTestId('results')).toBeVisible()
    })
  }
})

test('an export carries custom profiles, so imported ids resolve on another device', async ({
  page,
  browser,
  baseURL,
}) => {
  await openHome(page, { profileRef: CLASSIC, mode: 'typed', seed: 4242 })
  await page.getByTestId('toggle-advanced').click()
  await page.getByTestId('count').fill('3')
  await beginRun(page)
  const id = await page.getByTestId('question').getAttribute('data-question-id')
  expect(id).toMatch(/^1\.custom-[0-9a-f]{8}\./)
  await answerCurrent(page, 'typed', false)
  await page.keyboard.press('Escape')
  await expect(page.getByTestId('results')).toBeVisible()

  await page.getByTestId('nav-history').click()
  const download = await Promise.all([
    page.waitForEvent('download'),
    page.getByTestId('export').click(),
  ]).then(([file]) => file)
  expect(download.suggestedFilename()).toMatch(/^80in8-export-\d{4}-\d{2}-\d{2}\.json$/)
  const path = await download.path()
  if (!path) throw new Error('no export file')
  const exported = JSON.parse(await readFile(path, 'utf8')) as ExportFile
  expect(Object.keys(exported.profiles)).toEqual([id?.split('.')[1]])

  const fresh = await browser.newContext(baseURL === undefined ? {} : { baseURL })
  try {
    const other = await fresh.newPage()
    await other.goto('/history')
    await other.getByTestId('import-file').setInputFiles(path)
    // The row appears from memory first; the toast follows the storage writes, and a
    // full navigation before they land would abandon them.
    await expect(other.getByTestId('toast')).toHaveText('Imported 1 new runs.')
    await expect(other.getByTestId('history-row')).toHaveCount(1)

    // The id names a custom profile; without the snapshot this would be "unavailable".
    await other.goto(`/q/${id}`)
    await expect(other.getByTestId('question')).toHaveAttribute('data-question-id', id ?? '')
    await expect(other.getByTestId('question-unavailable')).toHaveCount(0)

    await other.goto('/history')
    // One wrong answer is too thin a sample to call a weakness, so the deck is the slowest.
    await expect(other.getByTestId('weakest-80')).toHaveText(/Weakest 80|Slowest 80/)
    await other.getByTestId('weakest-80').click()
    await other.getByTestId('skip-countdown').click()
    await expect(other.getByTestId('question')).toHaveAttribute('data-question-id', id ?? '')
  } finally {
    await fresh.close()
  }
})
