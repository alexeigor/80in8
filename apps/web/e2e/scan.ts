import { expect, type Page } from '@playwright/test'

/**
 * Checks on what actually reaches the screen. Shared by the rendering, collision,
 * theme and landscape specs so that every screen is judged by the same rules.
 */

/**
 * Every run of visible text must clear WCAG AA against what is actually behind it:
 * 4.5:1, or 3:1 once the text is large. The composed colour is what counts, so
 * inherited opacity is folded in; a muted colour that passes on its own can fail
 * once something dims it.
 */
export async function lowContrast(page: Page): Promise<string[]> {
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

    // What is actually behind the text: translucent layers are composited over
    // whatever lies beneath them, down to the first opaque one. Treating a 12% wash
    // as a solid colour reports nonsense in either direction.
    const backdrop = (el: Element): number[] => {
      const layers: [number, number, number, number][] = []
      for (let e: Element | null = el; e; e = e.parentElement) {
        const layer = parse(getComputedStyle(e).backgroundColor)
        if (layer[3] > 0) layers.push(layer)
        if (layer[3] >= 1) break
      }
      let below = [255, 255, 255]
      for (const [r, g, b, a] of layers.reverse()) below = over([r, g, b], below, a)
      return below
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

/**
 * Nothing on screen may collide with anything else. The check compares rendered
 * glyph runs rather than element boxes: two stacked blocks always touch at the edges,
 * but two runs of text that touch are something a person sees. It also flags text
 * clipped by its own container.
 */
export async function collisions(page: Page): Promise<string[]> {
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
  return [...new Set(hits)]
}

/** Fails the test if the page reported anything, with the detail in the message. */
export async function expectNoCollisions(page: Page, label: string): Promise<void> {
  const hits = await collisions(page)
  expect(hits, `${label}:\n${hits.join('\n')}`).toEqual([])
}

export interface FitMetrics {
  /** Horizontal and vertical overflow of the document beyond the viewport, in px. */
  horizontal: number
  vertical: number
  /** Interactive elements under the 44×44 CSS px target size (N5). */
  tooSmall: string[]
  /** Buttons whose box ends below the viewport. */
  offBottom: string[]
}

/** Whether a screen fits its viewport with nothing clipped and nothing too small to hit. */
export async function fitMetrics(page: Page): Promise<FitMetrics> {
  return page.evaluate(() => {
    const root = document.documentElement
    const describe = (el: Element, r: DOMRect) =>
      `${el.tagName} "${(el.textContent ?? '').trim().slice(0, 12)}" ${Math.round(r.width)}x${Math.round(r.height)}`
    // A link that sits in a sentence is exempt (WCAG 2.5.8, "inline"); everything
    // else that can be pressed is a target.
    const inline = (el: Element) => el.tagName === 'A' && getComputedStyle(el).display === 'inline'
    const tooSmall = [...document.querySelectorAll('button, a, select, input')]
      .filter((el) => !inline(el))
      .map((el) => ({ el, r: el.getBoundingClientRect() }))
      .filter(({ r }) => r.width > 0 && r.height > 0 && (r.width < 44 || r.height < 44))
      .map(({ el, r }) => describe(el, r))
    const offBottom = [...document.querySelectorAll('button')]
      .map((el) => ({ el, r: el.getBoundingClientRect() }))
      .filter(({ r }) => r.height > 0 && r.bottom > window.innerHeight + 1)
      .map(({ el, r }) => describe(el, r))
    return {
      horizontal: root.scrollWidth - root.clientWidth,
      vertical: root.scrollHeight - window.innerHeight,
      tooSmall,
      offBottom,
    }
  })
}
