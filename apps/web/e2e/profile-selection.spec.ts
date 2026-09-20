import {
  type Answer,
  canonicalJson,
  DEFAULT_SETTINGS,
  type ExportFile,
  generateRun,
  PRESETS,
  type Profile,
  profileRefOf,
  summariseRun,
} from '@80in8/core'
import { expect, test } from '@playwright/test'
import { answerCurrent, beginRun, CLASSIC, MCQ, openHome } from './helpers.js'

test('test selection keeps the chosen answer format and offers one classic Optiver entry', async ({
  page,
  isMobile,
}, testInfo) => {
  await page.goto('/')
  const picker = page.getByRole('combobox', { name: 'Test', exact: true })
  await expect(picker.locator('option')).toHaveCount(5)
  await expect(picker.locator('option').filter({ hasText: '(multiple choice)' })).toHaveCount(0)
  await expect(page.getByRole('group', { name: 'Answer format', exact: true })).toBeVisible()
  for (const mode of ['mcq', 'typed'] as const) {
    await page.getByTestId(`mode-${mode}`).click()
    for (const ref of ['zetamac-drill@1', 'optiver-harsh@1', 'hard@1', CLASSIC]) {
      await picker.selectOption(ref)
      await expect(page.getByTestId(`mode-${mode}`)).toHaveAttribute('aria-pressed', 'true')
    }
  }
  await page.getByTestId('toggle-advanced').click()
  await expect(page.getByLabel('Question mix', { exact: true })).toHaveValue('0.2')
  await expect(
    page.getByText('Missing-number questions, such as ? × 5 = 35.', { exact: false }),
  ).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  const keyboardHint = page.getByText('or press Enter', { exact: true })
  if (isMobile) await expect(keyboardHint).toBeHidden()
  else await expect(keyboardHint).toBeVisible()
  // A full-page Chromium capture can reset the emulated phone's pointer to fine.
  // Use viewport captures on phones so screenshots preserve their input capabilities.
  await page.screenshot({ path: testInfo.outputPath('test-selection.png'), fullPage: !isMobile })
  if (isMobile) {
    await page.getByTestId('question-mix').scrollIntoViewIfNeeded()
    await page.screenshot({ path: testInfo.outputPath('test-options.png') })
    await expect(keyboardHint).toBeHidden()
  }
})

for (const share of ['0.2', '0.4']) {
  for (const mode of ['typed', 'mcq'] as const) {
    test(`${mode} answers with mix ${share} preserve question IDs and preferences after reload`, async ({
      page,
    }) => {
      const preset = PRESETS[share === '0.4' ? 'optiver-mcq' : 'optiver-classic']
      const expected = generateRun('expected', 4242, preset, mode)
      await page.goto('/')
      await page.getByTestId(`mode-${mode}`).click()
      await page.getByTestId('toggle-advanced').click()
      await page.getByTestId('seed').fill('4242')
      await page.getByTestId('question-mix').selectOption(share)
      await expect(page.getByTestId('profile')).toHaveValue(CLASSIC)
      await expect(page.getByTestId(`mode-${mode}`)).toHaveAttribute('aria-pressed', 'true')
      await beginRun(page)
      for (const id of expected.questionIds.slice(0, 3)) {
        await expect(page.getByTestId('question')).toHaveAttribute('data-question-id', id)
        await answerCurrent(page, mode)
      }
      await page.keyboard.press('Escape')
      await expect(page.getByTestId('score')).toHaveText('3')
      await page.getByTestId('nav-history').click()
      await expect(page.getByTestId('history-row')).toHaveAttribute('data-run-id', expected.runId ?? '')
      await page.reload()
      await expect(page.getByTestId('history-row')).toHaveAttribute('data-run-id', expected.runId ?? '')
      await page.getByTestId('nav-settings').click()
      await expect(page.getByTestId('setting-profile')).toHaveValue(CLASSIC)
      await expect(page.getByTestId('setting-mode')).toHaveValue(mode)
      await expect(page.getByTestId('setting-question-mix')).toHaveValue(share)
      await page.goto('/')
      await expect(page.getByTestId(`mode-${mode}`)).toHaveAttribute('aria-pressed', 'true')
      await page.getByTestId('toggle-advanced').click()
      await expect(page.getByTestId('question-mix')).toHaveValue(share)
    })
  }
}

test('a legacy MCQ link keeps its original question mix and explicit typed format', async ({ page }) => {
  await openHome(page, { profileRef: MCQ, mode: 'typed', seed: 4242 })
  await expect(page.getByTestId('profile')).toHaveValue(CLASSIC)
  await expect(page.getByTestId('mode-typed')).toHaveAttribute('aria-pressed', 'true')
  await page.getByTestId('toggle-advanced').click()
  await expect(page.getByTestId('question-mix')).toHaveValue('0.4')
  await page.getByTestId('question-mix').selectOption('0.2')
  await page.getByTestId('question-mix').selectOption('0.4')
  await beginRun(page)
  const expected = generateRun('old-link', 4242, PRESETS['optiver-mcq'], 'typed')
  await expect(page.getByTestId('question')).toHaveAttribute(
    'data-question-id',
    expected.questionIds[0] ?? '',
  )
  await answerCurrent(page, 'typed')
  await page.keyboard.press('Escape')
  await expect(page.getByTestId('score')).toHaveText('1')
  // Following a shared link must not replace this device's default mix.
  await page.getByTestId('nav-settings').click()
  await expect(page.getByTestId('setting-question-mix')).toHaveValue('0.2')
})

test('changing a custom shared mix preserves its count, timer and scoring', async ({ page }) => {
  const original: Profile = {
    ...PRESETS['optiver-mcq'],
    questionCount: 3,
    timeLimit: { kind: 'timed', durationMs: 4_800_000 },
    scoring: { ...PRESETS['optiver-mcq'].scoring, wrong: -2 },
  }
  const params = new URLSearchParams({
    p: profileRefOf(original, false),
    pf: Buffer.from(canonicalJson(original)).toString('base64url'),
    s: '4242',
    m: 'typed',
  })
  await page.goto(`/?${params}`)
  await expect(page.getByTestId('profile').locator('option:checked')).toHaveText(
    'Optiver 80 in 8 (from link)',
  )
  await page.getByTestId('toggle-advanced').click()
  await expect(page.getByTestId('question-mix')).toHaveValue('0.4')
  await page.getByTestId('question-mix').selectOption('0.2')
  await expect(page.getByTestId('disclosure')).toHaveText(
    '3 questions · 80:00 · +1 correct · -2 wrong · 0 skipped',
  )
  await expect(page.getByTestId('count')).toHaveValue('3')
  const expected = generateRun('custom', 4242, { ...original, missingOperandShare: 0.2 }, 'typed', false)
  await beginRun(page)
  await expect(page.getByTestId('question')).toHaveAttribute(
    'data-question-id',
    expected.questionIds[0] ?? '',
  )
  await expect(page.getByTestId('timer')).toHaveText('80:00')
  await expect(page.getByTestId('counter')).toHaveText('1/3')
  await expect(page.getByTestId('typed-input')).toBeVisible()
})

test('imported legacy settings and history survive consolidation and preference changes', async ({
  page,
}) => {
  const preset = PRESETS['optiver-mcq']
  const run = generateRun('legacy-import', 4242, preset, 'mcq')
  const answers: Answer[] = [
    {
      questionId: run.questionIds[0] ?? '',
      shownAt: 0,
      answeredAt: 1200,
      elapsedMs: 1200,
      raw: '',
      value: null,
      correct: false,
      skipped: true,
    },
  ]
  const fixture: ExportFile = {
    app: '80in8',
    schemaVersion: 1,
    exportedAt: Date.now(),
    settings: { ...DEFAULT_SETTINGS, profileRef: MCQ, mode: 'typed' },
    profiles: {},
    runs: [
      {
        schemaVersion: 1,
        attemptId: run.attemptId,
        ...(run.runId ? { runId: run.runId } : {}),
        spec: run.spec,
        startedAt: Date.now(),
        practice: false,
        questionIds: [...run.questionIds],
        answers,
        summary: summariseRun(answers, preset, { endedBy: 'aborted', totalMs: 1200, hiddenMs: 0 }),
      },
    ],
  }
  await page.goto('/history')
  await page.getByTestId('import-file').setInputFiles({
    name: 'legacy.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(fixture)),
  })
  await expect(page.getByTestId('toast')).toHaveText('Imported 1 new runs.')
  const row = page.getByTestId('history-row')
  await expect(row).toHaveAttribute('data-run-id', run.runId ?? '')
  const originalRow = await row.innerText()
  await page.getByTestId('nav-settings').click()
  await expect(page.getByTestId('setting-profile')).toHaveValue(CLASSIC)
  await expect(page.getByTestId('setting-question-mix')).toHaveValue('0.4')
  await expect(page.getByTestId('setting-mode')).toHaveValue('typed')
  await page.getByTestId('setting-question-mix').selectOption('0.2')
  await expect(page.getByTestId('setting-mode')).toHaveValue('typed')
  await page.getByTestId('setting-mode').selectOption('mcq')
  await page.getByTestId('setting-profile').selectOption('optiver-harsh@1')
  await expect(page.getByTestId('setting-mode')).toHaveValue('mcq')
  await expect(page.getByTestId('setting-question-mix')).toHaveCount(0)
  await page.getByTestId('setting-profile').selectOption(CLASSIC)
  await page.reload()
  await expect(page.getByTestId('setting-question-mix')).toHaveValue('0.2')
  await expect(page.getByTestId('setting-mode')).toHaveValue('mcq')
  await page.getByTestId('nav-history').click()
  await expect(row).toHaveText(originalRow, { useInnerText: true })
})
