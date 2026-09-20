import { DEFAULT_SETTINGS } from '@80in8/core'
import { expect, test } from '@playwright/test'
import { abortAfter, beginRun, openHome } from './helpers.js'

for (const [name, changes] of [
  ['missing run fields', { runs: [{ attemptId: 'bad', questionIds: [], answers: [] }] }],
  ['invalid settings', { settings: { ...DEFAULT_SETTINGS, mode: 'broken', keypad: 'false' } }],
  ['invalid profile', { profiles: { 'custom-00000000': { name: 'Incomplete' } } }],
] as const) {
  test(`rejecting ${name} leaves existing history and preferences unchanged`, async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    await page.goto('/settings')
    await page.getByTestId('setting-theme').selectOption('dark')
    const keypad = page.getByTestId('toggle-keypad')
    if ((await keypad.getAttribute('aria-pressed')) === 'true') await keypad.click()
    await expect(keypad).toHaveAttribute('aria-pressed', 'false')
    await openHome(page)
    await beginRun(page)
    await abortAfter(page, 'typed', 1)
    await page.getByTestId('nav-history').click()
    const original = await page.getByTestId('history-row').innerText()
    await page.getByTestId('import-file').setInputFiles({
      name: 'bad.json',
      mimeType: 'application/json',
      buffer: Buffer.from(
        JSON.stringify({
          app: '80in8',
          schemaVersion: 1,
          settings: DEFAULT_SETTINGS,
          profiles: {},
          runs: [],
          ...changes,
        }),
      ),
    })
    await expect(page.getByTestId('toast')).toContainText('Import failed:')
    await expect(page.getByTestId('history-row')).toHaveText(original, { useInnerText: true })
    await page.reload()
    await expect(page.getByTestId('history-row')).toHaveText(original, { useInnerText: true })
    await page.getByTestId('nav-settings').click()
    await expect(page.getByTestId('setting-theme')).toHaveValue('dark')
    await expect(page.getByTestId('toggle-keypad')).toHaveAttribute('aria-pressed', 'false')
    expect(errors).toEqual([])
  })
}

for (const checkpoint of ['{', '{"state":{"phase":"running"}}', '{"state":{"phase":"countdown"}}']) {
  test(`a corrupt checkpoint does not prevent startup: ${checkpoint}`, async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    await page.addInitScript((value) => sessionStorage.setItem('80in8:checkpoint:v1', value), checkpoint)
    await openHome(page)
    await beginRun(page)
    await abortAfter(page, 'typed', 1)
    await expect(page.getByTestId('score')).toHaveText('1')
    expect(errors).toEqual([])
  })
}

test('invalid persisted preferences fall back to usable defaults', async ({ page }) => {
  await page.addInitScript(() =>
    localStorage.setItem(
      '80in8:settings:v1',
      JSON.stringify({ mode: null, fractionPolicy: 'bad', theme: [] }),
    ),
  )
  await page.goto('/settings')
  await expect(page.getByTestId('setting-mode')).toHaveValue('typed')
  await expect(page.getByTestId('setting-fraction-policy')).toHaveValue('equivalent')
  await expect(page.getByTestId('setting-theme')).toHaveValue('system')
})

test('a malformed IndexedDB row does not hide valid history', async ({ page }) => {
  await openHome(page)
  await beginRun(page)
  await abortAfter(page, 'typed', 1)
  await page.evaluate(async () => {
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.open('80in8-runs')
      request.onerror = () => reject(request.error)
      request.onsuccess = () => {
        const db = request.result
        const transaction = db.transaction('kv', 'readwrite')
        transaction.objectStore('kv').put({ attemptId: 'broken' }, 'broken')
        transaction.oncomplete = () => {
          db.close()
          resolve()
        }
      }
    })
  })
  await page.goto('/history')
  await expect(page.getByTestId('history-row')).toHaveCount(1)
  await expect(page.getByTestId('history')).toBeVisible()
})
