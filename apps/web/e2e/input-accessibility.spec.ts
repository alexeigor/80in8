import { expect, test } from '@playwright/test'
import { answerCurrent, beginRun, currentQuestion, openHome, typeableAnswer } from './helpers.js'

for (const [profileRef, enabled, auto] of [
  ['zetamac-drill@1', true, true],
  ['zetamac-drill@1', false, false],
  ['optiver-classic@1', true, false],
] as const) {
  test(`auto-submit profile=${profileRef}, enabled=${enabled}`, async ({ page }) => {
    await page.goto('/settings')
    await page.getByTestId('setting-profile').selectOption('zetamac-drill@1')
    if (enabled) await page.getByTestId('toggle-autoSubmit').click()
    await openHome(page, { profileRef })
    await beginRun(page)
    const question = await currentQuestion(page)
    await page.keyboard.type(typeableAnswer(question))
    if (!auto) {
      await expect(page.getByTestId('question')).toHaveAttribute('data-question-id', question.id)
      await page.keyboard.press('Enter')
    }
    await expect(page.getByTestId('question')).not.toHaveAttribute('data-question-id', question.id)
    await page.keyboard.press('Escape')
    await expect(page.getByTestId('score')).toHaveText('1')
  })
}

test('native text input preserves pasted minus signs and decimal commas', async ({ page }) => {
  await openHome(page)
  await beginRun(page)
  const input = page.getByTestId('typed-input')
  // insertText goes through the browser's text-input path rather than the app's
  // keydown editor, like paste/dictation. No clipboard permissions are needed.
  await input.focus()
  await page.keyboard.insertText('−0,5')
  await expect(page.getByTestId('parse-hint')).toHaveText('= −0.5')
  await page.keyboard.press('Enter')
  await expect(page.getByTestId('counter')).toHaveText('2/80')
  await page.keyboard.press('Escape')
  await page.getByTestId('toggle-review').click()
  await expect(page.getByTestId('review-row-0')).toContainText('you: -0,5')
})

test('a short run can be completed using only the on-screen keypad', async ({ page, isMobile }) => {
  const press = async (id: string) => {
    const key = page.getByTestId(id)
    if (isMobile) await key.tap()
    else await key.click()
  }
  await page.goto('/settings')
  const toggle = page.getByTestId('toggle-keypad')
  if (!(await toggle.isChecked())) await toggle.click()
  await openHome(page)
  await page.getByTestId('toggle-advanced').click()
  await page.getByTestId('count').fill('3')
  await beginRun(page)
  for (let index = 0; index < 3; index++) {
    await press('key-minus')
    await press('key-1')
    await press('key-dot')
    await press('key-5')
    await expect(page.getByTestId('typed-input')).toHaveValue('-1.5')
    await press('key-back')
    await press('key-2')
    await expect(page.getByTestId('typed-input')).toHaveValue('-1.2')
    await press('key-submit')
  }
  await expect(page.getByTestId('answered')).toHaveText('3/3')
  await expect(page.getByTestId('ended-by')).toHaveText('completed')
})

test('shortcuts trap focus and restore it when dismissed', async ({ page }) => {
  await openHome(page)
  const start = page.getByTestId('start')
  await start.focus()
  await page.keyboard.press('?')
  const close = page.getByTestId('shortcuts-close')
  await expect(close).toBeFocused()
  await page.keyboard.press('Tab')
  await expect(close).toBeFocused()
  await page.keyboard.press('Shift+Tab')
  await expect(close).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(page.getByTestId('shortcuts')).toHaveCount(0)
  await expect(start).toBeFocused()
})

test('abort confirmation traps focus and Enter activates the focused choice', async ({ page }) => {
  await openHome(page)
  await beginRun(page)
  for (let index = 0; index < 6; index++) await answerCurrent(page, 'typed')
  const input = page.getByTestId('typed-input')
  await input.focus()
  await page.keyboard.press('Escape')
  await expect(page.getByTestId('abort-no')).toBeFocused()
  await page.keyboard.press('Tab')
  await expect(page.getByTestId('abort-yes')).toBeFocused()
  await page.keyboard.press('Tab')
  await expect(page.getByTestId('abort-no')).toBeFocused()
  await page.keyboard.press('Shift+Tab')
  await expect(page.getByTestId('abort-yes')).toBeFocused()
  await page.keyboard.press('Shift+Tab')
  await expect(page.getByTestId('abort-no')).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(page.getByTestId('abort-confirm')).toHaveCount(0)
  await expect(page.getByTestId('question')).toBeVisible()
  await expect(input).toBeFocused()
  await page.keyboard.press('Escape')
  await page.keyboard.press('Escape')
  await expect(input).toBeFocused()
  await page.keyboard.press('Escape')
  await page.keyboard.press('Tab')
  await page.keyboard.press('Enter')
  await expect(page.getByTestId('results')).toBeVisible()
  await expect(page.getByTestId('answered')).toHaveText('6/80')
})
