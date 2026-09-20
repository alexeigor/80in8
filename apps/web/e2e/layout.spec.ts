import { expect, test } from '@playwright/test'
import { beginRun, CLASSIC, MCQ, openHome } from './helpers.js'
import { expectNoCollisions, fitMetrics } from './scan.js'

/**
 * Layouts the device projects do not reach on their own: a phone turned sideways,
 * and the home screen's touch targets. The run screen's targets are checked in
 * `rendering.spec.ts`; N5 asks for 44×44 CSS px everywhere.
 */

test('the home screen has nothing too small to hit', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByTestId('home')).toBeVisible()
  const metrics = await fitMetrics(page)
  expect(metrics.tooSmall, 'controls under 44×44 CSS px on the home screen').toEqual([])
  expect(metrics.horizontal).toBeLessThanOrEqual(0)
})

test.describe('a phone in landscape', () => {
  test.skip(({ isMobile }) => !isMobile, 'the landscape layout only applies to phones')

  test.beforeEach(async ({ page }) => {
    const portrait = page.viewportSize()
    if (!portrait) throw new Error('phone projects have a viewport')
    // The stylesheet switches on `(orientation: landscape) and (max-height: 520px)`,
    // so turning the device's own viewport sideways is what exercises that branch.
    await page.setViewportSize({ width: portrait.height, height: portrait.width })
  })

  test('the home screen fits', async ({ page }) => {
    await openHome(page, { profileRef: CLASSIC, mode: 'typed', seed: 7 })
    await expectNoCollisions(page, 'landscape home')
    expect((await fitMetrics(page)).horizontal).toBeLessThanOrEqual(0)
  })

  test('a typed run fits with the whole keypad on screen', async ({ page }) => {
    await openHome(page, { profileRef: CLASSIC, mode: 'typed', seed: 7 })
    await beginRun(page)
    await page.keyboard.type('12.5')
    await expectNoCollisions(page, 'landscape typed run')
    const metrics = await fitMetrics(page)
    expect(metrics.horizontal).toBeLessThanOrEqual(0)
    expect(metrics.vertical, 'the run screen must not scroll').toBeLessThanOrEqual(0)
    expect(metrics.offBottom, 'buttons below the viewport').toEqual([])
    expect(metrics.tooSmall).toEqual([])
    await expect(page.getByTestId('key-submit')).toBeInViewport({ ratio: 1 })
  })

  test('a multiple-choice run fits with every option on screen', async ({ page }) => {
    await openHome(page, { profileRef: MCQ, mode: 'mcq', seed: 99 })
    await beginRun(page)
    await expectNoCollisions(page, 'landscape multiple-choice run')
    const metrics = await fitMetrics(page)
    expect(metrics.horizontal).toBeLessThanOrEqual(0)
    expect(metrics.vertical).toBeLessThanOrEqual(0)
    expect(metrics.offBottom).toEqual([])
    for (let index = 0; index < 4; index++) {
      await expect(page.getByTestId(`option-${index}`)).toBeInViewport({ ratio: 1 })
    }
  })
})
