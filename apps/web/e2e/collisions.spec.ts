import { expect, type Page, test } from '@playwright/test'
import { answerCurrent, beginRun, CLASSIC, MCQ, openHome } from './helpers.js'

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
async function scan(page: Page, label: string): Promise<string[]> {
  const hits = await page.evaluate(() => {
    const overlay = document.querySelector('[role="dialog"], .overlay')
    const layerOf = (el: Element) => (overlay?.contains(el) ? 'modal' : 'page')
    const shown = (el: Element) => {
      if (el.closest('.sr-only')) return false
      for (let e: Element | null = el; e; e = e.parentElement) {
        const s = getComputedStyle(e)
        if (s.display === 'none' || s.visibility === 'hidden' || Number(s.opacity) === 0) return false
      }
      return true
    }

    // Compare the ink, not the boxes. Two stacked blocks always touch; two runs of
    // glyphs that touch are a visual collision.
    type Ink = { r: DOMRect; el: Element; text: string }
    const ink: Ink[] = []
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      const text = (n.textContent ?? '').trim()
      const el = n.parentElement
      if (!text || !el || !shown(el)) continue
      const range = document.createRange()
      range.selectNodeContents(n)
      for (const r of [...range.getClientRects()]) {
        if (r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < window.innerHeight) {
          ink.push({ r, el, text })
        }
      }
    }

    const name = (i: Ink) =>
      `${i.el.tagName.toLowerCase()}${i.el.getAttribute('data-testid') ? `[${i.el.getAttribute('data-testid')}]` : ''}"${i.text.slice(0, 16)}"`

    const out: string[] = []
    for (let i = 0; i < ink.length; i++) {
      const a = ink[i]
      if (!a) continue
      for (let j = i + 1; j < ink.length; j++) {
        const b = ink[j]
        if (!b) continue
        if (a.el === b.el || a.el.contains(b.el) || b.el.contains(a.el)) continue
        if (layerOf(a.el) !== layerOf(b.el)) continue
        const ox = Math.min(a.r.right, b.r.right) - Math.max(a.r.left, b.r.left)
        const oy = Math.min(a.r.bottom, b.r.bottom) - Math.max(a.r.top, b.r.top)
        if (ox > 0.5 && oy > 0.5) {
          out.push(`GLYPHS OVERLAP ${Math.round(ox)}x${Math.round(oy)}  ${name(a)}  ><  ${name(b)}`)
        } else if (oy > 2 && ox > -4 && ox <= 0.5) {
          out.push(`GLYPHS ${(-ox).toFixed(1)}px APART  ${name(a)}  |  ${name(b)}`)
        }
      }
    }

    // Text clipped by its own container.
    for (const el of document.querySelectorAll('body *')) {
      if (!shown(el)) continue
      const s = getComputedStyle(el)
      if (s.overflow === 'visible' || s.overflowX === 'auto' || s.overflowX === 'scroll') continue
      if (el.scrollWidth > el.clientWidth + 1 && (el.textContent ?? '').trim())
        out.push(
          `CLIPPED ${el.scrollWidth - el.clientWidth}px  ${el.tagName.toLowerCase()}"${(el.textContent ?? '').trim().slice(0, 20)}"`,
        )
    }
    return out
  })
  void label
  return [...new Set(hits)]
}

/** Fails the test if the page reported anything, with the detail in the message. */
async function expectNoCollisions(page: Page, label: string): Promise<void> {
  const hits = await scan(page, label)
  expect(hits, `${label}:\n${hits.join('\n')}`).toEqual([])
}

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
