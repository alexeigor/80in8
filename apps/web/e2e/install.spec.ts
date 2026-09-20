import { expect, test } from '@playwright/test'
import { abortAfter, answerCurrent, beginRun, CLASSIC, openHome } from './helpers.js'

/**
 * The install hint (§7.9), and the two device APIs a run touches: the screen wake
 * lock (§7.5) and the haptic tick on the keypad (§7.4). The browser will not grant any
 * of these to automation, so each is stood in for by a stub that records the calls.
 */

test('the install button appears after the second run and asks the browser to install', async ({ page }) => {
  await page.addInitScript(() => {
    const target = window as Window & { __installPrompts?: number }
    target.__installPrompts = 0
    // The app listens from the module script, which runs before DOMContentLoaded.
    addEventListener('DOMContentLoaded', () => {
      const event = new Event('beforeinstallprompt') as Event & { prompt: () => Promise<void> }
      event.prompt = async () => {
        target.__installPrompts = (target.__installPrompts ?? 0) + 1
      }
      dispatchEvent(event)
    })
  })
  await openHome(page, { profileRef: CLASSIC, mode: 'typed', seed: 1 })
  await expect(page.getByTestId('install')).toHaveCount(0)
  await beginRun(page)
  await abortAfter(page, 'typed', 1)
  await openHome(page, { profileRef: CLASSIC, mode: 'typed', seed: 2 })
  await expect(page.getByTestId('install')).toHaveCount(0)
  await beginRun(page)
  await abortAfter(page, 'typed', 1)

  await openHome(page, { profileRef: CLASSIC, mode: 'typed', seed: 3 })
  await page.getByTestId('install').click()
  await expect
    .poll(() => page.evaluate(() => (window as Window & { __installPrompts?: number }).__installPrompts))
    .toBe(1)
  // The event is single-use, so the button goes away once used.
  await expect(page.getByTestId('install')).toHaveCount(0)
})

test('iOS gets the Add to Home Screen instructions instead', async ({ page }) => {
  await page.goto('/settings')
  const ios = await page.evaluate(() => /iphone|ipad|ipod/i.test(navigator.userAgent))
  await expect(page.getByText('Share → Add to Home Screen')).toHaveCount(ios ? 1 : 0)
})

test('the screen wake lock is held for the run and released with it', async ({ page }) => {
  await page.addInitScript(() => {
    const log = { requests: 0, releases: 0 }
    Object.assign(window, { __wake: log })
    Object.defineProperty(navigator, 'wakeLock', {
      value: {
        request: async () => {
          log.requests += 1
          return {
            addEventListener: () => undefined,
            release: async () => {
              log.releases += 1
            },
          }
        },
      },
    })
  })
  const wake = () => page.evaluate(() => (window as Window & { __wake?: unknown }).__wake)
  await openHome(page, { profileRef: CLASSIC, mode: 'typed', seed: 1 })
  await page.getByTestId('start').click()
  await expect(page.getByTestId('countdown')).toBeVisible()
  expect(await wake()).toEqual({ requests: 0, releases: 0 })
  await page.getByTestId('skip-countdown').click()
  await expect(page.getByTestId('question')).toBeVisible()
  await expect.poll(wake).toEqual({ requests: 1, releases: 0 })
  await answerCurrent(page, 'typed')
  await page.keyboard.press('Escape')
  await expect(page.getByTestId('results')).toBeVisible()
  await expect.poll(wake).toEqual({ requests: 1, releases: 1 })
})

test('each answer gives a haptic tick where the device supports one', async ({ page }) => {
  await page.addInitScript(() => {
    const calls: number[] = []
    Object.assign(window, { __vibrations: calls })
    Object.defineProperty(navigator, 'vibrate', {
      value: (ms: number) => {
        calls.push(ms)
        return true
      },
    })
  })
  await openHome(page, { profileRef: CLASSIC, mode: 'typed', seed: 1 })
  await beginRun(page)
  await answerCurrent(page, 'typed', true)
  await answerCurrent(page, 'typed', false)
  await page.keyboard.press('ArrowRight')
  const calls = await page.evaluate(() => (window as Window & { __vibrations?: number[] }).__vibrations)
  // Two verdicts, two ticks of different lengths; a skip has no verdict and no tick.
  expect(calls).toHaveLength(2)
  expect(calls?.[0]).not.toBe(calls?.[1])
})
