import { expect, test } from '@playwright/test'
import { answerCurrent, beginRun, CLASSIC, openHome } from './helpers.js'

/**
 * Sharing from a preset run (§7.2): the run link button, and the clipboard when the
 * browser actually grants it. `custom-sharing.spec.ts` covers custom profiles and the
 * denied-clipboard fallback.
 */

test('the run link reproduces a preset run for someone else', async ({ page, browser, baseURL }) => {
  await page.addInitScript(() =>
    Object.defineProperty(navigator, 'clipboard', {
      value: {
        writeText: async () => {
          throw new DOMException('Denied', 'NotAllowedError')
        },
      },
    }),
  )
  await openHome(page, { profileRef: CLASSIC, mode: 'mcq', seed: 8_675_309 })
  await beginRun(page)
  const first = await page.getByTestId('question').getAttribute('data-question-id')
  await answerCurrent(page, 'mcq')
  await page.keyboard.press('Escape')
  await expect(page.getByTestId('results')).toBeVisible()
  await page.getByTestId('share-run').click()
  const link = new URL(await page.getByTestId('toast').innerText())
  expect(link.searchParams.get('p')).toBe(CLASSIC)
  expect(link.searchParams.get('s')).toBe('8675309')
  expect(link.searchParams.get('m')).toBe('mcq')
  // A preset needs no payload.
  expect(link.searchParams.get('pf')).toBeNull()

  const fresh = await browser.newContext(baseURL === undefined ? {} : { baseURL })
  try {
    const other = await fresh.newPage()
    await other.goto(link.toString())
    await expect(other.getByTestId('mode-mcq')).toHaveAttribute('aria-pressed', 'true')
    await beginRun(other)
    await expect(other.getByTestId('question')).toHaveAttribute('data-question-id', first ?? '')
    await expect(other.getByTestId('mcq-grid')).toBeVisible()
  } finally {
    await fresh.close()
  }
})

test('when the clipboard is granted, the link really lands on it', async ({ page, context, browserName }) => {
  test.skip(browserName !== 'chromium', 'only Chromium lets a test grant clipboard access')
  await context.grantPermissions(['clipboard-read', 'clipboard-write'])
  await openHome(page, { profileRef: CLASSIC, mode: 'typed', seed: 7 })
  await beginRun(page)
  const id = await page.getByTestId('question').getAttribute('data-question-id')
  await answerCurrent(page, 'typed')
  await page.keyboard.press('Escape')
  await expect(page.getByTestId('results')).toBeVisible()

  await page.keyboard.press('r')
  await page.getByTestId('copy-link-0').click()
  await expect(page.getByTestId('toast')).toHaveText('Question link copied')
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
    `${new URL(page.url()).origin}/q/${id}`,
  )

  await page.getByTestId('share-run').click()
  await expect(page.getByTestId('toast')).toHaveText('Run link copied')
  const link = new URL(await page.evaluate(() => navigator.clipboard.readText()))
  expect(link.pathname).toBe('/')
  expect(link.searchParams.get('s')).toBe('7')
})
