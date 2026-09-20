import { expect, type Page, test } from '@playwright/test'
import { beginRun, openHome } from './helpers.js'

async function shareRun(page: Page, pace: 'timed' | 'extended') {
  await openHome(page)
  await page.getByTestId('toggle-advanced').click()
  await page.getByTestId('count').fill('3')
  await page.getByTestId('pace').selectOption(pace)
  await beginRun(page)
  const id = await page.getByTestId('question').getAttribute('data-question-id')
  const display = await page.getByTestId('question').innerText()
  await page.keyboard.press('1')
  await page.keyboard.press('Enter')
  await page.keyboard.press('Escape')
  await expect(page.getByTestId('results')).toBeVisible()
  await page.getByTestId('share-run').click()
  await expect(page.getByTestId('toast')).toContainText('pf=')
  const link = await page.getByTestId('toast').innerText()
  return { link, id: id ?? '', display }
}

test.beforeEach(async ({ page }) => {
  // Exercise the real generated link and the clipboard-denied fallback on every
  // browser, without relying on OS clipboard permissions or private app state.
  await page.addInitScript(() =>
    Object.defineProperty(navigator, 'clipboard', {
      value: {
        writeText: async () => {
          throw new DOMException('Denied', 'NotAllowedError')
        },
      },
    }),
  )
})

for (const previouslyKnown of [false, true]) {
  test(`a shared custom run preserves its timing and questions, known=${previouslyKnown}`, async ({
    page,
    browser,
  }) => {
    const timed = await shareRun(page, 'timed')
    const extended = await shareRun(page, 'extended')
    expect(new URL(timed.link).searchParams.get('p')).toBe(new URL(extended.link).searchParams.get('p'))
    const recipient = await browser.newContext()
    try {
      const other = await recipient.newPage()
      if (previouslyKnown) {
        await other.goto(timed.link)
        await beginRun(other)
        await expect(other.getByTestId('timer')).toHaveText('8:00')
        await other.keyboard.press('Escape')
      }
      await other.goto(extended.link)
      await expect(other.getByTestId('disclosure')).toContainText('3 questions · 80:00')
      await beginRun(other)
      await expect(other.getByTestId('question')).toHaveAttribute('data-question-id', extended.id)
      await expect(other.getByTestId('question')).toHaveText(extended.display, { useInnerText: true })
      await expect(other.getByTestId('timer')).toHaveText('80:00')
    } finally {
      await recipient.close()
    }
  })
}

test('custom question links carry their profile and reject missing or altered payloads', async ({
  page,
  browser,
}) => {
  const shared = await shareRun(page, 'extended')
  await page.getByTestId('toggle-review').click()
  await page.getByTestId('copy-link-0').click()
  await expect(page.getByTestId('toast')).toContainText('/q/')
  const link = new URL(await page.getByTestId('toast').innerText())
  const payload = link.searchParams.get('pf')
  if (!payload) throw new Error('missing custom profile in shared question')
  const altered = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'))
  altered.integer.addSub = [1, 2]
  for (const variant of [
    payload,
    null,
    'not-base64',
    Buffer.from(JSON.stringify(altered)).toString('base64url'),
  ]) {
    const recipient = await browser.newContext()
    try {
      const other = await recipient.newPage()
      const url = new URL(link)
      if (variant === null) url.searchParams.delete('pf')
      else url.searchParams.set('pf', variant)
      await other.goto(url.toString())
      if (variant === payload) {
        await expect(other.getByTestId('question')).toHaveAttribute('data-question-id', shared.id)
        await expect(other.getByTestId('question')).toHaveText(shared.display, { useInnerText: true })
        await expect(other.getByTestId('timer')).toHaveAttribute('data-untimed', 'true')
      } else {
        await expect(other.getByTestId('question-unavailable')).toBeVisible()
        await expect(other.getByTestId('question')).toHaveCount(0)
      }
    } finally {
      await recipient.close()
    }
  }
})
