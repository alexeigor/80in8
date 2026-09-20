import { resolvePreset } from '@80in8/core'
import { expect, type Page, test } from '@playwright/test'
// Imported from the app rather than copied, so a renamed category cannot make these
// tests quietly stop checking anything. `src/labels.ts` is listed in
// tsconfig.node.json for this reason; it is plain data with no DOM dependency.
import { KIND_LABELS } from '../src/labels.js'
import {
  answerCurrent,
  beginRun,
  CLASSIC,
  completeRun,
  currentQuestion,
  openHome,
  typeableAnswer,
} from './helpers.js'

/**
 * The statistics screens, checked against a run whose every answer is known.
 *
 * These assert arithmetic the user will actually read off the page: that the category
 * table accounts for all eighty questions, that accuracy ignores skips, that a wrong
 * answer is attributed to the category it came from, and that history aggregates two
 * runs rather than showing the last one twice.
 */

/** Read a table into rows of trimmed cell text, keyed by the first column. */
async function readTable(page: Page, testid: string): Promise<Map<string, string[]>> {
  const rows = await page.getByTestId(testid).locator('tbody tr').all()
  const out = new Map<string, string[]>()
  for (const row of rows) {
    const cells = await row.locator('td').allInnerTexts()
    const [head, ...rest] = cells.map((cell) => cell.trim())
    out.set(head ?? '', rest)
  }
  return out
}

test.describe('the statistics after a perfect run', () => {
  test('eighty correct answers are accounted for on every line of the results', async ({ page }) => {
    const profile = resolvePreset(CLASSIC)
    if (!profile) throw new Error('preset missing')

    await openHome(page, { profileRef: CLASSIC, mode: 'typed', seed: 20_240_101 })
    await beginRun(page)
    const asked = await completeRun(page, 'typed')

    expect(asked).toHaveLength(80)
    expect(asked).toHaveLength(profile.questionCount)

    // The headline figures.
    await expect(page.getByTestId('score')).toHaveText('80')
    await expect(page.getByTestId('accuracy')).toHaveText('100%')
    await expect(page.getByTestId('answered')).toHaveText('80/80')
    await expect(page.getByTestId('ended-by')).toHaveText('completed')
    await expect(page.getByTestId('band')).toHaveText('Competitive')
    await expect(page.getByTestId('results')).toContainText('80 correct · 0 wrong · 0 skipped')

    // A mean time per question is reported, and it is a plausible number.
    // Reported in seconds to one decimal. Automation answers in milliseconds, so the
    // value is legitimately 0.0s here; the check is that it is present and well formed.
    const perQuestion = await page.getByTestId('per-question').innerText()
    expect(perQuestion).toMatch(/^\d+(\.\d+)?s$/)
    expect(Number.parseFloat(perQuestion)).toBeGreaterThanOrEqual(0)

    // Nothing was fallen for, so there is nothing to report as a weakness.
    await expect(page.getByText('What tripped you up')).toHaveCount(0)
    await expect(page.getByTestId('retry')).toBeDisabled()

    // The category table must account for every question that was asked, with the
    // counts taken from the ids the run actually used rather than from the page.
    const expected = new Map<string, number>()
    for (const question of asked) {
      const label = KIND_LABELS[question.kind]
      expected.set(label, (expected.get(label) ?? 0) + 1)
    }
    const table = await readTable(page, 'by-kind')
    expect([...table.keys()].sort()).toEqual([...expected.keys()].sort())

    let askedTotal = 0
    let rightTotal = 0
    for (const [label, cells] of table) {
      const [answered, correct, wrong, skipped] = cells.map(Number)
      expect(answered).toBe(expected.get(label))
      expect(correct).toBe(expected.get(label))
      expect(wrong).toBe(0)
      expect(skipped).toBe(0)
      askedTotal += answered ?? 0
      rightTotal += correct ?? 0
    }
    expect(askedTotal).toBe(80)
    expect(rightTotal).toBe(80)
  })

  test('the run reaches history with the same numbers on it', async ({ page }) => {
    await openHome(page, { profileRef: CLASSIC, mode: 'typed', seed: 20_240_101 })
    await beginRun(page)
    const asked = await completeRun(page, 'typed')

    await page.goto('/history')
    await expect(page.getByTestId('history')).toBeVisible()
    await expect(page.getByTestId('run-count')).toHaveText('1')

    const row = page.getByTestId('history-row').first()
    await expect(row).toContainText('80')
    await expect(row).toContainText('100%')
    await expect(row).toContainText('typed')

    // History aggregates by category across runs; with one perfect run every row is
    // at full accuracy and the asked counts match the run.
    const expected = new Map<string, number>()
    for (const question of asked) {
      const label = KIND_LABELS[question.kind]
      expected.set(label, (expected.get(label) ?? 0) + 1)
    }
    const table = await readTable(page, 'kind-table')
    let total = 0
    for (const [label, cells] of table) {
      const [answered, correct, accuracy] = cells
      expect(Number(answered)).toBe(expected.get(label))
      expect(Number(correct)).toBe(expected.get(label))
      expect(accuracy).toBe('100%')
      total += Number(answered)
    }
    expect(total).toBe(80)

    // One run is a dot, not a trend, so the chart and its heading stay away.
    await expect(page.getByTestId('trend-section')).toHaveCount(0)

    // Nothing has gone wrong, so no category is named as a weakness, and the deck
    // on offer is the slowest questions rather than the weakest ones.
    await expect(page.getByTestId('weakest')).toHaveCount(0)
    await expect(page.getByTestId('weakest-80')).toHaveText('Slowest 80')
  })
})

test.describe('the statistics when the run is not perfect', () => {
  test('a wrong answer and a skip land in the right columns', async ({ page }) => {
    await openHome(page, { profileRef: CLASSIC, mode: 'typed', seed: 31_337 })
    await beginRun(page)

    // One wrong, one skipped, one right, then stop: three answers, all known.
    const wrong = await currentQuestion(page)
    await answerCurrent(page, 'typed', false)
    const skipped = await currentQuestion(page)
    await page.keyboard.press('ArrowRight')
    const right = await currentQuestion(page)
    await answerCurrent(page, 'typed', true)
    await page.keyboard.press('Escape')

    await expect(page.getByTestId('results')).toBeVisible()
    // +1 for the correct answer, -1 for the wrong one, nothing for the skip.
    await expect(page.getByTestId('score')).toHaveText('0')
    await expect(page.getByTestId('results')).toContainText('1 correct · 1 wrong · 1 skipped')
    await expect(page.getByTestId('answered')).toHaveText('3/80')
    await expect(page.getByTestId('ended-by')).toHaveText('aborted')
    // Accuracy counts attempts, so the skip is excluded: one right out of two tried.
    await expect(page.getByTestId('accuracy')).toHaveText('50%')

    const table = await readTable(page, 'by-kind')
    let answeredTotal = 0
    let wrongTotal = 0
    let skippedTotal = 0
    for (const cells of table.values()) {
      answeredTotal += Number(cells[0])
      wrongTotal += Number(cells[2])
      skippedTotal += Number(cells[3])
    }
    expect(answeredTotal).toBe(3)
    expect(wrongTotal).toBe(1)
    expect(skippedTotal).toBe(1)

    // The wrong answer is attributed to its own category, not to the skip's.
    const wrongRow = table.get(KIND_LABELS[wrong.kind])
    expect(wrongRow).toBeDefined()
    expect(Number(wrongRow?.[2])).toBeGreaterThanOrEqual(1)
    const skippedRow = table.get(KIND_LABELS[skipped.kind])
    expect(Number(skippedRow?.[3])).toBeGreaterThanOrEqual(1)
    expect(right.id).not.toBe(wrong.id)

    // Only the missed questions are offered for retry: the wrong one and the skip.
    await expect(page.getByTestId('retry')).toHaveText(/Retry 2 mistakes/)
  })

  test('history separates two attempts at the same paper and averages them', async ({ page }) => {
    // First attempt: three correct, then abort.
    await openHome(page, { profileRef: CLASSIC, mode: 'typed', seed: 4242 })
    await beginRun(page)
    for (let i = 0; i < 3; i++) await answerCurrent(page, 'typed', true)
    await page.keyboard.press('Escape')
    await expect(page.getByTestId('score')).toHaveText('3')

    // Second attempt at the same seed: one correct, then abort.
    await page.keyboard.press('s')
    await page.getByTestId('skip-countdown').click()
    await answerCurrent(page, 'typed', true)
    await page.keyboard.press('Escape')
    await expect(page.getByTestId('score')).toHaveText('1')

    await page.goto('/history')
    await expect(page.getByTestId('run-count')).toHaveText('2')
    // Two rows, not one overwritten: attempts are distinct even at the same seed.
    await expect(page.getByTestId('history-row')).toHaveCount(2)

    // Two runs make a trend worth drawing.
    await expect(page.getByTestId('trend-section')).toBeVisible()
    await expect(page.getByTestId('trend')).toHaveAttribute('aria-label', /over 2 runs, from 3 to 1/)

    const table = await readTable(page, 'kind-table')
    let total = 0
    for (const cells of table.values()) total += Number(cells[0])
    expect(total).toBe(4)
  })
})

test.describe('the statistics survive a round trip through a file', () => {
  test('exported history imports back with its numbers intact', async ({ page }) => {
    await openHome(page, { profileRef: CLASSIC, mode: 'typed', seed: 20_240_101 })
    await beginRun(page)
    const first = await currentQuestion(page)
    await page.keyboard.type(typeableAnswer(first))
    await page.keyboard.press('Enter')
    await answerCurrent(page, 'typed', true)
    await page.keyboard.press('Escape')
    await expect(page.getByTestId('score')).toHaveText('2')

    await page.goto('/history')
    const before = await page.getByTestId('kind-table').innerText()

    const download = page.waitForEvent('download')
    await page.getByTestId('export').click()
    const file = await download
    const path = await file.path()

    await page.getByTestId('clear').click()
    await page.getByTestId('clear-yes').click()
    await expect(page.getByTestId('history-empty')).toBeVisible()

    await page.getByTestId('import-file').setInputFiles(path)
    await expect(page.getByTestId('run-count')).toHaveText('1')
    expect(await page.getByTestId('kind-table').innerText()).toBe(before)
  })
})

test.describe('the weakest categories', () => {
  test('are named the way the rest of the page names them, worst first', async ({ page }) => {
    await openHome(page, { profileRef: CLASSIC, mode: 'typed', seed: 8080 })
    await beginRun(page)

    // Answer enough of one category wrongly to make it a genuine weakness, and enough
    // of everything else correctly that the sample is not too thin to count.
    const wrongKind = (await currentQuestion(page)).kind
    let asked = 0
    while (asked < 60) {
      const question = await currentQuestion(page)
      await answerCurrent(page, 'typed', question.kind !== wrongKind)
      asked += 1
    }
    await page.keyboard.press('Escape')
    await page.getByTestId('abort-yes').click()
    await expect(page.getByTestId('results')).toBeVisible()

    await page.goto('/history')
    const weakest = page.getByTestId('weakest')
    await expect(weakest).toBeVisible()
    // Human labels, not the internal kind ids the core uses.
    await expect(weakest).toContainText(KIND_LABELS[wrongKind])
    await expect(weakest).not.toContainText(wrongKind)
    // Something is weak now, so the deck is offered as the weakest rather than slowest.
    await expect(page.getByTestId('weakest-80')).toHaveText('Weakest 80')
  })
})
