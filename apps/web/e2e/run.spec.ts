import { resolvePreset } from '@80in8/core'
import { expect, test } from '@playwright/test'
import {
  abortAfter,
  answerCurrent,
  beginRun,
  CLASSIC,
  completeRun,
  MCQ,
  openHome,
  STRICT,
} from './helpers.js'

test.describe('a whole run', () => {
  test('typed: 80 correct answers score what the profile says they should', async ({ page }) => {
    await openHome(page, { profileRef: CLASSIC, mode: 'typed', seed: 20_240_101 })
    await beginRun(page)

    const asked = await completeRun(page, 'typed')

    const profile = resolvePreset(CLASSIC)
    if (!profile) throw new Error('preset missing')
    expect(asked).toHaveLength(profile.questionCount)
    // Every id in the run is distinct, which is what makes per-question stats work.
    expect(new Set(asked.map((q) => q.id)).size).toBe(asked.length)

    await expect(page.getByTestId('score')).toHaveText(String(asked.length * profile.scoring.correct))
    await expect(page.getByTestId('ended-by')).toHaveText('completed')
    await expect(page.getByTestId('accuracy')).toHaveText('100%')
    await expect(page.getByTestId('band')).toHaveText('Competitive')
  })

  test('multiple choice: selecting the correct option advances and scores', async ({ page, isMobile }) => {
    await openHome(page, { profileRef: MCQ, mode: 'mcq', seed: 7 })
    await beginRun(page)

    if (isMobile) {
      // Touch selection has to work exactly like the keyboard, including the advance.
      const first = await page.getByTestId('question').getAttribute('data-question-id')
      await page.getByTestId('option-0').tap()
      await expect(page.getByTestId('question')).not.toHaveAttribute('data-question-id', first ?? '')
    }

    await completeRun(page, 'mcq')
    await expect(page.getByTestId('results')).toBeVisible()
    await expect(page.getByTestId('ended-by')).toHaveText('completed')
  })

  test('a wrong answer costs a point and shows up in the review', async ({ page }) => {
    await openHome(page, { profileRef: CLASSIC, mode: 'typed', seed: 55 })
    await beginRun(page)

    await answerCurrent(page, 'typed', false)
    await answerCurrent(page, 'typed', true)
    await page.keyboard.press('Escape')

    await expect(page.getByTestId('results')).toBeVisible()
    await expect(page.getByTestId('score')).toHaveText('0')
    await page.keyboard.press('r')
    await expect(page.getByTestId('review-row-0')).toHaveAttribute('data-correct', 'false')
    await expect(page.getByTestId('review-row-1')).toHaveAttribute('data-correct', 'true')
  })

  test('skipping is refused by the strict profile and allowed by the classic one', async ({ page }) => {
    await openHome(page, { profileRef: STRICT, mode: 'typed', seed: 3 })
    await beginRun(page)
    await expect(page.getByTestId('counter')).toHaveText('1/80')
    await page.keyboard.press('ArrowRight')
    await expect(page.getByTestId('counter')).toHaveText('1/80')

    await openHome(page, { profileRef: CLASSIC, mode: 'typed', seed: 3 })
    await beginRun(page)
    await page.keyboard.press('ArrowRight')
    await expect(page.getByTestId('counter')).toHaveText('2/80')
  })

  test('Space is the mixed-number separator and never a skip', async ({ page }) => {
    await openHome(page, { profileRef: CLASSIC, mode: 'typed', seed: 11 })
    await beginRun(page)

    await page.keyboard.press('2')
    await page.keyboard.press('Space')
    await page.keyboard.press('1')
    await page.keyboard.press('Slash')
    await page.keyboard.press('4')

    await expect(page.getByTestId('typed-input')).toHaveValue('2 1/4')
    await expect(page.getByTestId('counter')).toHaveText('1/80')
  })

  test('aborting after a handful of answers asks first', async ({ page }) => {
    await openHome(page, { profileRef: CLASSIC, mode: 'typed', seed: 8 })
    await beginRun(page)
    for (let index = 0; index < 6; index++) await answerCurrent(page, 'typed')

    await page.keyboard.press('Escape')
    await expect(page.getByTestId('abort-confirm')).toBeVisible()
    await page.getByTestId('abort-no').click()
    await expect(page.getByTestId('question')).toBeVisible()

    await page.keyboard.press('Escape')
    await page.getByTestId('abort-yes').click()
    await expect(page.getByTestId('results')).toBeVisible()
    await expect(page.getByTestId('ended-by')).toHaveText('aborted')
  })

  test('the keyboard reference is one key away', async ({ page }) => {
    await openHome(page)
    await page.keyboard.press('?')
    await expect(page.getByTestId('shortcuts')).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(page.getByTestId('shortcuts')).toBeHidden()
  })

  test('an aborted run keeps the questions that were answered', async ({ page }) => {
    await openHome(page, { profileRef: CLASSIC, mode: 'typed', seed: 99 })
    await beginRun(page)
    const asked = await abortAfter(page, 'typed', 3)
    await expect(page.getByTestId('answered')).toHaveText(`${asked.length}/80`)
  })
})

test.describe('interruptions', () => {
  test('the browser Back button during a run is not a silent exit', async ({ page }) => {
    await openHome(page, { profileRef: CLASSIC, mode: 'typed', seed: 12 })
    await beginRun(page)
    for (let index = 0; index < 6; index++) await answerCurrent(page, 'typed')

    await page.goBack()
    await expect(page.getByTestId('abort-confirm')).toBeVisible()
    await page.getByTestId('abort-yes').click()
    await expect(page.getByTestId('results')).toBeVisible()
  })

  test('a reload mid-run closes the run out rather than losing it', async ({ page }) => {
    await openHome(page, { profileRef: CLASSIC, mode: 'typed', seed: 13 })
    await beginRun(page)
    await answerCurrent(page, 'typed')
    await answerCurrent(page, 'typed')

    await page.reload()

    await expect(page.getByTestId('results')).toBeVisible()
    await expect(page.getByTestId('recovered')).toBeVisible()
    await expect(page.getByTestId('answered')).toHaveText('2/80')
  })
})

test.describe('the question id on screen', () => {
  test('names the question being asked, and can be selected in one click', async ({ page }) => {
    await openHome(page, { profileRef: CLASSIC, mode: 'typed', seed: 7 })
    await beginRun(page)

    const shown = page.getByTestId('question-id')
    await expect(shown).toBeVisible()

    // It must be the id of the question actually on screen, not a stale one.
    const first = await page.getByTestId('question').getAttribute('data-question-id')
    await expect(shown).toHaveText(new RegExp(first?.replace(/[.@]/g, '\\$&') ?? ''))

    // And it must follow the run from question to question.
    await answerCurrent(page, 'typed')
    const second = await page.getByTestId('question').getAttribute('data-question-id')
    expect(second).not.toBe(first)
    await expect(shown).toContainText(second ?? '')

    // One click takes the whole string, and takes only the id: the screen-reader
    // label sits outside the selectable element so it cannot end up on the clipboard.
    await expect(shown).toHaveCSS('user-select', 'all')
    expect((await shown.innerText()).trim()).toBe(second)
  })

  test('regenerates the very question it names', async ({ page }) => {
    await openHome(page, { profileRef: CLASSIC, mode: 'typed', seed: 7 })
    await beginRun(page)
    const shown = (await page.getByTestId('question-id').innerText()).trim()
    const display = await page
      .getByTestId('question')
      .evaluate((el) => (el.querySelector('span')?.textContent ?? '').replace(/\s+/g, ' ').trim())

    // Opening the id on its own must bring back the same question, which is the whole
    // point of showing it: it is a handle on this exact problem, not a label.
    await page.goto(`/q/${encodeURIComponent(shown)}`)
    await expect(page.getByTestId('question')).toHaveAttribute('data-question-id', shown)
    const again = await page
      .getByTestId('question')
      .evaluate((el) => (el.querySelector('span')?.textContent ?? '').replace(/\s+/g, ' ').trim())
    expect(again).toBe(display)
  })
})
