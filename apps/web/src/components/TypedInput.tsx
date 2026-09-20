import { parseAnswer, R } from '@80in8/core'
import type { JSX } from 'preact'
import { useEffect, useRef } from 'preact/hooks'

/**
 * The answer field (DESIGN.md §7.4).
 *
 * `type="text"` with `inputmode="none"`: never `type="number"` (it strips leading
 * zeros, offers spinners and refuses fractions), and never a numeric inputmode (iOS
 * shows a pad with no minus key). All editing arrives through the app's key handling,
 * so the keypad and the physical keyboard produce exactly the same string.
 */

export interface TypedInputProps {
  value: string
  shakeToken: number
  reducedMotion: boolean
  onFallbackInput: (value: string) => void
}

/**
 * A live, non-blocking reading of what the field currently means: `2 1/4` shows
 * `= 9/4`. It stays silent when it would only repeat what is already written, and
 * when the entry is merely unfinished — only genuine nonsense is called out.
 */
export function parseHint(raw: string): string {
  const parsed = parseAnswer(raw)
  if (!parsed.ok) return parsed.error === 'invalid' ? 'not a number' : ''
  const exact =
    parsed.form === 'fraction' || parsed.form === 'mixed'
      ? R.toFractionString(parsed.value)
      : (R.toDecimalString(parsed.value) ?? R.toFractionString(parsed.value))
  // Both minus glyphs mean the same thing; showing one back for the other is noise.
  const same = exact.replace(/−/g, '-') === raw.trim().replace(/−/g, '-')
  return same ? '' : `= ${exact}`
}

export function TypedInput({
  value,
  shakeToken,
  reducedMotion,
  onFallbackInput,
}: TypedInputProps): JSX.Element {
  const field = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (shakeToken === 0) return
    const element = field.current
    if (!element) return
    element.dataset.shake = 'true'
    const handle = setTimeout(
      () => {
        element.dataset.shake = 'false'
      },
      reducedMotion ? 600 : 240,
    )
    return () => clearTimeout(handle)
  }, [shakeToken, reducedMotion])

  return (
    <div>
      <input
        ref={field}
        class="answer nums"
        data-testid="typed-input"
        type="text"
        inputMode="none"
        autocomplete="off"
        autocorrect="off"
        autocapitalize="off"
        spellcheck={false}
        enterkeyhint="done"
        aria-label="Your answer"
        value={value}
        // Key handling is global and calls preventDefault, so this only fires for
        // paste, dictation or an IME; it keeps the signal the single source of truth.
        onInput={(event) => onFallbackInput(event.currentTarget.value)}
      />
    </div>
  )
}
