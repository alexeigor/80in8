import { canonicalJson, PRESETS, type Profile, profileRefOf } from '@80in8/core'
import { expect, test } from '@playwright/test'
import { answerCurrent, beginRun, CLASSIC, MCQ, openHome } from './helpers.js'

/**
 * The run's edges: the countdown left alone, the ways out of a run that are not the
 * End button, the keys that must be ignored, and the home controls that must keep
 * their own keyboard behaviour (§7.2, §7.7, §7.8).
 */

test.describe('the countdown', () => {
  test('counts three, two, one and starts on its own', async ({ page }) => {
    await page.clock.install()
    await openHome(page, { profileRef: CLASSIC, mode: 'typed', seed: 2 })
    await page.getByTestId('start').click()
    const digit = page.getByTestId('countdown').locator('.n')
    await expect(digit).toHaveText('3')
    await page.clock.fastForward(1100)
    await expect(digit).toHaveText('2')
    await page.clock.fastForward(1000)
    await expect(digit).toHaveText('1')
    await page.clock.fastForward(1000)
    await expect(page.getByTestId('question')).toBeVisible()
    // The clock starts at go, not at the click.
    await expect(page.getByTestId('timer')).toHaveText('8:00')
  })

  test('Escape does nothing and Back returns home with nothing recorded', async ({ page }) => {
    await openHome(page, { profileRef: CLASSIC, mode: 'typed', seed: 3 })
    await page.getByTestId('start').click()
    await expect(page.getByTestId('countdown')).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(page.getByTestId('countdown')).toBeVisible()

    await page.goBack()
    await expect(page.getByTestId('home')).toBeVisible()
    await expect(page.getByTestId('abort-confirm')).toHaveCount(0)
    // Enter must start a fresh run, which it cannot if the old one is still live.
    await page.keyboard.press('Enter')
    await expect(page.getByTestId('countdown')).toBeVisible()
    await page.goto('/history')
    await expect(page.getByTestId('history-empty')).toBeVisible()
  })
})

test.describe('leaving a run', () => {
  test('Back with a few answers ends the run quietly but keeps the answers', async ({ page }) => {
    await openHome(page, { profileRef: CLASSIC, mode: 'typed', seed: 3 })
    await beginRun(page)
    await answerCurrent(page, 'typed')
    await answerCurrent(page, 'typed')
    await page.goBack()
    await expect(page.getByTestId('home')).toBeVisible()
    await expect(page.getByTestId('abort-confirm')).toHaveCount(0)
    await page.getByRole('link', { name: 'Your history' }).click()
    await expect(page.getByTestId('history-row')).toHaveCount(1)
    await expect(page.getByTestId('history-row')).toContainText('2/80')
  })

  test('five answers end at once; the sixth is what makes Escape ask', async ({ page }) => {
    await openHome(page, { profileRef: CLASSIC, mode: 'typed', seed: 8 })
    await beginRun(page)
    for (let index = 0; index < 5; index++) await answerCurrent(page, 'typed')
    await page.keyboard.press('Escape')
    await expect(page.getByTestId('results')).toBeVisible()
    await expect(page.getByTestId('abort-confirm')).toHaveCount(0)
    await expect(page.getByTestId('answered')).toHaveText('5/80')
  })

  test('time running out while the confirmation is open leaves a working results screen', async ({
    page,
  }) => {
    await page.clock.install()
    await openHome(page, { profileRef: CLASSIC, mode: 'typed', seed: 1 })
    await beginRun(page)
    for (let index = 0; index < 6; index++) await answerCurrent(page, 'typed')
    await page.keyboard.press('Escape')
    await expect(page.getByTestId('abort-confirm')).toBeVisible()

    await page.clock.fastForward('09:00')
    await expect(page.getByTestId('results')).toBeVisible()
    await expect(page.getByTestId('ended-by')).toHaveText('time')
    await expect(page.getByTestId('abort-confirm')).toHaveCount(0)

    // The dialog is gone, so the results bindings must be live on the very first press.
    await page.keyboard.press('r')
    await expect(page.getByTestId('review')).toBeVisible()
    await page.keyboard.press('?')
    await expect(page.getByTestId('shortcuts')).toBeVisible()
  })

  test('navigating away mid-run closes the run out wherever you land', async ({ page }) => {
    await openHome(page, { profileRef: CLASSIC, mode: 'typed', seed: 3 })
    await beginRun(page)
    await answerCurrent(page, 'typed')
    await answerCurrent(page, 'typed')
    await page.goto('/history')
    await expect(page.getByTestId('history')).toBeVisible()
    await expect(page.getByTestId('history-row')).toHaveCount(1)
    await expect(page.getByTestId('history-row')).toContainText('2/80')
    // Landing on history shows history, not a results screen for a run you left.
    await expect(page.getByTestId('results')).toHaveCount(0)
  })
})

test.describe('during a run', () => {
  test('losing focus for a second shows a nudge and the clock keeps going', async ({ page }) => {
    await page.clock.install()
    await openHome(page, { profileRef: CLASSIC, mode: 'typed', seed: 3 })
    await beginRun(page)
    // The run screen attaches its focus listeners in the same effect pass that focuses
    // the answer field, so the field having focus means the listeners are in place.
    await expect(page.getByTestId('typed-input')).toBeFocused()
    await page.evaluate(() => window.dispatchEvent(new Event('blur')))
    await page.clock.fastForward(1500)
    await expect(page.getByTestId('blurred')).toBeVisible()
    await expect(page.getByTestId('blurred')).toContainText('the clock is still running')
    await page.clock.fastForward('00:10')
    await expect(page.getByTestId('timer')).toHaveText('7:49')
    await page.evaluate(() => window.dispatchEvent(new Event('focus')))
    await expect(page.getByTestId('blurred')).toHaveCount(0)
  })

  test('an unfinished entry shakes instead of submitting, and nonsense is named', async ({ page }) => {
    await openHome(page, { profileRef: CLASSIC, mode: 'typed', seed: 3 })
    await beginRun(page)
    await page.keyboard.press('Minus')
    await expect(page.getByTestId('parse-hint')).toHaveText('')
    await page.keyboard.press('Enter')
    await expect(page.getByTestId('typed-input')).toHaveAttribute('data-shake', 'true')
    await expect(page.getByTestId('counter')).toHaveText('1/80')
    await expect(page.getByTestId('typed-input')).toHaveAttribute('data-shake', 'false')

    await page.getByTestId('typed-input').focus()
    await page.keyboard.insertText('abc')
    await expect(page.getByTestId('parse-hint')).toHaveText('not a number')
    await page.keyboard.press('Enter')
    await expect(page.getByTestId('counter')).toHaveText('1/80')
  })

  test('keys are ignored while the shortcuts sheet is open, and with a modifier held', async ({ page }) => {
    await openHome(page, { profileRef: MCQ, mode: 'mcq', seed: 5 })
    await beginRun(page)
    await page.keyboard.press('?')
    await expect(page.getByTestId('shortcuts')).toBeVisible()
    await page.keyboard.press('1')
    await expect(page.getByTestId('counter')).toHaveText('1/80')
    await page.keyboard.press('Escape')
    await expect(page.getByTestId('shortcuts')).toHaveCount(0)
    await page.keyboard.press('Control+1')
    await page.keyboard.press('Alt+2')
    await expect(page.getByTestId('counter')).toHaveText('1/80')
    await page.keyboard.press('3')
    await expect(page.getByTestId('counter')).toHaveText('2/80')
  })
})

test.describe('the results keys', () => {
  test('Enter starts again with a new seed; M builds the retry deck', async ({ page }) => {
    await openHome(page, { profileRef: CLASSIC, mode: 'typed', seed: 3 })
    await beginRun(page)
    const first = await page.getByTestId('question').getAttribute('data-question-id')
    await answerCurrent(page, 'typed', false)
    await page.keyboard.press('Escape')
    await expect(page.getByTestId('results')).toBeVisible()

    await page.keyboard.press('m')
    await page.getByTestId('skip-countdown').click()
    await expect(page.getByTestId('counter')).toHaveText('1/1')
    await expect(page.getByTestId('question')).toHaveAttribute('data-question-id', first ?? '')
    await answerCurrent(page, 'typed')
    await expect(page.getByTestId('results')).toBeVisible()

    await page.keyboard.press('Enter')
    await page.getByTestId('skip-countdown').click()
    await expect(page.getByTestId('counter')).toHaveText('1/80')
    await expect(page.getByTestId('question')).not.toHaveAttribute('data-question-id', first ?? '')
  })

  test('Enter on a focused results button activates that button, not Again', async ({ page }) => {
    await openHome(page, { profileRef: CLASSIC, mode: 'typed', seed: 3 })
    await beginRun(page)
    await answerCurrent(page, 'typed')
    await page.keyboard.press('Escape')
    await expect(page.getByTestId('results')).toBeVisible()
    await page.getByTestId('toggle-review').focus()
    await page.keyboard.press('Enter')
    await expect(page.getByTestId('review')).toBeVisible()
    await expect(page.getByTestId('countdown')).toHaveCount(0)
  })
})

test.describe('the home controls', () => {
  test('Start has focus on load', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByTestId('start')).toBeFocused()
  })

  test('typing in the seed field never triggers a shortcut', async ({ page }) => {
    await page.goto('/')
    await page.getByTestId('toggle-advanced').click()
    await page.getByTestId('seed').click()
    await page.keyboard.type('a?b')
    await expect(page.getByTestId('shortcuts')).toHaveCount(0)
    await expect(page.getByTestId('seed')).toHaveValue('a?b')
  })

  test('a seed is any text: the same text gives the same paper, other text another', async ({ page }) => {
    const firstIdFor = async (seed: string) => {
      await page.goto('/')
      await page.getByTestId('toggle-advanced').click()
      await page.getByTestId('seed').fill(seed)
      await beginRun(page)
      const id = await page.getByTestId('question').getAttribute('data-question-id')
      await page.keyboard.press('Escape')
      return id
    }
    const hello = await firstIdFor('hello')
    expect(await firstIdFor('hello')).toBe(hello)
    expect(await firstIdFor('world')).not.toBe(hello)
    // Blank means a fresh seed every time.
    const blank = await firstIdFor('')
    expect(await firstIdFor('')).not.toBe(blank)
  })

  test('a shared link fills the seed field and choosing another test releases its profile', async ({
    page,
  }) => {
    const shared: Profile = { ...PRESETS['optiver-classic'], questionCount: 3 }
    const params = new URLSearchParams({
      p: profileRefOf(shared, false),
      pf: Buffer.from(canonicalJson(shared)).toString('base64url'),
      s: '4242',
      m: 'typed',
    })
    await page.goto(`/?${params}`)
    await expect(page.getByTestId('disclosure')).toContainText('3 questions')
    await page.getByTestId('toggle-advanced').click()
    await expect(page.getByTestId('seed')).toHaveValue('4242')

    await page.getByTestId('profile').selectOption('hard@1')
    await expect(page.getByTestId('disclosure')).toContainText('80 questions')
    await expect(page.getByTestId('profile').locator('option[value="shared"]')).toHaveCount(0)
    await beginRun(page)
    await expect(page.getByTestId('question')).toHaveAttribute('data-question-id', /^1\.hard@1\./)
  })
})

test.describe('routes without a session', () => {
  test('/run and /results go home, and an unknown path says so', async ({ page }) => {
    await page.goto('/run')
    await expect(page.getByTestId('home')).toBeVisible()
    expect(new URL(page.url()).pathname).toBe('/')
    await page.goto('/results')
    await expect(page.getByTestId('home')).toBeVisible()
    await page.goto('/nowhere')
    await expect(page.getByTestId('not-found')).toBeVisible()
    await page.getByRole('link', { name: 'Back to the start' }).click()
    await expect(page.getByTestId('home')).toBeVisible()
  })
})
