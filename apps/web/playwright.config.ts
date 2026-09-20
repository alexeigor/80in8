import { defineConfig, devices } from '@playwright/test'

const PORT = 4173
const BASE_URL = `http://127.0.0.1:${PORT}`

/**
 * Three device projects (DESIGN.md §9.4). The tests run against the *built* app served
 * by `vite preview`, because half of what they check — the service worker, the
 * manifest, offline, the network contract — does not exist in the dev server.
 *
 * The phone projects run their device descriptors on Chromium rather than WebKit so
 * that `isMobile` (viewport metrics, touch) is honoured and one browser download
 * covers the matrix. Set `E2E_WEBKIT=1` to run the iPhone project on WebKit instead,
 * which is what CI does. E2E_CROSS_BROWSER=1 also adds desktop Safari and Firefox.
 *
 * `E2E_CHANNEL=chrome` runs against an installed Google Chrome instead of Playwright's
 * bundled Chromium, for machines where the download is unavailable.
 */
const channel = process.env.E2E_CHANNEL ? { channel: process.env.E2E_CHANNEL } : {}
const crossBrowser = process.env.E2E_CROSS_BROWSER === '1'
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  ...(process.env.CI ? { workers: 2 } : {}),
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : [['list']],
  timeout: 60_000,
  use: {
    baseURL: BASE_URL,
    trace: 'on-first-retry',
    video: 'off',
  },
  webServer: {
    command: `npm run build && npx vite preview --port ${PORT} --strictPort --host 127.0.0.1`,
    url: `${BASE_URL}${process.env.BASE_PATH ?? '/'}`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
  projects: [
    { name: 'Desktop Chrome', use: { ...devices['Desktop Chrome'], ...channel } },
    {
      name: 'iPhone 15',
      use: {
        ...devices['iPhone 15'],
        ...(process.env.E2E_WEBKIT || crossBrowser ? {} : { browserName: 'chromium' as const, ...channel }),
      },
    },
    { name: 'Pixel 7', use: { ...devices['Pixel 7'], ...channel } },
    ...(crossBrowser
      ? [
          { name: 'Desktop Safari', use: { ...devices['Desktop Safari'] } },
          { name: 'Desktop Firefox', use: { ...devices['Desktop Firefox'] } },
        ]
      : []),
  ],
})
