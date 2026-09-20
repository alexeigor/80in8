import { execFile } from 'node:child_process'
import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { expect, test } from '@playwright/test'
import { answerCurrent, beginRun, homeUrl } from './helpers.js'
import { serveBuild } from './static-server.js'

test('a waiting update preserves a live run, activates on request, and works offline', async ({
  page,
  context,
  browserName,
}, testInfo) => {
  // Separate real production builds ensure the shell, asset hashes and precache
  // manifest all change, without changing the build used by other tests.
  const directory = testInfo.outputPath('upgrade-builds')
  const vite = fileURLToPath(new URL('../../../node_modules/vite/bin/vite.js', import.meta.url))
  const app = fileURLToPath(new URL('../', import.meta.url))
  for (const version of ['aaaaaaa', 'bbbbbbb']) {
    await promisify(execFile)(process.execPath, [vite, 'build', '--outDir', join(directory, version)], {
      cwd: app,
      env: { ...process.env, BASE_PATH: '/', GITHUB_SHA: version },
    })
  }
  const nextWorker = join(directory, 'bbbbbbb/sw.js')
  const worker = await readFile(nextWorker, 'utf8')
  // Make activation slower than a fixed reload timeout. This changes scheduling,
  // not the production worker's caching or message protocol.
  await writeFile(
    nextWorker,
    `self.addEventListener('message', event => {
    if (event.data?.type === 'SKIP_WAITING') {
      event.stopImmediatePropagation();
      event.waitUntil(new Promise(resolve => setTimeout(resolve, 400)).then(() => self.skipWaiting()));
    }
  });\n${worker}`,
  )
  let version = 'aaaaaaa'
  const server = await serveBuild({ root: () => join(directory, version) })
  try {
    await page.goto(server.origin)
    await page.evaluate(() => navigator.serviceWorker.ready.then(() => undefined))
    await page.reload()
    await page.waitForFunction(() => navigator.serviceWorker.controller !== null)
    await page.getByTestId('nav-settings').click()
    await expect(page.getByTestId('version')).toContainText('build aaaaaaa')
    await page.goto(`${server.origin}${homeUrl()}`)
    await beginRun(page)
    await answerCurrent(page, 'typed')
    const id = await page.getByTestId('question').getAttribute('data-question-id')

    version = 'bbbbbbb'
    // Simulate the browser discovering a deployment while this tab is running.
    await page.evaluate(async () => (await navigator.serviceWorker.ready).update().then(() => undefined))
    await page.waitForFunction(
      async () => (await navigator.serviceWorker.getRegistration())?.waiting?.state === 'installed',
    )
    await expect(page.getByTestId('update-toast')).toHaveCount(0)
    await expect(page.getByTestId('question')).toHaveAttribute('data-question-id', id ?? '')
    await expect(page.getByTestId('counter')).toHaveText('2/80')
    await answerCurrent(page, 'typed')
    await page.keyboard.press('Escape')
    await expect(page.getByTestId('score')).toHaveText('2')
    await expect(page.getByTestId('update-toast')).toBeVisible()

    await Promise.all([
      page.waitForEvent('load'),
      page.getByTestId('update-toast').getByRole('button', { name: 'Reload' }).click(),
    ])
    await page.getByTestId('nav-settings').click()
    await expect(page.getByTestId('version')).toContainText('build bbbbbbb')
    await expect(page.getByTestId('apply-update')).toHaveCount(0)
    await page.getByTestId('nav-history').click()
    await expect(page.getByTestId('history-row')).toHaveCount(1)
    await expect(page.getByTestId('history-row').getByRole('cell').nth(3)).toHaveText('2')
    const history = await page.getByTestId('history-row').innerText()

    await server.stop()
    await expect(page.request.get(server.origin)).rejects.toThrow()
    if (browserName !== 'webkit') await context.setOffline(true)
    await page.reload()
    await expect(page.getByTestId('history-row')).toHaveCount(1)
    await expect(page.getByTestId('history-row')).toHaveText(history, { useInnerText: true })
    await page.getByTestId('nav-settings').click()
    await expect(page.getByTestId('version')).toContainText('build bbbbbbb')
    await page.goto(`${server.origin}${homeUrl({ seed: 99 })}`)
    await beginRun(page)
    await answerCurrent(page, 'typed')
    await page.keyboard.press('Escape')
    await expect(page.getByTestId('score')).toHaveText('1')
    await page.getByTestId('nav-history').click()
    await expect(page.getByTestId('history-row')).toHaveCount(2)
  } finally {
    await context.setOffline(false)
    await server.stop()
  }
})
