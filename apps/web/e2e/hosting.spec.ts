import { expect, test } from '@playwright/test'
import { beginRun } from './helpers.js'

const base = process.env.BASE_PATH ?? '/'

test('the static deployment includes its fallback page and correctly scoped assets', async ({ request }) => {
  const shell = await request.get(base)
  const fallback = await request.get(`${base}404.html`)
  expect(shell.ok()).toBe(true)
  expect(fallback.ok()).toBe(true)
  expect(await fallback.text()).toBe(await shell.text())

  const response = await request.get(`${base}manifest.webmanifest`)
  expect(response.ok()).toBe(true)
  const manifest = await response.json()
  expect(manifest.scope).toBe(base)
  expect(manifest.start_url).toBe(base)
  for (const icon of manifest.icons) {
    expect(icon.src.startsWith(base)).toBe(true)
    expect((await request.get(icon.src)).ok()).toBe(true)
  }
})

test('navigation and shared question reloads work under the deployment base', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.goto(base)
  await expect(page.getByTestId('home')).toBeVisible()
  await page.getByTestId('nav-history').click()
  expect(new URL(page.url()).pathname).toBe(`${base}history`)
  await page.reload()
  await expect(page.getByTestId('history')).toBeVisible()
  await page.getByRole('link', { name: '80in8', exact: true }).click()
  await beginRun(page)
  const id = await page.getByTestId('question').getAttribute('data-question-id')
  if (!id) throw new Error('missing question id')
  await page.keyboard.press('Escape')
  await expect(page.getByTestId('results')).toBeVisible()
  await page.goto(`${base}q/${encodeURIComponent(id)}`)
  await expect(page.getByTestId('question')).toHaveAttribute('data-question-id', id)
  await page.reload()
  await expect(page.getByTestId('question')).toHaveAttribute('data-question-id', id)
  expect(errors).toEqual([])
})
