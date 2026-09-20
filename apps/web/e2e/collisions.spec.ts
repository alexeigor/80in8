import { expect, test } from '@playwright/test'
import { answerCurrent, beginRun, CLASSIC, MCQ, openHome } from './helpers.js'
import { expectNoCollisions } from './scan.js'

/**
 * Nothing on screen may collide with anything else.
 *
 * The check compares rendered glyph runs rather than element boxes: two stacked blocks
 * always touch at the edges, but two runs of text that touch are something a person
 * sees. It also flags text clipped by its own container.
 *
 * The cases that matter are the extremes. A 320px phone with the browser's text size
 * at 200% is both a real configuration and the one that broke: `clamp()` floors
 * written in `rem` grow with the root font instead of shrinking, and a `1fr` grid
 * column floors at min-content, so one long value pushed the whole grid off-screen.
 */
const HARD = 'hard@1'

test.describe('on this device', () => {
  test('every screen is free of collisions', async ({ page }) => {
    await openHome(page, { profileRef: CLASSIC, mode: 'typed', seed: 7 })
    await expectNoCollisions(page, 'home')
    await page.getByTestId('toggle-advanced').click()
    await page.getByTestId('advanced').waitFor()
    await expectNoCollisions(page, 'home with the advanced panel open')

    await page.getByTestId('start').click()
    await page.getByTestId('countdown').waitFor()
    await expectNoCollisions(page, 'countdown')
    await page.getByTestId('skip-countdown').click()
    await page.getByTestId('question').waitFor()
    await page.keyboard.type('12.5')
    await expectNoCollisions(page, 'a typed run mid-answer')

    await page.keyboard.press('?')
    await page.getByTestId('shortcuts').waitFor()
    await expectNoCollisions(page, 'the shortcuts overlay')
    await page.getByTestId('shortcuts-close').click()

    for (let index = 0; index < 7; index++) await answerCurrent(page, 'typed', index % 2 === 0)
    await page.keyboard.press('Escape')
    await page.getByTestId('abort-confirm').waitFor()
    await expectNoCollisions(page, 'the abort dialog')
    await page.getByTestId('abort-yes').click()
    await page.getByTestId('results').waitFor()
    await expectNoCollisions(page, 'results')
    await page.keyboard.press('r')
    await expectNoCollisions(page, 'results with the review open')

    await page.goto('/history')
    await page.getByTestId('history').waitFor()
    await expectNoCollisions(page, 'history')
    await page.goto('/settings')
    await page.getByTestId('settings').waitFor()
    await expectNoCollisions(page, 'settings')
  })

  test('multiple choice is free of collisions', async ({ page }) => {
    await openHome(page, { profileRef: MCQ, mode: 'mcq', seed: 99 })
    await beginRun(page)
    await expectNoCollisions(page, 'a multiple-choice run')
  })

  /**
   * The scan above compares every element against its own container, so a column
   * scrolled out of an *ancestor* slipped past it: nothing was clipped, the sheet was
   * simply narrower than the table inside it, and the column saying what each key does
   * sat outside `.scroller` until you scrolled sideways. Two claims, then: the far
   * column is always reachable, and wherever the viewport allows `.sheet.wide` its
   * full width, nothing is hidden at all.
   */
  test('the keyboard reference shows every column the viewport has room for', async ({ page }) => {
    await openHome(page)
    // The home screen paints before `App`'s effect attaches the key handler, so a '?'
    // sent the instant `openHome` returns can land on nothing — WebKit is the slowest
    // to attach and loses that race. Retry until the sheet is actually up, pressing
    // only while it is closed so a retry cannot toggle it shut again.
    await expect(async () => {
      if ((await page.getByTestId('shortcuts').count()) === 0) await page.keyboard.press('?')
      await expect(page.getByTestId('shortcuts')).toBeVisible({ timeout: 250 })
    }).toPass({ timeout: 10_000 })

    const layout = await page.evaluate(() => {
      const scroller = document.querySelector<HTMLElement>('[data-testid="shortcuts"] .scroller')
      if (!scroller) throw new Error('the shortcuts sheet has no scroller')
      const sheet = scroller.closest<HTMLElement>('.sheet')
      const far = scroller.querySelector('tbody tr:last-child td:last-child')
      if (!sheet || !far) throw new Error('the shortcuts sheet is not shaped as expected')

      const hidden = scroller.scrollWidth - scroller.clientWidth
      scroller.scrollLeft = scroller.scrollWidth
      const reachable = far.getBoundingClientRect().right <= scroller.getBoundingClientRect().right + 1
      scroller.scrollLeft = 0

      // 'Capped' means the screen, not the stylesheet, is what stops the sheet growing:
      // it already fills the space the overlay gives it. Asking instead whether the
      // sheet is under some nominal width would excuse the very bug this test is for,
      // since a too-narrow sheet is under it too.
      const overlay = sheet.parentElement
      if (!overlay) throw new Error('the sheet is not inside an overlay')
      const pad = getComputedStyle(overlay)
      const available =
        overlay.clientWidth - Number.parseFloat(pad.paddingLeft) - Number.parseFloat(pad.paddingRight)
      return { hidden, reachable, capped: sheet.getBoundingClientRect().width >= available - 1 }
    })

    expect(layout.reachable, 'the last column must be reachable by scrolling').toBe(true)
    if (!layout.capped) {
      expect(layout.hidden, 'no column may be hidden when the sheet fits').toBe(0)
    }
  })
})

test.describe('at 320px, the narrowest phone worth supporting', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 568 })
  })

  test('the longest questions the hard profile can ask still fit', async ({ page }) => {
    await openHome(page, { profileRef: HARD, mode: 'typed', seed: 31_337 })
    await expectNoCollisions(page, '320px home')
    await beginRun(page)
    // Several questions, so four-digit integers, two-place decimals and mixed
    // numbers all get a turn at the widest rendering.
    for (let index = 0; index < 25; index++) {
      await expectNoCollisions(page, `320px hard question ${index + 1}`)
      await answerCurrent(page, 'typed', index % 4 !== 0)
    }
    await page.keyboard.press('Escape')
    await page.getByTestId('abort-yes').click()
    await page.getByTestId('results').waitFor()
    await expectNoCollisions(page, '320px results')
    await page.keyboard.press('r')
    await expectNoCollisions(page, '320px results with the review open')
    await page.goto('/history')
    await page.getByTestId('history').waitFor()
    await expectNoCollisions(page, '320px history')
    await page.goto('/settings')
    await page.getByTestId('settings').waitFor()
    await expectNoCollisions(page, '320px settings')
  })

  test('text at 200% still lays out, as WCAG 1.4.4 requires', async ({ page }) => {
    await openHome(page, { profileRef: HARD, mode: 'mcq', seed: 4242 })
    await page.addStyleTag({ content: 'html { font-size: 200% }' })
    await expectNoCollisions(page, '320px home at 200%')
    await beginRun(page)
    for (let index = 0; index < 12; index++) {
      await expectNoCollisions(page, `320px question ${index + 1} at 200%`)
      await answerCurrent(page, 'mcq', index % 3 !== 0)
    }
    await page.keyboard.press('Escape')
    await page.getByTestId('abort-yes').click()
    await page.getByTestId('results').waitFor()
    await expectNoCollisions(page, '320px results at 200%')
    await page.goto('/settings')
    await page.getByTestId('settings').waitFor()
    await page.addStyleTag({ content: 'html { font-size: 200% }' })
    await expectNoCollisions(page, '320px settings at 200%')
  })

  test('the typed keypad at 200% keeps its keys apart', async ({ page }) => {
    await openHome(page, { profileRef: HARD, mode: 'typed', seed: 11 })
    await page.addStyleTag({ content: 'html { font-size: 200% }' })
    await beginRun(page)
    await page.keyboard.type('123.45')
    await expectNoCollisions(page, '320px keypad at 200%')
  })
})
