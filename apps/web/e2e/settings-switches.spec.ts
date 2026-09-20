import { expect, test } from '@playwright/test'

test('settings switches have stable names and support label clicks, Space and Enter', async ({ page }) => {
  await page.goto('/settings')
  await expect(page.getByRole('switch')).toHaveCount(8)
  const feedback = page.getByRole('switch', { name: 'Answer feedback', exact: true })
  await expect(feedback).toBeChecked()
  await expect(feedback).toHaveAccessibleDescription('A ✓ or ✗ in the top bar. Turn off for exam realism.')

  await page.getByText('Answer feedback', { exact: true }).click()
  await expect(feedback).not.toBeChecked()
  await feedback.focus()
  await page.keyboard.press('Space')
  await expect(feedback).toBeChecked()
  await page.keyboard.press('Enter')
  await expect(feedback).not.toBeChecked()
  await expect(feedback).toBeFocused()
  await page.reload()
  await expect(feedback).not.toBeChecked()
})

test('all switches work by touch or click and preserve their values after reload', async ({
  page,
  isMobile,
}) => {
  await page.goto('/settings')
  await page.getByTestId('setting-profile').selectOption('zetamac-drill@1')
  const expected = new Map<string, boolean>()
  for (const control of await page.getByRole('switch').all()) {
    const name = await control.getAttribute('data-testid')
    if (!name) throw new Error('switch missing test id')
    const checked = await control.isChecked()
    if (isMobile) await control.tap()
    else await control.click()
    await expect(control).toBeChecked({ checked: !checked })
    expected.set(name, !checked)
  }
  await page.reload()
  for (const [name, checked] of expected) await expect(page.getByTestId(name)).toBeChecked({ checked })
})

test('unavailable auto-submit remains disabled until a compatible profile is selected', async ({ page }) => {
  await page.goto('/settings')
  const auto = page.getByRole('switch', { name: 'Auto-submit', exact: true })
  await expect(auto).toBeDisabled()
  // Attempt the click even though Playwright correctly recognises the label's
  // associated control as disabled. The browser must still leave it unchanged.
  await page.getByText('Auto-submit', { exact: true }).click({ force: true })
  await expect(auto).not.toBeChecked()
  await page.getByTestId('setting-profile').selectOption('zetamac-drill@1')
  await expect(auto).toBeEnabled()
  await auto.click()
  await expect(auto).toBeChecked()
  await page.getByTestId('setting-profile').selectOption('optiver-classic@1')
  await expect(auto).toBeDisabled()
  await page.getByText('Auto-submit', { exact: true }).click({ force: true })
  await expect(auto).toBeChecked()
})

for (const theme of ['dark', 'light']) {
  for (const scale of [100, 200]) {
    test(`switches stay beside their labels at 320px, ${theme}, ${scale}% text`, async ({
      page,
    }, testInfo) => {
      await page.setViewportSize({ width: 320, height: 740 })
      await page.goto('/settings')
      await page.getByTestId('setting-theme').selectOption(theme)
      if (scale !== 100) await page.addStyleTag({ content: `html { font-size: ${scale}% }` })
      const rows = await page.getByRole('switch').evaluateAll((switches) =>
        switches.map((control) => {
          const row = control.closest('label')
          const text = row?.querySelector('.setting-toggle-copy')
          if (!row || !text) throw new Error('switch missing its visible label')
          const button = control.getBoundingClientRect()
          const label = text.getBoundingClientRect()
          return {
            name: text.textContent,
            width: button.width,
            height: button.height,
            right: button.right,
            top: button.top,
            labelTop: label.top,
            labelRight: label.right,
          }
        }),
      )
      for (const row of rows) {
        expect(row.width, String(row.name)).toBeGreaterThanOrEqual(44)
        expect(row.height, String(row.name)).toBeGreaterThanOrEqual(44)
        expect(row.labelRight, String(row.name)).toBeLessThanOrEqual(row.right - row.width - 12)
        expect(Math.abs(row.top - row.labelTop), String(row.name)).toBeLessThanOrEqual(8)
        expect(row.right, String(row.name)).toBe(rows[0]?.right)
      }
      const overflow = await page.evaluate(() => ({
        width: document.documentElement.scrollWidth - window.innerWidth,
        elements: [...document.querySelectorAll('body *')]
          .filter(
            (element) =>
              element.getBoundingClientRect().right > window.innerWidth + 1 ||
              element.scrollWidth > element.clientWidth + 1,
          )
          .map((element) => ({
            tag: element.tagName,
            class: element.className,
            text: element.textContent?.slice(0, 50),
            width: element.clientWidth,
            scroll: element.scrollWidth,
            x: element.getBoundingClientRect().left,
          })),
      }))
      expect(overflow.width, JSON.stringify(overflow.elements)).toBeLessThanOrEqual(1)
      await page.getByRole('group', { name: 'During a run', exact: true }).screenshot({
        path: testInfo.outputPath(`switches-${theme}-${scale}.png`),
        animations: 'disabled',
      })
    })
  }
}
