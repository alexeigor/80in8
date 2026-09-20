import { expect, test } from '@playwright/test'
import { abortAfter, beginRun, CLASSIC, openHome } from './helpers.js'

test.describe('history', () => {
  test('two runs make two rows', async ({ page }) => {
    await openHome(page, { profileRef: CLASSIC, mode: 'typed', seed: 101 })
    await beginRun(page)
    await abortAfter(page, 'typed', 2)

    await openHome(page, { profileRef: CLASSIC, mode: 'typed', seed: 202 })
    await beginRun(page)
    await abortAfter(page, 'typed', 2)

    await page.getByTestId('nav-history').click()
    await expect(page.getByTestId('history-row')).toHaveCount(2)
    await expect(page.getByTestId('run-count')).toHaveText('2')
  })

  test('"Same seed" twice is two attempts at one sequence, not one overwritten row', async ({ page }) => {
    await openHome(page, { profileRef: CLASSIC, mode: 'typed', seed: 4242 })
    await beginRun(page)
    await abortAfter(page, 'typed', 1)

    // The attempt id is minted fresh on every start, including this one.
    await page.getByTestId('same-seed').click()
    await page.getByTestId('skip-countdown').click()
    await abortAfter(page, 'typed', 1)

    await page.getByTestId('nav-history').click()
    const rows = page.getByTestId('history-row')
    await expect(rows).toHaveCount(2)

    const attempts = await rows.evaluateAll((nodes) =>
      nodes.map((node) => (node as HTMLElement).dataset.attemptId),
    )
    const runIds = await rows.evaluateAll((nodes) => nodes.map((node) => (node as HTMLElement).dataset.runId))
    expect(new Set(attempts).size).toBe(2)
    expect(runIds[0]).toBe(runIds[1])
    expect(runIds[0]).toBeTruthy()
  })

  test('export, clear and import round-trips the runs without duplicating them', async ({ page }) => {
    await openHome(page, { profileRef: CLASSIC, mode: 'typed', seed: 777 })
    await beginRun(page)
    await abortAfter(page, 'typed', 2)

    await page.getByTestId('nav-history').click()
    await expect(page.getByTestId('history-row')).toHaveCount(1)

    const download = page.waitForEvent('download')
    await page.getByTestId('export').click()
    const file = await (await download).path()
    if (!file) throw new Error('no export file')

    await page.getByTestId('clear').click()
    await page.getByTestId('clear-yes').click()
    await expect(page.getByTestId('history-empty')).toBeVisible()

    await page.getByTestId('import-file').setInputFiles(file)
    await expect(page.getByTestId('history-row')).toHaveCount(1)

    // Importing the same file again adds nothing: runs merge by attempt id.
    await page.getByTestId('import-file').setInputFiles(file)
    await expect(page.getByTestId('history-row')).toHaveCount(1)
  })

  test('"Retry mistakes" builds a deck of exactly what went wrong', async ({ page }) => {
    await openHome(page, { profileRef: CLASSIC, mode: 'typed', seed: 606 })
    await beginRun(page)

    await page.keyboard.press('ArrowRight')
    await page.keyboard.press('ArrowRight')
    await page.keyboard.press('Escape')
    await expect(page.getByTestId('results')).toBeVisible()

    await page.keyboard.press('r')
    const missed = await page
      .locator('[data-testid^="review-row-"][data-correct="false"]')
      .evaluateAll((nodes) => nodes.map((node) => (node as HTMLElement).dataset.questionId))
    expect(missed).toHaveLength(2)

    await page.getByTestId('retry').click()
    await page.getByTestId('skip-countdown').click()
    await expect(page.getByTestId('counter')).toHaveText('1/2')
    await expect(page.getByTestId('question')).toHaveAttribute('data-question-id', missed[0] ?? '')
  })
})
