import { readFile } from 'node:fs/promises'
import type { ExportFile } from '@80in8/core'
import { expect, test } from '@playwright/test'
import { abortAfter, beginRun, openHome } from './helpers.js'

test('a malformed percent-encoded question link shows an error instead of crashing', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  // Static hosting serves the SPA fallback for unknown paths. Vite's preview
  // rejects invalid escapes before serving it, so supply that fallback here.
  await page.route('**/q/%E0%A4%A', async (route) => {
    await route.fulfill({ response: await page.request.get('/') })
  })
  await page.goto('/q/%E0%A4%A')
  await expect(page.getByTestId('question-error')).toBeVisible()
  await page.getByRole('link', { name: 'Back to the start' }).click()
  await expect(page.getByTestId('home')).toBeVisible()
  expect(errors).toEqual([])
})

test('importing a conflicting attempt preserves the original after reload', async ({ page }) => {
  await openHome(page)
  await beginRun(page)
  await abortAfter(page, 'typed', 2)
  await page.getByTestId('nav-history').click()
  const row = page.getByTestId('history-row')
  await expect(row).toHaveCount(1)
  const before = await row.innerText()

  const download = page.waitForEvent('download')
  await page.getByTestId('export').click()
  const file = await (await download).path()
  if (!file) throw new Error('missing export')
  const exported = JSON.parse(await readFile(file, 'utf8')) as ExportFile
  const run = exported.runs[0]
  if (!run) throw new Error('missing run')
  run.summary.score = 999
  await page.getByTestId('import-file').setInputFiles({
    name: 'conflicting-attempt.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(exported)),
  })
  await expect(page.getByTestId('toast')).toHaveText('Imported 0 new runs.')
  await expect(row).toHaveText(before, { useInnerText: true })
  await page.reload()
  await expect(row).toHaveCount(1)
  await expect(row).toHaveText(before, { useInnerText: true })
})

test('an invalid import leaves existing history usable', async ({ page }) => {
  await openHome(page)
  await beginRun(page)
  await abortAfter(page, 'typed', 1)
  await page.getByTestId('nav-history').click()
  const before = await page.getByTestId('history-row').innerText()
  await page.getByTestId('import-file').setInputFiles({
    name: 'invalid.json',
    mimeType: 'application/json',
    buffer: Buffer.from('{"app":"80in8","schemaVersion":99}'),
  })
  await expect(page.getByTestId('toast')).toContainText('Import failed:')
  await expect(page.getByTestId('history-row')).toHaveText(before, { useInnerText: true })
  await page.reload()
  await expect(page.getByTestId('history-row')).toHaveText(before, { useInnerText: true })
})

test('training still works when browser storage is denied', async ({ page }) => {
  await page.addInitScript(() => {
    Storage.prototype.setItem = () => {
      throw new DOMException('Storage denied', 'SecurityError')
    }
    IDBFactory.prototype.open = () => {
      throw new DOMException('Storage denied', 'SecurityError')
    }
  })
  await openHome(page)
  await beginRun(page)
  await abortAfter(page, 'typed', 2)
  await expect(page.getByTestId('score')).toHaveText('2')
  await page.getByTestId('nav-history').click()
  await expect(page.getByTestId('storage-warning')).toBeVisible()
  await expect(page.getByTestId('history-row')).toHaveCount(1)
})

test('a recovered practice run stays marked as practice', async ({ page }) => {
  await openHome(page)
  await page.getByTestId('toggle-advanced').click()
  await page.getByTestId('pace').selectOption('untimed')
  await beginRun(page)
  await page.keyboard.press('1')
  await page.keyboard.press('Enter')
  await page.reload()
  await expect(page.getByTestId('recovered')).toBeVisible()
  await page.getByTestId('nav-history').click()
  await expect(page.getByTestId('history-row')).toContainText('practice')
  await page.reload()
  await expect(page.getByTestId('history-row')).toContainText('practice')
})

test('keyboard users can activate More options without starting a run', async ({ page }) => {
  await openHome(page)
  await page.getByTestId('toggle-advanced').focus()
  await page.keyboard.press('Enter')
  await expect(page.getByTestId('advanced')).toBeVisible()
  await expect(page.getByTestId('home')).toBeVisible()
})

test('Tab on results moves focus without starting another run', async ({ page }) => {
  await openHome(page)
  await beginRun(page)
  await abortAfter(page, 'typed', 1)
  await page.keyboard.press('Tab')
  await expect(page.getByTestId('results')).toBeVisible()
  await expect(page.getByTestId('skip-countdown')).toHaveCount(0)
  await page.getByTestId('nav-history').focus()
  await page.keyboard.press('Enter')
  await expect(page.getByTestId('history')).toBeVisible()
})
