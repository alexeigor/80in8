import { expect, test } from '@playwright/test'
import { beginRun, homeUrl } from './helpers.js'
import { serveBuild } from './static-server.js'

/**
 * N1(b) and §7.9, as stated: the hourly update check is the app's only intentional
 * network activity, it is same-origin, and it is suspended between `go` and
 * `finished`. The browser fetches the worker script itself, outside any page request
 * event, so the server's own log is the witness.
 */
test('the hourly update check fetches sw.js on the home screen, never during a run, once after', async ({
  page,
}) => {
  const server = await serveBuild()
  try {
    await page.clock.install()
    await page.goto(server.origin)
    await page.evaluate(() => navigator.serviceWorker.ready.then(() => undefined))
    await page.waitForLoadState('networkidle')
    server.hits.length = 0

    await page.clock.fastForward(61 * 60_000)
    await expect.poll(() => server.hits.filter((path) => path === '/sw.js')).toHaveLength(1)
    // The check fetches the worker and its runtime, never the app shell or its assets.
    expect(server.hits.filter((path) => path === '/' || path.startsWith('/assets/'))).toEqual([])

    // An untimed run outlives the hour without ending, so the check must be held.
    await page.goto(`${server.origin}${homeUrl({ seed: 5 })}`)
    await page.getByTestId('toggle-advanced').click()
    await page.getByTestId('pace').selectOption('untimed')
    await beginRun(page)
    await page.waitForLoadState('networkidle')
    server.hits.length = 0
    await page.clock.fastForward(61 * 60_000)
    await page.clock.runFor(1000)
    expect(server.hits).toEqual([])

    // The check that was missed runs as soon as the run is over.
    await page.keyboard.press('Escape')
    await expect(page.getByTestId('results')).toBeVisible()
    await expect.poll(() => server.hits.filter((path) => path === '/sw.js')).toHaveLength(1)
  } finally {
    await server.stop()
  }
})
