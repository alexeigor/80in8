import { expect, test } from '@playwright/test'
import { abortAfter, beginRun, CLASSIC, MCQ, openHome } from './helpers.js'

/**
 * F7: the id *is* the question. Opening `/q/<id>` in a browser that has never seen the
 * run must reproduce the same question and, in multiple choice, the same four options
 * in the same order — otherwise sharing a question would be sharing a different one.
 */
test.describe('question identity', () => {
  test('a shared question link reproduces the question and its options exactly', async ({
    page,
    browser,
    baseURL,
  }) => {
    await openHome(page, { profileRef: MCQ, mode: 'mcq', seed: 31_337 })
    await beginRun(page)

    const id = await page.getByTestId('question').getAttribute('data-question-id')
    const optionsBefore = await page
      .getByTestId('mcq-grid')
      .locator('[data-option-text]')
      .evaluateAll((nodes) => nodes.map((node) => (node as HTMLElement).dataset.optionText))

    await abortAfter(page, 'mcq', 1)

    // The review offers the link; the id it carries is what the link is made of.
    await page.keyboard.press('r')
    await expect(page.getByTestId('review-row-0')).toHaveAttribute('data-question-id', id ?? '')
    await page.getByTestId('copy-link-0').click()
    await expect(page.getByTestId('toast')).toBeVisible()

    // A context that has never seen this run: no history, no stored profiles.
    const fresh = await browser.newContext(baseURL === undefined ? {} : { baseURL })
    const other = await fresh.newPage()
    await other.goto(`/q/${id}`)

    await expect(other.getByTestId('question')).toHaveAttribute('data-question-id', id ?? '')
    const optionsAfter = await other
      .getByTestId('mcq-grid')
      .locator('[data-option-text]')
      .evaluateAll((nodes) => nodes.map((node) => (node as HTMLElement).dataset.optionText))
    expect(optionsAfter).toEqual(optionsBefore)

    // A single question is untimed: there is a clock, but it counts up.
    await expect(other.getByTestId('timer')).toHaveAttribute('data-untimed', 'true')
    await expect(other.getByTestId('counter')).toHaveText('1/1')

    await fresh.close()
  })

  test('a seeded run link reproduces the same sequence for someone else', async ({
    page,
    browser,
    baseURL,
  }) => {
    await openHome(page, { profileRef: CLASSIC, mode: 'typed', seed: 8_675_309 })
    await beginRun(page)
    const first = await page.getByTestId('question').getAttribute('data-question-id')

    const fresh = await browser.newContext(baseURL === undefined ? {} : { baseURL })
    const other = await fresh.newPage()
    await openHome(other, { profileRef: CLASSIC, mode: 'typed', seed: 8_675_309 })
    await beginRun(other)

    await expect(other.getByTestId('question')).toHaveAttribute('data-question-id', first ?? '')
    await fresh.close()
  })

  test('a nonsense id is reported, not guessed at', async ({ page }) => {
    await page.goto('/q/not-an-id')
    await expect(page.getByTestId('question-error')).toBeVisible()
  })
})
