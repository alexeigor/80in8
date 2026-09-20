import { expect, test } from '@playwright/test'
import { answerCurrent, beginRun, CLASSIC, openHome } from './helpers.js'

/**
 * N1, asserted literally: no request at all between `go` and `finished`, and over the
 * whole session nothing but same-origin GETs of the app's own assets.
 */

const ALLOWED = [
  /^\/$/,
  /^\/index\.html$/,
  /^\/404\.html$/,
  /^\/assets\//,
  /^\/sw\.js$/,
  /^\/workbox-[\w-]+\.js$/,
  /^\/manifest\.webmanifest$/,
  /^\/theme\.js$/,
  /^\/favicon\.svg$/,
  /^\/apple-touch-icon\.png$/,
  /^\/icon-[\w-]+\.png$/,
]

/**
 * The tab icon is fetched by the browser itself, lazily and outside any script, so it
 * is not app traffic and is excluded from the during-a-run window. It is still
 * same-origin and still on the allow-list, which the second test checks.
 */
const BROWSER_CHROME = /\/(favicon\.svg|apple-touch-icon\.png)$/

test.describe('the network contract', () => {
  test('a run makes no requests at all', async ({ page }) => {
    const requests: string[] = []
    page.on('request', (request) => {
      if (!BROWSER_CHROME.test(new URL(request.url()).pathname)) requests.push(request.url())
    })

    await openHome(page, { profileRef: CLASSIC, mode: 'typed', seed: 21 })
    await page.waitForLoadState('networkidle')
    await beginRun(page)

    requests.length = 0
    for (let index = 0; index < 5; index++) await answerCurrent(page, 'typed')
    await page.keyboard.press('Escape')
    await expect(page.getByTestId('results')).toBeVisible()

    expect(requests).toEqual([])
  })

  test('every request in a session is a same-origin GET of an app asset', async ({ page, baseURL }) => {
    const seen: { url: string; method: string }[] = []
    page.on('request', (request) => seen.push({ url: request.url(), method: request.method() }))

    await openHome(page)
    await page.reload()
    await openHome(page, { profileRef: CLASSIC, mode: 'mcq', seed: 2 })
    await beginRun(page)
    await page.keyboard.press('Escape')
    await expect(page.getByTestId('results')).toBeVisible()

    expect(seen.length).toBeGreaterThan(0)
    for (const request of seen) {
      const url = new URL(request.url)
      expect(request.method, `${request.url} must be a GET`).toBe('GET')
      expect(url.origin, `${request.url} must be same-origin`).toBe(new URL(baseURL ?? '').origin)
      // The only query strings the app produces are its own share parameters on the
      // document itself; no asset request may carry one.
      const isDocument = url.pathname === '/' || url.pathname.endsWith('.html')
      if (!isDocument) expect(url.search, `${request.url} must not carry a query string`).toBe('')
      expect(
        ALLOWED.some((pattern) => pattern.test(url.pathname)),
        `${url.pathname} is not on the asset allow-list`,
      ).toBe(true)
    }
  })

  test('the page declares the policy that makes this enforceable', async ({ page }) => {
    await page.goto('/')
    const policy = await page.locator('meta[http-equiv="Content-Security-Policy"]').getAttribute('content')
    expect(policy).toContain("default-src 'self'")
    expect(policy).toContain("connect-src 'self'")
  })
})
