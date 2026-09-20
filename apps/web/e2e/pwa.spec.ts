import { expect, test } from '@playwright/test'
import { answerCurrent, beginRun, CLASSIC, homeUrl } from './helpers.js'
import { serveBuild } from './static-server.js'

interface ManifestIcon {
  src: string
  sizes: string
  type: string
  purpose?: string
}

test.describe('installability and offline', () => {
  test('the manifest has everything an install needs', async ({ request }) => {
    const response = await request.get('/manifest.webmanifest')
    expect(response.ok()).toBe(true)

    const manifest = (await response.json()) as {
      name: string
      short_name: string
      start_url: string
      display: string
      theme_color: string
      icons: ManifestIcon[]
    }

    expect(manifest.short_name).toBe('80 in 8')
    expect(manifest.name.length).toBeGreaterThan(0)
    expect(manifest.display).toBe('standalone')
    expect(manifest.start_url).toBeTruthy()
    expect(manifest.theme_color).toBeTruthy()

    const sizes = manifest.icons.map((icon) => icon.sizes)
    expect(sizes).toContain('192x192')
    expect(sizes).toContain('512x512')
    expect(manifest.icons.some((icon) => icon.purpose === 'maskable')).toBe(true)

    for (const icon of manifest.icons) {
      const image = await request.get(icon.src)
      expect(image.ok(), `${icon.src} should be served`).toBe(true)
    }
  })

  test('the service worker takes control and the app then runs offline', async ({
    page,
    context,
    browserName,
  }) => {
    const server = await serveBuild()
    try {
      await page.goto(server.origin)
      // `ready` resolves once a worker is active; a client is only *controlled* from
      // the next navigation, which is why the reload matters.
      await page.evaluate(() => navigator.serviceWorker.ready.then(() => undefined))

      await page.reload()
      await page.waitForFunction(() => navigator.serviceWorker.controller !== null)

      // WebKit's offline emulation rejects navigation even with a trivial fetch
      // handler returning an in-memory Response. Stop the real server on every
      // engine; additionally exercise offline emulation where it works.
      await server.stop()
      await expect(page.request.get(server.origin)).rejects.toThrow()
      if (browserName !== 'webkit') await context.setOffline(true)
      await page.reload()
      await expect(page.getByTestId('home')).toBeVisible()

      // Answer and finish a short run while the origin remains unavailable.
      await page.goto(`${server.origin}${homeUrl({ profileRef: CLASSIC, mode: 'typed', seed: 31 })}`)
      await expect(page.getByTestId('home')).toBeVisible()
      await beginRun(page)
      for (let index = 0; index < 3; index++) await answerCurrent(page, 'typed')
      await page.keyboard.press('Escape')
      await expect(page.getByTestId('results')).toBeVisible()
      await expect(page.getByTestId('score')).toHaveText('3')
    } finally {
      await context.setOffline(false)
      await server.stop()
    }
  })
})
