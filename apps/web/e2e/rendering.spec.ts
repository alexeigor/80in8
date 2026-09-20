import { expect, test } from '@playwright/test'
import { answerCurrent, beginRun, CLASSIC, MCQ, openHome } from './helpers.js'

/**
 * Checks on what actually reaches the screen, as opposed to what the markup says.
 *
 * These exist because the CSS cascade and asynchronous storage both fail quietly: a
 * component rule can be outranked by a base rule and simply not apply, and a write
 * can be abandoned by a navigation. Neither shows up in a unit test.
 */

test.describe('the answer field', () => {
  test('is rendered at the size and in the face it is styled for', async ({ page }) => {
    await openHome(page, { profileRef: CLASSIC, mode: 'typed', seed: 7 })
    await beginRun(page)

    const style = await page.getByTestId('typed-input').evaluate((el) => {
      const s = getComputedStyle(el)
      return { size: Number.parseFloat(s.fontSize), family: s.fontFamily.toLowerCase() }
    })
    // The base `input[type="text"]` rule carries an attribute selector, so it outranks
    // a plain class and once reset this field to 16px system font without a trace.
    expect(style.size).toBeGreaterThanOrEqual(18)
    expect(style.family).toMatch(/mono/)

    // It must also read as part of the same composition as the question above it.
    const question = await page
      .getByTestId('question')
      .evaluate((el) => getComputedStyle(el).fontFamily.toLowerCase())
    expect(question).toMatch(/mono/)
  })

  test('never drops below the size that makes iOS zoom the page', async ({ page }) => {
    await openHome(page, { profileRef: CLASSIC, mode: 'typed', seed: 7 })
    const sizes = await page.evaluate(() =>
      [...document.querySelectorAll('input, select, textarea')].map((el) =>
        Number.parseFloat(getComputedStyle(el).fontSize),
      ),
    )
    for (const size of sizes) expect(size).toBeGreaterThanOrEqual(16)
  })
})

test.describe('layout on the device it is running on', () => {
  test('a run fits the viewport with nothing clipped and nothing too small to hit', async ({ page }) => {
    await openHome(page, { profileRef: CLASSIC, mode: 'typed', seed: 7 })
    await beginRun(page)

    const metrics = await page.evaluate(() => {
      const root = document.documentElement
      const tooSmall = [...document.querySelectorAll('button, a, select, input')]
        .map((el) => ({ el, r: el.getBoundingClientRect() }))
        .filter(({ r }) => r.width > 0 && r.height > 0 && (r.width < 44 || r.height < 44))
        .map(
          ({ el, r }) =>
            `${el.tagName} "${(el.textContent ?? '').trim().slice(0, 10)}" ${Math.round(r.width)}x${Math.round(r.height)}`,
        )
      const offBottom = [...document.querySelectorAll('button')]
        .map((el) => el.getBoundingClientRect())
        .filter((r) => r.height > 0 && r.bottom > window.innerHeight + 1).length
      return {
        horizontal: root.scrollWidth - root.clientWidth,
        vertical: root.scrollHeight - window.innerHeight,
        tooSmall,
        offBottom,
      }
    })

    expect(metrics.horizontal).toBeLessThanOrEqual(0)
    expect(metrics.vertical).toBeLessThanOrEqual(0)
    expect(metrics.tooSmall).toEqual([])
    expect(metrics.offBottom).toBe(0)
  })

  test('the multiple-choice options are comfortably tappable', async ({ page }) => {
    await openHome(page, { profileRef: MCQ, mode: 'mcq', seed: 99 })
    await beginRun(page)
    for (let index = 0; index < 4; index++) {
      const box = await page.getByTestId(`option-${index}`).boundingBox()
      expect(box).not.toBeNull()
      expect(box?.height ?? 0).toBeGreaterThanOrEqual(44)
      expect(box?.width ?? 0).toBeGreaterThanOrEqual(44)
    }
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    )
    expect(overflow).toBeLessThanOrEqual(0)
  })
})

test.describe('an interrupted run', () => {
  test('reaches history even when the page is torn down the instant it ends', async ({ page }) => {
    await openHome(page, { profileRef: MCQ, mode: 'mcq', seed: 99 })
    await beginRun(page)
    for (let index = 0; index < 6; index++) await answerCurrent(page, 'mcq', true)
    await page.keyboard.press('Escape')
    await page.getByTestId('abort-yes').click()

    // No pause: a full navigation here used to abandon the storage write mid-flight,
    // and the checkpoint had already been cleared, so the run was lost twice over.
    await page.goto('/history')
    await expect(page.getByTestId('history')).toBeVisible()
    await expect(page.getByTestId('history-empty')).toHaveCount(0)
    await expect(page.getByTestId('history-row')).toHaveCount(1)

    // And it is really in storage, not just in memory.
    await page.reload()
    await expect(page.getByTestId('history-row')).toHaveCount(1)
  })

  test('leaves no history row behind when nothing was answered', async ({ page }) => {
    await openHome(page, { profileRef: MCQ, mode: 'mcq', seed: 99 })
    await beginRun(page)
    await page.keyboard.press('Escape')
    await page.goto('/history')
    await expect(page.getByTestId('history-empty')).toBeVisible()
  })
})

test.describe('text contrast', () => {
  /**
   * Every run of visible text must clear WCAG AA against what is actually behind it:
   * 4.5:1, or 3:1 once the text is large. The composed colour is what counts, so
   * inherited opacity is folded in; a muted colour that passes on its own can fail
   * once something dims it.
   */
  async function lowContrast(page: import('@playwright/test').Page): Promise<string[]> {
    return page.evaluate(() => {
      const parse = (c: string): [number, number, number, number] => {
        const n = (c.match(/[\d.]+/g) ?? ['0', '0', '0']).map(Number)
        return [n[0] ?? 0, n[1] ?? 0, n[2] ?? 0, n[3] === undefined ? 1 : n[3]]
      }
      const lum = ([r, g, b]: number[]) => {
        const f = (v: number) => {
          const x = (v ?? 0) / 255
          return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4
        }
        return 0.2126 * f(r ?? 0) + 0.7152 * f(g ?? 0) + 0.0722 * f(b ?? 0)
      }
      const ratio = (a: number[], b: number[]) => {
        const [l1, l2] = [lum(a), lum(b)]
        return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05)
      }
      const over = (fg: number[], bg: number[], alpha: number) =>
        [0, 1, 2].map((i) => (fg[i] ?? 0) * alpha + (bg[i] ?? 0) * (1 - alpha))

      const backdrop = (el: Element): number[] => {
        for (let e: Element | null = el; e; e = e.parentElement) {
          const [r, g, b, a] = parse(getComputedStyle(e).backgroundColor)
          if (a > 0) return [r, g, b]
        }
        return [255, 255, 255]
      }
      const inheritedOpacity = (el: Element): number => {
        let o = 1
        for (let e: Element | null = el; e; e = e.parentElement) o *= Number(getComputedStyle(e).opacity)
        return o
      }

      const bad: string[] = []
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
      for (let n = walker.nextNode(); n; n = walker.nextNode()) {
        const text = (n.textContent ?? '').trim()
        const el = n.parentElement
        if (!text || !el || el.closest('.sr-only')) continue
        // WCAG 1.4.3 exempts text in an inactive control, and looking inactive is the
        // point of it, so a disabled toggle is allowed to sit below the threshold.
        if (el.closest(':disabled, [aria-disabled="true"]')) continue
        const s = getComputedStyle(el)
        if (s.visibility === 'hidden' || s.display === 'none') continue
        const box = el.getBoundingClientRect()
        if (box.width === 0 || box.height === 0) continue
        const alpha = inheritedOpacity(el)
        if (alpha === 0) continue
        const bg = backdrop(el)
        const fg = over(parse(s.color).slice(0, 3), bg, alpha * (parse(s.color)[3] ?? 1))
        const size = Number.parseFloat(s.fontSize)
        const large = size >= 24 || (size >= 18.66 && Number(s.fontWeight) >= 700)
        const need = large ? 3 : 4.5
        const got = ratio(fg, bg)
        if (got < need) bad.push(`${got.toFixed(2)}:1 (needs ${need}) ${size}px "${text.slice(0, 24)}"`)
      }
      return [...new Set(bad)]
    })
  }

  test('every run of text on the run screen clears AA', async ({ page }) => {
    await openHome(page, { profileRef: CLASSIC, mode: 'typed', seed: 7 })
    expect(await lowContrast(page)).toEqual([])
    await beginRun(page)
    await page.keyboard.type('12.5')
    expect(await lowContrast(page)).toEqual([])
  })

  test('and on the results and history screens', async ({ page }) => {
    await openHome(page, { profileRef: MCQ, mode: 'mcq', seed: 99 })
    await beginRun(page)
    expect(await lowContrast(page)).toEqual([])
    for (let index = 0; index < 6; index++) await answerCurrent(page, 'mcq', index % 2 === 0)
    await page.keyboard.press('Escape')
    await page.getByTestId('abort-yes').click()
    await expect(page.getByTestId('results')).toBeVisible()
    expect(await lowContrast(page)).toEqual([])
    await page.goto('/history')
    await expect(page.getByTestId('history')).toBeVisible()
    expect(await lowContrast(page)).toEqual([])
    await page.goto('/settings')
    await expect(page.getByTestId('settings')).toBeVisible()
    expect(await lowContrast(page)).toEqual([])
  })
})
