import { expect, test } from '@playwright/test'
import { answerCurrent, beginRun, openHome } from './helpers.js'

for (const action of ['same-seed', 'retry', 'again']) {
  test(`a recovered run supports ${action}`, async ({ page }) => {
    await openHome(page)
    await beginRun(page)
    const first = await page.getByTestId('question').getAttribute('data-question-id')
    await answerCurrent(page, 'typed', false)
    await page.reload()
    await expect(page.getByTestId('recovered')).toBeVisible()
    await page.getByTestId(action).click()
    await page.getByTestId('skip-countdown').click()
    await expect(page.getByTestId('question')).toBeVisible()
    if (action === 'again') {
      await expect(page.getByTestId('question')).not.toHaveAttribute('data-question-id', first ?? '')
    } else {
      await expect(page.getByTestId('question')).toHaveAttribute('data-question-id', first ?? '')
    }
    await expect(page.getByTestId('counter')).toHaveText(action === 'retry' ? '1/1' : '1/80')
    await answerCurrent(page, 'typed')
    if (action !== 'retry') await page.keyboard.press('Escape')
    await expect(page.getByTestId('results')).toBeVisible()
    await page.getByTestId('nav-history').click()
    await expect(page.getByTestId('history-row')).toHaveCount(2)
  })
}

// Keep real IndexedDB transactions open until explicitly released. Navigation
// aborts an unfinished transaction, just as closing a tab during a slow write can.
async function installSlowWrites(page: import('@playwright/test').Page) {
  await page.addInitScript(() => {
    const target = window as Window & { holdRunWrites?: boolean }
    target.holdRunWrites = false
    const put = IDBObjectStore.prototype.put
    IDBObjectStore.prototype.put = function (...args) {
      const result = put.apply(this, args)
      if (this.transaction.db.name === '80in8-runs' && target.holdRunWrites) {
        const keepAlive = () => {
          this.get('__test_keep_alive__').onsuccess = () => {
            if (target.holdRunWrites) keepAlive()
          }
        }
        keepAlive()
      }
      return result
    }
  })
}

test('the final answer survives a reload before its history write commits', async ({ page }) => {
  await installSlowWrites(page)
  await openHome(page)
  await page.getByTestId('toggle-advanced').click()
  await page.getByTestId('count').fill('1')
  await beginRun(page)
  await page.evaluate(() => {
    ;(window as Window & { holdRunWrites?: boolean }).holdRunWrites = true
  })
  await page.keyboard.press('1')
  await page.keyboard.press('Enter')
  await expect(page.getByTestId('results')).toBeVisible()
  await page.reload()
  await expect(page.getByTestId('results')).toBeVisible()
  await expect(page.getByTestId('answered')).toHaveText('1/1')
  await expect(page.getByTestId('ended-by')).toHaveText('completed')
  await page.getByTestId('nav-history').click()
  await expect(page.getByTestId('history-row')).toHaveCount(1)
  await page.reload()
  await expect(page.getByTestId('history-row')).toHaveCount(1)
})

test('finishing an earlier write cannot clear the next run checkpoint', async ({ page }) => {
  await installSlowWrites(page)
  await openHome(page)
  await beginRun(page)
  await answerCurrent(page, 'typed')
  await page.evaluate(() => {
    ;(window as Window & { holdRunWrites?: boolean }).holdRunWrites = true
  })
  await page.keyboard.press('Escape')
  await expect(page.getByTestId('results')).toBeVisible()
  await page.getByTestId('same-seed').click()
  await page.getByTestId('skip-countdown').click()
  await answerCurrent(page, 'typed')
  await page.evaluate(() => {
    ;(window as Window & { holdRunWrites?: boolean }).holdRunWrites = false
  })
  // Wait until the first write is committed using a separate read transaction.
  await page.evaluate(async () => {
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.open('80in8-runs')
      request.onerror = () => reject(request.error)
      request.onsuccess = () => {
        const db = request.result
        const transaction = db.transaction('kv')
        transaction.objectStore('kv').getAll()
        transaction.oncomplete = () => {
          db.close()
          resolve()
        }
      }
    })
  })
  await page.reload()
  await expect(page.getByTestId('recovered')).toBeVisible()
  await expect(page.getByTestId('answered')).toHaveText('1/80')
  await page.getByTestId('nav-history').click()
  await expect(page.getByTestId('history-row')).toHaveCount(2)
})
