import { expect, test } from '@playwright/test'
import { beginRun, openHome } from './helpers.js'

test('a fresh device offers touch keys on phones and a keypad control on desktops', async ({
  page,
  isMobile,
}, testInfo) => {
  await page.setViewportSize({ width: 320, height: 568 })
  await openHome(page)
  await beginRun(page)
  await page.screenshot({ path: testInfo.outputPath('typed-run.png'), animations: 'disabled' })
  if (isMobile) {
    await expect(page.getByTestId('keypad')).toBeVisible()
    for (const key of await page.getByTestId('keypad').getByRole('button').all()) {
      await expect(key).toBeInViewport({ ratio: 1 })
    }
  } else {
    await expect(page.getByRole('button', { name: 'Show keypad' })).toBeVisible()
    await expect(page.getByTestId('keypad')).toHaveCount(0)
  }
})

for (const detection of ['any-pointer', 'touch-points'] as const) {
  test(`a touch device with a fine primary pointer gets a keypad via ${detection}`, async ({ page }) => {
    await page.addInitScript((detection) => {
      const original = window.matchMedia.bind(window)
      window.matchMedia = (query) => {
        const result = original(query)
        if (query === '(pointer: coarse)' || query === '(any-pointer: coarse)') {
          Object.defineProperty(result, 'matches', {
            value: query === '(any-pointer: coarse)' && detection === 'any-pointer',
          })
        }
        return result
      }
      Object.defineProperty(navigator, 'maxTouchPoints', { value: detection === 'touch-points' ? 1 : 0 })
    }, detection)
    await openHome(page)
    await beginRun(page)
    await expect(page.getByTestId('keypad')).toBeVisible()
    await expect(page.getByTestId('show-keypad')).toHaveCount(0)
  })
}

test('a saved hidden keypad can be shown mid-run by touch and stays enabled', async ({ page, isMobile }) => {
  await page.goto('/settings')
  const toggle = page.getByRole('switch', { name: 'On-screen keypad', exact: true })
  if (await toggle.isChecked()) await toggle.click()
  await openHome(page)
  await beginRun(page)
  await expect(page.getByTestId('keypad')).toHaveCount(0)
  const question = await page.getByTestId('question').getAttribute('data-question-id')
  if (!question) throw new Error('missing question')
  const press = async (id: string) => {
    const control = page.getByTestId(id)
    if (isMobile) await control.tap()
    else await control.click()
  }
  await press('show-keypad')
  await expect(page.getByTestId('keypad')).toBeVisible()
  await expect(page.getByTestId('question')).toHaveAttribute('data-question-id', question)
  await expect(page.getByTestId('counter')).toHaveText('1/80')
  await press('key-1')
  await press('key-2')
  await expect(page.getByTestId('typed-input')).toHaveValue('12')
  await press('key-submit')
  await expect(page.getByTestId('counter')).toHaveText('2/80')
  await page.getByTestId('abort').click()
  await page.goto('/settings')
  await page.reload()
  await expect(toggle).toBeChecked()
})

for (const activation of ['Enter', 'Space']) {
  test(`${activation} on Show keypad preserves the answer and restores input focus`, async ({ page }) => {
    await page.goto('/settings')
    const toggle = page.getByRole('switch', { name: 'On-screen keypad', exact: true })
    if (await toggle.isChecked()) await toggle.click()
    await openHome(page)
    await beginRun(page)
    await page.keyboard.type('12')
    await page.getByTestId('show-keypad').focus()
    await page.keyboard.press(activation)
    await expect(page.getByTestId('keypad')).toBeVisible()
    await expect(page.getByTestId('counter')).toHaveText('1/80')
    await expect(page.getByTestId('typed-input')).toHaveValue('12')
    await expect(page.getByTestId('typed-input')).toBeFocused()
  })
}
