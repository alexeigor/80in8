import { describe, expect, it } from 'vitest'
import { canonicalJson } from './canonical.js'
import {
  CURRENT_PRESETS,
  EXTENDED_TIME_FACTOR,
  PRESETS,
  practiceVariant,
  presetRefs,
  resolvePreset,
} from './presets.js'
import { validateProfile } from './validate.js'

describe('presets', () => {
  it('registers every preset under its versioned reference', () => {
    expect(presetRefs()).toEqual([
      'hard@1',
      'optiver-classic@1',
      'optiver-harsh@1',
      'optiver-mcq@1',
      'optiver-strict@1',
      'zetamac-drill@1',
    ])
  })

  it('resolves a known reference and refuses an unknown one', () => {
    expect(resolvePreset('optiver-classic@1')?.id).toBe('optiver-classic')
    expect(resolvePreset('optiver-classic@99')).toBeUndefined()
    expect(resolvePreset('nonsense')).toBeUndefined()
  })

  it('lists current presets in display order', () => {
    expect(CURRENT_PRESETS.map((p) => p.id)).toEqual([
      'optiver-classic',
      'optiver-mcq',
      'optiver-strict',
      'optiver-harsh',
      'hard',
      'zetamac-drill',
    ])
  })

  it('keeps every preset valid', () => {
    for (const profile of Object.values(PRESETS)) expect(() => validateProfile(profile)).not.toThrow()
  })

  it('matches the Optiver format described in the design doc', () => {
    const classic = PRESETS['optiver-classic']
    expect(classic.questionCount).toBe(80)
    expect(classic.timeLimit).toEqual({ kind: 'timed', durationMs: 480_000 })
    expect(classic.scoring).toEqual({ correct: 1, wrong: -1, skipped: 0, allowSkip: true })
    expect(classic.passScore).toBe(56)
    expect(classic.missingOperandShare).toBeCloseTo(0.2)
  })

  it('never lets a wrong keystroke cost anything when auto-submit is on', () => {
    // Zetamac-style advance-on-correct only makes sense with no penalty for a mistype.
    for (const profile of Object.values(PRESETS)) {
      if (profile.allowAutoSubmit) expect(profile.scoring.wrong).toBe(0)
    }
  })

  /**
   * The guard that makes question ids permanent: changing a preset's parameters changes
   * what every existing id regenerates to, so the change must come with a version bump.
   * If this snapshot fails, bump `version` and register the old copy rather than
   * updating the snapshot in place.
   */
  it('has stable parameters for each published version', () => {
    const fingerprint = Object.fromEntries(
      presetRefs().map((ref) => [ref, canonicalJson(resolvePreset(ref))]),
    )
    expect(fingerprint).toMatchSnapshot()
  })
})

describe('practice variants', () => {
  const classic = PRESETS['optiver-classic']

  it('removes the clock entirely', () => {
    expect(practiceVariant(classic, 'untimed').timeLimit).toEqual({ kind: 'untimed' })
  })

  it('stretches the clock by the documented factor', () => {
    expect(practiceVariant(classic, 'extended').timeLimit).toEqual({
      kind: 'timed',
      durationMs: 480_000 * EXTENDED_TIME_FACTOR,
    })
  })

  it('leaves an already untimed profile alone', () => {
    const untimed = practiceVariant(classic, 'untimed')
    expect(practiceVariant(untimed, 'extended')).toBe(untimed)
  })

  it('changes nothing that question generation depends on', () => {
    // Practice runs must produce the same questions as graded ones, or a retry deck
    // built in practice would mean something different in a real run.
    for (const mode of ['untimed', 'extended'] as const) {
      const variant = practiceVariant(classic, mode)
      expect({ ...variant, timeLimit: null }).toEqual({ ...classic, timeLimit: null })
    }
  })
})

describe('the harsher scoring preset', () => {
  it('models the stricter penalty some candidates report', () => {
    const harsh = PRESETS['optiver-harsh']
    expect(harsh.scoring).toEqual({ correct: 1, wrong: -2, skipped: -2, allowSkip: true })
    // Same questions as the classic profile; only the marking differs.
    expect({
      ...harsh,
      id: '',
      name: '',
      description: '',
      scoring: null,
      passScore: 0,
      competitiveScore: 0,
    }).toEqual({
      ...PRESETS['optiver-classic'],
      id: '',
      name: '',
      description: '',
      scoring: null,
      passScore: 0,
      competitiveScore: 0,
    })
  })
})
